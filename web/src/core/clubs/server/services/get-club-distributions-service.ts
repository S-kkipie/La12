import "server-only";
import { parseAbiItem } from "viem";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { publicClient, readSafely } from "@/lib/contracts";
import { findClubRounds } from "../repository/find-club-rounds";
import { windowFromBlock } from "./chain-reads";
import { cumulativeSeries, type Distribution, type SeriesPoint } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

const DISTRIBUTED_EVENT = parseAbiItem(
  "event Distributed(uint256 revenueReceived, uint256 creditedToHolders, uint256 refundedToClub)",
);

type DistributedLog = {
  args: { revenueReceived?: bigint; creditedToHolders?: bigint; refundedToClub?: bigint };
  blockNumber: bigint | null;
  transactionHash: string | null;
};

type DistributionsDeps = {
  clubId: number;
  findClubRounds: (clubId: number) => Promise<{ clubName: string; rounds: Round[] }>;
  windowFromBlock: () => Promise<bigint>;
  fetchDistributedLogs: (address: `0x${string}`, fromBlock: bigint) => Promise<DistributedLog[]>;
  blockTimestamp: (blockNumber: bigint) => Promise<number | null>;
};

/** Distributed-event history for a club's verified rounds + the running
 *  cumulative series. Graceful-empty: a catastrophic failure still returns
 *  200-empty (see get-club-overview-service.ts for the same rationale). */
export async function getClubDistributions(
  deps: DistributionsDeps,
): AsyncAppResult<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  try {
    const { clubName, rounds: rows } = await deps.findClubRounds(deps.clubId);
    const fromBlock = await deps.windowFromBlock();
    const perRound = await Promise.all(
      rows.map(async (row): Promise<Distribution[]> => {
        const address = row.contractAddress as `0x${string}`;
        const logs = await deps.fetchDistributedLogs(address, fromBlock);
        const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
        const times = new Map<bigint, number>();
        await Promise.all(
          blocks.map(async (bn) => {
            const ts = await deps.blockTimestamp(bn);
            if (ts !== null) times.set(bn, ts);
          }),
        );
        return logs.map((l) => ({
          roundId: row.id,
          roundName: `${clubName} · Round #${row.id}`,
          received: l.args.revenueReceived ?? 0n,
          credited: l.args.creditedToHolders ?? 0n,
          refunded: l.args.refundedToClub ?? 0n,
          txHash: (l.transactionHash ?? "0x") as `0x${string}`,
          timestamp: l.blockNumber ? (times.get(l.blockNumber) ?? 0) : 0,
        }));
      }),
    );
    const distributions = perRound.flat();
    return ok({ distributions, series: cumulativeSeries(distributions) });
  } catch {
    return ok({ distributions: [], series: [] });
  }
}

/** Real-deps wrapper the route calls. Moved verbatim from clubRevenue.ts's
 *  getClubDistributions — the viem Log -> DistributedLog cast mirrors the
 *  legacy `as unknown as {args:...}` (parseAbiItem's inferred arg types
 *  aren't easily narrowed further without a fight). */
export function getClubDistributionsService(
  clubId: number,
): AsyncAppResult<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  return getClubDistributions({
    clubId,
    findClubRounds,
    windowFromBlock,
    fetchDistributedLogs: async (address, fromBlock) => {
      const logs = await readSafely(
        () => publicClient.getLogs({ address, event: DISTRIBUTED_EVENT, fromBlock, toBlock: "latest" }),
        [] as Awaited<ReturnType<typeof publicClient.getLogs>>,
      );
      return logs.map((l) => ({
        args: (l as unknown as { args: DistributedLog["args"] }).args,
        blockNumber: l.blockNumber,
        transactionHash: l.transactionHash,
      }));
    },
    blockTimestamp: async (blockNumber) => {
      const block = await readSafely(() => publicClient.getBlock({ blockNumber }), null);
      return block ? Number(block.timestamp) : null;
    },
  });
}
