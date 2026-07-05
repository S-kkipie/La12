// Off-chain metadata + UI cache (spec §6). Money truth lives on-chain — if this
// DB is wiped, funds are still recoverable from the contract; nothing here is
// authoritative for balances or ownership.
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const clubs = sqliteTable("clubs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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
  // wallet. This flag is our off-chain allowlist: only rounds we've vetted
  // (currently just the seeded demo) are `true`. Never set from client input
  // (see /api/rounds POST) — defaults false for anything the public API creates.
  verified: integer("verified", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const profiles = sqliteTable("profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
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

export type Club = typeof clubs.$inferSelect;
export type NewClub = typeof clubs.$inferInsert;
export type Round = typeof rounds.$inferSelect;
export type NewRound = typeof rounds.$inferInsert;
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
