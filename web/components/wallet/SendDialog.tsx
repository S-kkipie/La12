"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { toast } from "sonner";
import type { WalletHandle } from "@/lib/wdk";
import { parseUsdt, formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
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

export function SendDialog({
  open,
  onOpenChange,
  wallet,
  balance,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallet: WalletHandle | null;
  balance: bigint;
  onSent?: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [sending, setSending] = useState(false);

  const validAddress = isAddress(recipient);
  const parsed = safeParseUsdt(amount);
  const value = parsed ?? 0n;
  const validAmount = parsed !== null && parsed > 0n;
  const overBalance = validAmount && value > balance;
  const canReview = validAddress && validAmount && !overBalance;

  function reset() {
    setStep("form");
    setSending(false);
  }

  async function handleSend() {
    if (!wallet || !canReview) return;
    setSending(true);
    const toastId = toast.loading("Sending…");
    try {
      const hash = await wallet.transferUsdt(recipient as `0x${string}`, value);
      toast.success("Sent!", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank", "noopener,noreferrer") },
      });
      onSent?.();
      onOpenChange(false);
      setRecipient("");
      setAmount("");
      reset();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send USD₮</DialogTitle>
          <DialogDescription>
            {step === "form" ? "To any address on Sepolia." : "Confirm — this is irreversible."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-to">Recipient address</Label>
              <Input id="send-to" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              {recipient !== "" && !validAddress && (
                <span className="text-xs text-destructive">Not a valid address.</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-amount">Amount (USD₮)</Label>
              <Input id="send-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="text-xs text-muted-foreground">Balance: {formatUsdt(balance)} USD₮</span>
              {overBalance && <span className="text-xs text-destructive">More than your balance.</span>}
              {!overBalance && amount !== "" && !validAmount && (
                <span className="text-xs text-destructive">Not a valid amount.</span>
              )}
            </div>
            <DialogFooter>
              <Button disabled={!canReview} onClick={() => setStep("review")}>
                Review
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="text-xs text-muted-foreground">You&apos;re sending</div>
              <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(value)} USD₮</div>
              <div className="mt-2 text-xs text-muted-foreground">
                to <span className="font-mono text-foreground">{shortenAddress(recipient)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">This transfer cannot be undone. Double-check the address.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")} disabled={sending}>
                Back
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? "Sending…" : "Confirm send"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
