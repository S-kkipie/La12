import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressSchema, fanPositionSchema } from "@/core/wallet/domain/schemas";
import { toPositionDTO } from "@/core/wallet/domain/types";
import { getFanPositionsService } from "../../services/get-fan-positions-service";

export const getPositionsRoute = new Elysia().get(
  "/positions",
  async ({ query, status }) => {
    const result = await getFanPositionsService(query.address as `0x${string}`);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toPositionDTO) }));
  },
  {
    query: z.object({ address: addressSchema }),
    response: {
      200: successResponseSchema(z.array(fanPositionSchema), "FanPositions"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Wallet"], summary: "Fan positions (verified rounds the address holds shares in)" },
  },
);
