"use client";

import { useState } from "react";
import { createWallet, signer } from "@/lib/wdk";
import { invest } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";

type Props = {
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundAddress, onInvested }: Props) {
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleInvest() {
    setStatus("pending");
    setMessage(null);
    try {
      await createWallet(); // no-ops if a wallet already exists
      const account = await signer();
      const hash = await invest(account, roundAddress, parseUsdt(amount));
      setStatus("done");
      setMessage(`Listo — tx ${hash.slice(0, 10)}…`);
      onInvested?.(hash);
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
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
      {message && (
        <p className={status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}>
          {message}
        </p>
      )}
    </div>
  );
}
