import { test } from "node:test";
import assert from "node:assert";
import { createRound } from "../create-round-service";
import type { Round } from "@/db/schema";

const CLUB = { id: 1, walletAddress: "0x1111111111111111111111111111111111111111" };
const BODY = {
  contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"),
};
const INSERTED: Round = {
  id: 9, clubId: 1, contractAddress: BODY.contractAddress, goal: BODY.goal, sharePrice: BODY.sharePrice,
  revenueBps: BODY.revenueBps, capMultiple: BODY.capMultiple, deadline: BODY.deadline, status: "funding",
  verified: true, createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("createRound: matching on-chain club() -> inserts and returns ok(round)", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => CLUB.walletAddress,
    insertRound: async () => INSERTED,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.id, 9);
});

test("createRound: mismatched on-chain club() -> err(invalidBody, targets:[contractAddress])", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => "0x9999999999999999999999999999999999999999",
    insertRound: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 400);
  assert.deepStrictEqual(result.error.targets, ["contractAddress"]);
});

test("createRound: an unreadable contract -> err(invalidBody, targets:[contractAddress])", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => {
      throw new Error("execution reverted");
    },
    insertRound: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 400);
});

test("createRound: an insert failure -> err(unexpected) -> 500", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => CLUB.walletAddress,
    insertRound: async () => {
      throw new Error("db down");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
});
