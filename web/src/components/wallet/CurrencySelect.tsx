"use client";

import type { SupportedCurrency } from "@/core/pricing/domain/types";

const CURRENCIES: SupportedCurrency[] = ["USD", "EUR", "GBP"];

/** Currency picker for the wallet header — display currency only; the money
 *  truth stays USD₮ base units. Controlled by WalletOverview's useCurrency(). */
export function CurrencySelect({
  value,
  onChange,
}: {
  value: SupportedCurrency;
  onChange: (c: SupportedCurrency) => void;
}) {
  return (
    <select
      aria-label="Display currency"
      value={value}
      onChange={(e) => onChange(e.target.value as SupportedCurrency)}
      className="rounded-md border border-input bg-background px-2 py-1 text-sm text-muted-foreground outline-none focus-visible:border-ring"
    >
      {CURRENCIES.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
