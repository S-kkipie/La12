import { env } from "@/config/env";

export const ServerConfig = {
  databaseURL: env.DATABASE_URL,
  betterAuthSecret: env.BETTER_AUTH_SECRET,
  // Better Auth base URL: explicit env, else the public app URL, else localhost.
  baseUrl: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  info: {
    name: "La Doce API",
    version: "1.0.0",
    description: "La Doce — tokenized revenue-share for football clubs.",
  },
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
} as const;
