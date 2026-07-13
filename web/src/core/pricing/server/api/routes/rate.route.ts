import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { rateQuerySchema, rateSchema } from "@/core/pricing/domain/schemas";
import { toRateDTO } from "@/core/pricing/domain/types";
import { getRateService } from "../../services/get-rate-service";

export const rateRoute = new Elysia().get(
  "/rate",
  async ({ query, status }) => {
    const result = await getRateService(query.currency);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: toRateDTO(result.data) }));
  },
  {
    query: rateQuerySchema,
    response: {
      200: successResponseSchema(rateSchema, "Rate"),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Pricing"],
      summary: "USD₮→fiat rate for a currency",
      description: "Public read — no auth. Display-only; money truth stays on-chain / USD₮.",
    },
  },
);
