import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs, type Round } from "@/db/schema";

export type ClubRoundsResult = { clubName: string; rounds: Round[] };

/** This club's verified rounds + its display name (defaults to "Club" if the
 *  clubId doesn't resolve — mirrors the legacy `club?.name ?? "Club"` fallback). */
export async function findClubRounds(clubId: number): Promise<ClubRoundsResult> {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const rows = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, clubId), eq(rounds.verified, true)));
  return { clubName: club?.name ?? "Club", rounds: rows };
}
