// Client-safe DTO shapes + parsers for the fan wallet dashboard. No server
// imports here (no @/lib/positions, no DB) — this file is imported by
// "use client" components, so pulling in the DB would bundle it into the
// browser. Server code (Task 9's page/data layer) builds the *DTO shapes
// (bigint fields serialized to strings, since bigint doesn't survive the
// server->client RSC boundary), and these parsers turn them back into bigint
// views for math/formatUsdt on the client.

export type FanPositionDTO = {
  roundId: number;
  contractAddress: `0x${string}`;
  clubName: string;
  clubSlug: string;
  shares: string;
  totalShares: string;
  investedUsdt: string;
  claimable: string;
  raised: string;
  goal: string;
  status: "funding" | "active" | "closed";
};

export type FanPositionView = Omit<
  FanPositionDTO,
  "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
};

export function parsePositionDTO(d: FanPositionDTO): FanPositionView {
  return {
    ...d,
    shares: BigInt(d.shares),
    totalShares: BigInt(d.totalShares),
    investedUsdt: BigInt(d.investedUsdt),
    claimable: BigInt(d.claimable),
    raised: BigInt(d.raised),
    goal: BigInt(d.goal),
  };
}

export type HistoryEntryDTO = {
  hash: `0x${string}`;
  kind: "in" | "out";
  token: `0x${string}`;
  amount: string;
  counterparty: `0x${string}`;
  blockNumber: string;
  timestamp: number;
};

export type HistoryEntryView = Omit<HistoryEntryDTO, "amount" | "blockNumber"> & {
  amount: bigint;
  blockNumber: bigint;
};

export function parseHistoryDTO(d: HistoryEntryDTO): HistoryEntryView {
  return { ...d, amount: BigInt(d.amount), blockNumber: BigInt(d.blockNumber) };
}
