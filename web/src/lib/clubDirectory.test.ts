import assert from "node:assert";
import { computeFundedPct } from "./clubDirectory";

// Mirrors RoundProgress.tsx's own pct calc: floor(raised*100/goal), capped at 100.
assert.equal(computeFundedPct(20_000000n, 40_000000n), 50);
assert.equal(computeFundedPct(40_000000n, 40_000000n), 100);
assert.equal(computeFundedPct(50_000000n, 40_000000n), 100); // over-funded, still capped at 100
assert.equal(computeFundedPct(0n, 0n), 0); // no goal -> 0, never divide by zero

console.log("clubDirectory helpers OK");
