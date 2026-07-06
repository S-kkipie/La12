// Club revenue reads — money truth on-chain (CLAUDE.md). The DB supplies the
// verified round allowlist + round params; balances, distributions, holders,
// and cap utilization come from the contract / event logs. The `events` cache
// is deliberately NOT used here: it has no investor address and its `ts` is
// sync-time not block-time. Server-only (imports the DB).
import { eq } from "drizzle-orm";
import { parseAbiItem } from "viem";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";
import {
  publicClient,
  totalRaised,
  totalShares,
  roundState,
  shareBalance,
  pendingReward,
  totalDistributedToHolders,
  readSafely,
} from "@/lib/contracts";

const BPS_DENOM = 10_000n;
// getRoundInvestors/getRoundHolders/backer-count only see `Invested` events from
// roughly the last LOG_WINDOW blocks (public-RPC eth_getLogs cap), so on an old
// round the holder cap-table and backer count can undercount. `raised`/`distributed`
// totals are unaffected — they're direct contract reads, not log-derived.
const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs (~40-50k blocks)

const INVESTED_EVENT = parseAbiItem(
  "event Invested(address indexed investor, uint256 usdtAmount, uint256 sharesMinted)",
);
const DISTRIBUTED_EVENT = parseAbiItem(
  "event Distributed(uint256 revenueReceived, uint256 creditedToHolders, uint256 refundedToClub)",
);

export type RoundStatus = "funding" | "active" | "closed";

export type ClubRound = {
  roundId: number;
  contractAddress: `0x${string}`;
  name: string;
  goal: bigint;
  raised: bigint;
  totalShares: bigint;
  distributed: bigint;
  capMultiple: number;
  revenueBps: number;
  deadline: Date;
  status: RoundStatus;
  capUtilizationPct: number;
};
export type ClubTotals = { raised: bigint; distributed: bigint; roundCount: number; backerCount: number };
export type Distribution = {
  roundId: number;
  roundName: string;
  received: bigint;
  credited: bigint;
  refunded: bigint;
  txHash: `0x${string}`;
  timestamp: number;
};
export type SeriesPoint = { ts: number; cumulative: bigint };
export type Holder = { address: `0x${string}`; shares: bigint; claimable: bigint; pct: number };

// --- DTOs (bigints as strings; scalars kept) --------------------------------
export type ClubRoundDTO = Omit<ClubRound, "goal" | "raised" | "totalShares" | "distributed" | "deadline"> & {
  goal: string; raised: string; totalShares: string; distributed: string; deadline: string;
};
export type ClubTotalsDTO = Omit<ClubTotals, "raised" | "distributed"> & { raised: string; distributed: string };
export type DistributionDTO = Omit<Distribution, "received" | "credited" | "refunded"> & {
  received: string; credited: string; refunded: string;
};
export type SeriesPointDTO = { ts: number; cumulative: string };
export type HolderDTO = Omit<Holder, "shares" | "claimable"> & { shares: string; claimable: string };

export function toClubRoundDTO(r: ClubRound): ClubRoundDTO {
  return { ...r, goal: r.goal.toString(), raised: r.raised.toString(), totalShares: r.totalShares.toString(), distributed: r.distributed.toString(), deadline: r.deadline.toISOString() };
}
export function toClubTotalsDTO(t: ClubTotals): ClubTotalsDTO {
  return { ...t, raised: t.raised.toString(), distributed: t.distributed.toString() };
}
export function toDistributionDTO(d: Distribution): DistributionDTO {
  return { ...d, received: d.received.toString(), credited: d.credited.toString(), refunded: d.refunded.toString() };
}
export function toSeriesPointDTO(p: SeriesPoint): SeriesPointDTO {
  return { ts: p.ts, cumulative: p.cumulative.toString() };
}
export function toHolderDTO(h: Holder): HolderDTO {
  return { ...h, shares: h.shares.toString(), claimable: h.claimable.toString() };
}

// --- pure helpers -----------------------------------------------------------
export function cumulativeSeries(dists: Distribution[]): SeriesPoint[] {
  const sorted = [...dists].sort((a, b) => a.timestamp - b.timestamp);
  let acc = 0n;
  return sorted.map((d) => {
    acc += d.credited;
    return { ts: d.timestamp, cumulative: acc };
  });
}

export function capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number {
  const cap = (raised * BigInt(capMultipleBps)) / BPS_DENOM;
  if (cap === 0n) return 0;
  const pct = Number((distributed * 10_000n) / cap) / 100;
  return Math.min(100, pct);
}

// --- on-chain orchestration -------------------------------------------------
async function windowFromBlock(): Promise<bigint> {
  const latest = await publicClient.getBlockNumber();
  return latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;
}

/** Unique investor addresses for a round (from Invested logs). */
export async function getRoundInvestors(roundAddress: `0x${string}`): Promise<`0x${string}`[]> {
  const fromBlock = await windowFromBlock();
  const logs = await publicClient.getLogs({ address: roundAddress, event: INVESTED_EVENT, fromBlock, toBlock: "latest" });
  const set = new Set<string>();
  for (const log of logs) {
    const investor = (log as unknown as { args: { investor?: string } }).args.investor;
    if (investor) set.add(investor.toLowerCase());
  }
  return [...set] as `0x${string}`[];
}

/** Cap-table for a round: current holders (shares > 0) with claimable + %. */
export async function getRoundHolders(roundAddress: `0x${string}`): Promise<Holder[]> {
  const investors = await getRoundInvestors(roundAddress);
  const supply = await readSafely(() => totalShares(roundAddress), 0n);
  const holders = await Promise.all(
    investors.map(async (address): Promise<Holder | null> => {
      const shares = await readSafely(() => shareBalance(roundAddress, address), 0n);
      if (shares === 0n) return null;
      const claimable = await readSafely(() => pendingReward(roundAddress, address), 0n);
      const pct = supply === 0n ? 0 : Number((shares * 10_000n) / supply) / 100;
      return { address, shares, claimable, pct };
    }),
  );
  return holders.filter((h): h is Holder => h !== null);
}

async function clubRoundsRows(clubId: number) {
  return db.select().from(rounds).where(eq(rounds.clubId, clubId));
}

export async function getClubOverview(clubId: number): Promise<{ totals: ClubTotals; rounds: ClubRound[] }> {
  const rows = (await clubRoundsRows(clubId)).filter((r) => r.verified);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const clubName = club?.name ?? "Club";

  const backerSet = new Set<string>();
  const enriched = await Promise.all(
    rows.map(async (row): Promise<ClubRound> => {
      const address = row.contractAddress as `0x${string}`;
      const [raised, supply, status, distributed, investors] = await Promise.all([
        readSafely(() => totalRaised(address), 0n),
        readSafely(() => totalShares(address), 0n),
        readSafely(async () => (await roundState(address)).toLowerCase() as RoundStatus, "funding" as RoundStatus),
        readSafely(() => totalDistributedToHolders(address), 0n),
        readSafely(() => getRoundInvestors(address), [] as `0x${string}`[]),
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
  return { totals, rounds: enriched };
}

export async function getClubDistributions(clubId: number): Promise<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  const rows = (await clubRoundsRows(clubId)).filter((r) => r.verified);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const clubName = club?.name ?? "Club";
  const fromBlock = await windowFromBlock();

  const perRound = await Promise.all(
    rows.map(async (row): Promise<Distribution[]> => {
      const address = row.contractAddress as `0x${string}`;
      const logs = await readSafely(
        () => publicClient.getLogs({ address, event: DISTRIBUTED_EVENT, fromBlock, toBlock: "latest" }),
        [] as Awaited<ReturnType<typeof publicClient.getLogs>>,
      );
      const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
      const times = new Map<bigint, number>();
      await Promise.all(
        blocks.map(async (bn) => {
          const block = await readSafely(() => publicClient.getBlock({ blockNumber: bn }), null);
          if (block) times.set(bn, Number(block.timestamp));
        }),
      );
      return logs.map((l) => {
        const a = (l as unknown as { args: { revenueReceived?: bigint; creditedToHolders?: bigint; refundedToClub?: bigint } }).args;
        return {
          roundId: row.id,
          roundName: `${clubName} · Round #${row.id}`,
          received: a.revenueReceived ?? 0n,
          credited: a.creditedToHolders ?? 0n,
          refunded: a.refundedToClub ?? 0n,
          txHash: (l.transactionHash ?? "0x") as `0x${string}`,
          timestamp: l.blockNumber ? (times.get(l.blockNumber) ?? 0) : 0,
        };
      });
    }),
  );

  const distributions = perRound.flat();
  return { distributions, series: cumulativeSeries(distributions) };
}
