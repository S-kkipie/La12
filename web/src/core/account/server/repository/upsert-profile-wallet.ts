import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/db/schema";

/** Upsert the caller's profile row by userId, setting walletAddress.
 *  `displayName` seeded from `name` on insert. Returns the row id. */
export async function upsertProfileWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (existing) {
    const [updated] = await db
      .update(profiles)
      .set({ walletAddress })
      .where(eq(profiles.id, existing.id))
      .returning({ id: profiles.id });
    return updated;
  }
  const [profile] = await db
    .insert(profiles)
    .values({ userId, walletAddress, displayName: name })
    .returning({ id: profiles.id });
  return profile;
}
