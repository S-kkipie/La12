import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { buildOnRampSession as buildOnRampEngine, type OnRampSession } from "@/lib/moonpay";
import type { MoonpaySession } from "@/core/ops/domain/types";

type BuildOnRampDeps = {
  address: `0x${string}`;
  amountUsd: number;
  buildSession: (address: `0x${string}`, amountUsd: number) => Promise<OnRampSession>;
};

/** WDK fiat on-ramp (spec §5 tier 3) — builds a MoonPay widget URL, signed
 *  server-side when MOONPAY_SECRET_KEY is present. */
export async function buildOnRamp(deps: BuildOnRampDeps): AsyncAppResult<MoonpaySession> {
  try {
    return ok(await deps.buildSession(deps.address, deps.amountUsd));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper. Imports `@/lib/moonpay` in place. */
export function moonpayService(address: `0x${string}`, amountUsd: number): AsyncAppResult<MoonpaySession> {
  return buildOnRamp({ address, amountUsd, buildSession: buildOnRampEngine });
}
