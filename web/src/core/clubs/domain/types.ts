import type { z } from "zod";
import type {
  clubRoundSchema,
  clubTotalsSchema,
  distributionSchema,
  seriesPointSchema,
  holderSchema,
} from "./schemas";

const BPS_DENOM = 10_000n;

export type RoundStatus = "funding" | "active" | "closed";

// Wire DTOs — derived from the zod schemas (bigints are strings here).
export type ClubRoundDTO = z.infer<typeof clubRoundSchema>;
export type ClubTotalsDTO = z.infer<typeof clubTotalsSchema>;
export type DistributionDTO = z.infer<typeof distributionSchema>;
export type SeriesPointDTO = z.infer<typeof seriesPointSchema>;
export type HolderDTO = z.infer<typeof holderSchema>;

// Domain shapes — bigint/Date-precise; what the server computes and the client renders.
export type ClubRound = Omit<
  ClubRoundDTO,
  "contractAddress" | "goal" | "raised" | "totalShares" | "distributed" | "deadline"
> & {
  contractAddress: `0x${string}`;
  goal: bigint;
  raised: bigint;
  totalShares: bigint;
  distributed: bigint;
  deadline: Date;
};
export type ClubTotals = Omit<ClubTotalsDTO, "raised" | "distributed"> & { raised: bigint; distributed: bigint };
export type Distribution = Omit<DistributionDTO, "received" | "credited" | "refunded" | "txHash"> & {
  received: bigint;
  credited: bigint;
  refunded: bigint;
  txHash: `0x${string}`;
};
export type SeriesPoint = Omit<SeriesPointDTO, "cumulative"> & { cumulative: bigint };
export type Holder = Omit<HolderDTO, "address" | "shares" | "claimable"> & {
  address: `0x${string}`;
  shares: bigint;
  claimable: bigint;
};

// --- server -> wire (DTO) serializers ---------------------------------------
export function toClubRoundDTO(r: ClubRound): ClubRoundDTO {
  return {
    ...r,
    goal: r.goal.toString(),
    raised: r.raised.toString(),
    totalShares: r.totalShares.toString(),
    distributed: r.distributed.toString(),
    deadline: r.deadline.toISOString(),
  };
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

// --- wire (DTO) -> client parsers --------------------------------------------
export function parseClubRound(d: ClubRoundDTO): ClubRound {
  return {
    ...d,
    contractAddress: d.contractAddress as `0x${string}`,
    goal: BigInt(d.goal),
    raised: BigInt(d.raised),
    totalShares: BigInt(d.totalShares),
    distributed: BigInt(d.distributed),
    deadline: new Date(d.deadline),
  };
}
export function parseClubTotals(d: ClubTotalsDTO): ClubTotals {
  return { ...d, raised: BigInt(d.raised), distributed: BigInt(d.distributed) };
}
export function parseDistribution(d: DistributionDTO): Distribution {
  return {
    ...d,
    received: BigInt(d.received),
    credited: BigInt(d.credited),
    refunded: BigInt(d.refunded),
    txHash: d.txHash as `0x${string}`,
  };
}
export function parseSeriesPoint(d: SeriesPointDTO): SeriesPoint {
  return { ts: d.ts, cumulative: BigInt(d.cumulative) };
}
export function parseHolder(d: HolderDTO): Holder {
  return { ...d, address: d.address as `0x${string}`, shares: BigInt(d.shares), claimable: BigInt(d.claimable) };
}

// --- pure helpers -------------------------------------------------------------
/** Running total of `credited`, sorted by timestamp ascending. */
export function cumulativeSeries(dists: Distribution[]): SeriesPoint[] {
  const sorted = [...dists].sort((a, b) => a.timestamp - b.timestamp);
  let acc = 0n;
  return sorted.map((d) => {
    acc += d.credited;
    return { ts: d.timestamp, cumulative: acc };
  });
}

/** % of the round's revenue cap (raised * capMultipleBps / 1e4) already distributed, clamped to 100. */
export function capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number {
  const cap = (raised * BigInt(capMultipleBps)) / BPS_DENOM;
  if (cap === 0n) return 0;
  const pct = Number((distributed * 10_000n) / cap) / 100;
  return Math.min(100, pct);
}
