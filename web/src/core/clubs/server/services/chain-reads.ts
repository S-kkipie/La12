import "server-only";
import { parseAbiItem } from "viem";
import { publicClient, totalShares, shareBalance, pendingReward, readSafely } from "@/lib/contracts";
import type { Holder } from "@/core/clubs/domain/types";

// getRoundInvestors/getRoundHolders/backer-count only see `Invested` events from
// roughly the last LOG_WINDOW blocks (public-RPC eth_getLogs cap), so on an old
// round the holder cap-table and backer count can undercount. `raised`/`distributed`
// totals are unaffected — they're direct contract reads, not log-derived.
export const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs (~40-50k blocks)

const INVESTED_EVENT = parseAbiItem(
  "event Invested(address indexed investor, uint256 usdtAmount, uint256 sharesMinted)",
);

/** Earliest block to scan for logs, bounded by LOG_WINDOW below the chain tip. */
export async function windowFromBlock(): Promise<bigint> {
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
