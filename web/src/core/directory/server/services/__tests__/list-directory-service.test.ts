import { test } from "node:test";
import assert from "node:assert";
import { listDirectory } from "../list-directory-service";
import type { ClubRoundRow } from "../../repository/list-clubs-with-rounds";
import type { Club, Round } from "@/db/schema";

function makeClub(overrides: Partial<Club>): Club {
  return {
    id: 1,
    userId: null,
    name: "Demo",
    slug: "demo",
    logoUrl: null,
    description: null,
    walletAddress: "0xClub0000000000000000000000000000000000",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRound(overrides: Partial<Round>): Round {
  return {
    id: 1,
    clubId: 1,
    contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    goal: "100000000",
    sharePrice: "1000000",
    revenueBps: 800,
    capMultiple: 15000,
    deadline: new Date("2027-01-01T00:00:00Z"),
    status: "funding",
    verified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("listDirectory: enriches each row with on-chain raised + pct, sorted most-funded first", async () => {
  const rowA: ClubRoundRow = {
    club: makeClub({ id: 1, slug: "club-a" }),
    round: makeRound({ id: 1, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
  };
  const rowB: ClubRoundRow = {
    club: makeClub({ id: 2, slug: "club-b" }),
    round: makeRound({ id: 2, clubId: 2, contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
  };

  const result = await listDirectory({
    listRows: async () => [rowA, rowB],
    readTotalRaised: async (addr) =>
      addr === rowA.round.contractAddress ? 25_000000n : 90_000000n,
  });

  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 2);
  assert.strictEqual(result.data[0].club.slug, "club-b"); // 90% funded, sorts first
  assert.strictEqual(result.data[0].pct, 90);
  assert.strictEqual(result.data[1].pct, 25);
});

test("listDirectory: graceful-empty when there are no verified rounds", async () => {
  const result = await listDirectory({ listRows: async () => [], readTotalRaised: async () => 0n });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.ok && result.data, []);
});

test("listDirectory: a throwing repository yields err(unexpected) -> 500", async () => {
  const result = await listDirectory({
    listRows: async () => {
      throw new Error("db down");
    },
    readTotalRaised: async () => 0n,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 500);
});
