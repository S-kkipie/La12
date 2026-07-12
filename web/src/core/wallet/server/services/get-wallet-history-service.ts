import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { getHistory } from "@/lib/indexer";
import type { HistoryEntry } from "@/core/wallet/domain/types";

type HistoryDeps = {
  address: `0x${string}`;
  fetchHistory: (address: `0x${string}`) => Promise<HistoryEntry[]>;
};

/** USD₮ transfer history for an address. getHistory already degrades (indexer→RPC
 *  fallback, empty on error), so this returns ok([]) rather than 4xx for no data. */
export async function getWalletHistory(deps: HistoryDeps): AsyncAppResult<HistoryEntry[]> {
  try {
    return ok(await deps.fetchHistory(deps.address));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function getWalletHistoryService(address: `0x${string}`): AsyncAppResult<HistoryEntry[]> {
  return getWalletHistory({ address, fetchHistory: getHistory });
}
