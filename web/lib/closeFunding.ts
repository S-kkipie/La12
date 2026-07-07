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
