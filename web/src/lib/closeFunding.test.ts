import assert from "node:assert";
import { isFundingDue, mapOnChainStateToDb } from "./closeFunding";

// isFundingDue — goal reached
assert.equal(isFundingDue(40_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
assert.equal(isFundingDue(41_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
assert.equal(isFundingDue(39_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);

// isFundingDue — deadline passed, goal not reached
assert.equal(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-07-01"), new Date("2026-07-06")), true);

// isFundingDue — neither condition met
assert.equal(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);

// mapOnChainStateToDb
assert.equal(mapOnChainStateToDb("Funding"), "funding");
assert.equal(mapOnChainStateToDb("Active"), "active");
assert.equal(mapOnChainStateToDb("Closed"), "closed");

console.log("closeFunding helpers OK");
