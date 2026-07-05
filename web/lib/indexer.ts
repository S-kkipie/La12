// WDK Indexer API wrapper (spec §5 tier 2) — cross-chain balances + tx history
// for the /wallet page, without hammering our own RPC. The Indexer is a
// hosted Tether service, not an npm module; this file is a typed stub until
// the endpoint + auth are decided (spec §9).
//
// TODO(wire): point at the real Indexer API (docs.wdk.tether.io/tools/indexer-api)
// once we have a base URL / API key, and replace the mock data below with a
// real `fetch()`.

export type TokenBalance = {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  amount: bigint;
};

export type HistoryEntry = {
  hash: `0x${string}`;
  kind: "in" | "out";
  token: `0x${string}`;
  amount: bigint;
  counterparty: `0x${string}`;
  blockNumber: bigint;
  timestamp: number; // unix seconds
};

export async function getBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  // TODO(wire): GET {INDEXER_URL}/balances/{address}
  void address;
  return [];
}

export async function getHistory(address: `0x${string}`): Promise<HistoryEntry[]> {
  // TODO(wire): GET {INDEXER_URL}/history/{address}
  void address;
  return [];
}
