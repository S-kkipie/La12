import { test } from "node:test";
import assert from "node:assert";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { migrateSqliteToPg } from "./migrate-sqlite-to-pg";
import { db } from "@/lib/db";
import { clubs, rounds, user } from "@/db/schema";
import { eq } from "drizzle-orm";

// Build a tiny sqlite fixture with the legacy column shapes + encodings, run the
// migration, and assert Postgres row counts + preserved ids + type conversions.
function buildFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "ladoce-mig-"));
  const path = join(dir, "fixture.db");
  const s = new Database(path);
  s.exec(`
    CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT, email_verified INTEGER,
      image TEXT, role TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE clubs (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT, slug TEXT, logo_url TEXT,
      description TEXT, wallet_address TEXT, created_at INTEGER);
    CREATE TABLE rounds (id INTEGER PRIMARY KEY, club_id INTEGER, contract_address TEXT, goal TEXT,
      share_price TEXT, revenue_bps INTEGER, cap_multiple INTEGER, deadline INTEGER, status TEXT,
      verified INTEGER, created_at INTEGER);
    CREATE TABLE session (id TEXT PRIMARY KEY, expires_at INTEGER, token TEXT, created_at INTEGER,
      updated_at INTEGER, ip_address TEXT, user_agent TEXT, user_id TEXT);
    CREATE TABLE account (id TEXT PRIMARY KEY, account_id TEXT, provider_id TEXT, user_id TEXT,
      access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER, updated_at INTEGER);
    CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT, value TEXT, expires_at INTEGER,
      created_at INTEGER, updated_at INTEGER);
    CREATE TABLE profiles (id INTEGER PRIMARY KEY, user_id TEXT, wallet_address TEXT, display_name TEXT,
      created_at INTEGER);
    CREATE TABLE events (id INTEGER PRIMARY KEY, round_id INTEGER, kind TEXT, tx_hash TEXT, amount TEXT,
      block INTEGER, ts INTEGER);
  `);
  const nowMs = 1_700_000_000_000;
  const nowSec = 1_700_000_000;
  s.prepare(`INSERT INTO "user" VALUES (?,?,?,?,?,?,?,?)`).run(
    "u1", "Club Owner", "owner@example.com", 1, null, "club", nowMs, nowMs);
  s.prepare(`INSERT INTO clubs VALUES (?,?,?,?,?,?,?,?)`).run(
    7, "u1", "Fixture Club", "fixture-club", null, null, "0xclub", nowSec);
  s.prepare(`INSERT INTO rounds VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(
    3, 7, "0xround", "123456789012345678", "1000000", 800, 15000, nowSec, "funding", 1, nowSec);
  s.close();
  return path;
}

test("migrateSqliteToPg copies all tables with counts, ids, and conversions", async () => {
  const counts = await migrateSqliteToPg(buildFixture());
  assert.deepEqual(counts, {
    user: 1, session: 0, account: 0, verification: 0, clubs: 1, rounds: 1, profiles: 0, events: 0,
  });

  const [c] = await db.select().from(clubs).where(eq(clubs.id, 7));
  assert.equal(c.id, 7); // preserved pk
  assert.equal(c.createdAt instanceof Date, true);

  const [r] = await db.select().from(rounds).where(eq(rounds.id, 3));
  assert.equal(r.goal, "123456789012345678"); // bigint precision preserved
  assert.equal(r.verified, true); // 1 -> boolean

  const [u] = await db.select().from(user).where(eq(user.id, "u1"));
  assert.equal(u.emailVerified, true);
  assert.equal(u.createdAt.getTime(), 1_700_000_000_000); // ms preserved
});
