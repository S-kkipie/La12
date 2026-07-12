import { test } from "node:test";
import assert from "node:assert";
import { slugify } from "../types";

test("slugify: lowercases, dashes, strips accents", () => {
  assert.strictEqual(slugify("Club Atlético"), "club-atletico");
  assert.strictEqual(slugify("Deportivo San Martín"), "deportivo-san-martin");
});

test("slugify: collapses non-alphanumerics and trims edge dashes", () => {
  assert.strictEqual(slugify("  FC 123!! "), "fc-123");
  assert.strictEqual(slugify("--Boca--"), "boca");
});

test("slugify: empty / punctuation-only falls back to 'club'", () => {
  assert.strictEqual(slugify(""), "club");
  assert.strictEqual(slugify("!!!"), "club");
});
