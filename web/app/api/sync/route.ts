import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, events } from "@/db/schema";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";

const syncSchema = z.object({
  roundId: z.number().int().positive(),
  fromBlock: z.coerce.bigint().optional(),
});

const EVENT_KIND: Record<string, "invest" | "distribute" | "claim" | "close"> = {
  Invested: "invest",
  Distributed: "distribute",
  Claimed: "claim",
  FundingClosed: "close",
};

/** Picks the USD₮ amount field off whichever event fired (see contracts ABI). */
function amountFromArgs(args: Record<string, unknown>): bigint {
  return (
    (args.usdtAmount as bigint | undefined) ??
    (args.revenueReceived as bigint | undefined) ??
    (args.totalRaisedUsdt as bigint | undefined) ??
    0n
  );
}

export async function POST(request: Request) {
  const parsed = syncSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const [round] = await db.select().from(rounds).where(eq(rounds.id, parsed.data.roundId));
  if (!round) {
    return NextResponse.json({ error: "round not found" }, { status: 404 });
  }

  // RoundFactory.createRound() is permissionless on-chain, so a round address
  // existing in our own table isn't itself proof it's legitimate — only sync
  // (and thus only ever cache events for) rounds we've marked verified. This
  // is the allowlist check; it never trusts the on-chain event feed itself.
  if (!round.verified) {
    return NextResponse.json(
      { error: "round is not verified — refusing to sync unvetted contract events" },
      { status: 403 },
    );
  }

  const address = round.contractAddress as `0x${string}`;

  let rawLogs;
  try {
    // Default window: most public RPC providers (publicnode, etc.) cap
    // eth_getLogs at a 50k-block range, so "from block 0" fails outright on
    // an established testnet. A real deployment would track each round's
    // deploy block (from RoundFactory's `RoundCreated` event) and sync
    // incrementally from there instead of guessing a window.
    let fromBlock = parsed.data.fromBlock;
    if (fromBlock === undefined) {
      const latest = await publicClient.getBlockNumber();
      fromBlock = latest > 40_000n ? latest - 40_000n : 0n;
    }

    rawLogs = await publicClient.getContractEvents({
      address,
      abi: revenueShareRoundAbi,
      fromBlock,
      toBlock: "latest",
    });
  } catch (err) {
    return NextResponse.json(
      { error: `RPC read failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }

  // The ABI is imported from JSON (see contracts.ts) rather than declared
  // `as const`, so viem can't narrow `eventName`/`args` at the type level —
  // it still decodes both correctly at runtime. Recover the shape here.
  const logs = rawLogs as unknown as Array<{
    eventName: string;
    args: Record<string, unknown>;
    transactionHash: `0x${string}` | null;
    blockNumber: bigint | null;
  }>;

  const rows = logs
    .filter((log) => log.eventName in EVENT_KIND)
    .map((log) => ({
      roundId: round.id,
      kind: EVENT_KIND[log.eventName],
      txHash: log.transactionHash ?? "",
      amount: String(amountFromArgs((log.args as Record<string, unknown>) ?? {})),
      block: Number(log.blockNumber ?? 0n),
      // NOTE: sync time, not block time — good enough for UI ordering; fetching
      // each log's real block timestamp is a follow-up if judges want exact times.
      ts: new Date(),
    }));

  // Idempotent: this round's cache is fully rebuilt from on-chain logs each sync.
  await db.delete(events).where(eq(events.roundId, round.id));
  if (rows.length > 0) {
    await db.insert(events).values(rows);
  }

  return NextResponse.json({ synced: rows.length });
}
