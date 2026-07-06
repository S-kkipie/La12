// WDK Indexer API wrapper (spec §5 tier 2) — real USD₮ transfer history for the
// fan wallet. Uses the hosted Indexer (https://wdk-api.tether.io) when
// WDK_INDEXER_API_KEY is set; otherwise (and on any error/empty) falls back to
// reading ERC-20 Transfer logs straight from the RPC, so Activity is never
// empty on Sepolia. SERVER-ONLY: holds the API key — import from API routes,
// never from a client component.
import { parseAbiItem, getAddress } from "viem";
import { publicClient } from "@/lib/contracts";

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

const INDEXER_BASE = "https://wdk-api.tether.io";
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? "") as `0x${string}`;
const INDEXER_CHAIN = process.env.WDK_INDEXER_CHAIN ?? "ethereum";
const INDEXER_TOKEN = process.env.WDK_INDEXER_TOKEN ?? "usdt";
const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs ranges (~40-50k blocks)

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function asBigInt(v: unknown): bigint {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  } catch {
    /* fall through */
  }
  return 0n;
}

/** Tolerant map of an Indexer transfers payload — field names vary, so probe. */
export function mapIndexerTransfers(payload: unknown, self: string): HistoryEntry[] {
  const rows =
    Array.isArray(payload) ? payload
    : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data
    : Array.isArray((payload as { transfers?: unknown })?.transfers) ? (payload as { transfers: unknown[] }).transfers
    : [];
  const me = self.toLowerCase();

  return rows.flatMap((raw): HistoryEntry[] => {
    const r = raw as Record<string, unknown>;
    const from = String(r.from ?? r.fromAddress ?? "").toLowerCase();
    const to = String(r.to ?? r.toAddress ?? "").toLowerCase();
    if (!from && !to) return [];
    const kind: "in" | "out" = to === me ? "in" : "out";
    const counterparty = (kind === "in" ? from : to) || me;
    return [{
      hash: String(r.transactionHash ?? r.hash ?? r.txHash ?? "0x") as `0x${string}`,
      kind,
      token: USDT_ADDRESS,
      amount: asBigInt(r.value ?? r.amount),
      counterparty: counterparty as `0x${string}`,
      blockNumber: asBigInt(r.blockNumber ?? r.block),
      timestamp: Number(asBigInt(r.timestamp ?? r.blockTimestamp ?? r.time)),
    }];
  });
}

/** Map viem `getLogs` Transfer results into HistoryEntry (timestamp filled by caller). */
export function mapTransferLogs(
  logs: Array<{ args: { from?: string; to?: string; value?: bigint }; transactionHash: string | null; blockNumber: bigint | null }>,
  self: string,
): HistoryEntry[] {
  const me = self.toLowerCase();
  return logs.map((log) => {
    const from = (log.args.from ?? "").toLowerCase();
    const to = (log.args.to ?? "").toLowerCase();
    const kind: "in" | "out" = to === me ? "in" : "out";
    return {
      hash: (log.transactionHash ?? "0x") as `0x${string}`,
      kind,
      token: USDT_ADDRESS,
      amount: log.args.value ?? 0n,
      counterparty: ((kind === "in" ? from : to) || me) as `0x${string}`,
      blockNumber: log.blockNumber ?? 0n,
      timestamp: 0, // filled from block timestamps below
    };
  });
}

async function fromIndexer(address: `0x${string}`): Promise<HistoryEntry[]> {
  const apiKey = process.env.WDK_INDEXER_API_KEY;
  if (!apiKey) return [];
  const url = `${INDEXER_BASE}/api/v1/${INDEXER_CHAIN}/${INDEXER_TOKEN}/${address}/token-transfers`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (!res.ok) return [];
  return mapIndexerTransfers(await res.json(), address);
}

async function fromLogs(address: `0x${string}`): Promise<HistoryEntry[]> {
  if (!USDT_ADDRESS) return [];
  const latest = await publicClient.getBlockNumber();
  const fromBlock = latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;

  const [outgoing, incoming] = await Promise.all([
    publicClient.getLogs({ address: USDT_ADDRESS, event: TRANSFER_EVENT, args: { from: address }, fromBlock, toBlock: "latest" }),
    publicClient.getLogs({ address: USDT_ADDRESS, event: TRANSFER_EVENT, args: { to: address }, fromBlock, toBlock: "latest" }),
  ]);

  const entries = mapTransferLogs([...outgoing, ...incoming] as never, address);

  // Fill timestamps: one getBlock per distinct block (demo volume is tiny).
  const blocks = [...new Set(entries.map((e) => e.blockNumber))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blocks.map(async (bn) => {
      const block = await publicClient.getBlock({ blockNumber: bn });
      times.set(bn, Number(block.timestamp));
    }),
  );
  for (const e of entries) e.timestamp = times.get(e.blockNumber) ?? 0;

  return entries;
}

export async function getHistory(address: `0x${string}`): Promise<HistoryEntry[]> {
  let entries: HistoryEntry[] = [];
  try {
    entries = await fromIndexer(address);
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    try {
      entries = await fromLogs(getAddress(address));
    } catch {
      entries = [];
    }
  }
  // newest first
  return entries.sort((a, b) => Number(b.blockNumber - a.blockNumber));
}

// Balances stay a typed stub for now — the wallet reads USD₮ balance directly
// on-chain via the WDK handle, so this isn't on the critical path.
export async function getBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  void address;
  return [];
}
