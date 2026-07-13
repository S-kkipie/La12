import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet/account domains'. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Wire shape of an enriched club round — bigints as strings, deadline as ISO. */
export const clubRoundSchema = z.object({
  roundId: z.number().int(),
  contractAddress: addressSchema,
  name: z.string(),
  goal: z.string(),
  raised: z.string(),
  totalShares: z.string(),
  distributed: z.string(),
  capMultiple: z.number().int(),
  revenueBps: z.number().int(),
  deadline: z.string(),
  status: roundStatusSchema,
  capUtilizationPct: z.number(),
});

export const clubTotalsSchema = z.object({
  raised: z.string(),
  distributed: z.string(),
  roundCount: z.number().int(),
  backerCount: z.number().int(),
});

/** GET /clubs/overview response payload. */
export const clubOverviewSchema = z.object({
  totals: clubTotalsSchema,
  rounds: z.array(clubRoundSchema),
});

export const distributionSchema = z.object({
  roundId: z.number().int(),
  roundName: z.string(),
  received: z.string(),
  credited: z.string(),
  refunded: z.string(),
  txHash: z.string(),
  timestamp: z.number().int(),
});

export const seriesPointSchema = z.object({ ts: z.number().int(), cumulative: z.string() });

/** GET /clubs/distributions response payload. */
export const clubDistributionsSchema = z.object({
  distributions: z.array(distributionSchema),
  series: z.array(seriesPointSchema),
});

export const holderSchema = z.object({
  address: addressSchema,
  shares: z.string(),
  claimable: z.string(),
  pct: z.number(),
});

/** GET /clubs/holders?round= query param. */
export const roundQuerySchema = z.object({ round: addressSchema });
