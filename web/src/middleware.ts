// Optimistic, cookie-only auth gate (fast, Edge-safe — no DB access, so no
// better-sqlite3 in the Edge runtime). This is NOT the real security
// boundary: it only redirects obviously-logged-out visitors away early. The
// authoritative check (session + role + ownership) happens server-side in
// each protected page/route via `auth.api.getSession` (see app/dashboard,
// app/api/rounds, app/api/account/wallet) — never trust this alone.
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard", "/wallet"],
};
