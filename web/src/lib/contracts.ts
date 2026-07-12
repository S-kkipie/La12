// viem client + typed helpers for RevenueShareRound (spec §4). Reads go
// through a plain publicClient (used client-side by pages and server-side by
// /api/sync, and work identically in both wallet modes); writes encode
// calldata with viem and send it through a `WalletHandle` from lib/wdk.ts
// (`getWallet(userId)`), which hides whether that's a plain viem transaction
// (standard mode) or a UserOperation paid in USD₮ (erc4337 mode) — see
// walletMode.ts and wdk.ts `getWallet()`.
//
// ABIs come straight from the Foundry build in `contracts/` (see
// packages/abi/, the shared boundary between contracts and web per spec §3).
import { createPublicClient, encodeFunctionData, http } from "viem";
import { activeChain } from "./chain";
import type { WalletHandle } from "./wdk";
import { USDT_ADDRESS } from "./walletMode";
import revenueShareRoundAbiJson from "../../../packages/abi/RevenueShareRound.json";
import roundFactoryAbiJson from "../../../packages/abi/RoundFactory.json";
import mockUsdtAbiJson from "../../../packages/abi/MockUSDT.json";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const ROUND_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_ROUND_FACTORY as `0x${string}` | undefined;

export const revenueShareRoundAbi = revenueShareRoundAbiJson;
export const roundFactoryAbi = roundFactoryAbiJson;
export const mockUsdtAbi = mockUsdtAbiJson;

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

/** Round lifecycle enum as declared on-chain (RevenueShareRound.State). */
export const ROUND_STATE = ["Funding", "Active", "Closed"] as const;

export async function pendingReward(roundAddress: `0x${string}`, holder: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "pendingReward",
    args: [holder],
  }) as Promise<bigint>;
}

export async function shareBalance(roundAddress: `0x${string}`, holder: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "balanceOf",
    args: [holder],
  }) as Promise<bigint>;
}

export async function totalRaised(roundAddress: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "totalRaised",
  }) as Promise<bigint>;
}

export async function totalDistributedToHolders(roundAddress: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "totalDistributedToHolders",
  }) as Promise<bigint>;
}

export async function totalShares(roundAddress: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "totalSupply",
  }) as Promise<bigint>;
}

/**
 * Reads a contract value, falling back to `fallback` on error. Server-rendered
 * pages use this for the seeded demo round, whose contractAddress is still a
 * placeholder (spec §9: no round deployed to Sepolia yet) — without this, an
 * RPC call against a nonexistent contract would take the whole page down.
 */
export async function readSafely<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch {
    return fallback;
  }
}

export async function roundState(roundAddress: `0x${string}`) {
  const state = (await publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "state",
  })) as number;
  return ROUND_STATE[state];
}

/**
 * Both `invest()` and `distribute()` do a `transferFrom` under the hood, so
 * the round needs an ERC-20 allowance from the caller first — this pair
 * covers that (check → approve, only when short).
 */
export async function usdtAllowance(owner: `0x${string}`, spender: `0x${string}`) {
  if (!USDT_ADDRESS) throw new Error("NEXT_PUBLIC_USDT_ADDRESS no configurado");
  return publicClient.readContract({
    address: USDT_ADDRESS,
    abi: mockUsdtAbi,
    functionName: "allowance",
    args: [owner, spender],
  }) as Promise<bigint>;
}

/**
 * Approves `spender` for `amount` USD₮ and waits for the tx to be mined.
 *
 * Real USD₮ (mainnet) reverts `approve(spender, amount)` when the spender's
 * current allowance is already nonzero — Tether's contract bakes in the
 * classic ERC-20 approve race-condition mitigation, which requires resetting
 * to 0 before setting a new nonzero value. MockUSDT (local anvil/Sepolia)
 * doesn't enforce this, but resetting first is harmless there too, so this
 * path runs unconditionally rather than branching on which USD₮ we're
 * talking to. (Callers still do their own "is an approval even needed"
 * check via `usdtAllowance` before calling this — see InvestForm/
 * DistributeDialog — so this only runs when a top-up is already known to be
 * required.)
 */
export async function approveUsdt(wallet: WalletHandle, spender: `0x${string}`, amount: bigint) {
  if (!USDT_ADDRESS) throw new Error("NEXT_PUBLIC_USDT_ADDRESS no configurado");

  const current = await usdtAllowance(wallet.address, spender);
  if (current > 0n) {
    const resetData = encodeFunctionData({
      abi: mockUsdtAbi,
      functionName: "approve",
      args: [spender, 0n],
    });
    const resetHash = await wallet.execute({ to: USDT_ADDRESS, data: resetData });
    await publicClient.waitForTransactionReceipt({ hash: resetHash });
  }

  const data = encodeFunctionData({ abi: mockUsdtAbi, functionName: "approve", args: [spender, amount] });
  const hash = await wallet.execute({ to: USDT_ADDRESS, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function invest(wallet: WalletHandle, roundAddress: `0x${string}`, amount: bigint) {
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "invest", args: [amount] });
  const hash = await wallet.execute({ to: roundAddress, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function claim(wallet: WalletHandle, roundAddress: `0x${string}`) {
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "claim" });
  const hash = await wallet.execute({ to: roundAddress, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function distribute(wallet: WalletHandle, roundAddress: `0x${string}`, revenue: bigint) {
  const data = encodeFunctionData({
    abi: revenueShareRoundAbi,
    functionName: "distribute",
    args: [revenue],
  });
  const hash = await wallet.execute({ to: roundAddress, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

/** Club-only: retires the round (Active -> Closed). See RevenueShareRound.closeRound. */
export async function closeRound(wallet: WalletHandle, roundAddress: `0x${string}`) {
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "closeRound" });
  const hash = await wallet.execute({ to: roundAddress, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export type CreateRoundParams = {
  name: string;
  symbol: string;
  usdtToken: `0x${string}`;
  club: `0x${string}`;
  goal: bigint;
  sharePriceUsdt: bigint;
  revenueBps: bigint;
  capMultiple: bigint;
  deadline: bigint;
};

/**
 * Deploys a new RevenueShareRound via RoundFactory, signed by the club's
 * WDK-derived wallet, and returns the deployed round's address (predicted by
 * a read-only simulation — no key needed for that part, just the caller's
 * address — then confirmed on-chain by waiting for the real transaction's
 * receipt: the round genuinely exists once this resolves).
 *
 * KNOWN LOW (accepted, not fixed): the predicted address from
 * `simulateContract` could theoretically be stale if another tx from this
 * same factory lands between the simulation and our real send, changing the
 * factory's deploy nonce/salt. Demo-safe (single-club-at-a-time usage,
 * no concurrent round creation in practice) — a real fix would re-derive the
 * address from the `RoundCreated` event in the actual receipt instead.
 */
export async function createRoundOnChain(
  wallet: WalletHandle,
  params: CreateRoundParams,
): Promise<`0x${string}`> {
  if (!ROUND_FACTORY_ADDRESS) throw new Error("NEXT_PUBLIC_ROUND_FACTORY no configurado");

  const args = [
    params.name,
    params.symbol,
    params.usdtToken,
    params.club,
    params.goal,
    params.sharePriceUsdt,
    params.revenueBps,
    params.capMultiple,
    params.deadline,
  ] as const;

  const { result } = await publicClient.simulateContract({
    address: ROUND_FACTORY_ADDRESS,
    abi: roundFactoryAbi,
    functionName: "createRound",
    args,
    account: wallet.address,
  });

  const data = encodeFunctionData({ abi: roundFactoryAbi, functionName: "createRound", args });
  const hash = await wallet.execute({ to: ROUND_FACTORY_ADDRESS, data });
  await publicClient.waitForTransactionReceipt({ hash });
  return result as `0x${string}`;
}
