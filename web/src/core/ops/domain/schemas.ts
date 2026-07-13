import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Duplicated per-domain deliberately (same
 *  shape as wallet's/account's addressSchema) — no cross-domain imports,
 *  matching the established convention. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

/** Body of POST /ops/faucet and /ops/faucet-usdt. */
export const addressBodySchema = z.object({ address: addressSchema });

/** Body of POST /ops/moonpay. */
export const moonpayBodySchema = z.object({
  address: addressSchema,
  amountUsd: z.number().positive(),
});

/** Body of POST /ops/sync. `fromBlock` is coerced (JSON has no bigint). */
export const syncBodySchema = z.object({
  roundId: z.number().int().positive(),
  fromBlock: z.coerce.bigint().optional(),
});

/** Result of the gas sponsor. A "skipped" result (no SPONSOR_PK configured)
 *  is a valid 200 outcome, not an error — see fund-gas-service.ts. */
export const faucetResultSchema = z.union([
  z.object({ hash: z.string() }),
  z.object({ skipped: z.literal(true), reason: z.string() }),
]);

/** Result of the test-USD₮ mint. `amount` is a wire string (bigint precision). */
export const mintUsdtResultSchema = z.union([
  z.object({ hash: z.string(), amount: z.string() }),
  z.object({ skipped: z.literal(true), reason: z.string() }),
]);

export const moonpaySessionSchema = z.object({
  sessionId: z.string(),
  widgetUrl: z.string(),
});

export const syncResultSchema = z.object({ synced: z.number().int() });
