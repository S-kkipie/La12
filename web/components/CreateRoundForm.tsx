"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { createRoundOnChain } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";

type Props = {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}`;
};

/** Deploys a real RevenueShareRound via RoundFactory, then registers it. */
export function CreateRoundForm({ clubName, clubWalletAddress, usdtAddress }: Props) {
  const router = useRouter();
  const { userId } = useCurrentUserId();
  const [goal, setGoal] = useState("40000");
  const [sharePrice, setSharePrice] = useState("1");
  const [revenueBps, setRevenueBps] = useState("800");
  const [capMultiple, setCapMultiple] = useState("15000");
  const [deadlineDays, setDeadlineDays] = useState("90");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!userId) return;
    setSubmitting(true);
    const toastId = toast.loading("Desplegando ronda…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86_400);

      const contractAddress = await createRoundOnChain(wallet, {
        name: `${clubName} Round`,
        symbol: "LDR",
        usdtToken: usdtAddress,
        club: clubWalletAddress,
        goal: parseUsdt(goal),
        sharePriceUsdt: parseUsdt(sharePrice),
        revenueBps: BigInt(revenueBps),
        capMultiple: BigInt(capMultiple),
        deadline,
      });

      toast.loading("Registrando ronda…", { id: toastId });
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress,
          goal: parseUsdt(goal).toString(),
          sharePrice: parseUsdt(sharePrice).toString(),
          revenueBps: Number(revenueBps),
          capMultiple: Number(capMultiple),
          deadline: new Date(Number(deadline) * 1000).toISOString(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo registrar la ronda", { id: toastId });
        return;
      }

      toast.success("¡Ronda creada!", { id: toastId });
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <h3 className="font-semibold">Crear nueva ronda</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Meta (USD₮)
          <input
            type="number"
            min="1"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Precio por share (USD₮)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={sharePrice}
            onChange={(e) => setSharePrice(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Reparto (bps, 800 = 8%)
          <input
            type="number"
            min="1"
            max="10000"
            value={revenueBps}
            onChange={(e) => setRevenueBps(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Tope (bps, 15000 = 1.5x)
          <input
            type="number"
            min="1"
            value={capMultiple}
            onChange={(e) => setCapMultiple(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          Plazo (días)
          <input
            type="number"
            min="1"
            value={deadlineDays}
            onChange={(e) => setDeadlineDays(e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-3 py-2 text-sm text-zinc-900 dark:border-white/10 dark:text-zinc-100"
          />
        </label>
      </div>
      <button
        onClick={handleCreate}
        disabled={!userId || submitting}
        className="self-start rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {submitting ? "Desplegando…" : "Crear ronda"}
      </button>
    </div>
  );
}
