// Gas sponsor, "approach B" (spec §5): the server pre-funds a small amount of
// Sepolia ETH so the fan can pay gas for their own invest/claim transactions.
// The relayer only ever sends its own ETH — it never touches the fan's key,
// so self-custody stays intact. Server-only; SPONSOR_PK must never reach the
// client bundle.
import { createWalletClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "./chain";
import { publicClient, revenueShareRoundAbi } from "./contracts";

const RPC_URL =
  process.env.RPC_URL ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";

// Default: 0.002 ETH — enough for a handful of testnet invest/claim calls.
const FUND_AMOUNT_WEI = BigInt(process.env.SPONSOR_FUND_WEI ?? "2000000000000000");

export type FundGasResult = { hash: `0x${string}` } | { skipped: true; reason: string };

/** Sends a small, fixed amount of Sepolia ETH to `recipient` to cover gas. */
export async function fundGas(recipient: `0x${string}`): Promise<FundGasResult> {
  const pk = process.env.SPONSOR_PK;
  if (!pk) {
    // No-op cleanly rather than throwing: lets the rest of the app build/run
    // (e.g. in CI, or a judge's machine) without a funded relayer configured.
    return { skipped: true, reason: "SPONSOR_PK no configurado — gas sponsor deshabilitado." };
  }

  const account = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: activeChain, transport: http(RPC_URL) });

  const hash = await walletClient.sendTransaction({
    to: recipient,
    value: FUND_AMOUNT_WEI,
  });

  return { hash };
}

/**
 * Calls `closeFunding()` on `roundAddress`, paid by the sponsor relayer.
 * `closeFunding()` has no access control on-chain — the sponsor is acting as
 * "anyone", the same way a fan or the club themselves could call it directly.
 * Swallows failures (already closed by a concurrent trigger, or SPONSOR_PK
 * not configured) — the caller always re-reads the contract's real `state()`
 * afterward regardless of whether this call succeeded.
 */
export async function closeFundingSponsored(roundAddress: `0x${string}`): Promise<void> {
  const pk = process.env.SPONSOR_PK;
  if (!pk) return;

  const account = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: activeChain, transport: http(RPC_URL) });
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "closeFunding" });

  try {
    const hash = await walletClient.sendTransaction({ to: roundAddress, data });
    await publicClient.waitForTransactionReceipt({ hash });
  } catch {
    // Not due yet, or another concurrent trigger already closed it — ignore.
  }
}
