import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, createdResponseSchema } from "@/server/common/responses";
import { createRoundBodySchema, roundRowSchema } from "@/core/rounds/domain/schemas";
import { toRoundRowDTO } from "@/core/rounds/domain/types";
import { createRoundService } from "../../services/create-round-service";

export const createRoundRoute = new Elysia().use(clubAuthed).post(
  "/",
  async ({ body, club, status }) => {
    const result = await createRoundService(club, body);
    // TEMPLATE NOTE: create can ALSO err with invalidBody(400) — the deployed
    // contract's on-chain club() doesn't match this club's registered wallet, or
    // couldn't be read at all — on top of the macro's 401/403/409 and the
    // deps-injected insert's possible 500. Widen both the cast and the response
    // map accordingly (see get-positions.route.ts's TEMPLATE NOTE for the base case,
    // and holders.route.ts for the sibling 403-widening exemplar).
    if (!result.ok) return status(result.error.status as 400 | 500, errorToResponse(result.error));
    return status(201, CommonResponse.created({ response: toRoundRowDTO(result.data) }));
  },
  {
    clubAuthed: true,
    body: createRoundBodySchema,
    response: {
      201: createdResponseSchema(roundRowSchema, "Round"),
      400: errorResponseSchema(400),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Rounds"],
      summary: "Register a round for the caller's club, after verifying on-chain ownership",
    },
  },
);
