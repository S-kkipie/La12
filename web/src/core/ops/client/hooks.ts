"use client";
import { useMutation } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Ops-domain client hooks — best-effort server-relayer helpers (gas
 *  sponsor, test USD₮ mint, MoonPay on-ramp session). All three are public
 *  POSTs; a "skipped" result (e.g. no SPONSOR_PK configured) is still a 200
 *  — callers inspect `data.response` for a `skipped` field rather than
 *  catching an error. No `useSync` here — nothing in the client calls
 *  /ops/sync today (confirmed by grep during planning). */
export const useOps = () => {
  const elysia = useElysia();

  const useFundGas = () => useMutation(elysia.ops.faucet.post.mutationOptions());
  // Bracket access: "faucet-usdt" isn't a valid JS identifier for dot access.
  const useMintUsdt = () => useMutation(elysia.ops["faucet-usdt"].post.mutationOptions());
  const useMoonpay = () => useMutation(elysia.ops.moonpay.post.mutationOptions());

  return { useFundGas, useMintUsdt, useMoonpay };
};
