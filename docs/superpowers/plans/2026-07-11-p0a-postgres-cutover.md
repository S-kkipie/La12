# P0a — Postgres Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move La Doce's existing Next.js app off `better-sqlite3` onto PostgreSQL with zero architecture change — every current Route Handler and RSC page runs unchanged against Postgres.

**Architecture:** Port the Drizzle schema `sqlite-core` → `pg-core` keeping identical inferred TS types (so no consumer changes), swap the Drizzle client to `drizzle-orm/node-postgres`, migrate live data with a one-shot script, and verify Better Auth + app flows on Postgres. No Elysia/Eden yet — that is P0b. Files stay in the current flat layout (`web/lib`, `web/db`); the `src/` move is P0b.

**Tech Stack:** Next.js 15.5, Drizzle ORM 0.44, `pg` (node-postgres), PostgreSQL 16, Better Auth 1.6.23, `tsx` + `node:test`, pnpm.

## Global Constraints

- **Money truth is on-chain.** Postgres = UX/metadata + event cache only. Never authoritative for balances/ownership.
- **`goal` / `sharePrice` / `events.amount` stay `text`** — USD₮ base-units held as strings for exact bigint precision. Do NOT convert to `numeric`.
- **`revenueBps` / `capMultiple` stay `integer`** (bps-scaled, e.g. `15000 = 1.5x`).
- **Inferred types must not change.** `db/schema.ts` type exports (`User`, `Club`, `NewClub`, `Round`, `NewRound`, `Profile`, `NewProfile`, `Event`, `NewEvent`) keep the same names and the same inferred field types so `lib/*` and `app/api/*` compile untouched.
- **Preserve primary keys during migration.** `clubs.id` / `rounds.id` / `profiles.id` / `events.id` values are referenced by FKs — copy explicit ids, then reset sequences.
- **`casing: "snake_case"`** on the Drizzle client (TS camelCase ↔ DB snake_case).
- **Keep `better-sqlite3` installed** — the migration script reads the old DB with it. It is removed in PF, not here.
- Package manager is **pnpm**. Tests run with **`pnpm exec tsx --test <file>`** (`node:test` runner, no vitest).
- Timestamp encoding in the OLD sqlite DB: Better Auth tables (`user`/`session`/`account`/`verification`) use **milliseconds** (`timestamp_ms`); app tables (`clubs`/`rounds`/`profiles`/`events`) use **seconds** (`timestamp`). The migration script must convert each correctly.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `web/package.json` | add `pg` + `@types/pg`, scripts `db:migrate-pg` / `test:db` | Modify |
| `web/docker-compose.yml` | local Postgres 16 for dev/test | Create |
| `web/.env.example` | document `DATABASE_URL`; mark `DATABASE_PATH` migration-only | Modify |
| `web/.env.local` | set `DATABASE_URL` for local dev | Modify |
| `web/db/schema.ts` | Drizzle schema ported to `pg-core`, identical inferred types | Rewrite |
| `web/lib/db.ts` | Drizzle client over `node-postgres` Pool | Rewrite |
| `web/drizzle.config.ts` | `dialect: "postgresql"`, url from `DATABASE_URL` | Rewrite |
| `web/scripts/migrate-sqlite-to-pg.ts` | testable `migrateSqliteToPg(sqlitePath)` + CLI wrapper | Create |
| `web/scripts/migrate-sqlite-to-pg.test.ts` | row-count parity test against a fixture sqlite | Create |
| `web/lib/db.roundtrip.test.ts` | insert/read round-trip of each app table on pg | Create |

---

## Task 1: Add Postgres deps, local Postgres, and `DATABASE_URL`

**Files:**
- Modify: `web/package.json`
- Create: `web/docker-compose.yml`
- Modify: `web/.env.example`, `web/.env.local`

**Interfaces:**
- Produces: env var `DATABASE_URL` (Postgres connection string); a running local Postgres reachable at that URL; `pnpm` scripts `db:migrate-pg`, `test:db`.

- [ ] **Step 1: Add deps + scripts to `web/package.json`**

Add to `dependencies`: `"pg": "^8.13.1"`. Add to `devDependencies`: `"@types/pg": "^8.11.10"`. Add to `scripts`:

```json
    "db:migrate-pg": "tsx scripts/migrate-sqlite-to-pg.ts",
    "test:db": "tsx --test lib/db.roundtrip.test.ts scripts/migrate-sqlite-to-pg.test.ts"
```

- [ ] **Step 2: Install**

Run: `cd web && pnpm install`
Expected: `pg` and `@types/pg` resolve and install; lockfile updates.

- [ ] **Step 3: Create `web/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16
    container_name: ladoce-pg
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: ladoce
    ports:
      - "5432:5432"
    volumes:
      - ladoce-pgdata:/var/lib/postgresql/data
volumes:
  ladoce-pgdata:
```

- [ ] **Step 4: Start Postgres**

Run: `cd web && docker compose up -d`
Expected: `ladoce-pg` container running. Verify: `docker compose exec postgres pg_isready -U postgres` prints `accepting connections`.

(Alternative host: any managed Postgres — Supabase/Neon. Set its URL as `DATABASE_URL` and skip docker. For prod, the OCI deploy uses the chosen managed URL.)

- [ ] **Step 5: Set `DATABASE_URL` in `web/.env.local`**

Add:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce
```

Keep the existing `DATABASE_PATH=./ladoce.db` line — the migration script still reads it.

- [ ] **Step 6: Document env in `web/.env.example`**

Replace the `# --- Off-chain data ---` block with:

```
# --- Off-chain data (Postgres + Drizzle, spec §6) ---
# Postgres connection string. Local dev: `docker compose up -d` then use the
# line below. Prod: managed Postgres (Supabase/Neon) URL.
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce
# Legacy SQLite path — ONLY read by scripts/migrate-sqlite-to-pg.ts to copy
# existing data into Postgres. Remove once migration is done (PF).
DATABASE_PATH=./ladoce.db
```

- [ ] **Step 7: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/package.json web/pnpm-lock.yaml web/docker-compose.yml web/.env.example
git commit -m "chore(p0a): add pg deps + local Postgres + DATABASE_URL"
```

---

## Task 2: Port `db/schema.ts` to `pg-core`

**Files:**
- Rewrite: `web/db/schema.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `pgTable` exports `user`, `session`, `account`, `verification`, `clubs`, `rounds`, `profiles`, `events`; type exports `User`, `Club`, `NewClub`, `Round`, `NewRound`, `Profile`, `NewProfile`, `Event`, `NewEvent` — same names, same inferred field types as before.

- [ ] **Step 1: Rewrite `web/db/schema.ts`**

```ts
// Off-chain metadata + UI cache (spec §6). Money truth lives on-chain — if this
// DB is wiped, funds are still recoverable from the contract; nothing here is
// authoritative for balances or ownership.
import { pgTable, text, integer, serial, boolean, timestamp, index } from "drizzle-orm/pg-core";

// --- Better Auth tables (lib/auth.ts) ---------------------------------------
// Column names/types match Better Auth's Postgres/Drizzle adapter shape.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // additionalFields.role in lib/auth.ts — never trusted from client input
  // for anything privileged (routes re-check the session).
  role: text("role", { enum: ["club", "fan"] }).notNull().default("fan"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"), // email+password hash lives here, per Better Auth's model
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()).$onUpdate(() => new Date()),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// --- App tables --------------------------------------------------------------
export const clubs = pgTable("clubs", {
  id: serial("id").primaryKey(),
  // Nullable: the seeded demo club predates auth. New clubs set this at /signup.
  userId: text("user_id").references(() => user.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  description: text("description"),
  walletAddress: text("wallet_address").notNull(),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const rounds = pgTable("rounds", {
  id: serial("id").primaryKey(),
  clubId: integer("club_id").notNull().references(() => clubs.id),
  contractAddress: text("contract_address").notNull(),
  goal: text("goal").notNull(), // USD₮ base units (6 decimals), string for bigint precision
  sharePrice: text("share_price").notNull(), // USD₮ base units per share
  revenueBps: integer("revenue_bps").notNull(), // retained %, e.g. 800 = 8%
  capMultiple: integer("cap_multiple").notNull(), // bps-scaled, e.g. 15000 = 1.5x
  deadline: timestamp("deadline").notNull(),
  status: text("status", { enum: ["funding", "active", "closed"] }).notNull().default("funding"),
  // off-chain allowlist flag — see db/schema.ts history; only vetted rounds are true.
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

export const profiles = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => user.id),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name"),
  createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
});

// Cache of on-chain events (invest/distribute/claim/close). Populated by
// /api/sync; on-chain logs remain the source of truth; rebuildable.
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  roundId: integer("round_id").notNull().references(() => rounds.id),
  kind: text("kind", { enum: ["invest", "distribute", "claim", "close"] }).notNull(),
  txHash: text("tx_hash").notNull(),
  amount: text("amount").notNull(), // USD₮ base units, string for bigint precision
  block: integer("block").notNull(),
  ts: timestamp("ts").notNull(),
});

export type User = typeof user.$inferSelect;
export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
```

- [ ] **Step 2: Rewrite `web/lib/db.ts` (node-postgres) — lands WITH the schema so the driver matches**

The `better-sqlite3` driver cannot accept a `pg-core` schema (compile-time type mismatch), so the client swap must land in the same commit as the schema port — otherwise `tsc` is red at the checkpoint. Rewrite `web/lib/db.ts`:

```ts
// Postgres + Drizzle client (server-only). Off-chain metadata + event cache —
// see db/schema.ts. Never import this from a "use client" component.
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

// Managed Postgres (Supabase/Neon) terminates TLS with its own CA; allow it in
// prod. Local docker Postgres has no TLS — disable there.
const ssl = connectionString.includes("localhost") ? false : { rejectUnauthorized: false };

const pool = new Pool({ connectionString, ssl });

export const db = drizzle(pool, { schema, casing: "snake_case" });
```

- [ ] **Step 3: Rewrite `web/drizzle.config.ts`**

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/ladoce",
  },
});
```

- [ ] **Step 4: Typecheck — schema + client match, consumers still compile**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: PASS. The pg-core schema now pairs with the node-postgres driver, and consumers (`lib/*.ts`, `app/api/**`) import `Club`/`Round`/etc.; `serial` still infers `id: number` on select and optional on insert, `boolean` infers `boolean`, `timestamp` infers `Date`, `text` infers `string` — identical to the sqlite shapes.

- [ ] **Step 5: Cross-check the Better Auth tables against the CLI (drift guard)**

The spec requires the `user`/`session`/`account`/`verification` shapes match Better Auth's Postgres adapter exactly. The hand-port is verified against the generator. Note `lib/auth.ts` still declares `provider: "sqlite"` — it is repointed to `pg` in P0b; for THIS check, temporarily read the config with `provider: "pg"` OR generate against a throwaway copy, and do not commit any auth.ts change here.

Run: `cd web && npx @better-auth/cli@latest generate --config lib/auth.ts --output /tmp/ba-pg-schema.ts` (choose Postgres/Drizzle when prompted).
Then diff the four auth tables' columns/types against `db/schema.ts`. Expected: same column names, same types (`text` id, `boolean` email_verified, `timestamp` \*_at, `text` role). Reconcile any difference into `db/schema.ts` (the generator wins on auth tables). Discard `/tmp/ba-pg-schema.ts` — reference only; do not overwrite `db/schema.ts` (it also holds the app tables).

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/db/schema.ts web/lib/db.ts web/drizzle.config.ts
git commit -m "feat(p0a): port schema sqlite-core -> pg-core + node-postgres client"
```

---

## Task 3: Push schema to Postgres + round-trip test

**Files:**
- Create: `web/lib/db.roundtrip.test.ts`
- Create: `web/drizzle/*` (generated by drizzle-kit push metadata)

**Interfaces:**
- Consumes: pg-core schema + node-postgres `db` (Task 2); `DATABASE_URL` (Task 1).
- Produces: the 8 tables physically created in Postgres; a round-trip test proving the tricky column types survive (serial id, text-bigint precision, integer bps, boolean, Date).

- [ ] **Step 1: Push schema to Postgres**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec drizzle-kit push`
Expected: drizzle-kit reports creating tables `user`, `session`, `account`, `verification`, `clubs`, `rounds`, `profiles`, `events` + indexes. Confirm with `docker compose exec postgres psql -U postgres -d ladoce -c '\dt'` — 8 tables listed.

- [ ] **Step 2: Write the failing round-trip test `web/lib/db.roundtrip.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { clubs, rounds } from "@/db/schema";

// Proves the pg client + schema round-trips the tricky column types:
// serial id (number), text bigint (string precision), integer bps, boolean, Date.
test("clubs + rounds round-trip through the pg client", async () => {
  const [club] = await db
    .insert(clubs)
    .values({ name: "RT Club", slug: `rt-${Date.now()}`, walletAddress: "0xrt" })
    .returning();
  assert.equal(typeof club.id, "number");
  assert.equal(club.createdAt instanceof Date, true);

  const bigGoal = "123456789012345678"; // beyond Number.MAX_SAFE_INTEGER — must survive as string
  const [round] = await db
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

  assert.equal(round.goal, bigGoal); // no float rounding
  assert.equal(round.revenueBps, 800);
  assert.equal(round.verified, true);

  // cleanup
  await db.delete(rounds).where(eq(rounds.id, round.id));
  await db.delete(clubs).where(eq(clubs.id, club.id));
});
```

- [ ] **Step 3: Run it**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --test lib/db.roundtrip.test.ts`
Expected: PASS. (If it fails on connection, Postgres from Task 1 Step 4 isn't up.)

- [ ] **Step 4: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/lib/db.roundtrip.test.ts web/drizzle
git commit -m "feat(p0a): push pg schema + round-trip test"
```

---

## Task 4: Data migration script (sqlite → pg)

**Files:**
- Create: `web/scripts/migrate-sqlite-to-pg.ts`
- Create: `web/scripts/migrate-sqlite-to-pg.test.ts`

**Interfaces:**
- Consumes: `db` (node-postgres client, Task 2); `better-sqlite3` (already installed).
- Produces: `export async function migrateSqliteToPg(sqlitePath: string): Promise<Record<string, number>>` — truncates target tables, copies every row preserving ids, resets serial sequences, returns `{ user, session, account, verification, clubs, rounds, profiles, events }` insert counts. A CLI wrapper runs it against `DATABASE_PATH`.

- [ ] **Step 1: Write the migration script `web/scripts/migrate-sqlite-to-pg.ts`**

```ts
// One-shot copy of the legacy SQLite DB into Postgres, preserving primary keys
// so FKs stay valid, then resetting serial sequences. Idempotent: truncates the
// target first, so re-running yields the same result. Removed in PF.
import { existsSync } from "node:fs";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, session, account, verification, clubs, rounds, profiles, events } from "@/db/schema";

const ms = (v: number | null) => (v == null ? null : new Date(v)); // Better Auth cols: milliseconds
const sec = (v: number | null) => (v == null ? null : new Date(v * 1000)); // app cols: seconds
const bool = (v: number | null) => v === 1;

type Row = Record<string, number | string | null>;
const rows = (sqlite: Database.Database, table: string): Row[] =>
  sqlite.prepare(`SELECT * FROM "${table}"`).all() as Row[];

export async function migrateSqliteToPg(sqlitePath: string): Promise<Record<string, number>> {
  if (!existsSync(sqlitePath)) throw new Error(`SQLite file not found: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  // FK-safe truncate (children first via CASCADE), reset serial sequences to 1.
  await db.execute(
    sql`TRUNCATE TABLE ${events}, ${rounds}, ${profiles}, ${clubs}, ${session}, ${account}, ${verification}, ${user} RESTART IDENTITY CASCADE`,
  );

  const counts: Record<string, number> = {};

  // Parents first, then children (FK order).
  const uRows = rows(sqlite, "user").map((r) => ({
    id: r.id as string, name: r.name as string, email: r.email as string,
    emailVerified: bool(r.email_verified as number), image: r.image as string | null,
    role: (r.role as "club" | "fan") ?? "fan",
    createdAt: ms(r.created_at as number)!, updatedAt: ms(r.updated_at as number)!,
  }));
  if (uRows.length) await db.insert(user).values(uRows);
  counts.user = uRows.length;

  const sRows = rows(sqlite, "session").map((r) => ({
    id: r.id as string, expiresAt: ms(r.expires_at as number)!, token: r.token as string,
    createdAt: ms(r.created_at as number)!, updatedAt: ms(r.updated_at as number)!,
    ipAddress: r.ip_address as string | null, userAgent: r.user_agent as string | null,
    userId: r.user_id as string,
  }));
  if (sRows.length) await db.insert(session).values(sRows);
  counts.session = sRows.length;

  const aRows = rows(sqlite, "account").map((r) => ({
    id: r.id as string, accountId: r.account_id as string, providerId: r.provider_id as string,
    userId: r.user_id as string, accessToken: r.access_token as string | null,
    refreshToken: r.refresh_token as string | null, idToken: r.id_token as string | null,
    accessTokenExpiresAt: ms(r.access_token_expires_at as number),
    refreshTokenExpiresAt: ms(r.refresh_token_expires_at as number),
    scope: r.scope as string | null, password: r.password as string | null,
    createdAt: ms(r.created_at as number)!, updatedAt: ms(r.updated_at as number)!,
  }));
  if (aRows.length) await db.insert(account).values(aRows);
  counts.account = aRows.length;

  const vRows = rows(sqlite, "verification").map((r) => ({
    id: r.id as string, identifier: r.identifier as string, value: r.value as string,
    expiresAt: ms(r.expires_at as number)!, createdAt: ms(r.created_at as number),
    updatedAt: ms(r.updated_at as number),
  }));
  if (vRows.length) await db.insert(verification).values(vRows);
  counts.verification = vRows.length;

  const cRows = rows(sqlite, "clubs").map((r) => ({
    id: r.id as number, userId: r.user_id as string | null, name: r.name as string,
    slug: r.slug as string, logoUrl: r.logo_url as string | null,
    description: r.description as string | null, walletAddress: r.wallet_address as string,
    createdAt: sec(r.created_at as number)!,
  }));
  if (cRows.length) await db.insert(clubs).values(cRows);
  counts.clubs = cRows.length;

  const rRows = rows(sqlite, "rounds").map((r) => ({
    id: r.id as number, clubId: r.club_id as number, contractAddress: r.contract_address as string,
    goal: r.goal as string, sharePrice: r.share_price as string,
    revenueBps: r.revenue_bps as number, capMultiple: r.cap_multiple as number,
    deadline: sec(r.deadline as number)!, status: r.status as "funding" | "active" | "closed",
    verified: bool(r.verified as number), createdAt: sec(r.created_at as number)!,
  }));
  if (rRows.length) await db.insert(rounds).values(rRows);
  counts.rounds = rRows.length;

  const pRows = rows(sqlite, "profiles").map((r) => ({
    id: r.id as number, userId: r.user_id as string | null, walletAddress: r.wallet_address as string,
    displayName: r.display_name as string | null, createdAt: sec(r.created_at as number)!,
  }));
  if (pRows.length) await db.insert(profiles).values(pRows);
  counts.profiles = pRows.length;

  const eRows = rows(sqlite, "events").map((r) => ({
    id: r.id as number, roundId: r.round_id as number, kind: r.kind as "invest" | "distribute" | "claim" | "close",
    txHash: r.tx_hash as string, amount: r.amount as string, block: r.block as number,
    ts: sec(r.ts as number)!,
  }));
  if (eRows.length) await db.insert(events).values(eRows);
  counts.events = eRows.length;

  // Reset serial sequences past the max copied id so future auto-ids don't collide.
  for (const t of ["clubs", "rounds", "profiles", "events"]) {
    await db.execute(
      sql.raw(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 1))`),
    );
  }

  sqlite.close();
  return counts;
}

// CLI: `pnpm db:migrate-pg`
if (process.argv[1] && process.argv[1].endsWith("migrate-sqlite-to-pg.ts")) {
  if (existsSync(".env.local")) process.loadEnvFile(".env.local");
  const path = process.env.DATABASE_PATH ?? "./ladoce.db";
  migrateSqliteToPg(path)
    .then((counts) => {
      console.log("Migrated rows:", counts);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
```

- [ ] **Step 2: Write the failing parity test `web/scripts/migrate-sqlite-to-pg.test.ts`**

```ts
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
```

> **⚠ These tests are destructive** — `migrateSqliteToPg` runs `TRUNCATE ... CASCADE`
> on every table. Run `test:db` **before** the real `pnpm db:migrate-pg` (Task 4 Step 4),
> or against a throwaway database (`DATABASE_URL=...ladoce_test`). If you run it after
> the real migration, re-run `pnpm db:migrate-pg` to restore the live data.

- [ ] **Step 3: Run the test**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --test scripts/migrate-sqlite-to-pg.test.ts`
Expected: PASS. Counts match, ids preserved, `goal` string intact, booleans + ms timestamps converted.

- [ ] **Step 4: Run the real migration against the live sqlite DB**

Run: `cd web && pnpm db:migrate-pg`
Expected: prints `Migrated rows: { user: N, session: ..., clubs: ..., rounds: ..., ... }` with the real counts from `ladoce.db`. Cross-check one table: `docker compose exec postgres psql -U postgres -d ladoce -c 'SELECT count(*) FROM rounds;'` matches sqlite `sqlite3 ladoce.db 'SELECT count(*) FROM rounds;'` (or `pnpm exec tsx -e` equivalent).

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/scripts/migrate-sqlite-to-pg.ts web/scripts/migrate-sqlite-to-pg.test.ts
git commit -m "feat(p0a): sqlite->pg data migration script + parity test"
```

---

## Task 5: Verify Better Auth + app end-to-end on Postgres

**Files:**
- None (verification task). Re-run existing pure tests; drive the app.

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: confidence gate — the app runs on Postgres with no behavior change. This is P0a's acceptance.

- [ ] **Step 1: Existing pure logic tests still green**

Run: `cd web && pnpm exec tsx --test lib/positions.test.ts lib/clubRevenue.test.ts lib/closeFunding.test.ts lib/format.test.ts lib/walletMode.test.ts lib/indexer.test.ts lib/moonpay.test.ts lib/clubDirectory.test.ts`
Expected: all PASS (these don't touch the DB; they must be unaffected).

- [ ] **Step 2: Build passes**

Run: `cd web && pnpm build`
Expected: `next build` completes with no type errors. (Confirms every `app/api/**` + RSC page compiles against the pg schema/client.)

- [ ] **Step 3: Boot the app and drive auth on Postgres**

Run: `cd web && pnpm dev` (ensure `docker compose up -d` + migration done).
Then, in a browser:
1. `/signup` — create a **fan** account. Expected: redirect to post-auth; a `user` row (role `fan`) + `account` (password hash) + `session` appear in Postgres (`psql ... 'SELECT id, role FROM "user";'`).
2. `/login` — sign in with the same account. Expected: session established.
3. Open `/wallet` (fan) — positions/history load (empty is fine for a fresh fan). Expected: no 500s; `/api/wallet/*` handlers succeed against pg.
4. Sign up a **club** account, open the club dashboard — `/api/club/overview` returns totals (the seeded demo club/round if present). Expected: reads succeed.

- [ ] **Step 4: Confirm seeded demo data survived (if the live sqlite had it)**

Run: `docker compose exec postgres psql -U postgres -d ladoce -c "SELECT slug, wallet_address FROM clubs; SELECT id, status, verified FROM rounds;"`
Expected: the demo club (`deportivo-san-martin`) + its round present with `verified = true`, matching the pre-migration sqlite.

- [ ] **Step 5: Commit any incidental fixes**

If Steps 1–4 surfaced small fixes (a type nit, an env tweak), commit them. If nothing changed, there is nothing to commit — do not create an empty commit; P0a is already captured by Tasks 1–4.

```bash
cd /home/skkippie/work/AI-DO/La12
git add -A web
git commit -m "fix(p0a): address issues found verifying Postgres cutover"
```

---

## Acceptance criteria (P0a done)

- `pnpm build` green; `pnpm exec tsc --noEmit` green.
- `lib/db.roundtrip.test.ts` + `scripts/migrate-sqlite-to-pg.test.ts` + all existing `lib/*.test.ts` green.
- Live data copied into Postgres with preserved ids and exact `goal`/`sharePrice`/`amount` strings; serial sequences reset.
- Signup/login/session, `/api/wallet/*`, `/api/club/*` all work against Postgres.
- `better-sqlite3` still installed (migration script depends on it); removed later in PF.
- No Elysia/Eden/`src/` changes — those are P0b.

## Notes for the next phase (P0b)

- `lib/db.ts` reads `process.env.DATABASE_URL` directly for now; P0b folds it into `ServerConfig` (t3-env).
- The `ssl` heuristic (`localhost` → off) is a stopgap; P0b's config layer should make it explicit per environment.
- Prod cutover: point `DATABASE_URL` at the managed host (Supabase rec.), run `drizzle-kit push` then `pnpm db:migrate-pg` once against it, then redeploy `ladoce.service`.
