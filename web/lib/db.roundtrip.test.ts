import { test } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { clubs, rounds, type Round } from "@/db/schema";

// Proves the pg client + schema round-trips the tricky column types:
// serial id (number), text bigint (string precision), integer bps, boolean, Date.
test("clubs + rounds round-trip through the pg client", async () => {
  const [club] = await db
    .insert(clubs)
    .values({ name: "RT Club", slug: `rt-${Date.now()}`, walletAddress: "0xrt" })
    .returning();

  let round: Round | undefined;
  try {
    assert.strictEqual(typeof club.id, "number");
    assert.strictEqual(club.createdAt instanceof Date, true);

    const bigGoal = "123456789012345678"; // beyond Number.MAX_SAFE_INTEGER — must survive as string
    [round] = await db
      .insert(rounds)
      .values({
        clubId: club.id,
        contractAddress: "0xabc",
        goal: bigGoal,
        sharePrice: "1000000",
        revenueBps: 800,
        capMultiple: 15000,
        deadline: new Date(),
        verified: true,
      })
      .returning();

    assert.strictEqual(round.goal, bigGoal); // no float rounding
    assert.strictEqual(typeof round.revenueBps, "number");
    assert.strictEqual(round.revenueBps, 800);
    assert.strictEqual(typeof round.verified, "boolean");
    assert.strictEqual(round.verified, true);
  } finally {
    // cleanup — runs even if an assertion above throws
    if (round) await db.delete(rounds).where(eq(rounds.id, round.id));
    await db.delete(clubs).where(eq(clubs.id, club.id));
  }
});
