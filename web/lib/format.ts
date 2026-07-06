// Small display helpers shared by pages/components. USD₮ + the share token
// both use 6 decimals (spec §4).
const USDT_DECIMALS = 6;

export function formatUsdt(baseUnits: bigint | number | string): string {
  const value = typeof baseUnits === "bigint" ? baseUnits : BigInt(Math.trunc(Number(baseUnits)));
  const whole = value / 10n ** BigInt(USDT_DECIMALS);
  const fraction = value % 10n ** BigInt(USDT_DECIMALS);
  const fractionStr = fraction.toString().padStart(USDT_DECIMALS, "0").slice(0, 2);
  return `${whole.toLocaleString("en-US")}.${fractionStr}`;
}

export function parseUsdt(amount: string): bigint {
  const [whole, fraction = ""] = amount.trim().split(".");
  const paddedFraction = fraction.padEnd(USDT_DECIMALS, "0").slice(0, USDT_DECIMALS);
  return BigInt(whole || "0") * 10n ** BigInt(USDT_DECIMALS) + BigInt(paddedFraction || "0");
}

export function formatFiat(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function formatCapMultiple(bps: number): string {
  return `${(bps / 10_000).toFixed(2)}x`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
