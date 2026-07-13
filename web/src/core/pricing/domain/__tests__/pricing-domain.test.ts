import { test } from "node:test";
import assert from "node:assert";
import {
  convertUsdtToFiat,
  toRateDTO,
  parseRate,
  type Rate,
} from "../types";

test("convertUsdtToFiat: scales USD₮ base units to a display-only fiat float", () => {
  assert.strictEqual(convertUsdtToFiat(1_000000n, 1), 1);
  assert.strictEqual(convertUsdtToFiat(1_000000n, 0.92), 0.92);
  // large base-units value keeps display-float precision (well under 2^53)
  assert.strictEqual(convertUsdtToFiat(1_500_000_000000n, 2), 3_000_000);
});

test("toRateDTO -> parseRate round-trips a Rate", () => {
  const rate: Rate = { currency: "EUR", rate: 0.92, source: "live" };

  const dto = toRateDTO(rate);
  assert.strictEqual(dto.currency, "EUR");
  assert.strictEqual(dto.rate, 0.92);
  assert.strictEqual(dto.source, "live");

  const back = parseRate(dto);
  assert.deepStrictEqual(back, rate);
});
