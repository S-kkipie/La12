import { test } from "node:test";
import assert from "node:assert";
import { buildOnRamp } from "../moonpay-service";

const ADDR = "0x1111111111111111111111111111111111111111" as const;

test("buildOnRamp: returns ok with the session from the engine", async () => {
  const res = await buildOnRamp({
    address: ADDR,
    amountUsd: 50,
    buildSession: async () => ({ sessionId: "wdk-onramp", widgetUrl: "https://buy.moonpay.com/?x=1" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, {
    sessionId: "wdk-onramp",
    widgetUrl: "https://buy.moonpay.com/?x=1",
  });
});

test("buildOnRamp: a throwing engine yields err(unexpected) -> 500", async () => {
  const res = await buildOnRamp({
    address: ADDR,
    amountUsd: 50,
    buildSession: async () => {
      throw new Error("network down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});
