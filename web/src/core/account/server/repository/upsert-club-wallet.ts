import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { slugify } from "@/core/account/domain/types";

/** Atomically upsert the caller's club row by userId, setting walletAddress.
 *  UNIQUE(clubs.userId) makes this race-safe: concurrent calls for the same
 *  user conflict on userId and update in place rather than creating a second
 *  row. On a genuine first insert, derive a unique slug from `name` (slugify +
 *  `-2/-3/…` collision loop; slug has its own UNIQUE backstop). Returns the id. */
export async function upsertClubWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const base = slugify(name);
  let slug = base;
  for (let n = 2; (await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.slug, slug))).length > 0; n++) {
    slug = `${base}-${n}`;
  }
  const [row] = await db
    .insert(clubs)
    .values({ userId, name, slug, walletAddress })
    .onConflictDoUpdate({ target: clubs.userId, set: { walletAddress } })
    .returning({ id: clubs.id });
  return row;
}
