import "server-only";
import { db } from "@/lib/db";
import { profiles } from "@/db/schema";

/** Atomically upsert the caller's profile row by userId, setting walletAddress.
 *  UNIQUE(profiles.userId) makes concurrent calls for one user conflict-update
 *  in place instead of creating a second row. `displayName` seeded on insert. */
export async function upsertProfileWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const [row] = await db
    .insert(profiles)
    .values({ userId, walletAddress, displayName: name })
    .onConflictDoUpdate({ target: profiles.userId, set: { walletAddress } })
    .returning({ id: profiles.id });
  return row;
}
