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
