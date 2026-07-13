import { Elysia } from "elysia";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { closeCheckParamsSchema, closeCheckResultSchema } from "@/core/rounds/domain/schemas";
import { closeCheckService } from "../../services/close-check-service";

/**
 * Public and unauthenticated on purpose: it only ever reads on-chain state
 * and, if due, performs the same permissionless `closeFunding()` call anyone
 * could already send directly — there's no privileged action to gate here.
 */
export const closeCheckRoute = new Elysia().post(
  "/:id/close-check",
  async ({ params, status }) => {
    const result = await closeCheckService(params.id);
    if (!result.ok) return status(result.error.status as 404 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    params: closeCheckParamsSchema,
    response: {
      200: successResponseSchema(closeCheckResultSchema, "CloseCheckResult"),
      404: errorResponseSchema(404),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Rounds"], summary: "Permissionless: close the round on-chain if due, sync DB status" },
  },
);
