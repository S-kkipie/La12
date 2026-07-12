import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet domain's. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

/** Account role — Better Auth's `role` additionalField enum. */
export const roleSchema = z.enum(["club", "fan"]);

/** Body of POST /account/wallet — walletAddress ONLY; identity comes from the session. */
export const linkWalletBodySchema = z.object({ walletAddress: addressSchema });

/** Wire DTO — normalized across the club/profile branches. `linkedId` is the
 *  serial pk of the upserted clubs/profiles row. */
export const linkedWalletSchema = z.object({
  role: roleSchema,
  walletAddress: addressSchema,
  linkedId: z.number().int(),
});
