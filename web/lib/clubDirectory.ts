/**
 * Same integer math RoundProgress.tsx already uses for its progress bar
 * (`Math.min(100, Number((raised * 100n) / goal))`) — duplicated here
 * rather than importing a client component's internals into this
 * server-only data helper.
 */
export function computeFundedPct(raised: bigint, goal: bigint): number {
  return goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
}
