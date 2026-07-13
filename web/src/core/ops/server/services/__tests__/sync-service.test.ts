import { test } from "node:test";
import assert from "node:assert";
import { syncRoundEvents } from "../sync-service";
import type { Round, NewEvent } from "@/db/schema";

const ROUND: Round = {
  id: 7,
  clubId: 1,
  contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "500000000",
  sharePrice: "1000000",
  revenueBps: 800,
  capMultiple: 15000,
  deadline: new Date("2027-01-01T00:00:00Z"),
  status: "funding",
  verified: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

test("syncRoundEvents: 404 when the round doesn't exist", async () => {
  const result = await syncRoundEvents({
    roundId: 999,
    findRound: async () => undefined,
    getBlockNumber: async () => 1000n,
    getLogs: async () => [],
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 404);
});

test("syncRoundEvents: 403 when the round is not verified (allowlist check)", async () => {
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ({ ...ROUND, verified: false }),
    getBlockNumber: async () => 1000n,
    getLogs: async () => [],
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 403);
});

test("syncRoundEvents: maps known events, drops unknown ones, replaces the cache", async () => {
  let deletedFor: number | undefined;
  let inserted: NewEvent[] = [];
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 100_000n,
    getLogs: async () => [
      { eventName: "Invested", args: { usdtAmount: 5_000000n }, transactionHash: "0xtx1", blockNumber: 90_000n },
      { eventName: "SomeOtherEvent", args: {}, transactionHash: "0xtx2", blockNumber: 90_001n },
      { eventName: "FundingClosed", args: {}, transactionHash: "0xtx3", blockNumber: 90_002n },
    ],
    replaceEvents: async (roundId, rows) => {
      deletedFor = roundId;
      inserted = rows;
    },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.ok && result.data, { synced: 2 }); // unknown event dropped
  assert.strictEqual(deletedFor, ROUND.id);
  assert.strictEqual(inserted.length, 2);
  assert.strictEqual(inserted[0].kind, "invest");
  assert.strictEqual(inserted[0].amount, "5000000");
  assert.strictEqual(inserted[1].kind, "close");
});

test("syncRoundEvents: defaults fromBlock to latest-40000 (or 0 when latest is small)", async () => {
  let seenFromBlock: bigint | undefined;
  await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 1000n, // < 40_000 -> clamps to 0n
    getLogs: async (_address, fromBlock) => {
      seenFromBlock = fromBlock;
      return [];
    },
    replaceEvents: async () => {},
  });
  assert.strictEqual(seenFromBlock, 0n);
});

test("syncRoundEvents: a throwing getLogs yields err(unexpected) -> 500", async () => {
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 1000n,
    getLogs: async () => {
      throw new Error("rpc down");
    },
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 500);
});
