"use client";

import { useState } from "react";
import { createWallet, signer } from "@/lib/wdk";
import { distribute } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";

type Props = {
  roundAddress: `0x${string}`;
};

/**
 * The demo "wow moment" (spec §7 step 7): simulates gate revenue landing on
 * the club's side and triggers the payout that fans then see as a rising
 * `pendingReward` on /wallet.
 *
 * NOTE: on-chain, `distribute()` is restricted to the round's own `club`
 * caller. This form uses whatever wallet the current browser is signed in
 * as — for the demo, that means the "club" role and the "fan" role are
 * played from two different browsers/devices, each with their own WDK
 * wallet. TODO(wire): a real club onboarding flow would pin a club's WDK
 * wallet address to its `clubs.wallet_address` row and enforce it here.
 */
export function DistributeForm({ roundAddress }: Props) {
  const [revenue, setRevenue] = useState("1000");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleDistribute() {
    setStatus("pending");
    setMessage(null);
    try {
      await createWallet(); // no-ops if a wallet already exists
      const account = await signer();
      const hash = await distribute(account, roundAddress, parseUsdt(revenue));
      setStatus("done");
      setMessage(`Recaudación distribuida — tx ${hash.slice(0, 10)}…`);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <label className="text-sm font-medium" htmlFor="revenue-amount">
        Recaudación a distribuir (USD₮)
      </label>
      <input
        id="revenue-amount"
        type="number"
        min="1"
        step="1"
        value={revenue}
        onChange={(e) => setRevenue(e.target.value)}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
      />
      <button
        onClick={handleDistribute}
        disabled={status === "pending"}
        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "pending" ? "Distribuyendo…" : "Distribuir recaudación"}
      </button>
      {message && (
        <p className={status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}>
          {message}
        </p>
      )}
    </div>
  );
}
