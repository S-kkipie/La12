// Shared "make sure this account has a wallet, and the server knows its
// address" step. Used right after signup, right after login, and as a
// self-heal on /wallet + /dashboard's first load in case an earlier attempt
// got interrupted (spec bug B: signUp commits the account before the wallet
// is linked, so a dropped request could otherwise leave someone stuck).
"use client";

import { toast } from "sonner";
import { createWallet } from "./wdk";

/**
 * Creates (or loads) this user's local WDK wallet and POSTs its address to
 * the server. Idempotent — /api/account/wallet upserts, and createWallet()
 * itself no-ops if a wallet already exists on this device for this userId.
 *
 * A freshly minted wallet (isNew) has 0 ETH, so its very first invest/
 * approve would otherwise fail with "insufficient funds for gas" — best-
 * effort fund it via the gas sponsor (/api/faucet). This is deliberately
 * best-effort: on a real testnet without SPONSOR_PK configured (or if the
 * relayer is dry) it fails silently past a soft toast, since the "Conseguir
 * ETH de gas" button on /wallet (WalletCard) is the fallback either way.
 *
 * TODO(wire): this only recovers the wallet on the SAME browser/device that
 * created it — the seed never leaves the device by design (self-custody), so
 * logging in fresh on a new device currently mints a brand-new address rather
 * than recovering the original one. A real recovery-phrase UX is out of
 * scope for this fix.
 */
export async function ensureWalletLinked(userId: string): Promise<string> {
  const { address, isNew } = await createWallet(userId);

  const res = await fetch("/api/account/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo vincular la billetera");
  }

  if (isNew) {
    await fundGasBestEffort(address);
  }

  return address;
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
