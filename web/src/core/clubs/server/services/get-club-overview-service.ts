import "server-only";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { totalRaised, totalShares, roundState, totalDistributedToHolders, readSafely } from "@/lib/contracts";
import { findClubRounds } from "../repository/find-club-rounds";
import { getRoundInvestors } from "./chain-reads";
import { capUtilization, type ClubRound, type ClubTotals, type RoundStatus } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

type OverviewDeps = {
  clubId: number;
  findClubRounds: (clubId: number) => Promise<{ clubName: string; rounds: Round[] }>;
  reads: {
    totalRaised: (addr: `0x${string}`) => Promise<bigint>;
    totalShares: (addr: `0x${string}`) => Promise<bigint>;
    roundState: (addr: `0x${string}`) => Promise<RoundStatus>;
    totalDistributedToHolders: (addr: `0x${string}`) => Promise<bigint>;
    getRoundInvestors: (addr: `0x${string}`) => Promise<`0x${string}`[]>;
  };
};

/** Verified rounds for a club, on-chain enriched, aggregated into totals.
 *  Individual reads are readSafely-wrapped by the real deps below, so a dead
 *  RPC degrades a single field to its zero value; only a catastrophic failure
 *  (e.g. DB down) hits this catch — which still returns 200-empty, matching
 *  the legacy dashboard's graceful-empty UX (never a 500 from this service). */
export async function getClubOverview(deps: OverviewDeps): AsyncAppResult<{ totals: ClubTotals; rounds: ClubRound[] }> {
  try {
    const { clubName, rounds: rows } = await deps.findClubRounds(deps.clubId);
    const backerSet = new Set<string>();
    const enriched = await Promise.all(
      rows.map(async (row): Promise<ClubRound> => {
        const address = row.contractAddress as `0x${string}`;
        const [raised, supply, status, distributed, investors] = await Promise.all([
          deps.reads.totalRaised(address),
          deps.reads.totalShares(address),
          deps.reads.roundState(address),
          deps.reads.totalDistributedToHolders(address),
          deps.reads.getRoundInvestors(address),
        ]);
        investors.forEach((i) => backerSet.add(i));
        return {
          roundId: row.id,
          contractAddress: address,
          name: `${clubName} · Round #${row.id}`,
          goal: BigInt(row.goal),
          raised,
          totalShares: supply,
          distributed,
          capMultiple: row.capMultiple,
          revenueBps: row.revenueBps,
          deadline: row.deadline,
          status,
          capUtilizationPct: capUtilization(distributed, raised, row.capMultiple),
        };
      }),
    );
    const totals: ClubTotals = {
      raised: enriched.reduce((s, r) => s + r.raised, 0n),
      distributed: enriched.reduce((s, r) => s + r.distributed, 0n),
      roundCount: enriched.length,
      backerCount: backerSet.size,
    };
    return ok({ totals, rounds: enriched });
  } catch {
    return ok({ totals: { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 }, rounds: [] });
  }
}

/** Real-deps wrapper the route calls. Chain reads are readSafely-wrapped
 *  (0n/"funding"/[] fallback) so one dead RPC degrades a single field, not
 *  the whole dashboard. */
export function getClubOverviewService(clubId: number): AsyncAppResult<{ totals: ClubTotals; rounds: ClubRound[] }> {
  return getClubOverview({
    clubId,
    findClubRounds,
    reads: {
      totalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
      totalShares: (addr) => readSafely(() => totalShares(addr), 0n),
      roundState: (addr) => readSafely(async () => (await roundState(addr)).toLowerCase() as RoundStatus, "funding" as RoundStatus),
      totalDistributedToHolders: (addr) => readSafely(() => totalDistributedToHolders(addr), 0n),
      getRoundInvestors: (addr) => readSafely(() => getRoundInvestors(addr), [] as `0x${string}`[]),
    },
  });
}
