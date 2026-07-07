/**
 * Mirrors the contract's own due-condition (`totalRaised >= goal ||
 * block.timestamp >= deadline`) so a close is only attempted when it should
 * actually succeed on-chain.
 */
export function isFundingDue(totalRaised: bigint, goal: bigint, deadline: Date, now: Date): boolean {
  return totalRaised >= goal || now.getTime() >= deadline.getTime();
}

/** RevenueShareRound.State enum labels (see lib/contracts.ts ROUND_STATE) to the DB's lowercase enum. */
export function mapOnChainStateToDb(state: "Funding" | "Active" | "Closed"): "funding" | "active" | "closed" {
  return state.toLowerCase() as "funding" | "active" | "closed";
}

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";
import { totalRaised, roundState } from "./contracts";
import { closeFundingSponsored } from "./sponsor";

/**
 * If `round` is still `funding` and due to close (goal reached or deadline
 * passed), sends the sponsor-paid `closeFunding()` call. Either way, finishes
 * by reading the contract's real `state()` and correcting `rounds.status` in
 * the DB if it's stale — the DB is never trusted, only ever corrected from
 * on-chain reads.
 */
export async function tryCloseFundingIfDue(round: Round): Promise<"funding" | "active" | "closed"> {
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

  let onChainStatus: "funding" | "active" | "closed";
  try {
    onChainStatus = mapOnChainStateToDb(await roundState(address));
  } catch {
    return round.status;
  }

  if (onChainStatus !== round.status) {
    try {
      await db.update(rounds).set({ status: onChainStatus }).where(eq(rounds.id, round.id));
    } catch {
      // DB write failed — stale status persists but caller still gets the correct
      // on-chain truth; the DB will be corrected on the next successful check.
    }
  }
  return onChainStatus;
}
