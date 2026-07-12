import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { CommonResponse } from "@/server/common/responses";

/** When a route sets `authed: true`, resolves the session and injects
 *  `user`/`session`, else short-circuits with the 401 envelope. */
export const authed = new Elysia({ name: "authed" }).macro({
  authed: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401, CommonResponse.unauthorized());
      return { user: session.user, session: session.session };
    },
  },
});
