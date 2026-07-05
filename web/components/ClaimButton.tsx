"use client";

import { useCallback, useEffect, useState } from "react";
import { createWallet, signer } from "@/lib/wdk";
import { claim, pendingReward } from "@/lib/contracts";
import { formatUsdt } from "@/lib/format";

type Props = {
  roundAddress: `0x${string}`;
};

export function ClaimButton({ roundAddress }: Props) {
  const [pending, setPending] = useState<bigint | null>(null);
  const [status, setStatus] = useState<"idle" | "claiming" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { address } = await createWallet(); // no-ops if a wallet already exists
      setPending(await pendingReward(roundAddress, address as `0x${string}`));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [roundAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleClaim() {
    setStatus("claiming");
    setMessage(null);
    try {
      const account = await signer();
      await claim(account, roundAddress);
      setMessage("¡Reclamado! Tu USD₮ ya está en tu billetera.");
      await refresh();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const hasReward = (pending ?? 0n) > 0n;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-black">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">Tu recompensa pendiente</div>
      <div className="text-xl font-semibold">{formatUsdt(pending ?? 0n)} USD₮</div>
      <button
        onClick={handleClaim}
        disabled={!hasReward || status === "claiming"}
        className="mt-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "claiming" ? "Reclamando…" : "Reclamar"}
      </button>
      {message && (
        <p className={status === "error" ? "text-sm text-red-600" : "text-sm text-emerald-700"}>
          {message}
        </p>
      )}
    </div>
  );
}
