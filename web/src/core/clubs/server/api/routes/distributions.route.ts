import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { clubDistributionsSchema } from "@/core/clubs/domain/schemas";
import { toDistributionDTO, toSeriesPointDTO } from "@/core/clubs/domain/types";
import { getClubDistributionsService } from "../../services/get-club-distributions-service";

export const distributionsRoute = new Elysia().use(clubAuthed).get(
  "/distributions",
  async ({ club, status }) => {
    const result = await getClubDistributionsService(club.id);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(
      200,
      CommonResponse.successful({
        response: {
          distributions: result.data.distributions.map(toDistributionDTO),
          series: result.data.series.map(toSeriesPointDTO),
        },
      }),
    );
  },
  {
    clubAuthed: true,
    response: {
      200: successResponseSchema(clubDistributionsSchema, "ClubDistributions"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Distribution history + cumulative series for the caller's rounds" },
  },
);
