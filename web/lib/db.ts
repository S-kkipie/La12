// SQLite + Drizzle client (server-only). Off-chain metadata + event cache —
// see db/schema.ts. Never import this from a "use client" component.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "@/db/schema";

const dbPath = process.env.DATABASE_PATH ?? "./ladoce.db";

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
