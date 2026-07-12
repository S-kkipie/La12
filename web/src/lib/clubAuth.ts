// Shared session→club gate for the /api/club/* routes. Resolves the caller's
// club from the session (like /api/rounds POST) — never trusts client input.
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { db } from "@/lib/db";
import { clubs, type Club } from "@/db/schema";

export type RequireClubResult = { club: Club } | { error: NextResponse };

export async function requireClub(): Promise<RequireClubResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: NextResponse.json({ error: "not authenticated" }, { status: 401 }) };
  if (session.user.role !== "club") return { error: NextResponse.json({ error: "clubs only" }, { status: 403 }) };
  const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
  if (!club) return { error: NextResponse.json({ error: "no club linked" }, { status: 409 }) };
  return { club };
}
