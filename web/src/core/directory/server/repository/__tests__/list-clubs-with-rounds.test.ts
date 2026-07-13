import { test } from "node:test";
import assert from "node:assert";
import { listClubsWithRoundsRows } from "../list-clubs-with-rounds";

test("listClubsWithRoundsRows: returns clubs joined to their verified round", async () => {
  const rows = await listClubsWithRoundsRows();
  assert.ok(Array.isArray(rows));
  for (const r of rows) {
    assert.strictEqual(typeof r.club.id, "number");
    assert.strictEqual(typeof r.round.id, "number");
    assert.strictEqual(r.round.clubId, r.club.id);
    assert.strictEqual(r.round.verified, true); // join predicate guarantees this
  }
  assert.ok(rows.some((r) => r.club.slug === "deportivo-san-martin"));
});
