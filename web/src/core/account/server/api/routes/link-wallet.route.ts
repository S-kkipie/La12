import { Elysia } from "elysia";
import { authed } from "@/server/auth/middleware/authed";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { linkWalletBodySchema, linkedWalletSchema } from "@/core/account/domain/schemas";
import { linkWalletService } from "../../services/link-wallet-service";

export const linkWalletRoute = new Elysia().use(authed).post(
  "/wallet",
  async ({ body, user, status }) => {
    const result = await linkWalletService(
      { id: user.id, role: user.role as "club" | "fan", name: user.name },
      body,
    );
    // TEMPLATE NOTE: link only ever errs with 500 (unexpected DB failure), so
    // `as 500` + a {200,500} response map suffices. A domain whose service can
    // return notFound(404)/forbidden(403)/conflict(409) must WIDEN both the cast
    // and the `response:` map (see wallet get-positions.route.ts).
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    authed: true,
    body: linkWalletBodySchema,
    response: {
      200: successResponseSchema(linkedWalletSchema, "LinkedWallet"),
      401: errorResponseSchema(401),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Account"],
      summary: "Link the caller's WDK wallet address to their account",
      description:
        "Upserts the authenticated user's clubs (role=club) or profiles (role=fan) row with the given wallet address. Identity comes from the session, never the body.",
    },
  },
);
