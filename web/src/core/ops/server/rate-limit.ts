import "server-only";

// In-memory per-address throttle — one call per address per hour, PER
// ENDPOINT. Restored from the legacy app/api/faucet + app/api/faucet-usdt
// routes (spec §5.2: "preserve any rate-limit"), which each kept their OWN
// Map (lastFundedAt / lastMintedAt) — gas and test-USDT throttle
// independently. A single shared bucket would let a signup's auto gas-fund
// block the same address's test-USDT mint for an hour. `SPONSOR_PK` funds a
// real relayer, so an unthrottled public faucet POST is a drain vector.
// Module-level Maps: reset on restart and aren't shared across instances —
// fine for the single-node hackathon box (same tradeoff the legacy routes
// documented). Swap for a real store (Redis/DB) before scaling out.
const RATE_LIMIT_MS = 60 * 60 * 1000;

/** Builds one independent per-address rate limiter (its own backing Map). */
function makeRateLimiter(): (address: string) => boolean {
  const lastServedAt = new Map<string, number>();
  /** Returns true if `address` called within the last hour (=> reject with
   *  429). Returns false and records `Date.now()` when the call is allowed.
   *  Address is lowercased so `0xAbC…`/`0xabc…` share a bucket. */
  return function checkRateLimit(address: string): boolean {
    const key = address.toLowerCase();
    const last = lastServedAt.get(key);
    if (last !== undefined && Date.now() - last < RATE_LIMIT_MS) return true;
    lastServedAt.set(key, Date.now());
    return false;
  };
}

/** Gas-sponsor faucet throttle (independent bucket). */
export const checkGasRateLimit = makeRateLimiter();

/** Test-USD₮ mint faucet throttle (independent bucket). */
export const checkUsdtRateLimit = makeRateLimiter();
