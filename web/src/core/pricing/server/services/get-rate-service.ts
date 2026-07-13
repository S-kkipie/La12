import "server-only";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import type { Rate, SupportedCurrency } from "@/core/pricing/domain/types";
import { getUsdtRate } from "../rates";

/** Deps injected so the mapping is testable without the real WDK client. */
type GetRateDeps = {
  getUsdtRate: (c: SupportedCurrency) => Promise<{ rate: number; source: "live" | "fallback" }>;
};

/** Maps a WDK USD₮ rate into an ok(Rate). This service NEVER emits a 5xx:
 *  `getUsdtRate` already swallows every upstream failure to a 1.0 fallback, so
 *  the worst case is ok({ source: "fallback", rate: 1 }) — there is no error
 *  surface to catch here. The only real error (an unsupported currency) is
 *  rejected by zod at the route (422) before this runs. */
export function getRate(deps: GetRateDeps) {
  return async (currency: SupportedCurrency): AsyncAppResult<Rate> => {
    const { rate, source } = await deps.getUsdtRate(currency);
    return ok({ currency, rate, source });
  };
}

/** Real-deps wrapper the route calls (Task 4 imports this). */
export function getRateService(currency: SupportedCurrency): AsyncAppResult<Rate> {
  return getRate({ getUsdtRate })(currency);
}
