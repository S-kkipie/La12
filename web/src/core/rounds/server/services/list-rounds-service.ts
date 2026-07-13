import "server-only";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { listRounds, type ListRoundsFilter } from "../repository/list-rounds";
import type { Round } from "@/db/schema";

type ListRoundsDeps = { filter: ListRoundsFilter; listRounds: (filter: ListRoundsFilter) => Promise<Round[]> };

/** Public catalog list — no auth, graceful-empty (a DB failure here degrades
 *  like any other public read rather than erroring the whole page). */
export async function listRoundsForQuery(deps: ListRoundsDeps): AsyncAppResult<Round[]> {
  try {
    return ok(await deps.listRounds(deps.filter));
  } catch {
    return ok([]);
  }
}

export function listRoundsService(filter: ListRoundsFilter): AsyncAppResult<Round[]> {
  return listRoundsForQuery({ filter, listRounds });
}
