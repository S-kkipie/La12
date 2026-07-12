import { test } from "node:test";
import assert from "node:assert";
import { linkWallet } from "../link-wallet-service";

const ADDR = "0x1111111111111111111111111111111111111111";

test("linkWallet: club role calls upsertClub and returns a club DTO", async () => {
  let clubCalls = 0;
  let profileCalls = 0;
  const res = await linkWallet({
    user: { id: "u1", role: "club", name: "Boca" },
    walletAddress: ADDR,
    upsertClub: async () => { clubCalls++; return { id: 7 }; },
    upsertProfile: async () => { profileCalls++; return { id: 99 }; },
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { role: "club", walletAddress: ADDR, linkedId: 7 });
  assert.strictEqual(clubCalls, 1);
  assert.strictEqual(profileCalls, 0);
});

test("linkWallet: fan role calls upsertProfile and returns a fan DTO", async () => {
  const res = await linkWallet({
    user: { id: "u2", role: "fan", name: "Fan" },
    walletAddress: ADDR,
    upsertClub: async () => { throw new Error("should not be called"); },
    upsertProfile: async () => ({ id: 42 }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { role: "fan", walletAddress: ADDR, linkedId: 42 });
});

test("linkWallet: a throwing upsert yields err(unexpected) → 500", async () => {
  const res = await linkWallet({
    user: { id: "u3", role: "club", name: "X" },
    walletAddress: ADDR,
    upsertClub: async () => { throw new Error("db down"); },
    upsertProfile: async () => ({ id: 1 }),
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});
