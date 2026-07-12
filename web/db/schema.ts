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
    // Better Auth's CLI generator (verified via Step 5 drift check, 2026-07)
    // emits both as NOT NULL for the Postgres/Drizzle adapter — differs from
    // the earlier hand-transcribed SQLite version, which left them nullable.
    createdAt: timestamp("created_at").notNull().$defaultFn(() => new Date()),
    updatedAt: timestamp("updated_at").notNull().$defaultFn(() => new Date()),
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
