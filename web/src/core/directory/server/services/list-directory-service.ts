import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { totalRaised, readSafely } from "@/lib/contracts";
import { listClubsWithRoundsRows, type ClubRoundRow } from "../repository/list-clubs-with-rounds";
import { computeFundedPct, type ClubWithRound } from "@/core/directory/domain/types";

/** Deps injected so the enrich+sort orchestration is testable without a DB
 *  or a chain. */
type ListDirectoryDeps = {
  listRows: () => Promise<ClubRoundRow[]>;
  readTotalRaised: (addr: `0x${string}`) => Promise<bigint>;
};

/** Every verified-round club, enriched with on-chain `raised`, most-funded
 *  first. A round whose contract can't be read degrades to `raised = 0n`
 *  (readSafely, in the real-deps wrapper) rather than failing the whole
 *  list. A catastrophic failure (e.g. DB down) surfaces as err(unexpected). */
export async function listDirectory(deps: ListDirectoryDeps): AsyncAppResult<ClubWithRound[]> {
  try {
    const rows = await deps.listRows();
    const withRaised = await Promise.all(
      rows.map(async ({ club, round }) => {
        const raised = await deps.readTotalRaised(round.contractAddress as `0x${string}`);
        return { club, round, raised, pct: computeFundedPct(raised, BigInt(round.goal)) };
      }),
    );
    return ok(withRaised.sort((a, b) => b.pct - a.pct));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function listDirectoryService(): AsyncAppResult<ClubWithRound[]> {
  return listDirectory({
    listRows: listClubsWithRoundsRows,
    readTotalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
  });
}
