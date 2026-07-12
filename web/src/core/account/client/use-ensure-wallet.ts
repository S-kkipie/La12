"use client";
import { toast } from "sonner";
import { createWallet, getWallet } from "@/lib/wdk";
import { walletMode } from "@/lib/walletMode";
import { useAccount } from "./hooks";

/**
 * Returns an imperative `ensureWallet(userId)` callback (a bare fn can't call
 * hooks, so this is a hook that closes over the link mutation). Creates (or
 * loads) this user's local WDK wallet and links its address to the server.
 * Idempotent — the server upserts, and createWallet() no-ops if a wallet
 * already exists on this device for this userId.
 *
 * A freshly minted wallet (isNew) has 0 ETH, so in `standard` mode its first
 * invest/approve would fail with "insufficient funds for gas" — best-effort
 * fund it via the gas sponsor (/api/faucet). Deliberately best-effort: on a
 * real testnet without SPONSOR_PK (or a dry relayer) it fails silently past a
 * soft toast, since the "Get gas ETH" button in /wallet is the fallback either
 * way. Skipped in `erc4337` mode (that wallet pays gas in USD₮ via the
 * paymaster and never needs ETH).
 *
 * TODO(wire): only recovers the wallet on the SAME device that created it —
 * the seed never leaves the device by design (self-custody), so a fresh login
 * on a new device mints a new address rather than recovering the original. A
 * real recovery-phrase UX is out of scope.
 *
 * Links `getWallet(userId).address`, NOT createWallet's return — in erc4337
 * mode those differ (EOA vs the Safe smart-account address), and the smart
 * account is the one that holds funds and sends txs. createWallet is still
 * called for `isNew` (the gas-fund decision); getWallet's `.address` is acted on.
 */
export function useEnsureWallet() {
  const { useLinkWallet } = useAccount();
  const linkWallet = useLinkWallet();

  return async function ensureWallet(userId: string): Promise<string> {
    const { isNew } = await createWallet(userId);
    const wallet = await getWallet(userId);

    // eden-tanstack's mutationFn throws result.error on an API error (verified
    // in dist: `if (result.error) throw result.error`), so mutateAsync rejects
    // on failure — no `.error` to check. Rethrow a friendly Spanish message so
    // EnsureWallet's friendlyError has one (matches the legacy fetch UX).
    try {
      await linkWallet.mutateAsync({ walletAddress: wallet.address });
    } catch {
      throw new Error("No se pudo vincular la billetera");
    }

    if (isNew && walletMode() === "standard") {
      await fundGasBestEffort(wallet.address);
    }
    return wallet.address;
  };
}

async function fundGasBestEffort(address: string): Promise<void> {
  try {
    const res = await fetch("/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.warning(
        data.error ?? "No se pudo cubrir el gas automáticamente — usá 'Conseguir ETH de gas' en tu billetera.",
      );
    }
  } catch {
    toast.warning(
      "No se pudo cubrir el gas automáticamente — usá 'Conseguir ETH de gas' en tu billetera.",
    );
  }
}
