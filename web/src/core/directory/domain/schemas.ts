import { z } from "zod";

const clubDtoSchema = z.object({
  id: z.number().int(),
  // NOTE: `userId` (the club owner's better-auth id) is intentionally NOT on
  // the public wire — data minimization for GET /api/v1/directory. The internal
  // ClubWithRound domain shape still carries it (see types.ts).
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
