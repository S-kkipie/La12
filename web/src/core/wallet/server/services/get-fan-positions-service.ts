import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { shareBalance, totalShares, pendingReward, totalRaised, readSafely } from "@/lib/contracts";
import { findVerifiedRounds, type VerifiedRoundRow } from "../repository/find-verified-rounds";
import { investedFromShares, type FanPosition } from "@/core/wallet/domain/types";

/** Deps injected so the orchestration is testable without a DB or a chain. */
type FanPositionsDeps = {
  fan: `0x${string}`;
  findRounds: () => Promise<VerifiedRoundRow[]>;
  reads: {
    shareBalance: (addr: `0x${string}`, fan: `0x${string}`) => Promise<bigint>;
    totalShares: (addr: `0x${string}`) => Promise<bigint>;
    pendingReward: (addr: `0x${string}`, fan: `0x${string}`) => Promise<bigint>;
    totalRaised: (addr: `0x${string}`) => Promise<bigint>;
  };
};

/** Verified rounds where `fan` holds > 0 shares, enriched with on-chain reads.
 *  Reads are individually fault-tolerant (readSafely in the wrapper); a
 *  catastrophic failure (e.g. DB down) surfaces as err(unexpected)→500. */
export async function getFanPositions(deps: FanPositionsDeps): AsyncAppResult<FanPosition[]> {
  try {
    const rounds = await deps.findRounds();
    const positions = await Promise.all(
      rounds.map(async (round): Promise<FanPosition | null> => {
        const shares = await deps.reads.shareBalance(round.contractAddress, deps.fan);
        if (shares === 0n) return null;
        const [supply, claimable, raised] = await Promise.all([
          deps.reads.totalShares(round.contractAddress),
          deps.reads.pendingReward(round.contractAddress, deps.fan),
          deps.reads.totalRaised(round.contractAddress),
        ]);
        return {
          roundId: round.roundId,
          contractAddress: round.contractAddress,
          clubName: round.clubName,
          clubSlug: round.clubSlug,
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
    return ok(positions.filter((p): p is FanPosition => p !== null));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. Chain reads are readSafely-wrapped (0n fallback). */
export function getFanPositionsService(fan: `0x${string}`): AsyncAppResult<FanPosition[]> {
  return getFanPositions({
    fan,
    findRounds: findVerifiedRounds,
    reads: {
      shareBalance: (addr, f) => readSafely(() => shareBalance(addr, f), 0n),
      totalShares: (addr) => readSafely(() => totalShares(addr), 0n),
      pendingReward: (addr, f) => readSafely(() => pendingReward(addr, f), 0n),
      totalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
    },
  });
}
