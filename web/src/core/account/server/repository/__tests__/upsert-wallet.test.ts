import { test, after } from "node:test";
import assert from "node:assert";
import { eq, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, clubs, profiles } from "@/db/schema";
import { upsertClubWallet } from "../upsert-club-wallet";
import { upsertProfileWallet } from "../upsert-profile-wallet";

const CLUB_USER = "p2-test-club-user";
const FAN_USER = "p2-test-fan-user";
const RACE_USER = "p2-test-race-user";
const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";

async function ensureUser(id: string) {
  await db
    .insert(user)
    .values({ id, name: "P2 Test", email: `${id}@test.local`, emailVerified: false })
    .onConflictDoNothing();
}

after(async () => {
  await db.delete(clubs).where(eq(clubs.userId, CLUB_USER));
  await db.delete(clubs).where(eq(clubs.userId, RACE_USER));
  await db.delete(profiles).where(eq(profiles.userId, FAN_USER));
  await db.delete(user).where(eq(user.id, CLUB_USER));
  await db.delete(user).where(eq(user.id, FAN_USER));
  await db.delete(user).where(eq(user.id, RACE_USER));
});

test("upsertClubWallet: inserts (unique slug on collision) then updates in place", async () => {
  await ensureUser(CLUB_USER);

  // Insert — name collides with the seeded "deportivo-san-martin" → slug "-2".
  const first = await upsertClubWallet(CLUB_USER, "Deportivo San Martín", ADDR_A);
  const [row1] = await db.select().from(clubs).where(eq(clubs.id, first.id));
  assert.strictEqual(row1.walletAddress, ADDR_A);
  assert.strictEqual(row1.slug, "deportivo-san-martin-2");

  // Second call for the same user → UPDATE (same id), new address, slug unchanged.
  const second = await upsertClubWallet(CLUB_USER, "Deportivo San Martín", ADDR_B);
  assert.strictEqual(second.id, first.id);
  const [row2] = await db.select().from(clubs).where(eq(clubs.id, second.id));
  assert.strictEqual(row2.walletAddress, ADDR_B);
  assert.strictEqual(row2.slug, "deportivo-san-martin-2");

  // Atomicity proof: exactly one row exists for this userId — the onConflict
  // path updated in place rather than inserting a second row.
  const [{ value: clubCount }] = await db.select({ value: count() }).from(clubs).where(eq(clubs.userId, CLUB_USER));
  assert.strictEqual(clubCount, 1);
});

test("upsertProfileWallet: inserts with displayName then updates address in place", async () => {
  await ensureUser(FAN_USER);

  const first = await upsertProfileWallet(FAN_USER, "Fan Uno", ADDR_A);
  const [row1] = await db.select().from(profiles).where(eq(profiles.id, first.id));
  assert.strictEqual(row1.walletAddress, ADDR_A);
  assert.strictEqual(row1.displayName, "Fan Uno");

  const second = await upsertProfileWallet(FAN_USER, "Fan Uno", ADDR_B);
  assert.strictEqual(second.id, first.id);
  const [row2] = await db.select().from(profiles).where(eq(profiles.id, second.id));
  assert.strictEqual(row2.walletAddress, ADDR_B);

  // Atomicity proof: exactly one row exists for this userId — the onConflict
  // path updated in place rather than inserting a second row.
  const [{ value: profileCount }] = await db.select({ value: count() }).from(profiles).where(eq(profiles.userId, FAN_USER));
  assert.strictEqual(profileCount, 1);
});

test("upsertClubWallet: concurrent calls for one user produce exactly one row (race-safe)", async () => {
  await ensureUser(RACE_USER);

  // Fire several upserts concurrently (not awaited sequentially). Under the old
  // non-atomic select-then-insert they could each take the insert branch and
  // create duplicate rows; UNIQUE(userId)+onConflictDoUpdate collapses them.
  const results = await Promise.all([
    upsertClubWallet(RACE_USER, "Racing Club", ADDR_A),
    upsertClubWallet(RACE_USER, "Racing Club", ADDR_B),
    upsertClubWallet(RACE_USER, "Racing Club", ADDR_A),
  ]);

  const ids = new Set(results.map((r) => r.id));
  assert.strictEqual(ids.size, 1, "all concurrent upserts must resolve to the same row id");

  const rows = await db
    .select({ id: clubs.id })
    .from(clubs)
    .where(eq(clubs.userId, RACE_USER));
  assert.strictEqual(rows.length, 1, "exactly one clubs row for the user after concurrent upserts");
});
