// Maps a thrown error (viem walletClient/publicClient calls, or a plain WDK
// Error) to a short, English, user-facing message. Never surfaces the raw
// hex/ABI dump viem errors otherwise print — those are great for our logs,
// terrible for a fan staring at a toast.
import { BaseError } from "viem";

/** Known on-chain revert reasons for RevenueShareRound (see contracts/src). */
const KNOWN_REVERTS: Array<[needle: string, message: string]> = [
  ["insufficientallowance", "USD₮ approval needed (retry, it'll approve first this time)"],
  ["insufficientbalance", "Not enough USD₮ — use 'Get test USD₮'"],
  ["exceeds balance", "Not enough USD₮ — use 'Get test USD₮'"],
  ["user rejected", "You cancelled the transaction"],
  [" 4001", "You cancelled the transaction"],
  ["insufficient funds", "No ETH for gas — tap 'Get gas ETH' in your wallet"],
  ["not funding", "The round has already closed funding"],
  ["not active", "The round isn't active yet"],
  ["nothing to claim", "You have no pending reward to claim"],
  ["goal/deadline not met", "The round didn't reach its goal or its deadline"],
];

export function friendlyError(err: unknown): string {
  if (err instanceof BaseError) {
    const root = err.walk() as { message?: string; shortMessage?: string } | null;
    const haystack = [err.shortMessage, err.details, root?.message]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const [needle, message] of KNOWN_REVERTS) {
      if (haystack.includes(needle)) return message;
    }

    return err.shortMessage || "Transaction error";
  }

  if (err instanceof Error) {
    const lower = err.message.toLowerCase();
    for (const [needle, message] of KNOWN_REVERTS) {
      if (lower.includes(needle)) return message;
    }
    return err.message;
  }

  return "Transaction error";
}
