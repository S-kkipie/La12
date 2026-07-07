"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { approveUsdt, invest, usdtAllowance } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  roundId: number;
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundId, roundAddress, onInvested }: Props) {
  const { userId } = useCurrentUserId();
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function handleInvest() {
    if (!userId) return;
    setStatus("pending");
    const toastId = toast.loading("Preparing…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const value = parseUsdt(amount);

      // invest() does a transferFrom under the hood — approve first if the
      // round doesn't already have enough allowance from a previous invest.
      const allowance = await usdtAllowance(wallet.address, roundAddress);
      if (allowance < value) {
        toast.loading("Approving USD₮…", { id: toastId });
        await approveUsdt(wallet, roundAddress, value);
      }

      toast.loading("Investing…", { id: toastId });
      const hash = await invest(wallet, roundAddress, value);

      // Best-effort: if this investment crossed the goal, close funding now
      // so the club receives the raised USD₮ immediately. A failure here
      // never blocks the fan's own successful investment.
      fetch(`/api/rounds/${roundId}/close-check`, { method: "POST" }).catch(() => {});

      toast.success("Investment confirmed!", { id: toastId });
      setStatus("done");
      onInvested?.(hash);
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="invest-amount">Amount to invest (USD₮)</Label>
      <Input
        id="invest-amount"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-200">
        ⚠️ No refunds. You&apos;re buying a right to a % of the club&apos;s
        revenue, not a guarantee. If the round doesn&apos;t reach its goal,
        your USD₮ still goes to the club and you get paid based on real
        revenue. Your keys are yours.
      </p>
      <Button onClick={handleInvest} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Investing…" : "Invest"}
      </Button>
    </Card>
  );
}
