import "server-only";
import { eq } from "drizzle-orm";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { db } from "@/lib/db";
import { rounds, events, type Round, type NewEvent } from "@/db/schema";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";
import { EVENT_KIND, amountFromArgs } from "@/core/ops/domain/types";
import type { SyncResult } from "@/core/ops/domain/types";

/** Shape viem's `getContractEvents` decodes each log into (ABI is imported
 *  from JSON, so viem can't narrow `eventName`/`args` at the type level — it
 *  still decodes both correctly at runtime; the real-deps wrapper recasts
 *  the shape here, same as the legacy sync route did). */
type RawLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: `0x${string}` | null;
  blockNumber: bigint | null;
};

type SyncDeps = {
  roundId: number;
  fromBlock?: bigint;
  findRound: (id: number) => Promise<Round | undefined>;
  getBlockNumber: () => Promise<bigint>;
  getLogs: (address: `0x${string}`, fromBlock: bigint) => Promise<RawLog[]>;
  replaceEvents: (roundId: number, rows: NewEvent[]) => Promise<void>;
};

/** Rebuilds the `events` cache for one VERIFIED round from on-chain logs.
 *  Rejects a round that doesn't exist (404) or isn't verified (403,
 *  allowlist) — RoundFactory.createRound() is permissionless on-chain, so a
 *  round address existing in our own table isn't itself proof it's
 *  legitimate; this never trusts the on-chain event feed for that check.
 *  Idempotent — the round's cache is fully replaced each sync (money truth
 *  stays on-chain regardless; this is a rebuildable UI cache). */
export async function syncRoundEvents(deps: SyncDeps): AsyncAppResult<SyncResult> {
  let round: Round | undefined;
  try {
    round = await deps.findRound(deps.roundId);
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
  if (!round) return err(AppErrors.notFound({ targets: ["roundId"] }));
  if (!round.verified) return err(AppErrors.forbidden());
  const verifiedRound = round; // new const binding — safe to close over below

  const address = verifiedRound.contractAddress as `0x${string}`;
  try {
    // Default window: most public RPC providers cap eth_getLogs at ~50k
    // blocks, so "from block 0" fails outright on an established testnet.
    let fromBlock = deps.fromBlock;
    if (fromBlock === undefined) {
      const latest = await deps.getBlockNumber();
      fromBlock = latest > 40_000n ? latest - 40_000n : 0n;
    }

    const rawLogs = await deps.getLogs(address, fromBlock);
    const rows: NewEvent[] = rawLogs
      .filter((log) => log.eventName in EVENT_KIND)
      .map((log) => ({
        roundId: verifiedRound.id,
        kind: EVENT_KIND[log.eventName],
        txHash: log.transactionHash ?? "",
        amount: String(amountFromArgs(log.args ?? {})),
        block: Number(log.blockNumber ?? 0n),
        // NOTE: sync time, not block time — good enough for UI ordering.
        ts: new Date(),
      }));

    await deps.replaceEvents(verifiedRound.id, rows);
    return ok({ synced: rows.length });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function syncEventsService(roundId: number, fromBlock?: bigint): AsyncAppResult<SyncResult> {
  return syncRoundEvents({
    roundId,
    fromBlock,
    findRound: async (id) => {
      const [row] = await db.select().from(rounds).where(eq(rounds.id, id));
      return row;
    },
    getBlockNumber: () => publicClient.getBlockNumber(),
    getLogs: async (address, from) => {
      const rawLogs = await publicClient.getContractEvents({
        address,
        abi: revenueShareRoundAbi,
        fromBlock: from,
        toBlock: "latest",
      });
      return rawLogs as unknown as RawLog[];
    },
    replaceEvents: async (roundId, rows) => {
      await db.delete(events).where(eq(events.roundId, roundId));
      if (rows.length > 0) await db.insert(events).values(rows);
    },
  });
}
