"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { createWallet, signer } from "@/lib/wdk";
import { claim, pendingReward, publicClient } from "@/lib/contracts";
import { formatUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";

type Props = {
  roundAddress: `0x${string}`;
};

export function ClaimButton({ roundAddress }: Props) {
  const [pending, setPending] = useState<bigint | null>(null);
  const [status, setStatus] = useState<"idle" | "claiming">("idle");

  const refresh = useCallback(async () => {
    try {
      const { address } = await createWallet(); // no-ops if a wallet already exists
      setPending(await pendingReward(roundAddress, address as `0x${string}`));
    } catch (err) {
      toast.error(friendlyError(err));
    }
  }, [roundAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleClaim() {
    setStatus("claiming");
    const toastId = toast.loading("Reclamando…");
    try {
      // claim() pulls nothing from the caller (only pays out) — no approve needed.
      const account = await signer();
      const hash = await claim(account, roundAddress);
      await publicClient.waitForTransactionReceipt({ hash });

      toast.success("¡Cobrado!", { id: toastId });
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setStatus("idle");
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
    </div>
  );
}
