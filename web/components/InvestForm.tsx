"use client";

import { useState } from "react";
import { toast } from "sonner";
import { createWallet, signer } from "@/lib/wdk";
import { approveUsdt, invest, publicClient, usdtAllowance } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";

type Props = {
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundAddress, onInvested }: Props) {
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function handleInvest() {
    setStatus("pending");
    const toastId = toast.loading("Preparando…");
    try {
      await createWallet(); // no-ops if a wallet already exists
      const account = await signer();
      const value = parseUsdt(amount);

      // invest() does a transferFrom under the hood — approve first if the
      // round doesn't already have enough allowance from a previous invest.
      const allowance = await usdtAllowance(account.address, roundAddress);
      if (allowance < value) {
        toast.loading("Aprobando USD₮…", { id: toastId });
        await approveUsdt(account, roundAddress, value);
      }

      toast.loading("Invirtiendo…", { id: toastId });
      const hash = await invest(account, roundAddress, value);
      await publicClient.waitForTransactionReceipt({ hash });

      toast.success("¡Inversión confirmada!", { id: toastId });
      setStatus("done");
      onInvested?.(hash);
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <label className="text-sm font-medium" htmlFor="invest-amount">
        Monto a invertir (USD₮)
      </label>
      <input
        id="invest-amount"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="rounded-lg border border-black/10 bg-transparent px-3 py-2 dark:border-white/10"
      />
      <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ Sin reembolso. Comprás un derecho a % de ingresos del club, no una
        garantía. Si la ronda no llega a la meta, tu USD₮ igual va al club y
        cobrás según los ingresos reales. Tus llaves son tuyas.
      </p>
      <button
        onClick={handleInvest}
        disabled={status === "pending"}
        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "pending" ? "Invirtiendo…" : "Invertir"}
      </button>
    </div>
  );
}
