// Better Auth server instance — email+password for the two roles (club/fan).
// Server-only. Mounted into Elysia at /api/v1/auth by src/server/router.ts.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { openAPI } from "better-auth/plugins";
import { headers } from "next/headers";
import { cache } from "react";
import { ServerConfig } from "@/config/server-config";
import { db } from "@/lib/db";

export const auth = betterAuth({
  // No explicit `schema`: Better Auth auto-maps to the user/session/account/
  // verification tables by name (as the current working config does). Only the
  // provider changes sqlite→pg. Do NOT pass the full db/schema module (it also
  // holds the app tables).
  database: drizzleAdapter(db, { provider: "pg" }),
  baseURL: ServerConfig.baseUrl,
  basePath: "/api/v1/auth",
  secret: ServerConfig.betterAuthSecret,
  // ≥1.6.12 otherwise 403s SESSION_NOT_FRESH on session-list/unlink/change-email.
  session: { freshAge: 0 },
  emailAndPassword: { enabled: true, requireEmailVerification: false },
  user: {
    additionalFields: {
      role: { type: ["club", "fan"], required: true, defaultValue: "fan", input: true },
    },
  },
  // Dev-only reference at /api/v1/auth/reference; kept registered so the
  // generated schema (consumed by the Elysia docs in router.ts) keeps its type.
  plugins: [openAPI({ disableDefaultReference: !ServerConfig.isDevelopment })],
});

export type Session = typeof auth.$Infer.Session;

// OpenAPI paths for the Elysia docs plugin (dev-only), tagged "Better Auth".
let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>;
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema());
export const OpenAPI = {
  getPaths: (prefix = "/api/v1/auth") =>
    getSchema().then(({ paths }) => {
      const reference: Record<string, unknown> = Object.create(null);
      for (const path of Object.keys(paths)) {
        const key = prefix + path;
        reference[key] = paths[path];
        for (const method of Object.keys(paths[path])) {
          (reference[key] as Record<string, { tags: string[] }>)[method].tags = ["Better Auth"];
        }
      }
      return reference;
    }),
  components: getSchema().then(({ components }) => components),
} as const;

// React cache()-wrapped session read for RSC/page guards. Swallows errors → null.
export const authenticate = cache(async () => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session ? { user: session.user, session: session.session } : null;
  } catch {
    return null;
  }
});
