import { test } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { findClubRounds } from "../find-club-rounds";
import { findOwnedRound } from "../find-owned-round";

test("findClubRounds: returns the seeded club's verified rounds + its name", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  assert.ok(club, "seeded demo club missing — run `pnpm db:migrate-pg` first");

  const { clubName, rounds: rows } = await findClubRounds(club.id);
  assert.strictEqual(clubName, "Deportivo San Martín");
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => r.clubId === club.id && r.verified));
});

test("findClubRounds: unknown clubId -> empty rounds, generic club name", async () => {
  const { clubName, rounds: rows } = await findClubRounds(999999);
  assert.strictEqual(clubName, "Club");
  assert.deepStrictEqual(rows, []);
});

test("findOwnedRound: the seeded verified round is owned by its own club", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  assert.ok(club, "seeded demo club missing — run `pnpm db:migrate-pg` first");
  const [round] = await db.select().from(rounds).where(eq(rounds.clubId, club.id));
  assert.ok(round, "seeded demo round missing");

  const owned = await findOwnedRound(club.id, round.contractAddress);
  assert.strictEqual(owned?.id, round.id);
});

test("findOwnedRound: a foreign clubId doesn't own the round", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  const [round] = await db.select().from(rounds).where(eq(rounds.clubId, club!.id));
  const owned = await findOwnedRound(club!.id + 999999, round!.contractAddress);
  assert.strictEqual(owned, undefined);
});
