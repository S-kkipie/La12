import type { z } from "zod";
import type { Round } from "@/db/schema";
import type { roundRowSchema } from "./schemas";

export type RoundStatus = "funding" | "active" | "closed";
export type RoundRowDTO = z.infer<typeof roundRowSchema>;

/** Serialize a rounds row to the wire DTO — goal/sharePrice are already
 *  strings on the drizzle row; only the two timestamptz columns convert. */
export function toRoundRowDTO(r: Round): RoundRowDTO {
  return { ...r, deadline: r.deadline.toISOString(), createdAt: r.createdAt.toISOString() };
}

/**
 * Mirrors the contract's own due-condition (`totalRaised >= goal ||
 * block.timestamp >= deadline`) so a close is only attempted when it should
 * actually succeed on-chain.
 */
export function isFundingDue(totalRaised: bigint, goal: bigint, deadline: Date, now: Date): boolean {
  return totalRaised >= goal || now.getTime() >= deadline.getTime();
}

/** RevenueShareRound.State enum labels (see lib/contracts.ts ROUND_STATE) to the DB's lowercase enum. */
export function mapOnChainStateToDb(state: "Funding" | "Active" | "Closed"): RoundStatus {
  return state.toLowerCase() as RoundStatus;
}
