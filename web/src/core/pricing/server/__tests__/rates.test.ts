import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
import type { RateCache } from "../rates";

// `server-only` throws when imported outside a React Server Component. Stub it
// (no-op) BEFORE importing the module under test so this suite runs under a
// plain `tsx --test`. A dynamic import (below) guarantees the stub lands first —
// static imports are hoisted above top-level statements and would run too early.
const req = createRequire(import.meta.url);
req.cache[req.resolve("server-only")] = { exports: {} } as unknown as NodeModule;

const ratesPromise = import("../rates") as Promise<typeof import("../rates")>;

const freshCache = (): RateCache => new Map();

test("getUsdtRateWith: USD short-circuits to {1,'live'} without calling upstream", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  let called = 0;
  const res = await getUsdtRateWith(
    {
      getCurrentPrice: async () => {
        called++;
        return 0.5;
      },
    },
    freshCache(),
    "USD",
  );
  assert.deepStrictEqual(res, { rate: 1, source: "live" });
  assert.strictEqual(called, 0);
});

test("getUsdtRateWith: a finite positive price → {price,'live'}", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  const res = await getUsdtRateWith({ getCurrentPrice: async () => 0.92 }, freshCache(), "EUR");
  assert.deepStrictEqual(res, { rate: 0.92, source: "live" });
});

test("getUsdtRateWith: null upstream → {1,'fallback'}", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  const res = await getUsdtRateWith({ getCurrentPrice: async () => null }, freshCache(), "GBP");
  assert.deepStrictEqual(res, { rate: 1, source: "fallback" });
});

test("getUsdtRateWith: a non-finite price → {1,'fallback'}", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  const res = await getUsdtRateWith(
    { getCurrentPrice: async () => Number.POSITIVE_INFINITY },
    freshCache(),
    "EUR",
  );
  assert.deepStrictEqual(res, { rate: 1, source: "fallback" });
});

test("getUsdtRateWith: a throwing upstream → {1,'fallback'}", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  const res = await getUsdtRateWith(
    {
      getCurrentPrice: async () => {
        throw new Error("bitfinex down");
      },
    },
    freshCache(),
    "EUR",
  );
  assert.deepStrictEqual(res, { rate: 1, source: "fallback" });
});

test("getUsdtRateWith: queries Bitfinex with the 'UST' Tether code (not 'USDT', which resolves to null)", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  let seen: { from: string; to: string } | null = null;
  await getUsdtRateWith(
    {
      getCurrentPrice: async (from, to) => {
        seen = { from, to };
        return 0.87;
      },
    },
    freshCache(),
    "EUR",
  );
  assert.deepStrictEqual(seen, { from: "UST", to: "EUR" });
});

test("getUsdtRateWith: two calls within TTL hit cache — upstream called once", async () => {
  const { getUsdtRateWith } = await ratesPromise;
  const cache = freshCache();
  let called = 0;
  const deps = {
    getCurrentPrice: async () => {
      called++;
      return 0.8;
    },
  };
  const a = await getUsdtRateWith(deps, cache, "EUR", 1_000);
  const b = await getUsdtRateWith(deps, cache, "EUR", 1_000 + 59_000); // 59s < 60s TTL
  assert.deepStrictEqual(a, { rate: 0.8, source: "live" });
  assert.deepStrictEqual(b, { rate: 0.8, source: "live" });
  assert.strictEqual(called, 1);
});
