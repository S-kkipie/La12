"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { approveUsdt, distribute, usdtAllowance } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
      const wallet = await getWallet(userId);
      const value = parseUsdt(revenue);

      // distribute() also does a transferFrom (pulls the revenue in) —
      // approve first if needed, same as invest().
      const allowance = await usdtAllowance(wallet.address, roundAddress);
      if (allowance < value) {
        toast.loading("Aprobando USD₮…", { id: toastId });
        await approveUsdt(wallet, roundAddress, value);
      }

      toast.loading("Distribuyendo…", { id: toastId });
      await distribute(wallet, roundAddress, value);

      toast.success("Reparto enviado", { id: toastId });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="revenue-amount">Recaudación a distribuir (USD₮)</Label>
      <Input
        id="revenue-amount"
        type="number"
        min="1"
        step="1"
        value={revenue}
        onChange={(e) => setRevenue(e.target.value)}
      />
      <Button onClick={handleDistribute} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Distribuyendo…" : "Distribuir recaudación"}
      </Button>
    </Card>
  );
}
