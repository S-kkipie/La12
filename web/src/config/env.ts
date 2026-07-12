import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// P0b scope: server env + the app base URL. The NEXT_PUBLIC_* chain/wallet vars
// stay in lib/walletMode.ts + lib/chain.ts (literal process.env access is
// required for Next to inline them, and they carry conditional validation).
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  // Let the app boot in CI/build without a full env; validation still runs at
  // runtime reads. (Matches Next's build-time env absence.)
  skipValidation: process.env.SKIP_ENV_VALIDATION === "true",
  emptyStringAsUndefined: true,
});
