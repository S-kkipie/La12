import { z } from "zod";

const clubDtoSchema = z.object({
  id: z.number().int(),
  userId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  walletAddress: z.string(),
  createdAt: z.string(), // ISO instant
});

const roundDtoSchema = z.object({
  id: z.number().int(),
  clubId: z.number().int(),
  contractAddress: z.string(),
  goal: z.string(), // USD₮ base units, string for bigint precision
  sharePrice: z.string(), // USD₮ base units per share
  revenueBps: z.number().int(),
  capMultiple: z.number().int(),
  deadline: z.string(), // ISO instant
  status: z.enum(["funding", "active", "closed"]),
  verified: z.boolean(),
  createdAt: z.string(), // ISO instant
});

/** Wire shape of one directory entry — a club joined to its verified round,
 *  enriched with on-chain `raised` + the derived `pct`. */
export const clubWithRoundSchema = z.object({
  club: clubDtoSchema,
  round: roundDtoSchema,
  raised: z.string(), // USD₮ base units, string for bigint precision
  pct: z.number(),
});
