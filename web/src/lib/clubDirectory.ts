/**
 * Same integer math RoundProgress.tsx already uses for its progress bar
 * (`Math.min(100, Number((raised * 100n) / goal))`) — duplicated here
 * rather than importing a client component's internals into this
 * server-only data helper.
 */
export function computeFundedPct(raised: bigint, goal: bigint): number {
  return goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
}

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds, type Club, type Round } from "@/db/schema";
import { totalRaised, readSafely } from "./contracts";

export type ClubWithRound = {
  club: Club;
  round: Round;
  raised: bigint;
  pct: number;
};

/**
 * Every club with a verified round, most-funded first. A round whose
 * contract can't be read (RPC down, bad address) degrades to `raised = 0n`
 * via `readSafely` rather than taking the whole list down — same tolerance
 * the single-club homepage already had.
 */
export async function listClubsWithRounds(): Promise<ClubWithRound[]> {
  const rows = await db
    .select({ club: clubs, round: rounds })
    .from(clubs)
    .innerJoin(rounds, and(eq(rounds.clubId, clubs.id), eq(rounds.verified, true)));

  const withRaised = await Promise.all(
    rows.map(async ({ club, round }) => {
      const raised = await readSafely(
        () => totalRaised(round.contractAddress as `0x${string}`),
        0n,
      );
      return { club, round, raised, pct: computeFundedPct(raised, BigInt(round.goal)) };
    }),
  );

  return withRaised.sort((a, b) => b.pct - a.pct);
}
