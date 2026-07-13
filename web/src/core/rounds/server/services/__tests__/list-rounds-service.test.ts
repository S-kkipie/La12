import { test } from "node:test";
import assert from "node:assert";
import { listRoundsForQuery } from "../list-rounds-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 1, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "1000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("listRoundsForQuery: forwards the filter to the repository", async () => {
  let seenFilter: unknown;
  const result = await listRoundsForQuery({
    filter: { clubId: 1 },
    listRounds: async (f) => {
      seenFilter = f;
      return [ROUND];
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, [ROUND]);
  assert.deepStrictEqual(seenFilter, { clubId: 1 });
});

test("listRoundsForQuery: a repository throw degrades to ok([]) (graceful-empty, public read)", async () => {
  const result = await listRoundsForQuery({
    filter: {},
    listRounds: async () => {
      throw new Error("db down");
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, []);
});
