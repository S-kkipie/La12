// Better Auth browser client. `inferAdditionalFields<typeof auth>()` is a
// type-only import (erased at compile time) so this file never pulls
// lib/auth.ts's server code (better-sqlite3 et al.) into the client bundle.
"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";

// No baseURL: the auth API lives on the same origin as this app (same
// Next.js server), so relative requests are correct — no env var needed.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

/**
 * Convenience for components that only need "am I logged in, and as who" to
 * key their WDK wallet calls (see lib/wdk.ts — every export there takes a
 * userId). `userId` is undefined while the session is still loading OR when
 * logged out; check `isPending` to tell those apart.
 */
export function useCurrentUserId() {
  const { data, isPending } = useSession();
  return { userId: data?.user.id, isPending };
}
