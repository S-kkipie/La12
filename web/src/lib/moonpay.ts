// WDK fiat on-ramp (spec §5 tier 3) — "Add funds → MoonPay" on the fan wallet:
// card in, USD₮ out, straight to the fan's self-custody address. Builds a
// MoonPay widget URL, signed server-side with MOONPAY_SECRET_KEY when present
// (the signature is required for a production widget). SERVER-ONLY: never
// expose the secret key to the client — this module is imported from
// /api/moonpay, never a client component.
import { createHmac } from "node:crypto";

export type OnRampSession = {
  sessionId: string;
  widgetUrl: string;
};

export async function buildOnRampSession(
  address: `0x${string}`,
  amountUsd: number,
): Promise<OnRampSession> {
  const apiKey = process.env.MOONPAY_PUBLISHABLE_KEY ?? process.env.MOONPAY_API_KEY;
  const secret = process.env.MOONPAY_SECRET_KEY;

  const params = new URLSearchParams({
    currencyCode: "usdt",
    walletAddress: address,
    baseCurrencyAmount: String(amountUsd),
  });
  if (apiKey) params.set("apiKey", apiKey);

  const query = `?${params.toString()}`;
  let widgetUrl = `https://buy.moonpay.com/${query}`;

  if (secret && apiKey) {
    const signature = createHmac("sha256", secret).update(query).digest("base64");
    widgetUrl += `&signature=${encodeURIComponent(signature)}`;
  }

  return { sessionId: "wdk-onramp", widgetUrl };
}
