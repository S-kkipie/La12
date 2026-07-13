import { test } from "node:test";
import assert from "node:assert";
import { isFundingDue, mapOnChainStateToDb, toRoundRowDTO } from "../types";
import type { Round } from "@/db/schema";

test("isFundingDue: goal reached", () => {
  assert.strictEqual(isFundingDue(40_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
  assert.strictEqual(isFundingDue(41_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
  assert.strictEqual(isFundingDue(39_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);
});

test("isFundingDue: deadline passed, goal not reached", () => {
  assert.strictEqual(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-07-01"), new Date("2026-07-06")), true);
});

test("isFundingDue: neither condition met", () => {
  assert.strictEqual(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);
});

test("mapOnChainStateToDb: lowercases the on-chain enum label", () => {
  assert.strictEqual(mapOnChainStateToDb("Funding"), "funding");
  assert.strictEqual(mapOnChainStateToDb("Active"), "active");
  assert.strictEqual(mapOnChainStateToDb("Closed"), "closed");
});

test("toRoundRowDTO: ISO-izes deadline/createdAt, keeps string money fields", () => {
  const row: Round = {
    id: 1, clubId: 1, contractAddress: "0xabc", goal: "40000000000", sharePrice: "1000000",
    revenueBps: 800, capMultiple: 15000,
    deadline: new Date("2026-08-01T00:00:00.000Z"),
    status: "funding", verified: true,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  };
  const dto = toRoundRowDTO(row);
  assert.strictEqual(dto.deadline, "2026-08-01T00:00:00.000Z");
  assert.strictEqual(dto.createdAt, "2026-07-01T00:00:00.000Z");
  assert.strictEqual(dto.goal, "40000000000");
  assert.strictEqual(dto.status, "funding");
});
