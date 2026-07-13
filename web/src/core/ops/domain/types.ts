import type { z } from "zod";
import type {
  addressBodySchema,
  moonpayBodySchema,
  syncBodySchema,
  faucetResultSchema,
  mintUsdtResultSchema,
  moonpaySessionSchema,
  syncResultSchema,
} from "./schemas";

export type AddressBody = z.infer<typeof addressBodySchema>;
export type MoonpayBody = z.infer<typeof moonpayBodySchema>;
export type SyncBody = z.infer<typeof syncBodySchema>;
export type FaucetResult = z.infer<typeof faucetResultSchema>;
export type MintUsdtResult = z.infer<typeof mintUsdtResultSchema>;
export type MoonpaySession = z.infer<typeof moonpaySessionSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;

/** Maps a decoded RevenueShareRound event name to the `events` cache's
 *  `kind` enum. Moved verbatim out of the legacy app/api/sync/route.ts. */
export const EVENT_KIND: Record<string, "invest" | "distribute" | "claim" | "close"> = {
  Invested: "invest",
  Distributed: "distribute",
  Claimed: "claim",
  FundingClosed: "close",
};

/** Picks the USD₮ amount field off whichever event fired (see the
 *  RevenueShareRound ABI — different events name the field differently).
 *  Moved verbatim out of the legacy sync route. */
export function amountFromArgs(args: Record<string, unknown>): bigint {
  return (
    (args.usdtAmount as bigint | undefined) ??
    (args.revenueReceived as bigint | undefined) ??
    (args.totalRaisedUsdt as bigint | undefined) ??
    0n
  );
}
