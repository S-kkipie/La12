import { test } from "node:test";
import assert from "node:assert";
import { closeCheck } from "../close-check-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 4, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "1000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("closeCheck: err(notFound) when the round doesn't exist", async () => {
  const result = await closeCheck({ id: 999, findRoundById: async () => undefined, tryClose: async () => "funding" });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 404);
});

test("closeCheck: ok({status}) from the injected tryClose", async () => {
  const result = await closeCheck({ id: 4, findRoundById: async () => ROUND, tryClose: async () => "active" });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { status: "active" });
});

test("closeCheck: a repository throw -> err(unexpected) -> 500", async () => {
  const result = await closeCheck({
    id: 4,
    findRoundById: async () => {
      throw new Error("db down");
    },
    tryClose: async () => "funding",
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
});
