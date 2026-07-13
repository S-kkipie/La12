import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";

// `server-only` throws when imported outside a React Server Component. Stub it
// (no-op) BEFORE importing the module under test so this suite runs under a
// plain `tsx --test`. The dynamic import (below) guarantees the stub lands first.
const req = createRequire(import.meta.url);
req.cache[req.resolve("server-only")] = { exports: {} } as unknown as NodeModule;

const svcPromise = import("../get-rate-service") as Promise<typeof import("../get-rate-service")>;

test("getRate: maps {rate,source} → ok({currency, rate, source})", async () => {
  const { getRate } = await svcPromise;
  const res = await getRate({ getUsdtRate: async () => ({ rate: 0.92, source: "live" }) })("EUR");
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { currency: "EUR", rate: 0.92, source: "live" });
});

test("getRate: a fallback rate still yields ok(...source:'fallback') — never a 5xx", async () => {
  const { getRate } = await svcPromise;
  const res = await getRate({ getUsdtRate: async () => ({ rate: 1, source: "fallback" }) })("GBP");
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { currency: "GBP", rate: 1, source: "fallback" });
});
