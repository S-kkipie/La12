import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { mintTestUsdt as mintUsdtEngine, type FaucetUsdtResult } from "@/lib/faucetUsdt";
import { checkUsdtRateLimit } from "../rate-limit";
import type { MintUsdtResult } from "@/core/ops/domain/types";

type MintUsdtDeps = {
  address: `0x${string}`;
  isRateLimited: (address: string) => boolean;
  mint: (address: `0x${string}`) => Promise<FaucetUsdtResult>;
};

/** Mints test USD₮ via the MockUSDT faucet (`@/lib/faucetUsdt`, same
 *  server-only relayer key as the gas sponsor). Throttled per-address (429 on
 *  a repeat within the hour) BEFORE any work — same drain guard as the gas
 *  faucet. Converts the engine's bigint `amount` to a wire-safe string —
 *  money on the wire is always a string, never `Number()`'d. A "skipped"
 *  result (no SPONSOR_PK / NEXT_PUBLIC_USDT_ADDRESS configured) passes through
 *  unchanged as a valid 200, not an error. */
export async function mintUsdt(deps: MintUsdtDeps): AsyncAppResult<MintUsdtResult> {
  if (deps.isRateLimited(deps.address)) return err(AppErrors.tooManyRequests());
  try {
    const result = await deps.mint(deps.address);
    return ok("skipped" in result ? result : { hash: result.hash, amount: result.amount.toString() });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function mintUsdtService(address: `0x${string}`): AsyncAppResult<MintUsdtResult> {
  return mintUsdt({ address, isRateLimited: checkUsdtRateLimit, mint: mintUsdtEngine });
}
