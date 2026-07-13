import { test } from "node:test";
import assert from "node:assert";
import {
  computeFundedPct,
  toClubWithRoundDTO,
  parseClubWithRoundDTO,
  type ClubWithRound,
} from "../types";

test("computeFundedPct: raised/goal * 100, capped at 100, 0 when goal is 0", () => {
  assert.strictEqual(computeFundedPct(25_000000n, 100_000000n), 25);
  assert.strictEqual(computeFundedPct(999_000000n, 100_000000n), 100); // capped
  assert.strictEqual(computeFundedPct(1n, 0n), 0);
});

test("toClubWithRoundDTO -> parseClubWithRoundDTO round-trips bigints + dates", () => {
  const cw: ClubWithRound = {
    club: {
      id: 1,
      userId: null,
      name: "Deportivo Demo",
      slug: "deportivo-demo",
      logoUrl: null,
      description: null,
      walletAddress: "0xClub0000000000000000000000000000000000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    round: {
      id: 1,
      clubId: 1,
      contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: "500000000",
      sharePrice: "1000000",
      revenueBps: 800,
      capMultiple: 15000,
      deadline: new Date("2027-06-01T00:00:00.000Z"),
      status: "funding",
      verified: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    raised: 123456789012345678n, // beyond 2^53 — proves no float rounding
    pct: 24,
  };

  const dto = toClubWithRoundDTO(cw);
  assert.strictEqual(dto.raised, "123456789012345678");
  assert.strictEqual(dto.round.deadline, "2027-06-01T00:00:00.000Z");
  assert.strictEqual(dto.club.createdAt, "2026-01-01T00:00:00.000Z");

  const back = parseClubWithRoundDTO(dto);
  assert.strictEqual(back.raised, 123456789012345678n);
  assert.strictEqual(back.round.deadline.getTime(), cw.round.deadline.getTime());
  assert.strictEqual(back.club.createdAt.getTime(), cw.club.createdAt.getTime());
  assert.strictEqual(back.round.status, "funding");
  assert.strictEqual(back.club.slug, "deportivo-demo");
});
