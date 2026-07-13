import "server-only";
import { db } from "@/lib/db";
import { rounds, type NewRound, type Round } from "@/db/schema";

/** Inserts a round row, always `verified: true` — only called after the
 *  on-chain ownership check in create-round-service.ts. */
export async function insertRound(values: Omit<NewRound, "verified">): Promise<Round> {
  const [round] = await db
    .insert(rounds)
    .values({ ...values, verified: true })
    .returning();
  return round;
}
