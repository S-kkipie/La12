import { test, after } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { listRounds } from "../list-rounds";
import { insertRound } from "../insert-round";
import { findRoundById } from "../find-round-by-id";
import { updateRoundStatus } from "../update-round-status";

const TEMP_SLUG = "p4-test-club";
const TEMP_ADDR_VERIFIED = "0xfeed000000000000000000000000000000fee1";
const TEMP_ADDR_UNVERIFIED = "0xfeed000000000000000000000000000000fee2";

let clubId: number;

async function ensureTempClub(): Promise<number> {
  const [existing] = await db.select().from(clubs).where(eq(clubs.slug, TEMP_SLUG));
  if (existing) return existing.id;
  const [club] = await db
    .insert(clubs)
    .values({ name: "P4 Test Club", slug: TEMP_SLUG, walletAddress: "0x1111111111111111111111111111111111111111" })
    .returning();
  return club.id;
}

after(async () => {
  if (clubId === undefined) return;
  await db.delete(rounds).where(eq(rounds.clubId, clubId));
  await db.delete(clubs).where(eq(clubs.id, clubId));
});

test("listRounds / insertRound / findRoundById / updateRoundStatus", async () => {
  clubId = await ensureTempClub();
  const deadline = new Date(Date.now() + 30 * 86_400_000);

  const verified = await insertRound({
    clubId, contractAddress: TEMP_ADDR_VERIFIED, goal: "1000000", sharePrice: "1000000",
    revenueBps: 800, capMultiple: 15000, deadline,
  });
  assert.strictEqual(verified.verified, true); // insertRound always forces verified:true

  // A directly-inserted unverified row (bypassing insertRound) to test the filter.
  const [unverified] = await db
    .insert(rounds)
    .values({
      clubId, contractAddress: TEMP_ADDR_UNVERIFIED, goal: "1000000", sharePrice: "1000000",
      revenueBps: 800, capMultiple: 15000, deadline, status: "funding", verified: false,
    })
    .returning();

  const verifiedOnly = await listRounds({ clubId });
  assert.ok(verifiedOnly.some((r) => r.id === verified.id));
  assert.ok(!verifiedOnly.some((r) => r.id === unverified.id));

  const all = await listRounds({ clubId, includeAll: true });
  assert.ok(all.some((r) => r.id === unverified.id));

  const found = await findRoundById(verified.id);
  assert.strictEqual(found?.contractAddress, TEMP_ADDR_VERIFIED);

  await updateRoundStatus(verified.id, "active");
  const updated = await findRoundById(verified.id);
  assert.strictEqual(updated?.status, "active");
});
