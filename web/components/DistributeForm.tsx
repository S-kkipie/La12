"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, signer } from "@/lib/wdk";
import { approveUsdt, distribute, publicClient, usdtAllowance } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";

type Props = {
  roundAddress: `0x${string}`;
};

/**
 * The demo "wow moment" (spec §7 step 7): simulates gate revenue landing on
 * the club's side and triggers the payout that fans then see as a rising
 * `pendingReward` on /wallet.
 *
 * On-chain, `distribute()` is restricted to the round's own `club` caller.
 * This form is only ever rendered from /dashboard, which resolves "which
 * club" from the logged-in session (clubs.userId) — never a public page — so
 * the signer here really is that club's own wallet, not "whoever's browser".
 */
export function DistributeForm({ roundAddress }: Props) {
  const { userId } = useCurrentUserId();
  const [revenue, setRevenue] = useState("1000");
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function handleDistribute() {
    if (!userId) return;
    setStatus("pending");
    const toastId = toast.loading("Preparando…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const account = await signer(userId);
      const value = parseUsdt(revenue);

      // distribute() also does a transferFrom (pulls the revenue in) —
      // approve first if needed, same as invest().
      const allowance = await usdtAllowance(account.address, roundAddress);
      if (allowance < value) {
        toast.loading("Aprobando USD₮…", { id: toastId });
        await approveUsdt(account, roundAddress, value);
      }

      toast.loading("Distribuyendo…", { id: toastId });
      const hash = await distribute(account, roundAddress, value);
      await publicClient.waitForTransactionReceipt({ hash });

      toast.success("Reparto enviado", { id: toastId });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
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
        disabled={!userId || status === "pending"}
        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "pending" ? "Distribuyendo…" : "Distribuir recaudación"}
      </button>
    </div>
  );
}
