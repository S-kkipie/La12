import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { syncBodySchema, syncResultSchema } from "@/core/ops/domain/schemas";
import { syncEventsService } from "../../services/sync-service";

export const syncRoute = new Elysia().post(
  "/sync",
  async ({ body, status }) => {
    const result = await syncEventsService(body.roundId, body.fromBlock);
    // WIDENED beyond {200,500}: syncEventsService's real error surface
    // includes 404 (round not found) and 403 (round not verified — the
    // allowlist check), not just a catastrophic 500. See sync-service.ts.
    if (!result.ok) {
      return status(result.error.status as 403 | 404 | 500, errorToResponse(result.error));
    }
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: syncBodySchema,
    response: {
      200: successResponseSchema(syncResultSchema, "SyncResult"),
      403: errorResponseSchema(403),
      404: errorResponseSchema(404),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Rebuild the events cache for one verified round from on-chain logs (public)",
    },
  },
);
