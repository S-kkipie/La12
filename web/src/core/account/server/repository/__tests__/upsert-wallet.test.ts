import { test, after } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, clubs, profiles } from "@/db/schema";
import { upsertClubWallet } from "../upsert-club-wallet";
import { upsertProfileWallet } from "../upsert-profile-wallet";

const CLUB_USER = "p2-test-club-user";
const FAN_USER = "p2-test-fan-user";
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
  await db.delete(profiles).where(eq(profiles.userId, FAN_USER));
  await db.delete(user).where(eq(user.id, CLUB_USER));
  await db.delete(user).where(eq(user.id, FAN_USER));
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
});
