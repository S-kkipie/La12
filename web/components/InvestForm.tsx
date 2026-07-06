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
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundAddress, onInvested }: Props) {
  const { userId } = useCurrentUserId();
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function handleInvest() {
    if (!userId) return;
    setStatus("pending");
    const toastId = toast.loading("Preparando…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const value = parseUsdt(amount);

      // invest() does a transferFrom under the hood — approve first if the
      // round doesn't already have enough allowance from a previous invest.
      const allowance = await usdtAllowance(wallet.address, roundAddress);
      if (allowance < value) {
        toast.loading("Aprobando USD₮…", { id: toastId });
        await approveUsdt(wallet, roundAddress, value);
      }

      toast.loading("Invirtiendo…", { id: toastId });
      const hash = await invest(wallet, roundAddress, value);

      toast.success("¡Inversión confirmada!", { id: toastId });
      setStatus("done");
      onInvested?.(hash);
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="invest-amount">Monto a invertir (USD₮)</Label>
      <Input
        id="invest-amount"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-200">
        ⚠️ Sin reembolso. Comprás un derecho a % de ingresos del club, no una
        garantía. Si la ronda no llega a la meta, tu USD₮ igual va al club y
        cobrás según los ingresos reales. Tus llaves son tuyas.
      </p>
      <Button onClick={handleInvest} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Invirtiendo…" : "Invertir"}
      </Button>
    </Card>
  );
}
