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

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

export const revenueShareRoundAbi = revenueShareRoundAbiJson;
export const roundFactoryAbi = roundFactoryAbiJson;

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
