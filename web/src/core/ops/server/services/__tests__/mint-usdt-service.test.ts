import { test } from "node:test";
import assert from "node:assert";
import { mintUsdt } from "../mint-usdt-service";
import { checkUsdtRateLimit } from "../../rate-limit";

const ADDR = "0x1111111111111111111111111111111111111111" as const;
// Distinct address for the throttle test. NOTE: each test file runs in its own
// tsx process, so this Map does not collide with the fund-gas test's RATE_ADDR
// even though both files import the same module — but keep them distinct anyway
// for clarity.
const RATE_ADDR = "0x4444444444444444444444444444444444444444" as const;

test("mintUsdt: converts the engine's bigint amount to a wire string on success", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => ({ hash: "0xhash" as const, amount: 5_000000000n }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { hash: "0xhash", amount: "5000000000" });
});

test("mintUsdt: a 'skipped' result passes through unchanged", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => ({ skipped: true, reason: "no key" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { skipped: true, reason: "no key" });
});

test("mintUsdt: a throwing engine yields err(unexpected) -> 500", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});

test("mintUsdt: a second immediate call for the same address is throttled -> 429", async () => {
  const first = await mintUsdt({
    address: RATE_ADDR,
    isRateLimited: checkUsdtRateLimit,
    mint: async () => ({ hash: "0xhash" as const, amount: 5_000000000n }),
  });
  assert.strictEqual(first.ok, true);
  const second = await mintUsdt({
    address: RATE_ADDR,
    isRateLimited: checkUsdtRateLimit,
    mint: async () => {
      throw new Error("should not be called when rate-limited");
    },
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(!second.ok && second.error.status, 429);
});
