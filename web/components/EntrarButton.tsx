"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWallet } from "@/lib/wdk";

/**
 * Onboarding CTA (spec §7): one tap creates the fan's self-custody wallet
 * (Yape-style — no seed phrase shown) and the server covers gas so the very
 * next action (invest) doesn't need the fan to hold any ETH.
 */
export function EntrarButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "entering">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleEntrar() {
    setStatus("entering");
    setError(null);
    try {
      const { address } = await createWallet();
      await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      router.push("/wallet");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("idle");
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        onClick={handleEntrar}
        disabled={status === "entering"}
        className="rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
      >
        {status === "entering" ? "Entrando…" : "Entrar"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
