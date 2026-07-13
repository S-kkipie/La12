import "server-only";
import { BitfinexPricingClient } from "@tetherto/wdk-pricing-bitfinex-http";
import type { SupportedCurrency } from "@/core/pricing/domain/types";

/** How long a fetched (or fallback) rate is trusted before we re-query upstream.
 *  Short enough to stay fresh; long enough to shield a flaky upstream from a
 *  request storm — a fallback is cached too, so a failing Bitfinex isn't hammered. */
const TTL = 60_000; // ms

/** What `getUsdtRate` resolves to — a display multiplier, NOT money. */
export type RateResult = { rate: number; source: "live" | "fallback" };

type CacheEntry = RateResult & { at: number };
export type RateCache = Map<SupportedCurrency, CacheEntry>;

/** The single upstream method this module consumes from the WDK Bitfinex client
 *  (`getCurrentPrice(from, to) -> Promise<number | null>`). */
type GetCurrentPrice = (base: string, quote: SupportedCurrency) => Promise<number | null>;

/** Deps-injected core (no singleton, no network of its own) — the seam a test
 *  drives. `now` is injectable so TTL behaviour is deterministic under test. */
export async function getUsdtRateWith(
  deps: { getCurrentPrice: GetCurrentPrice },
  cache: RateCache,
  currency: SupportedCurrency,
  now: number = Date.now(),
): Promise<RateResult> {
  // 1. USD short-circuit: USD₮ is USD-pegged, so 1.0 is definitional — no
  //    network call and no cache lookup.
  if (currency === "USD") return { rate: 1, source: "live" };

  // 2. Fresh cache hit (covers both a prior live rate and a prior fallback).
  const hit = cache.get(currency);
  if (hit && now - hit.at < TTL) return { rate: hit.rate, source: hit.source };

  // 3. Query upstream; degrade to a 1.0 fallback on null / non-finite / throw.
  //    The fallback is cached too (short TTL) so a failing upstream isn't hammered.
  let result: RateResult;
  try {
    // Bitfinex's fx endpoint codes Tether as "UST", NOT "USDT" — an "USDT"
    // pair resolves to null (verified against /calc/fx/batch), which would
    // silently degrade every non-USD rate to the 1.0 fallback. "UST" is the
    // USD₮ quote we want (UST≈USDT; both Tether).
    const price = await deps.getCurrentPrice("UST", currency);
    result =
      price !== null && Number.isFinite(price) && price > 0
        ? { rate: price, source: "live" }
        : { rate: 1, source: "fallback" };
  } catch {
    result = { rate: 1, source: "fallback" };
  }
  cache.set(currency, { ...result, at: now });
  return result;
}

// ─── Production singletons ──────────────────────────────────────────
// ONE client + ONE cache for the process. Bitfinex's public HTTP API needs no
// key, so there's no env/secret to wire here.
const client = new BitfinexPricingClient();
const moduleCache: RateCache = new Map();

/** Real-deps wrapper: the app-facing entry the service calls. */
export function getUsdtRate(currency: SupportedCurrency): Promise<RateResult> {
  return getUsdtRateWith(
    { getCurrentPrice: (base, quote) => client.getCurrentPrice(base, quote) },
    moduleCache,
    currency,
  );
}
