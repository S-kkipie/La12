import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Replaces the old ADDRESS_RE regex. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Wire shape of a fan position — bigints serialized to strings (JSON has no bigint). */
export const fanPositionSchema = z.object({
  roundId: z.number().int(),
  contractAddress: addressSchema,
  clubName: z.string(),
  clubSlug: z.string(),
  shares: z.string(),
  totalShares: z.string(),
  investedUsdt: z.string(),
  claimable: z.string(),
  raised: z.string(),
  goal: z.string(),
  status: roundStatusSchema,
});

/** Wire shape of a USD₮ transfer history entry. `hash` is a 32-byte tx hash (not an address). */
export const historyEntrySchema = z.object({
  hash: z.string(),
  kind: z.enum(["in", "out"]),
  token: addressSchema,
  amount: z.string(),
  counterparty: addressSchema,
  blockNumber: z.string(),
  timestamp: z.number().int(),
});
