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

// Postgres binds are capped at 65535 per statement; batch inserts so wide
// tables (account: 13 cols, events: 7 cols) can't exceed it as data grows.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function migrateSqliteToPg(sqlitePath: string): Promise<Record<string, number>> {
  if (!existsSync(sqlitePath)) throw new Error(`SQLite file not found: ${sqlitePath}`);
  const sqlite = new Database(sqlitePath, { readonly: true });

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    // FK-safe truncate (children first via CASCADE), reset serial sequences to 1.
    await tx.execute(
      sql`TRUNCATE TABLE ${events}, ${rounds}, ${profiles}, ${clubs}, ${session}, ${account}, ${verification}, ${user} RESTART IDENTITY CASCADE`,
    );

    // Parents first, then children (FK order).
    const uRows = rows(sqlite, "user").map((r) => ({
      id: r.id as string, name: r.name as string, email: r.email as string,
      emailVerified: bool(r.email_verified as number), image: r.image as string | null,
      role: (r.role as "club" | "fan") ?? "fan",
      createdAt: ms(r.created_at as number)!, updatedAt: ms(r.updated_at as number)!,
    }));
    for (const batch of chunk(uRows, 1000)) await tx.insert(user).values(batch);
    counts.user = uRows.length;

    const sRows = rows(sqlite, "session").map((r) => ({
      id: r.id as string, expiresAt: ms(r.expires_at as number)!, token: r.token as string,
      createdAt: ms(r.created_at as number)!, updatedAt: ms(r.updated_at as number)!,
      ipAddress: r.ip_address as string | null, userAgent: r.user_agent as string | null,
      userId: r.user_id as string,
    }));
    for (const batch of chunk(sRows, 1000)) await tx.insert(session).values(batch);
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
    for (const batch of chunk(aRows, 1000)) await tx.insert(account).values(batch);
    counts.account = aRows.length;

    const vRows = rows(sqlite, "verification").map((r) => ({
      id: r.id as string, identifier: r.identifier as string, value: r.value as string,
      expiresAt: ms(r.expires_at as number)!,
      // Pg schema has verification.createdAt/updatedAt NOT NULL (Better-Auth-correct),
      // but the legacy sqlite table left them nullable. $defaultFn only fires when the
      // field is omitted, not when passed null, so coalesce here to avoid a NOT NULL
      // violation on rows that predate the column being populated.
      createdAt: ms(r.created_at as number) ?? new Date(),
      updatedAt: ms(r.updated_at as number) ?? new Date(),
    }));
    for (const batch of chunk(vRows, 1000)) await tx.insert(verification).values(batch);
    counts.verification = vRows.length;

    const cRows = rows(sqlite, "clubs").map((r) => ({
      id: r.id as number, userId: r.user_id as string | null, name: r.name as string,
      slug: r.slug as string, logoUrl: r.logo_url as string | null,
      description: r.description as string | null, walletAddress: r.wallet_address as string,
      createdAt: sec(r.created_at as number)!,
    }));
    for (const batch of chunk(cRows, 1000)) await tx.insert(clubs).values(batch);
    counts.clubs = cRows.length;

    const rRows = rows(sqlite, "rounds").map((r) => ({
      id: r.id as number, clubId: r.club_id as number, contractAddress: r.contract_address as string,
      goal: r.goal as string, sharePrice: r.share_price as string,
      revenueBps: r.revenue_bps as number, capMultiple: r.cap_multiple as number,
      deadline: sec(r.deadline as number)!, status: r.status as "funding" | "active" | "closed",
      verified: bool(r.verified as number), createdAt: sec(r.created_at as number)!,
    }));
    for (const batch of chunk(rRows, 1000)) await tx.insert(rounds).values(batch);
    counts.rounds = rRows.length;

    const pRows = rows(sqlite, "profiles").map((r) => ({
      id: r.id as number, userId: r.user_id as string | null, walletAddress: r.wallet_address as string,
      displayName: r.display_name as string | null, createdAt: sec(r.created_at as number)!,
    }));
    for (const batch of chunk(pRows, 1000)) await tx.insert(profiles).values(batch);
    counts.profiles = pRows.length;

    const eRows = rows(sqlite, "events").map((r) => ({
      id: r.id as number, roundId: r.round_id as number, kind: r.kind as "invest" | "distribute" | "claim" | "close",
      txHash: r.tx_hash as string, amount: r.amount as string, block: r.block as number,
      ts: sec(r.ts as number)!,
    }));
    for (const batch of chunk(eRows, 1000)) await tx.insert(events).values(batch);
    counts.events = eRows.length;

    // Reset serial sequences past the max copied id so future auto-ids don't collide.
    // For empty tables, TRUNCATE RESTART IDENTITY already leaves sequence at 0, so nextval() returns 1.
    // Only call setval when table has data to avoid "value out of bounds" error with 0.
    for (const t of ["clubs", "rounds", "profiles", "events"]) {
      await tx.execute(
        sql.raw(`SELECT CASE WHEN (SELECT MAX(id) FROM "${t}") IS NOT NULL THEN setval(pg_get_serial_sequence('${t}', 'id'), (SELECT MAX(id) FROM "${t}"), true) END`),
      );
    }
  });

  sqlite.close();
  return counts;
}

// CLI: `pnpm db:migrate-pg`
if (process.argv[1] && process.argv[1].endsWith("migrate-sqlite-to-pg.ts")) {
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
