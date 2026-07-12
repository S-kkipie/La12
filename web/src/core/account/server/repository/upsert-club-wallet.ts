import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { slugify } from "@/core/account/domain/types";

/** Upsert the caller's club row by userId, setting walletAddress. On insert,
 *  derive a unique slug from `name` (slugify + `-2/-3/…` collision loop —
 *  the slug UNIQUE constraint is the backstop). Returns the row id. */
export async function upsertClubWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(clubs).where(eq(clubs.userId, userId));
  if (existing) {
    const [updated] = await db
      .update(clubs)
      .set({ walletAddress })
      .where(eq(clubs.id, existing.id))
      .returning({ id: clubs.id });
    return updated;
  }
  const base = slugify(name);
  let slug = base;
  for (let n = 2; (await db.select().from(clubs).where(eq(clubs.slug, slug))).length > 0; n++) {
    slug = `${base}-${n}`;
  }
  const [club] = await db
    .insert(clubs)
    .values({ userId, name, slug, walletAddress })
    .returning({ id: clubs.id });
  return club;
}
