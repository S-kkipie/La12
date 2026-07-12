// WDK Price Rates (spec §5 tier 4) — fiat value of a USD₮ position on
// /wallet. USD₮ tracks USD closely enough that a 1:1 stub is a reasonable
// placeholder for the demo.
//
// TODO(wire): call the real WDK Price Rates tool once its endpoint is known,
// and support currencies other than USD.

const USDT_DECIMALS = 6;

export async function usdtToFiat(amountBaseUnits: bigint, currency = "USD"): Promise<number> {
  void currency; // TODO(wire): only USD is supported by this stub.
  return Number(amountBaseUnits) / 10 ** USDT_DECIMALS;
}
