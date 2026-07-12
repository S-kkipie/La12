// Client-safe mirror of percentOfRound (lib/positions.ts). PositionsList is a
// "use client" component; importing lib/positions.ts directly would drag its
// server-only DB import (better-sqlite3) into the browser bundle, so this
// tiny pure-math helper is duplicated here instead.
export function percentOfRoundView(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}
