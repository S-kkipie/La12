"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { getWallet } from "@/lib/wdk";
import { approveUsdt, distribute, usdtAllowance } from "@/lib/contracts";
import { parseUsdt, formatUsdt, explorerTxUrl } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import type { ClubRoundView } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeParseUsdt(input: string): bigint | null {
  if (input.trim() === "") return null;
  try {
    return parseUsdt(input);
  } catch {
    return null;
  }
}

export function DistributeDialog({
  open,
  onOpenChange,
  round,
  onDistributed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: ClubRoundView;
  onDistributed?: () => void;
}) {
  const { userId } = useCurrentUserId();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [busy, setBusy] = useState(false);

  const parsed = safeParseUsdt(amount);
  const value = parsed ?? 0n;
  const validAmount = parsed !== null && parsed > 0n;

  function reset() {
    setStep("form");
    setBusy(false);
  }

  async function handleDistribute() {
    if (!userId || !validAmount) return;
    setBusy(true);
    const toastId = toast.loading("Preparing…");
    try {
      const wallet = await getWallet(userId);
      const allowance = await usdtAllowance(wallet.address, round.contractAddress);
      if (allowance < value) {
        toast.loading("Approving USD₮…", { id: toastId });
        await approveUsdt(wallet, round.contractAddress, value);
      }
      toast.loading("Distributing…", { id: toastId });
      const hash = await distribute(wallet, round.contractAddress, value);
      toast.success("Distribution sent", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank", "noopener,noreferrer") },
      });
      onDistributed?.();
      onOpenChange(false);
      setAmount("");
      reset();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Distribute revenue</DialogTitle>
          <DialogDescription>
            {step === "form" ? "Pay revenue to this round's holders." : "Confirm the distribution."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dist-amount">Revenue to distribute (USD₮)</Label>
              <Input id="dist-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amount !== "" && !validAmount && <span className="text-xs text-destructive">Enter a valid amount.</span>}
              <span className="text-xs text-muted-foreground">
                Holders receive {round.revenueBps / 100}% of revenue, up to the round&apos;s cap.
              </span>
            </div>
            <DialogFooter>
              <Button disabled={!validAmount} onClick={() => setStep("review")}>Review</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="text-xs text-muted-foreground">You&apos;re distributing</div>
              <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(value)} USD₮</div>
              <div className="mt-2 text-xs text-muted-foreground">to {round.name} holders</div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")} disabled={busy}>Back</Button>
              <Button onClick={handleDistribute} disabled={busy}>{busy ? "Distributing…" : "Confirm"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
