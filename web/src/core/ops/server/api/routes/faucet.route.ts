import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressBodySchema, faucetResultSchema } from "@/core/ops/domain/schemas";
import { fundGasService } from "../../services/fund-gas-service";

export const faucetRoute = new Elysia().post(
  "/faucet",
  async ({ body, status }) => {
    const result = await fundGasService(body.address as `0x${string}`);
    // Widened past the wallet template's `as 500`: fundGasService also emits
    // err(tooManyRequests)=429 when the per-address throttle trips (spec §5.2).
    if (!result.ok) return status(result.error.status as 429 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: addressBodySchema,
    response: {
      200: successResponseSchema(faucetResultSchema, "FaucetResult"),
      429: errorResponseSchema(429),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Sponsor a small amount of Sepolia ETH for gas (best-effort, public)",
    },
  },
);
