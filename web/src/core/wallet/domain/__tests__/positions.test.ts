import { test } from "node:test";
import assert from "node:assert";
import {
  investedFromShares,
  percentOfRound,
  toPositionDTO,
  parsePosition,
  type FanPosition,
} from "../types";

test("investedFromShares: shares * sharePrice / 1e6", () => {
  assert.strictEqual(investedFromShares(10_000000n, 1_000000n), 10_000000n); // 10 shares @ 1 USDT = 10 USDT
  assert.strictEqual(investedFromShares(10_000000n, 2_000000n), 20_000000n); // @ 2 USDT/share = 20 USDT
});

test("percentOfRound: 2-decimal share of supply; 0 when supply 0", () => {
  assert.strictEqual(percentOfRound(25_000000n, 100_000000n), 25);
  assert.strictEqual(percentOfRound(1n, 0n), 0);
});

test("toPositionDTO -> parsePosition round-trips bigints (precision beyond 2^53)", () => {
  const p: FanPosition = {
    roundId: 1, contractAddress: "0xabc", clubName: "C", clubSlug: "c",
    shares: 10_000000n, totalShares: 40_000000n,
    investedUsdt: 10_000000n, claimable: 0n,
    raised: 123456789012345678n, goal: 500_000000n, status: "funding",
  };
  const round = parsePosition(toPositionDTO(p));
  assert.strictEqual(round.raised, 123456789012345678n); // no float rounding
  assert.strictEqual(round.shares, 10_000000n);
  assert.strictEqual(round.status, "funding");
});
