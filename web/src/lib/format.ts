// Small display helpers shared by pages/components. USD₮ + the share token
// both use 6 decimals (spec §4).
import { activeChain } from "./chain";

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

export function shortenAddress(addr: string, chars = 4): string {
  if (!addr || addr.length <= 2 + chars * 2) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatRelativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function explorerTxUrl(hash: string): string {
  const base = activeChain.blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : "#";
}
