import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";

export type VerifiedRoundRow = {
  roundId: number;
  contractAddress: `0x${string}`;
  sharePrice: string; // USD₮ base units per share (string for bigint precision)
  goal: string; // USD₮ base units
  status: "funding" | "active" | "closed";
  clubName: string;
  clubSlug: string;
};

/** All allowlisted (verified) rounds joined to their club. Money truth is on-chain;
 *  this returns only the display metadata + the contract address to read. */
export async function findVerifiedRounds(): Promise<VerifiedRoundRow[]> {
  const rows = await db
    .select({
      roundId: rounds.id,
      contractAddress: rounds.contractAddress,
      sharePrice: rounds.sharePrice,
      goal: rounds.goal,
      status: rounds.status,
      clubName: clubs.name,
      clubSlug: clubs.slug,
    })
    .from(rounds)
    .innerJoin(clubs, eq(clubs.id, rounds.clubId))
    .where(eq(rounds.verified, true));

  return rows.map((r) => ({ ...r, contractAddress: r.contractAddress as `0x${string}` }));
}
