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

/** Wire shape of a USD₮ transfer history entry. `hash` is a 32-byte tx hash (not
 *  an address). `token`/`counterparty` are `z.string()` (not addressSchema): they
 *  come from an external indexer whose payloads are deliberately tolerated, so
 *  response validation must not turn a good (graceful-empty) read into a 500 if a
 *  field isn't strict 20-byte hex. The domain HistoryEntry type still carries
 *  `0x${string}` (see types.ts). */
export const historyEntrySchema = z.object({
  hash: z.string(),
  kind: z.enum(["in", "out"]),
  token: z.string(),
  amount: z.string(),
  counterparty: z.string(),
  blockNumber: z.string(),
  timestamp: z.number().int(),
});
