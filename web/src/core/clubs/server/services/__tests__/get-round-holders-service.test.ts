import { test } from "node:test";
import assert from "node:assert";
import { getRoundHoldersForClub } from "../get-round-holders-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "active", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getRoundHoldersForClub: err(forbidden) when the round isn't owned/verified by this club", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    findOwnedRound: async () => undefined,
    getRoundHolders: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 403);
});

test("getRoundHoldersForClub: ok(holders) when owned", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: ROUND.contractAddress,
    findOwnedRound: async () => ROUND,
    getRoundHolders: async () => [{ address: "0x1111111111111111111111111111111111111111", shares: 10n, claimable: 1n, pct: 100 }],
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 1);
});

test("getRoundHoldersForClub: a chain-read throw after ownership passes degrades to ok([]) (graceful-empty)", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: ROUND.contractAddress,
    findOwnedRound: async () => ROUND,
    getRoundHolders: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, []);
});
