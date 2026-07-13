import { test } from "node:test";
import assert from "node:assert";
import { cumulativeSeries, capUtilization, toClubRoundDTO, parseClubRound, type Distribution, type ClubRound } from "../types";

test("cumulativeSeries: sorts by ts ascending, running sum of credited", () => {
  const dists: Distribution[] = [
    { roundId: 1, roundName: "R", received: 0n, credited: 100n, refunded: 0n, txHash: "0xb", timestamp: 2 },
    { roundId: 1, roundName: "R", received: 0n, credited: 50n, refunded: 0n, txHash: "0xa", timestamp: 1 },
    { roundId: 1, roundName: "R", received: 0n, credited: 25n, refunded: 0n, txHash: "0xc", timestamp: 3 },
  ];
  const series = cumulativeSeries(dists);
  assert.deepStrictEqual(series.map((p) => [p.ts, p.cumulative]), [[1, 50n], [2, 150n], [3, 175n]]);
  assert.deepStrictEqual(cumulativeSeries([]), []);
});

test("capUtilization: cap = raised*capMultiple/1e4; pct = distributed*100/cap, clamp 100, 0 when cap 0", () => {
  assert.strictEqual(capUtilization(75_000000n, 100_000000n, 15000), 50); // cap 150 USDT, 75 used -> 50%
  assert.strictEqual(capUtilization(150_000000n, 100_000000n, 15000), 100);
  assert.strictEqual(capUtilization(200_000000n, 100_000000n, 15000), 100); // clamp
  assert.strictEqual(capUtilization(5n, 0n, 15000), 0); // no raise -> cap 0
  assert.strictEqual(capUtilization(5n, 100n, 0), 0); // capMultiple 0 -> cap 0
});

test("toClubRoundDTO -> parseClubRound round-trips bigints + Date (precision beyond 2^53)", () => {
  const cr: ClubRound = {
    roundId: 7,
    contractAddress: "0xabc0000000000000000000000000000000000d",
    name: "FC · Round #7",
    goal: 40_000000n,
    raised: 123456789012345678n,
    totalShares: 30_000000n,
    distributed: 1_000000n,
    capMultiple: 15000,
    revenueBps: 800,
    deadline: new Date("2026-08-01T00:00:00.000Z"),
    status: "active",
    capUtilizationPct: 2.22,
  };
  const dto = toClubRoundDTO(cr);
  assert.strictEqual(dto.raised, "123456789012345678");
  assert.strictEqual(dto.deadline, "2026-08-01T00:00:00.000Z");
  const round = parseClubRound(dto);
  assert.strictEqual(round.raised, 123456789012345678n); // no float rounding
  assert.strictEqual(round.deadline.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.strictEqual(round.status, "active");
});
