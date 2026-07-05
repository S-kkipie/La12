// Off-chain metadata + UI cache (spec §6). Money truth lives on-chain — if this
// DB is wiped, funds are still recoverable from the contract; nothing here is
// authoritative for balances or ownership.
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// --- Better Auth tables (lib/auth.ts) ---------------------------------------
// Hand-written to match Better Auth's documented SQLite/Drizzle shape
// (docs: concepts/database, adapters/drizzle) rather than run through its CLI
// generator against an existing schema file — same tables/columns/types it
// would produce, just transcribed directly so nothing else in db/schema.ts
// risks being touched by a generator we don't control.
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
  image: text("image"),
  // additionalFields.role in lib/auth.ts — chosen at signup, never trusted
  // from client input for anything privileged (routes re-check the session).
  role: text("role", { enum: ["club", "fan"] }).notNull().default("fan"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdate(() => new Date()),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"), // email+password hash lives here, per Better Auth's model
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date())
      .$onUpdate(() => new Date()),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$defaultFn(() => new Date()),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

// --- App tables --------------------------------------------------------------
export const clubs = sqliteTable("clubs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Nullable: the seeded demo club predates auth and has no Better Auth
  // account behind it. New clubs created via /signup always set this.
  userId: text("user_id").references(() => user.id),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  description: text("description"),
  walletAddress: text("wallet_address").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const rounds = sqliteTable("rounds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  clubId: integer("club_id")
    .notNull()
    .references(() => clubs.id),
  contractAddress: text("contract_address").notNull(),
  goal: text("goal").notNull(), // USD₮ base units (6 decimals), stored as string to keep bigint precision
  sharePrice: text("share_price").notNull(), // USD₮ base units per share
  revenueBps: integer("revenue_bps").notNull(), // retained %, e.g. 800 = 8%
  // bps-scaled like the contract's `capMultiple` (BPS_DENOM = 10_000), e.g. 15000 = 1.5x
  capMultiple: integer("cap_multiple").notNull(),
  deadline: integer("deadline", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["funding", "active", "closed"] })
    .notNull()
    .default("funding"),
  // `RoundFactory.createRound()` is permissionless on-chain — anyone can deploy
  // a round that emits `RoundCreated` for a fake club pointed at their own
  // wallet. This flag is our off-chain allowlist: only rounds we've vetted are
  // `true`. The seeded demo round is vetted by hand; rounds created via the
  // authenticated club dashboard (/api/rounds POST) are vetted by checking
  // on-chain that the round's `club()` matches the caller's own club wallet —
  // never set from raw, unauthenticated client input.
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Nullable for the same reason as clubs.userId — rows created before auth
  // existed (there aren't any in practice, but the column stays optional).
  userId: text("user_id").references(() => user.id),
  walletAddress: text("wallet_address").notNull().unique(),
  displayName: text("display_name"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Cache of on-chain events (invest/distribute/claim) so the UI can render fast
// without hitting the RPC on every request. Populated by /api/sync. On-chain
// logs remain the source of truth; this table can be rebuilt from them.
export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roundId: integer("round_id")
    .notNull()
    .references(() => rounds.id),
  kind: text("kind", { enum: ["invest", "distribute", "claim", "close"] }).notNull(),
  txHash: text("tx_hash").notNull(),
  amount: text("amount").notNull(), // USD₮ base units, string for bigint precision
  block: integer("block").notNull(),
  ts: integer("ts", { mode: "timestamp" }).notNull(),
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
