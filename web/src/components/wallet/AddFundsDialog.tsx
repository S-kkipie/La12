"use client";

import { useState } from "react";
import { toast } from "sonner";
import { walletMode } from "@/lib/walletMode";
import { friendlyError } from "@/lib/txError";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AddFundsDialog({
  open,
  onOpenChange,
  address,
  onFunded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
  onFunded?: () => void;
}) {
  const [busy, setBusy] = useState<"moonpay" | "usdt" | "gas" | null>(null);

  async function moonpay() {
    setBusy("moonpay");
    try {
      const res = await fetch("/api/moonpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amountUsd: 50 }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not open MoonPay.");
      window.open(data.widgetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  async function faucet(kind: "usdt" | "gas") {
    setBusy(kind);
    const path = kind === "usdt" ? "/api/faucet-usdt" : "/api/faucet";
    const toastId = toast.loading(kind === "usdt" ? "Getting test USD₮…" : "Getting gas ETH…");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not get funds.", { id: toastId });
      toast.success(kind === "usdt" ? "Test USD₮ received" : "Gas ETH received", { id: toastId });
      onFunded?.();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Buy USD₮ with a card, straight to your self-custody wallet.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button onClick={moonpay} disabled={busy !== null}>
            {busy === "moonpay" ? "Opening MoonPay…" : "Buy with MoonPay"}
          </Button>
          {walletMode() === "standard" && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <span className="text-xs text-muted-foreground">Test funds — local/testnet demo</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => faucet("usdt")} disabled={busy !== null}>
                  {busy === "usdt" ? "Getting…" : "Get 5,000 test USD₮"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => faucet("gas")} disabled={busy !== null}>
                  {busy === "gas" ? "Getting…" : "Get gas ETH"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
