"use client";
import { useEffect, useState } from "react";
import { currencySchema } from "@/core/pricing/domain/schemas";
import type { SupportedCurrency } from "@/core/pricing/domain/types";

const STORAGE_KEY = "ladoce:currency";

/** Currency preference backed by localStorage. State initializes to "USD" so
 *  SSR + first client render agree (no hydration mismatch); the stored value is
 *  read in an effect after mount. Junk in storage is validated away → "USD". */
export function useCurrency(): [SupportedCurrency, (c: SupportedCurrency) => void] {
  const [currency, setCurrencyState] = useState<SupportedCurrency>("USD");

  useEffect(() => {
    const parsed = currencySchema.safeParse(localStorage.getItem(STORAGE_KEY));
    if (parsed.success) setCurrencyState(parsed.data);
  }, []);

  const setCurrency = (c: SupportedCurrency) => {
    setCurrencyState(c);
    localStorage.setItem(STORAGE_KEY, c);
  };

  return [currency, setCurrency];
}
