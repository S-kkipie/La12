"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createWallet } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";

/**
 * Onboarding CTA (spec §7): one tap creates the fan's self-custody wallet
 * (Yape-style — no seed phrase shown) and the server covers gas so the very
 * next action (invest) doesn't need the fan to hold any ETH.
 */
export function EntrarButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "entering">("idle");

  async function handleEntrar() {
    setStatus("entering");
    try {
      const { address } = await createWallet();
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "No se pudo cubrir el gas — probá invertir igual.");
      }
      router.push("/wallet");
    } catch (err) {
      toast.error(friendlyError(err));
      setStatus("idle");
    }
  }

  return (
    <button
      onClick={handleEntrar}
      disabled={status === "entering"}
      className="rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
    >
      {status === "entering" ? "Entrando…" : "Entrar"}
    </button>
  );
}
