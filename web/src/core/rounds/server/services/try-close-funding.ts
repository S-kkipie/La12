import "server-only";
import { totalRaised, roundState } from "@/lib/contracts";
import { closeFundingSponsored } from "@/lib/sponsor";
import { updateRoundStatus } from "../repository/update-round-status";
import { isFundingDue, mapOnChainStateToDb, type RoundStatus } from "@/core/rounds/domain/types";
import type { Round } from "@/db/schema";

/**
 * If `round` is still `funding` and due to close (goal reached or deadline
 * passed), sends the sponsor-paid `closeFunding()` call. Either way, finishes
 * by reading the contract's real `state()` and correcting `rounds.status` in
 * the DB if it's stale — the DB is never trusted, only ever corrected from
 * on-chain reads. Moved verbatim from lib/closeFunding.ts; still imports the
 * ops-domain (P6) sponsor relayer — unchanged, out of scope here.
 */
export async function tryCloseFundingIfDue(round: Round): Promise<RoundStatus> {
  if (round.status !== "funding") return round.status;

  const address = round.contractAddress as `0x${string}`;

  try {
    const raised = await totalRaised(address);
    if (isFundingDue(raised, BigInt(round.goal), round.deadline, new Date())) {
      await closeFundingSponsored(address);
    }
  } catch {
    // RPC read failed — fall through to the state() read below, which will
    // also fail and return the existing status unchanged.
  }

  let onChainStatus: RoundStatus;
  try {
    onChainStatus = mapOnChainStateToDb(await roundState(address));
  } catch {
    return round.status;
  }

  if (onChainStatus !== round.status) {
    try {
      await updateRoundStatus(round.id, onChainStatus);
    } catch {
      // DB write failed — stale status persists but caller still gets the correct
      // on-chain truth; the DB will be corrected on the next successful check.
    }
  }
  return onChainStatus;
}
