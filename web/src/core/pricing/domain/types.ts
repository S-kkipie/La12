import type { z } from "zod";
import type { currencySchema, rateSchema } from "./schemas";

export type SupportedCurrency = z.infer<typeof currencySchema>;
export type RateSource = "live" | "fallback";

/** Domain shape — a WDK Price Rates quote. `rate` is a display multiplier,
 *  NOT money, so it's a plain number (unlike bigint USD₮ base units). */
export type Rate = {
  currency: SupportedCurrency;
  rate: number;
  source: RateSource;
};

export type RateDTO = z.infer<typeof rateSchema>;

/** Structurally identical to Rate (rate is already JSON-safe) — kept for
 *  template symmetry + the DTO validation boundary, matching the directory domain. */
export function toRateDTO(r: Rate): RateDTO {
  return { currency: r.currency, rate: r.rate, source: r.source };
}

/** Identity-ish passthrough — exercised by the round-trip test today; keeps the
 *  DTO boundary symmetric and provable, matching the directory domain template. */
export function parseRate(d: RateDTO): Rate {
  return { currency: d.currency, rate: d.rate, source: d.source };
}

/** The ONE sanctioned `Number()` on a money value in this domain (like the
 *  chart-axis exception) — divides bigint USD₮ base units (6 decimals) down to a
 *  whole-token float, then applies the display multiplier. The result is
 *  **display-only** and MUST NOT re-enter any bigint money path. */
export function convertUsdtToFiat(amountBaseUnits: bigint, rate: number): number {
  return (Number(amountBaseUnits) / 1e6) * rate;
}
