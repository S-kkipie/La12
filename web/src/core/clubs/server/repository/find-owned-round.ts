import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

/** A round that belongs to `clubId`, matches `contractAddress`, and is
 *  verified — the ownership check the holders read (and, structurally,
 *  anything else that needs to prove a club owns a specific round) uses. */
export async function findOwnedRound(clubId: number, contractAddress: string): Promise<Round | undefined> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, clubId), eq(rounds.contractAddress, contractAddress), eq(rounds.verified, true)));
  return round;
}
