import { test } from "node:test";
import assert from "node:assert";
import { getClubDistributions } from "../get-club-distributions-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "active", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getClubDistributions: maps Distributed logs to Distribution rows + a cumulative series", async () => {
  const result = await getClubDistributions({
    clubId: 1,
    findClubRounds: async () => ({ clubName: "Demo", rounds: [ROUND] }),
    windowFromBlock: async () => 0n,
    fetchDistributedLogs: async () => [
      { args: { revenueReceived: 100n, creditedToHolders: 92n, refundedToClub: 8n }, blockNumber: 10n, transactionHash: "0xb" },
    ],
    blockTimestamp: async () => 1_700_000_000,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.distributions.length, 1);
  const d = result.data.distributions[0];
  assert.strictEqual(d.roundName, "Demo · Round #7");
  assert.strictEqual(d.credited, 92n);
  assert.strictEqual(d.timestamp, 1_700_000_000);
  assert.deepStrictEqual(result.data.series, [{ ts: 1_700_000_000, cumulative: 92n }]);
});

test("getClubDistributions: a repository throw degrades to a 200-empty result", async () => {
  const result = await getClubDistributions({
    clubId: 1,
    findClubRounds: async () => {
      throw new Error("db down");
    },
    windowFromBlock: async () => 0n,
    fetchDistributedLogs: async () => [],
    blockTimestamp: async () => null,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { distributions: [], series: [] });
});
