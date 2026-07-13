import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet/account/clubs domains'. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Body of POST /rounds — no clubId; identity comes from clubAuthed's `club`,
 *  never the request body (RoundFactory.createRound is permissionless on-chain,
 *  so this is re-verified against the chain in the service, not trusted here). */
export const createRoundBodySchema = z.object({
  contractAddress: addressSchema,
  goal: z.string().min(1), // USD₮ base units, string for bigint precision
  sharePrice: z.string().min(1),
  revenueBps: z.number().int().nonnegative(),
  capMultiple: z.number().int().positive(), // bps-scaled, e.g. 15000 = 1.5x
  deadline: z.coerce.date(),
});

/** Wire DTO of a rounds row — bigint-as-string columns pass through as-is;
 *  only the two timestamptz columns need Date -> ISO. */
export const roundRowSchema = z.object({
  id: z.number().int(),
  clubId: z.number().int(),
  contractAddress: addressSchema,
  goal: z.string(),
  sharePrice: z.string(),
  revenueBps: z.number().int(),
  capMultiple: z.number().int(),
  deadline: z.string(),
  status: roundStatusSchema,
  verified: z.boolean(),
  createdAt: z.string(),
});

/** GET /rounds query — clubId filters, `all=1` opts in to unverified rows too. */
export const listRoundsQuerySchema = z.object({
  clubId: z.coerce.number().int().optional(),
  all: z.string().optional(),
});

export const closeCheckParamsSchema = z.object({ id: z.coerce.number().int() });
export const closeCheckResultSchema = z.object({ status: roundStatusSchema });
