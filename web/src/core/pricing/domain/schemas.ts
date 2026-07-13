import { z } from "zod";

export const currencySchema = z.enum(["USD", "EUR", "GBP"]);

/** Wire shape of one WDK Price Rates quote — `rate` is a display multiplier,
 *  NOT a money value, so it stays a plain JSON number (no bigint precision). */
export const rateSchema = z.object({
  currency: currencySchema,
  rate: z.number(), // display multiplier, NOT money — plain number
  source: z.enum(["live", "fallback"]),
});

export const rateQuerySchema = z.object({
  currency: currencySchema.default("USD"),
});
