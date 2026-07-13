"use client";

import { useState } from "react";
import { toast } from "sonner";
import { walletMode } from "@/lib/walletMode";
import { friendlyError } from "@/lib/txError";
import { useOps } from "@/core/ops/client/hooks";
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
  const { useFundGas, useMintUsdt, useMoonpay } = useOps();
  const fundGas = useFundGas();
  const mintUsdt = useMintUsdt();
  const moonpay = useMoonpay();

  async function openMoonpay() {
    setBusy("moonpay");
    try {
      const result = await moonpay.mutateAsync({ address, amountUsd: 50 });
      window.open(result.response.widgetUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open MoonPay.");
    } finally {
      setBusy(null);
    }
  }

  async function faucet(kind: "usdt" | "gas") {
    setBusy(kind);
    const toastId = toast.loading(kind === "usdt" ? "Getting test USD₮…" : "Getting gas ETH…");
    try {
      const result = kind === "usdt" ? await mintUsdt.mutateAsync({ address }) : await fundGas.mutateAsync({ address });
      if ("skipped" in result.response) {
        toast.warning(result.response.reason, { id: toastId });
      } else {
        toast.success(kind === "usdt" ? "Test USD₮ received" : "Gas ETH received", { id: toastId });
        onFunded?.();
      }
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
          <Button onClick={openMoonpay} disabled={busy !== null}>
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
