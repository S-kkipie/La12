import assert from "node:assert";
import { buildOnRampSession } from "./moonpay";

const ADDR = "0x1234567890abcdef1234567890abcdefdeadbeef" as const;

(async () => {
  // Without a secret: unsigned fallback, no signature param.
  delete process.env.MOONPAY_SECRET_KEY;
  delete process.env.MOONPAY_API_KEY;
  delete process.env.MOONPAY_PUBLISHABLE_KEY;
  const unsigned = await buildOnRampSession(ADDR, 50);
  assert.ok(unsigned.widgetUrl.includes("walletAddress=" + ADDR));
  assert.ok(!unsigned.widgetUrl.includes("signature="));

  // With a secret: apiKey present and a signature appended.
  process.env.MOONPAY_PUBLISHABLE_KEY = "pk_test_123";
  process.env.MOONPAY_SECRET_KEY = "sk_test_456";
  const signed = await buildOnRampSession(ADDR, 50);
  assert.ok(signed.widgetUrl.includes("apiKey=pk_test_123"));
  assert.ok(signed.widgetUrl.includes("signature="));
  delete process.env.MOONPAY_SECRET_KEY;
  delete process.env.MOONPAY_PUBLISHABLE_KEY;

  console.log("moonpay signing OK");
})();
