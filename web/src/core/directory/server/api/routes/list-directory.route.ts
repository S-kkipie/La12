import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { clubWithRoundSchema } from "@/core/directory/domain/schemas";
import { toClubWithRoundDTO } from "@/core/directory/domain/types";
import { listDirectoryService } from "../../services/list-directory-service";

export const listDirectoryRoute = new Elysia().get(
  "/",
  async ({ status }) => {
    const result = await listDirectoryService();
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toClubWithRoundDTO) }));
  },
  {
    response: {
      200: successResponseSchema(z.array(clubWithRoundSchema), "Directory"),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Directory"],
      summary: "Every club with a verified round, most-funded first",
      description: "Public read — no auth. Money truth is on-chain (raised); Postgres holds display metadata.",
    },
  },
);
