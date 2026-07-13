import { test } from "node:test";
import assert from "node:assert";
import { getClubOverview } from "../get-club-overview-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getClubOverview: enriches a round from chain reads, aggregates totals + unique backers", async () => {
  const result = await getClubOverview({
    clubId: 1,
    findClubRounds: async () => ({ clubName: "Demo", rounds: [ROUND] }),
    reads: {
      totalRaised: async () => 30_000000n,
      totalShares: async () => 30_000000n,
      roundState: async () => "funding",
      totalDistributedToHolders: async () => 1_000000n,
      getRoundInvestors: async () => ["0x1111111111111111111111111111111111111111"],
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.rounds.length, 1);
  const r = result.data.rounds[0];
  assert.strictEqual(r.name, "Demo · Round #7");
  assert.strictEqual(r.raised, 30_000000n);
  assert.strictEqual(r.capUtilizationPct, 2.22);
  assert.strictEqual(result.data.totals.raised, 30_000000n);
  assert.strictEqual(result.data.totals.backerCount, 1);
  assert.strictEqual(result.data.totals.roundCount, 1);
});

test("getClubOverview: a repository throw degrades to a 200-empty result (graceful-empty)", async () => {
  const result = await getClubOverview({
    clubId: 1,
    findClubRounds: async () => {
      throw new Error("db down");
    },
    reads: {
      totalRaised: async () => 0n, totalShares: async () => 0n, roundState: async () => "funding",
      totalDistributedToHolders: async () => 0n, getRoundInvestors: async () => [],
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { totals: { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 }, rounds: [] });
});
