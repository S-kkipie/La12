import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds, type Club, type Round } from "@/db/schema";

export type ClubRoundRow = { club: Club; round: Round };

/** Table-direct — queries `clubs`/`rounds` directly (per the P5 decoupling
 *  constraint: this worktree has no `core/clubs`/`core/rounds` to import;
 *  those live on the parallel P3+P4 branch). Every club with a VERIFIED
 *  round (RoundFactory.createRound is permissionless on-chain, so `verified`
 *  is the off-chain allowlist gate — same as the legacy clubDirectory.ts helper). */
export async function listClubsWithRoundsRows(): Promise<ClubRoundRow[]> {
  return db
    .select({ club: clubs, round: rounds })
    .from(clubs)
    .innerJoin(rounds, and(eq(rounds.clubId, clubs.id), eq(rounds.verified, true)));
}
