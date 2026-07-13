import { Elysia } from "elysia";
import { z } from "zod";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { listRoundsQuerySchema, roundRowSchema } from "@/core/rounds/domain/schemas";
import { toRoundRowDTO } from "@/core/rounds/domain/types";
import { listRoundsService } from "../../services/list-rounds-service";

export const listRoundsRoute = new Elysia().get(
  "/",
  async ({ query, status }) => {
    const result = await listRoundsService({ clubId: query.clubId, includeAll: query.all === "1" });
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toRoundRowDTO) }));
  },
  {
    query: listRoundsQuerySchema,
    response: {
      200: successResponseSchema(z.array(roundRowSchema), "Rounds"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Rounds"], summary: "Public round catalog (filterable by clubId; verified-only unless all=1)" },
  },
);
