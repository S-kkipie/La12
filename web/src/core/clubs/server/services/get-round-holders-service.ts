import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { findOwnedRound } from "../repository/find-owned-round";
import { getRoundHolders } from "./chain-reads";
import type { Holder } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

type HoldersDeps = {
  clubId: number;
  contractAddress: string;
  findOwnedRound: (clubId: number, contractAddress: string) => Promise<Round | undefined>;
  getRoundHolders: (address: `0x${string}`) => Promise<Holder[]>;
};

/** Ownership gate (err(forbidden) BEFORE the graceful-empty read) then the
 *  cap-table. A dead RPC after ownership passes still degrades to ok([]) —
 *  this service never emits 500, matching overview/distributions. */
export async function getRoundHoldersForClub(deps: HoldersDeps): AsyncAppResult<Holder[]> {
  const owned = await deps.findOwnedRound(deps.clubId, deps.contractAddress);
  if (!owned) return err(AppErrors.forbidden());
  try {
    return ok(await deps.getRoundHolders(deps.contractAddress as `0x${string}`));
  } catch (err) {
    // Graceful-empty (never 500) — but DON'T swallow silently: a dead RPC or one
    // that rejects eth_getLogs (e.g. publicnode's archive gating) would otherwise
    // return an empty cap-table indistinguishable from a round with no backers.
    console.error(`[holders] getRoundHolders failed for ${deps.contractAddress}:`, err);
    return ok([]);
  }
}

export function getRoundHoldersService(clubId: number, contractAddress: string): AsyncAppResult<Holder[]> {
  return getRoundHoldersForClub({ clubId, contractAddress, findOwnedRound, getRoundHolders });
}
