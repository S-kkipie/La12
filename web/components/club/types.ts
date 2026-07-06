// Client-safe DTO shapes + parsers for the club revenue dashboard. No server
// imports here (no @/lib/clubRevenue, no DB) — this file is imported by
// "use client" components, so pulling in the DB would bundle it into the
// browser. Server code (the club page/data layer) builds the *DTO shapes
// (bigint fields serialized to strings, since bigint doesn't survive the
// server->client RSC boundary), and these parsers turn them back into bigint
// views for math/formatUsdt on the client. Mirrors components/wallet/types.ts.

export type ClubTotalsDTO = { raised: string; distributed: string; roundCount: number; backerCount: number };
export type ClubRoundDTO = {
  roundId: number; contractAddress: `0x${string}`; name: string;
  goal: string; raised: string; totalShares: string; distributed: string;
  capMultiple: number; revenueBps: number; deadline: string;
  status: "funding" | "active" | "closed"; capUtilizationPct: number;
};
export type DistributionDTO = {
  roundId: number; roundName: string; received: string; credited: string; refunded: string;
  txHash: `0x${string}`; timestamp: number;
};
export type SeriesPointDTO = { ts: number; cumulative: string };
export type HolderDTO = { address: `0x${string}`; shares: string; claimable: string; pct: number };

export type ClubTotalsView = { raised: bigint; distributed: bigint; roundCount: number; backerCount: number };
export type ClubRoundView = Omit<ClubRoundDTO, "goal" | "raised" | "totalShares" | "distributed" | "deadline"> & {
  goal: bigint; raised: bigint; totalShares: bigint; distributed: bigint; deadline: Date;
};
export type DistributionView = Omit<DistributionDTO, "received" | "credited" | "refunded"> & {
  received: bigint; credited: bigint; refunded: bigint;
};
export type HolderView = Omit<HolderDTO, "shares" | "claimable"> & { shares: bigint; claimable: bigint };

export function parseClubTotals(d: ClubTotalsDTO): ClubTotalsView {
  return { ...d, raised: BigInt(d.raised), distributed: BigInt(d.distributed) };
}
export function parseClubRound(d: ClubRoundDTO): ClubRoundView {
  return { ...d, goal: BigInt(d.goal), raised: BigInt(d.raised), totalShares: BigInt(d.totalShares), distributed: BigInt(d.distributed), deadline: new Date(d.deadline) };
}
export function parseDistribution(d: DistributionDTO): DistributionView {
  return { ...d, received: BigInt(d.received), credited: BigInt(d.credited), refunded: BigInt(d.refunded) };
}
export function parseHolder(d: HolderDTO): HolderView {
  return { ...d, shares: BigInt(d.shares), claimable: BigInt(d.claimable) };
}
/** Series → chart points in whole USD₮ (display only; number is fine for an axis). */
export function seriesToPoints(series: SeriesPointDTO[]): { ts: number; usdt: number }[] {
  return series.map((p) => ({ ts: p.ts, usdt: Number(BigInt(p.cumulative)) / 1_000_000 }));
}
