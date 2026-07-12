import { test } from "node:test";
import assert from "node:assert";
import { findVerifiedRounds } from "../find-verified-rounds";

// Read-only against local Postgres (seeded demo club deportivo-san-martin + its
// verified round). Non-destructive: no writes, no truncate.
test("findVerifiedRounds returns verified rounds joined to their club", async () => {
  const rows = await findVerifiedRounds();
  assert.ok(Array.isArray(rows));
  // Every returned row carries club display fields + a contract address.
  for (const r of rows) {
    assert.strictEqual(typeof r.roundId, "number");
    assert.match(r.contractAddress, /^0x[a-fA-F0-9]{40}$/);
    assert.strictEqual(typeof r.clubName, "string");
    assert.strictEqual(typeof r.clubSlug, "string");
    assert.ok(["funding", "active", "closed"].includes(r.status));
  }
  // The seeded demo round is verified and joined to deportivo-san-martin.
  assert.ok(rows.some((r) => r.clubSlug === "deportivo-san-martin"));
});
