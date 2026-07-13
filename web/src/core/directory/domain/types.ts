import type { z } from "zod";
import type { Club, Round } from "@/db/schema";
import type { clubWithRoundSchema } from "./schemas";

/** Domain shape — the enriched bigint-precise representation the server
 *  builds. `club`/`round` reuse the Drizzle row types verbatim (their
 *  `createdAt`/`deadline` are `Date`); `raised` is on-chain, bigint. */
export type ClubWithRound = {
  club: Club;
  round: Round;
  raised: bigint;
  pct: number;
};

export type ClubWithRoundDTO = z.infer<typeof clubWithRoundSchema>;

/** Same integer math RoundProgress.tsx's progress bar already uses
 *  (`Math.min(100, Number((raised * 100n) / goal))`) — moved verbatim out of
 *  the legacy `clubDirectory.ts` helper (since deleted). */
export function computeFundedPct(raised: bigint, goal: bigint): number {
  return goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
}

export function toClubWithRoundDTO(c: ClubWithRound): ClubWithRoundDTO {
  return {
    club: { ...c.club, createdAt: c.club.createdAt.toISOString() },
    round: {
      ...c.round,
      deadline: c.round.deadline.toISOString(),
      createdAt: c.round.createdAt.toISOString(),
    },
    raised: c.raised.toString(),
    pct: c.pct,
  };
}

/** Only exercised by the round-trip test today — the directory route has no
 *  client hook (RSC consumers import the service directly), but this keeps
 *  the DTO boundary symmetric and provable, matching the wallet domain template. */
export function parseClubWithRoundDTO(d: ClubWithRoundDTO): ClubWithRound {
  return {
    club: { ...d.club, createdAt: new Date(d.club.createdAt) },
    round: {
      ...d.round,
      deadline: new Date(d.round.deadline),
      createdAt: new Date(d.round.createdAt),
    },
    raised: BigInt(d.raised),
    pct: d.pct,
  };
}
