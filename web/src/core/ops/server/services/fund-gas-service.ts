import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { fundGas as sendGasSponsored, type FundGasResult } from "@/lib/sponsor";
import { checkGasRateLimit } from "../rate-limit";
import type { FaucetResult } from "@/core/ops/domain/types";

/** Deps injected so the wrapper is testable without a real relayer/RPC or the
 *  module-level throttle Map. */
type FundGasDeps = {
  address: `0x${string}`;
  isRateLimited: (address: string) => boolean;
  sendGas: (address: `0x${string}`) => Promise<FundGasResult>;
};

/** Best-effort Sepolia ETH sponsor (server's own relayer key, SPONSOR_PK —
 *  never the fan's, per self-custody). Throttled per-address (429 on a repeat
 *  within the hour — the relayer-drain guard) BEFORE any work. A "skipped"
 *  result (no SPONSOR_PK configured) is a valid 200 outcome, not an error —
 *  the caller (ensure-wallet's best-effort gas top-up) already tolerates it
 *  with a soft toast. Only a catastrophic throw surfaces as err(unexpected). */
export async function fundGas(deps: FundGasDeps): AsyncAppResult<FaucetResult> {
  if (deps.isRateLimited(deps.address)) return err(AppErrors.tooManyRequests());
  try {
    return ok(await deps.sendGas(deps.address));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. Imports `fundGas` from `@/lib/sponsor`
 *  IN PLACE — this lib is NOT relocated (decoupling constraint 2: the P4
 *  branch, on `main`, also imports it from this same path). */
export function fundGasService(address: `0x${string}`): AsyncAppResult<FaucetResult> {
  return fundGas({ address, isRateLimited: checkGasRateLimit, sendGas: sendGasSponsored });
}
