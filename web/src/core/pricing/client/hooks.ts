"use client";
import { useQuery } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
import { parseRate } from "@/core/pricing/domain/types";
import type { SupportedCurrency } from "@/core/pricing/domain/types";

/** Pricing-domain client hook — a public read (no auth); rates are display-only. */
export const usePricing = () => {
  const elysia = useElysia().pricing;

  const useRate = (currency: SupportedCurrency) =>
    useQuery({
      ...elysia.rate.get.queryOptions({ query: { currency } }),
      select: (data) => parseRate(data.response),
    });

  return { useRate };
};
