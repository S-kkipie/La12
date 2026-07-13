import { Elysia } from "elysia";
import { z } from "zod";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { holderSchema, roundQuerySchema } from "@/core/clubs/domain/schemas";
import { toHolderDTO } from "@/core/clubs/domain/types";
import { getRoundHoldersService } from "../../services/get-round-holders-service";

export const holdersRoute = new Elysia().use(clubAuthed).get(
  "/holders",
  async ({ query, club, status }) => {
    const result = await getRoundHoldersService(club.id, query.round);
    // TEMPLATE NOTE: unlike the wallet template (get-positions.route.ts, `as 500`
    // only), get-round-holders-service can ALSO err(forbidden) — the requested
    // round isn't a verified round of the caller's club — so this route WIDENS
    // both the cast and the `response:` map to add 403, per that template's own
    // note ("WIDEN both: the error.status cast AND the response map").
    if (!result.ok) return status(result.error.status as 403 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toHolderDTO) }));
  },
  {
    clubAuthed: true,
    query: roundQuerySchema,
    response: {
      200: successResponseSchema(z.array(holderSchema), "Holders"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Cap-table for a round owned + verified by the caller's club" },
  },
);
