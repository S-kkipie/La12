"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { ClientConfig } from "@/config/client-config";
import type { auth } from "@/server/auth/auth";

export const authClient = createAuthClient({
  baseURL: `${ClientConfig.baseUrl}/api/v1/auth`,
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signUp, signOut, useSession } = authClient;

/** userId for keying WDK wallet calls; undefined while loading or logged out. */
export function useCurrentUserId() {
  const { data, isPending } = useSession();
  return { userId: data?.user.id, isPending };
}
