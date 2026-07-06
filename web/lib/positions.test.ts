import assert from "node:assert";
import { investedFromShares, percentOfRound, toPositionDTO, type FanPosition } from "./positions";

// invested = shares * sharePrice / 1e6. sharePrice 1 USDT = 1_000000n.
// 10 shares (6dp) => 10_000000n shares, at price 1_000000n => 10 USDT = 10_000000n
assert.equal(investedFromShares(10_000000n, 1_000000n), 10_000000n);
// price 2 USDT/share => 10 shares invested 20 USDT
assert.equal(investedFromShares(10_000000n, 2_000000n), 20_000000n);

// percentOfRound
assert.equal(percentOfRound(25_000000n, 100_000000n), 25);
assert.equal(percentOfRound(1_000000n, 3_000000n), 33.33);
assert.equal(percentOfRound(5n, 0n), 0); // no supply -> 0, never divide by zero

// toPositionDTO stringifies every bigint field, leaves others intact
const p: FanPosition = {
  roundId: 7, contractAddress: "0xabc", clubName: "Racing", clubSlug: "racing",
  shares: 10_000000n, totalShares: 100_000000n, investedUsdt: 10_000000n,
  claimable: 3_140000n, raised: 40_000000n, goal: 40_000000n, status: "active",
};
const dto = toPositionDTO(p);
assert.equal(dto.shares, "10000000");
assert.equal(dto.claimable, "3140000");
assert.equal(dto.roundId, 7);
assert.equal(dto.status, "active");

console.log("positions helpers OK");
