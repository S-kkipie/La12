// viem client + typed helpers for RevenueShareRound (spec §4). Reads go
// through a plain publicClient (used client-side by pages and server-side by
// /api/sync); writes go through a walletClient built on the WDK-derived
// signer from wdk.ts (see lib/wdk.ts `signer()` for how the two connect).
//
// ABIs come straight from the Foundry build in `contracts/` (see
// packages/abi/, the shared boundary between contracts and web per spec §3).
import { createPublicClient, createWalletClient, http, type LocalAccount } from "viem";
import { activeChain } from "./chain";
import revenueShareRoundAbiJson from "../../packages/abi/RevenueShareRound.json";
import roundFactoryAbiJson from "../../packages/abi/RoundFactory.json";
import mockUsdtAbiJson from "../../packages/abi/MockUSDT.json";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const USDT_ADDRESS = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;

export const revenueShareRoundAbi = revenueShareRoundAbiJson;
export const roundFactoryAbi = roundFactoryAbiJson;
export const mockUsdtAbi = mockUsdtAbiJson;

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(RPC_URL),
});

function walletClientFor(account: LocalAccount) {
  return createWalletClient({ account, chain: activeChain, transport: http(RPC_URL) });
}

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

/** Approves `spender` for `amount` USD₮ and waits for the tx to be mined. */
export async function approveUsdt(account: LocalAccount, spender: `0x${string}`, amount: bigint) {
  if (!USDT_ADDRESS) throw new Error("NEXT_PUBLIC_USDT_ADDRESS no configurado");
  const walletClient = walletClientFor(account);
  const hash = await walletClient.writeContract({
    address: USDT_ADDRESS,
    abi: mockUsdtAbi,
    functionName: "approve",
    args: [spender, amount],
    chain: activeChain,
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

export async function invest(account: LocalAccount, roundAddress: `0x${string}`, amount: bigint) {
  const walletClient = walletClientFor(account);
  return walletClient.writeContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "invest",
    args: [amount],
    chain: activeChain,
  });
}

export async function claim(account: LocalAccount, roundAddress: `0x${string}`) {
  const walletClient = walletClientFor(account);
  return walletClient.writeContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "claim",
    chain: activeChain,
  });
}

export async function distribute(
  account: LocalAccount,
  roundAddress: `0x${string}`,
  revenue: bigint,
) {
  const walletClient = walletClientFor(account);
  return walletClient.writeContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "distribute",
    args: [revenue],
    chain: activeChain,
  });
}
