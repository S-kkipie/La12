// web/lib/clubRevenue.test.ts
import assert from "node:assert";
import { cumulativeSeries, capUtilization, toClubRoundDTO, type Distribution, type ClubRound } from "./clubRevenue";

// cumulativeSeries: sort by ts ascending, running sum of `credited`
const dists: Distribution[] = [
  { roundId: 1, roundName: "R", received: 0n, credited: 100n, refunded: 0n, txHash: "0xb", timestamp: 2 },
  { roundId: 1, roundName: "R", received: 0n, credited: 50n, refunded: 0n, txHash: "0xa", timestamp: 1 },
  { roundId: 1, roundName: "R", received: 0n, credited: 25n, refunded: 0n, txHash: "0xc", timestamp: 3 },
];
const series = cumulativeSeries(dists);
assert.deepEqual(series.map((p) => [p.ts, p.cumulative]), [[1, 50n], [2, 150n], [3, 175n]]);
assert.deepEqual(cumulativeSeries([]), []);

// capUtilization: cap = raised*capMultiple/1e4; pct = distributed*100/cap, clamp 100, 0 when cap 0
assert.equal(capUtilization(75_000000n, 100_000000n, 15000), 50); // cap 150 USDT, 75 used -> 50%
assert.equal(capUtilization(150_000000n, 100_000000n, 15000), 100);
assert.equal(capUtilization(200_000000n, 100_000000n, 15000), 100); // clamp
assert.equal(capUtilization(5n, 0n, 15000), 0);   // no raise -> cap 0
assert.equal(capUtilization(5n, 100n, 0), 0);     // capMultiple 0 -> cap 0

// toClubRoundDTO stringifies bigints, ISO-izes the date, keeps scalars
const cr: ClubRound = {
  roundId: 7, contractAddress: "0xabc", name: "FC · Round #7", goal: 40_000000n,
  raised: 30_000000n, totalShares: 30_000000n, distributed: 1_000000n,
  capMultiple: 15000, revenueBps: 800, deadline: new Date("2026-08-01T00:00:00.000Z"),
  status: "active", capUtilizationPct: 2.22,
};
const dto = toClubRoundDTO(cr);
assert.equal(dto.raised, "30000000");
assert.equal(dto.distributed, "1000000");
assert.equal(dto.deadline, "2026-08-01T00:00:00.000Z");
assert.equal(dto.capUtilizationPct, 2.22);
assert.equal(dto.status, "active");

console.log("clubRevenue helpers OK");
