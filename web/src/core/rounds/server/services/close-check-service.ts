import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { findRoundById } from "../repository/find-round-by-id";
import { tryCloseFundingIfDue } from "./try-close-funding";
import type { RoundStatus } from "@/core/rounds/domain/types";
import type { Round } from "@/db/schema";

type CloseCheckDeps = {
  id: number;
  findRoundById: (id: number) => Promise<Round | undefined>;
  tryClose: (round: Round) => Promise<RoundStatus>;
};

/** Public + permissionless — findById (404) -> tryClose -> the corrected status. */
export async function closeCheck(deps: CloseCheckDeps): AsyncAppResult<{ status: RoundStatus }> {
  try {
    const round = await deps.findRoundById(deps.id);
    if (!round) return err(AppErrors.notFound());
    const status = await deps.tryClose(round);
    return ok({ status });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function closeCheckService(id: number): AsyncAppResult<{ status: RoundStatus }> {
  return closeCheck({ id, findRoundById, tryClose: tryCloseFundingIfDue });
}
