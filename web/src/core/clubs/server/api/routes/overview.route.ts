import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { clubOverviewSchema } from "@/core/clubs/domain/schemas";
import { toClubTotalsDTO, toClubRoundDTO } from "@/core/clubs/domain/types";
import { getClubOverviewService } from "../../services/get-club-overview-service";

export const overviewRoute = new Elysia().use(clubAuthed).get(
  "/overview",
  async ({ club, status }) => {
    const result = await getClubOverviewService(club.id);
    // The service is graceful-empty (see get-club-overview-service.ts) — it never
    // returns err(...), so `as 500` is defensive only (matches get-positions.route.ts's
    // base template; there is no 500 this route can actually emit today).
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(
      200,
      CommonResponse.successful({
        response: { totals: toClubTotalsDTO(result.data.totals), rounds: result.data.rounds.map(toClubRoundDTO) },
      }),
    );
  },
  {
    clubAuthed: true,
    response: {
      200: successResponseSchema(clubOverviewSchema, "ClubOverview"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Club totals + verified rounds, on-chain enriched" },
  },
);
