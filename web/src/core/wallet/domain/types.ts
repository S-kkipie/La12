import type { z } from "zod";
import type { fanPositionSchema, historyEntrySchema } from "./schemas";

const SHARE_UNIT = 1_000000n; // 1e6 — matches RevenueShareRound.SHARE_UNIT & USD₮ 6dp

// Wire DTOs — derived from the zod schemas (bigints are strings here).
export type FanPositionDTO = z.infer<typeof fanPositionSchema>;
export type HistoryEntryDTO = z.infer<typeof historyEntrySchema>;

// Domain shapes — the enriched bigint/address-precise representation the server
// builds and the client renders. Not a mirror of the wire schema: bigint vs string.
export type FanPosition = Omit<
  FanPositionDTO,
  "contractAddress" | "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  contractAddress: `0x${string}`;
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
};

export type HistoryEntry = Omit<
  HistoryEntryDTO,
  "hash" | "token" | "counterparty" | "amount" | "blockNumber"
> & {
  hash: `0x${string}`;
  token: `0x${string}`;
  counterparty: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
};

/** invested USD₮ = shares * sharePrice / SHARE_UNIT (see contract invest()). */
export function investedFromShares(shares: bigint, sharePrice: bigint): bigint {
  return (shares * sharePrice) / SHARE_UNIT;
}

/** Fan's % of the round's total shares, 2 decimals; 0 when supply is 0. */
export function percentOfRound(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}

export function toPositionDTO(p: FanPosition): FanPositionDTO {
  return {
    ...p,
    shares: p.shares.toString(),
    totalShares: p.totalShares.toString(),
    investedUsdt: p.investedUsdt.toString(),
    claimable: p.claimable.toString(),
    raised: p.raised.toString(),
    goal: p.goal.toString(),
  };
}

export function parsePosition(d: FanPositionDTO): FanPosition {
  return {
    ...d,
    contractAddress: d.contractAddress as `0x${string}`,
    shares: BigInt(d.shares),
    totalShares: BigInt(d.totalShares),
    investedUsdt: BigInt(d.investedUsdt),
    claimable: BigInt(d.claimable),
    raised: BigInt(d.raised),
    goal: BigInt(d.goal),
  };
}

export function toHistoryDTO(e: HistoryEntry): HistoryEntryDTO {
  return { ...e, amount: e.amount.toString(), blockNumber: e.blockNumber.toString() };
}

export function parseHistoryEntry(d: HistoryEntryDTO): HistoryEntry {
  return {
    ...d,
    hash: d.hash as `0x${string}`,
    token: d.token as `0x${string}`,
    counterparty: d.counterparty as `0x${string}`,
    amount: BigInt(d.amount),
    blockNumber: BigInt(d.blockNumber),
  };
}
