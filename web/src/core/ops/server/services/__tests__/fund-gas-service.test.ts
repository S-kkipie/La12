import { test } from "node:test";
import assert from "node:assert";
import { fundGas } from "../fund-gas-service";
import { checkGasRateLimit } from "../../rate-limit";

const ADDR = "0x1111111111111111111111111111111111111111" as const;
// Distinct address for the throttle test so the happy-path calls above (which
// use ADDR with a `() => false` stub, never touching the real Map) can't
// pre-limit it.
const RATE_ADDR = "0x3333333333333333333333333333333333333333" as const;

test("fundGas: returns ok with the sponsor's tx hash on success", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => ({ hash: "0xhash" as const }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { hash: "0xhash" });
});

test("fundGas: a 'skipped' (no SPONSOR_PK) result is still ok — not an error", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => ({ skipped: true, reason: "SPONSOR_PK no configurado" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { skipped: true, reason: "SPONSOR_PK no configurado" });
});

test("fundGas: a throwing sendGas yields err(unexpected) -> 500", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});

test("fundGas: a second immediate call for the same address is throttled -> 429", async () => {
  // First call records the address in the real module-level limiter and succeeds.
  const first = await fundGas({
    address: RATE_ADDR,
    isRateLimited: checkGasRateLimit,
    sendGas: async () => ({ hash: "0xhash" as const }),
  });
  assert.strictEqual(first.ok, true);
  // Second immediate call is within the 60-min window → 429, engine never runs.
  const second = await fundGas({
    address: RATE_ADDR,
    isRateLimited: checkGasRateLimit,
    sendGas: async () => {
      throw new Error("should not be called when rate-limited");
    },
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(!second.ok && second.error.status, 429);
});
