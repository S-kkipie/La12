// Fan positions — which verified rounds a fan holds shares in, read straight
// from chain (money truth on-chain per CLAUDE.md). The DB only tells us which
// rounds are verified (schema allowlist) and their display metadata; balances,
// rewards and raised come from the contract. Server-only (imports the DB).
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";
import {
  shareBalance,
  pendingReward,
  totalRaised,
  totalShares,
  readSafely,
} from "@/lib/contracts";

const SHARE_UNIT = 1_000000n; // 1e6, matches RevenueShareRound.SHARE_UNIT & USD₮ 6dp

export type FanPosition = {
  roundId: number;
  contractAddress: `0x${string}`;
  clubName: string;
  clubSlug: string;
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
  status: "funding" | "active" | "closed";
};

export type FanPositionDTO = Omit<
  FanPosition,
  "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  shares: string;
  totalShares: string;
  investedUsdt: string;
  claimable: string;
  raised: string;
  goal: string;
};

/** invested USD₮ = shares * sharePrice / SHARE_UNIT (see contract invest()). */
export function investedFromShares(shares: bigint, sharePrice: bigint): bigint {
  return (shares * sharePrice) / SHARE_UNIT;
}

/** Fan's % of the round's total shares, 2 decimals; 0 when supply is 0. */
export function percentOfRound(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}

export function toPositionDTO(p: FanPosition): FanPositionDTO {
  return {
    ...p,
    shares: p.shares.toString(),
    totalShares: p.totalShares.toString(),
    investedUsdt: p.investedUsdt.toString(),
    claimable: p.claimable.toString(),
    raised: p.raised.toString(),
    goal: p.goal.toString(),
  };
}

/** Verified rounds where `fan` holds > 0 shares, enriched with on-chain reads. */
export async function getFanPositions(fan: `0x${string}`): Promise<FanPosition[]> {
  const verifiedRounds = await db.select().from(rounds).where(eq(rounds.verified, true));

  const positions = await Promise.all(
    verifiedRounds.map(async (round): Promise<FanPosition | null> => {
      const address = round.contractAddress as `0x${string}`;
      const shares = await readSafely(() => shareBalance(address, fan), 0n);
      if (shares === 0n) return null;

      const [supply, claimable, raised, [club]] = await Promise.all([
        readSafely(() => totalShares(address), 0n),
        readSafely(() => pendingReward(address, fan), 0n),
        readSafely(() => totalRaised(address), 0n),
        db.select().from(clubs).where(eq(clubs.id, round.clubId)),
      ]);

      return {
        roundId: round.id,
        contractAddress: address,
        clubName: club?.name ?? "Unknown club",
        clubSlug: club?.slug ?? "",
        shares,
        totalShares: supply,
        investedUsdt: investedFromShares(shares, BigInt(round.sharePrice)),
        claimable,
        raised,
        goal: BigInt(round.goal),
        status: round.status,
      };
    }),
  );

  return positions.filter((p): p is FanPosition => p !== null);
}
