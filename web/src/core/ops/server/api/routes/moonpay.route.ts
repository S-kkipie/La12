import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { moonpayBodySchema, moonpaySessionSchema } from "@/core/ops/domain/schemas";
import { moonpayService } from "../../services/moonpay-service";

export const moonpayRoute = new Elysia().post(
  "/moonpay",
  async ({ body, status }) => {
    const result = await moonpayService(body.address as `0x${string}`, body.amountUsd);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: moonpayBodySchema,
    response: {
      200: successResponseSchema(moonpaySessionSchema, "MoonpaySession"),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Build a signed MoonPay on-ramp widget URL (public)",
    },
  },
);
