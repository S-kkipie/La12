"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/frontend/auth/auth";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { getQueryClient } from "@/frontend/lib/query-client";

// English strings for every better-auth-ui view we actually render:
// sign-in, forgot-password, reset-password, sign-out, and the account/security
// settings. (Sign-up is our own custom page — see app/auth/sign-up/page.tsx.)
// No `localization` override is passed below, so the package's own English
// defaults apply to every one of those views.

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = getQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <EdenProvider client={apiClient} queryClient={queryClient}>
        <AuthUIProvider
          authClient={authClient}
          navigate={router.push}
          replace={router.replace}
          onSessionChange={() => router.refresh()}
          Link={Link}
          // Single static post-auth target; app/post-auth reads the session and
          // routes by role (club → /dashboard, fan → /wallet). Wallet creation +
          // linking still happens on the destination via <EnsureWallet>.
          redirectTo="/post-auth"
          // Account settings live at /account/*; only the display name is editable
          // (role is set once at signup and must not change; no avatar storage).
          account={{ basePath: "/account", fields: ["name"] }}
        >
          {children}
        </AuthUIProvider>
      </EdenProvider>
    </QueryClientProvider>
  );
}
