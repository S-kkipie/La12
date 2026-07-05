// Better Auth server instance — email+password accounts for the two SaaS
// roles (club / fan). Password hashing, sessions (httpOnly cookies), and
// verification tokens are all handled by Better Auth itself; we never
// hand-roll any of that. Server-only — never import from a client component.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite" }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // Local demo, no email service configured — see spec's open items.
    requireEmailVerification: false,
  },
  user: {
    additionalFields: {
      role: {
        type: ["club", "fan"],
        required: true,
        defaultValue: "fan",
        input: true, // the signup form sets this
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
