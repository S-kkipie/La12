import { test } from "node:test";
import assert from "node:assert";
import { amountFromArgs, EVENT_KIND } from "../types";

test("amountFromArgs: prefers usdtAmount, falls back through revenueReceived/totalRaisedUsdt, else 0n", () => {
  assert.strictEqual(amountFromArgs({ usdtAmount: 5_000000n }), 5_000000n);
  assert.strictEqual(amountFromArgs({ revenueReceived: 3_000000n }), 3_000000n);
  assert.strictEqual(amountFromArgs({ totalRaisedUsdt: 9_000000n }), 9_000000n);
  assert.strictEqual(amountFromArgs({}), 0n);
});

test("amountFromArgs: usdtAmount wins over the other fields when several are present", () => {
  assert.strictEqual(
    amountFromArgs({ usdtAmount: 1_000000n, revenueReceived: 2_000000n, totalRaisedUsdt: 3_000000n }),
    1_000000n,
  );
});

test("EVENT_KIND maps every tracked RevenueShareRound event to its cache kind", () => {
  assert.strictEqual(EVENT_KIND.Invested, "invest");
  assert.strictEqual(EVENT_KIND.Distributed, "distribute");
  assert.strictEqual(EVENT_KIND.Claimed, "claim");
  assert.strictEqual(EVENT_KIND.FundingClosed, "close");
  assert.strictEqual(EVENT_KIND.SomeUnknownEvent, undefined);
});
