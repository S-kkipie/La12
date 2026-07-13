import "server-only";

// In-memory per-address throttle — one call per address per hour. Restored
// from the legacy app/api/faucet + app/api/faucet-usdt routes (spec §5.2:
// "preserve any rate-limit"). `SPONSOR_PK` funds a real relayer, so an
// unthrottled public faucet POST is a drain vector. Module-level Map: resets
// on restart and isn't shared across instances — fine for the single-node
// hackathon box (same tradeoff the legacy routes documented). Swap for a
// real store (Redis/DB) before scaling out.
const RATE_LIMIT_MS = 60 * 60 * 1000;
const lastServedAt = new Map<string, number>();

/** Returns true if `address` called within the last hour (=> the caller
 *  should be rejected with 429). Returns false and records `Date.now()` when
 *  the call is allowed. Address is lowercased so `0xAbC…`/`0xabc…` share a
 *  bucket. (A service may read the clock directly; only Workflow scripts can't.) */
export function checkRateLimit(address: string): boolean {
  const key = address.toLowerCase();
  const last = lastServedAt.get(key);
  if (last !== undefined && Date.now() - last < RATE_LIMIT_MS) return true;
  lastServedAt.set(key, Date.now());
  return false;
}
