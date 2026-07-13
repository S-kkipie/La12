"use client";

import { useEffect, useState } from "react";
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

/** Base units → a comma-free decimal string safe to drop into a number input
 *  (formatUsdt adds thousands separators, which a number input rejects). */
function toAmountInput(base: bigint): string {
  const whole = base / 1_000_000n;
  const frac = (base % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
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

  const [balance, setBalance] = useState<bigint | null>(null);

  const parsed = safeParseUsdt(amount);
  const value = parsed ?? 0n;
  const validAmount = parsed !== null && parsed > 0n;

  // Read the club's spendable USD₮ when the dialog opens — distribute pulls it
  // from this wallet, so an input above it would revert at safeTransferFrom.
  useEffect(() => {
    if (!open || !userId) { setBalance(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const w = await getWallet(userId);
        const b = await w.getUsdtBalance();
        if (!cancelled) setBalance(b);
      } catch {
        if (!cancelled) setBalance(null);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  // Revenue split preview — mirrors the contract's distribute() exactly:
  // holderCut = revenueBps% of input; credited is clamped to the remaining cap
  // room (capMultiple × raised − already distributed); the rest refunds to you.
  const cap = (round.raised * BigInt(round.capMultiple)) / 10_000n;
  const room = cap > round.distributed ? cap - round.distributed : 0n;
  const holderCut = (value * BigInt(round.revenueBps)) / 10_000n;
  const credited = holderCut > room ? room : holderCut;
  const refund = value > credited ? value - credited : 0n;
  const overBalance = balance !== null && value > balance;
  // Most revenue worth entering: enough to fill the cap room, capped by balance.
  const revenueToFillCap = room === 0n ? 0n : (room * 10_000n) / BigInt(round.revenueBps);
  const maxRevenue = balance !== null && balance < revenueToFillCap ? balance : revenueToFillCap;
  const canReview = validAmount && !overBalance && room > 0n;

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
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Your balance: {balance === null ? "…" : `${formatUsdt(balance)} USD₮`}</span>
              <span>Cap room: {formatUsdt(room)} USD₮ left</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="dist-amount">Revenue to distribute (USD₮)</Label>
                <button
                  type="button"
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-40"
                  disabled={maxRevenue === 0n}
                  onClick={() => setAmount(toAmountInput(maxRevenue))}
                >
                  Max
                </button>
              </div>
              <Input id="dist-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amount !== "" && !validAmount && <span className="text-xs text-destructive">Enter a valid amount.</span>}
              {overBalance && (
                <span className="text-xs text-destructive">Not enough USD₮ — you have {formatUsdt(balance ?? 0n)}.</span>
              )}
              {room === 0n && (
                <span className="text-xs text-destructive">Cap reached — holders can&apos;t receive more from this round.</span>
              )}
              {canReview && (
                <div className="mt-1 rounded-md bg-secondary/40 p-2.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Holders receive ({round.revenueBps / 100}%)</span>
                    <span className="font-medium text-primary">{formatUsdt(credited)} USD₮</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Refunds to you</span>
                    <span className="font-medium">{formatUsdt(refund)} USD₮</span>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button disabled={!canReview} onClick={() => setStep("review")}>Review</Button>
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
