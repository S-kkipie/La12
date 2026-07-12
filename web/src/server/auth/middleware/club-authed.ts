import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { auth } from "@/server/auth/auth";
import { CommonResponse } from "@/server/common/responses";

/** Requires an authenticated club user with a linked clubs row. Injects
 *  `club` + `user` + `session`, or short-circuits 401/403/409. Mirrors the
 *  legacy requireClub() gate. */
export const clubAuthed = new Elysia({ name: "club-authed" }).macro({
  clubAuthed: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401, CommonResponse.unauthorized());
      if (session.user.role !== "club") return status(403, CommonResponse.forbidden());
      const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
      if (!club) return status(409, CommonResponse.conflict({ code: "NO_CLUB_LINKED" }));
      return { club, user: session.user, session: session.session };
    },
  },
});
