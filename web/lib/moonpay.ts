// WDK fiat on-ramp (spec §5 tier 3) — "Fondear con MoonPay" on /wallet: card
// in, USD₮ out, straight to the fan's self-custody address.
//
// TODO(wire): swap for `@tetherto/wdk-protocol-fiat-moonpay` once we have
// MOONPAY_API_KEY / MOONPAY_SECRET_KEY test credentials (spec §9). MoonPay
// widget URLs must be signed server-side with the secret key — never expose
// it to the client — so this stays a server-only module even once wired.

export type OnRampSession = {
  sessionId: string;
  widgetUrl: string;
};

export async function buildOnRampSession(
  address: `0x${string}`,
  amountUsd: number,
): Promise<OnRampSession> {
  const apiKey = process.env.MOONPAY_API_KEY;
  if (!apiKey) {
    return {
      sessionId: "stub",
      widgetUrl: `https://buy.moonpay.com/?currencyCode=usdt&walletAddress=${address}&baseCurrencyAmount=${amountUsd}`,
    };
  }
  // TODO(wire): call MoonPay's session API + sign the URL with MOONPAY_SECRET_KEY.
  return {
    sessionId: "stub",
    widgetUrl: `https://buy.moonpay.com/?apiKey=${apiKey}&currencyCode=usdt&walletAddress=${address}&baseCurrencyAmount=${amountUsd}`,
  };
}
