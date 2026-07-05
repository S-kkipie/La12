"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { createWallet, getUsdtBalance } from "@/lib/wdk";
import { usdtToFiat } from "@/lib/pricing";
import { getHistory, type HistoryEntry } from "@/lib/indexer";
import { formatUsdt, formatFiat } from "@/lib/format";
import { friendlyError } from "@/lib/txError";

export function WalletCard() {
  const [address, setAddress] = useState<string | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [fiat, setFiat] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fundingMoonpay, setFundingMoonpay] = useState(false);
  const [fundingFaucet, setFundingFaucet] = useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const { address: addr } = await createWallet(); // no-ops if a wallet already exists
      setAddress(addr);

      const bal = await getUsdtBalance();
      setBalance(bal);
      setFiat(await usdtToFiat(bal));
      setHistory(await getHistory(addr as `0x${string}`));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function fundWithMoonpay() {
    if (!address) return;
    setFundingMoonpay(true);
    try {
      const res = await fetch("/api/moonpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amountUsd: 50 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo abrir MoonPay.");
        return;
      }
      window.open(data.widgetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setFundingMoonpay(false);
    }
  }

  async function fundWithTestFaucet() {
    if (!address) return;
    setFundingFaucet(true);
    const toastId = toast.loading("Consiguiendo USD₮ de prueba…");
    try {
      const res = await fetch("/api/faucet-usdt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "No se pudo conseguir USD₮ de prueba.", { id: toastId });
        return;
      }
      toast.success("USD₮ de prueba recibido", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setFundingFaucet(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
        Cargando billetera…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        No se pudo cargar tu billetera: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Tu dirección</div>
        <div className="truncate font-mono text-sm">{address}</div>
      </div>

      <div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">Balance USD₮</div>
        <div className="text-2xl font-semibold">{formatUsdt(balance ?? 0n)} USD₮</div>
        {fiat !== null && (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">≈ {formatFiat(fiat)}</div>
        )}
      </div>

      <button
        onClick={fundWithMoonpay}
        disabled={fundingMoonpay}
        className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {fundingMoonpay ? "Abriendo MoonPay…" : "Fondear con MoonPay"}
      </button>

      <div className="flex flex-col gap-1 rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          USD₮ de prueba — solo demo local
        </span>
        <button
          onClick={fundWithTestFaucet}
          disabled={fundingFaucet}
          className="self-start rounded-full border border-emerald-600 px-5 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
        >
          {fundingFaucet ? "Consiguiendo…" : "Conseguir 5,000 USD₮ de prueba"}
        </button>
      </div>

      <div>
        <div className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">Movimientos</div>
        {history.length === 0 ? (
          <div className="text-sm text-zinc-400">Aún no hay movimientos.</div>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((entry) => (
              <li key={entry.hash} className="flex justify-between">
                <span>{entry.kind === "in" ? "Recibido" : "Enviado"}</span>
                <span>{formatUsdt(entry.amount)} USD₮</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
