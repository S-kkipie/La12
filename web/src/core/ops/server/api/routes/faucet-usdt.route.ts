import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressBodySchema, mintUsdtResultSchema } from "@/core/ops/domain/schemas";
import { mintUsdtService } from "../../services/mint-usdt-service";

export const faucetUsdtRoute = new Elysia().post(
  "/faucet-usdt",
  async ({ body, status }) => {
    const result = await mintUsdtService(body.address as `0x${string}`);
    // Widened past `as 500`: mintUsdtService also emits err(tooManyRequests)=429
    // when the per-address throttle trips (spec §5.2).
    if (!result.ok) return status(result.error.status as 429 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: addressBodySchema,
    response: {
      200: successResponseSchema(mintUsdtResultSchema, "MintUsdtResult"),
      429: errorResponseSchema(429),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Mint test USD₮ from the MockUSDT faucet (public, testnet-only)",
    },
  },
);
