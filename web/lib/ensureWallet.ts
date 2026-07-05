// Shared "make sure this account has a wallet, and the server knows its
// address" step. Used right after signup, right after login, and as a
// self-heal on /wallet + /dashboard's first load in case an earlier attempt
// got interrupted (spec bug B: signUp commits the account before the wallet
// is linked, so a dropped request could otherwise leave someone stuck).
"use client";

import { createWallet } from "./wdk";

/**
 * Creates (or loads) this user's local WDK wallet and POSTs its address to
 * the server. Idempotent — /api/account/wallet upserts, and createWallet()
 * itself no-ops if a wallet already exists on this device for this userId.
 *
 * TODO(wire): this only recovers the wallet on the SAME browser/device that
 * created it — the seed never leaves the device by design (self-custody), so
 * logging in fresh on a new device currently mints a brand-new address rather
 * than recovering the original one. A real recovery-phrase UX is out of
 * scope for this fix.
 */
export async function ensureWalletLinked(userId: string): Promise<string> {
  const { address } = await createWallet(userId);

  const res = await fetch("/api/account/wallet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: address }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "No se pudo vincular la billetera");
  }

  return address;
}
