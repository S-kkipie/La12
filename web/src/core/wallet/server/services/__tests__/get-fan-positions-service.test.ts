import { test } from "node:test";
import assert from "node:assert";
import { getFanPositions } from "../get-fan-positions-service";
import type { VerifiedRoundRow } from "../../repository/find-verified-rounds";

const FAN = "0x1111111111111111111111111111111111111111" as const;
const round: VerifiedRoundRow = {
  roundId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sharePrice: "1000000", goal: "500000000", status: "funding",
  clubName: "Demo", clubSlug: "demo",
};

test("maps a held round to a FanPosition (invested = shares*price/1e6), drops zero-share rounds", async () => {
  const zeroRound: VerifiedRoundRow = { ...round, roundId: 2, contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
  const result = await getFanPositions({
    fan: FAN,
    findRounds: async () => [round, zeroRound],
    reads: {
      shareBalance: async (addr) => (addr === round.contractAddress ? 10_000000n : 0n),
      totalShares: async () => 40_000000n,
      pendingReward: async () => 0n,
      totalRaised: async () => 250_000000n,
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 1); // zero-share round dropped
  assert.strictEqual(result.data[0].investedUsdt, 10_000000n); // 10 shares @ 1 USDT
  assert.strictEqual(result.data[0].goal, 500_000000n);
});

test("returns err(unexpected) when the repository throws", async () => {
  const result = await getFanPositions({
    fan: FAN,
    findRounds: async () => { throw new Error("db down"); },
    reads: { shareBalance: async () => 0n, totalShares: async () => 0n, pendingReward: async () => 0n, totalRaised: async () => 0n },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
  assert.strictEqual(result.error.code, "INTERNAL_SERVER_ERROR");
});
