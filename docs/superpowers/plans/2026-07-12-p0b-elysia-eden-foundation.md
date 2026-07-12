# P0b — Elysia / Eden Foundation Rails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Elysia API layer + Eden/TanStack-Query client + Result/envelope commons + config split as the typed, empty-but-serving foundation — a `GET /api/v1/health` returning the wire envelope, providers mounted — with **no domain migrated yet** and every existing Route Handler/page still working.

**Architecture:** Mount Elysia into Next via one catch-all (`app/api/v1/[...slugs]/route.ts` → `app.fetch`); root `server/router.ts` mounts Better Auth + cors + dev OpenAPI + server-timing + logtape + a root `onError` + a health route, and exports `AppRouter`. Copy the app-agnostic `server/common/responses/*` + `timed.ts` verbatim from myworkin. Add `authed`/`clubAuthed` Elysia macros. Wire `eden.ts` + `query-client.ts` and wrap the existing `@daveyplate` auth-ui provider with `QueryClientProvider` + `EdenProvider`. Introduce `src/` + a t3-env config split. Bump zod v3→v4.

**Tech Stack:** Next.js 15.5, Elysia 1.4, @elysiajs/{cors,eden,openapi,server-timing}, eden-tanstack-react-query, @tanstack/react-query 5, Better Auth 1.6.23, Drizzle + node-postgres, @t3-oss/env-nextjs, @logtape/{logtape,elysia}, zod 4, pnpm, tsx + node:test.

## Global Constraints

- **Reference app (copy patterns from):** `/home/skkippie/work/myworkin/myworkin-client/apps/myworkin-b2c/src`. Files under `server/common/responses/*` + `server/common/timed.ts` are copied **verbatim** (then AI-quota stripped — see Task 4). All other reference files are **adapted** to La Doce's smaller footprint.
- **La Doce has none of:** Stripe, Google OAuth, Firebase, AI/Gemini, PostHog, Sentry, nuqs, extension, live-events, multiSession. Strip every reference of these when adapting. Keep only: Better Auth email+password with the `role: ["club","fan"]` additionalField, Drizzle+pg, viem/WDK (untouched), `@daveyplate/better-auth-ui` (NOT `@better-auth-ui/react`).
- **Empty rails only.** No `core/<domain>` router is built in P0b. The root router mounts auth + middleware + a single `GET /health`. Domains come in P1+.
- **Existing behavior must not break.** Every current `app/api/*` Route Handler, RSC page, and the `@daveyplate` auth UI keeps working throughout. The legacy `app/api/auth/[...all]/route.ts` mount **stays** until the client fully targets `/api/v1/auth` (verified in Task 7).
- **Wire envelope (verbatim):** `{ response?: T, code: string, status: number, targets?: string[], detail?: unknown }`. `STATUS_MAP` = closed set `200/201/400/401/403/404/409/422/429/500`.
- **Import parity:** after the `src/` move, `@/*` → `./src/*`, so `@/server/...`, `@/core/...`, `@/frontend/...`, `@/config/...`, `@/lib/...`, `@/db/...` all resolve under `src/`.
- **NEXT_PUBLIC inlining gotcha:** Next only inlines `process.env.NEXT_PUBLIC_X` via **literal member access**. `lib/walletMode.ts` + `lib/chain.ts` depend on this and handle conditional validation. **Do NOT fold walletMode/chain into t3-env in P0b** — leave them reading `process.env` directly. P0b's config covers server env + the app base URL only. (Full walletMode→ClientConfig fold is a later cleanup.)
- **Better Auth freshAge:0** is deliberate (avoids `SESSION_NOT_FRESH` 403 on session-list/unlink/change-email in ≥1.6.12). Keep it.
- **zod v4:** all new schemas `import { z } from "zod"` (root = v4 after the bump). v3→v4 codemods: `z.string().email()`→`z.email()`, `z.string().url()`→`z.url()`; basic `z.object/string/number/enum` unchanged.
- Package manager **pnpm**. Tests run with **`pnpm exec tsx --test <file>`**. Authoritative typecheck gate: **`cd web && pnpm exec tsc --noEmit`** (EXIT 0). Ignore the known LSP `drizzle-orm` duplicate-instance TS2345 false positive (stale `better-sqlite3@11.10.0` transitive; removed in PF).
- Postgres is running locally (docker, `DATABASE_URL` in `web/.env.local`). Auth writes to pg (P0a done).
- Dep versions (exact, from myworkin): `elysia@^1.4.28`, `@elysiajs/cors@^1.4.2`, `@elysiajs/eden@^1.4.9`, `@elysiajs/openapi@^1.4.15`, `@elysiajs/server-timing@^1.4.1`, `eden-tanstack-react-query@^0.1.10`, `@tanstack/react-query@^5.100.13`, `@t3-oss/env-nextjs@^0.13.11`, `@logtape/logtape@^2.2.1`, `@logtape/elysia@^2.2.1`, `drizzle-zod@^0.8.3`, `zod@^4.4.3`.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `web/src/**` | all existing `app/ components/ lib/ db/ middleware.ts` moved under `src/` | Move (Task 1) |
| `web/tsconfig.json` | `@/*` → `./src/*` | Modify (Task 1) |
| `web/drizzle.config.ts` | schema path → `./src/db/schema.ts` | Modify (Task 1) |
| `web/components.json`, `web/src/app/globals.css` | shadcn/tailwind paths + `@source` under `src/` | Modify (Task 1) |
| `web/package.json` | P0b deps + zod v4 bump | Modify (Task 2) |
| the ~6 zod `safeParse` route handlers | v3→v4 codemod | Modify (Task 2) |
| `web/src/config/{env,server-config,client-config}.ts` | t3-env split (server env + app base URL) | Create (Task 3) |
| `web/src/server/common/responses/*` + `timed.ts` | Result + envelope, `cp` verbatim then strip AI-quota | Create (Task 4) |
| `web/src/server/auth/auth.ts` | Better Auth server (moved from `lib/auth.ts`, pg + basePath + openAPI + `authenticate()`) | Move+Modify (Task 5) |
| `web/src/frontend/auth/auth.ts` | Better Auth client (moved from `lib/auth-client.ts`, `/api/v1/auth` baseURL) | Move+Modify (Task 5) |
| `web/src/server/auth/middleware/authed.ts` · `club-authed.ts` | Elysia auth macros | Create (Task 5) |
| `web/src/server/router.ts` | root Elysia, mount auth + plugins + onError + health, `AppRouter` | Create (Task 6) |
| `web/src/app/api/v1/[...slugs]/route.ts` | Next→Elysia bridge (`app.fetch`) | Create (Task 6) |
| `web/src/frontend/lib/{eden,query-client}.ts` | Eden proxy + TanStack Query SSR singleton | Create (Task 7) |
| `web/src/components/providers.tsx` | wrap existing auth-ui with QueryClientProvider + EdenProvider | Modify (Task 7) |
| `web/src/instrumentation.ts` | logtape `configure()` (console sink) | Create (Task 8) |

---

## Task 1: Move the app under `src/`

**Files:**
- Move: `web/app`, `web/components`, `web/lib`, `web/db`, `web/middleware.ts` → `web/src/…`
- Modify: `web/tsconfig.json`, `web/drizzle.config.ts`, `web/components.json`, `web/src/app/globals.css`

**Interfaces:**
- Produces: every existing file reachable at `src/…`; `@/*` resolves to `./src/*`; `pnpm build` green from the new layout.

- [ ] **Step 1: Move the directories with git (preserves history)**

```bash
cd /home/skkippie/work/AI-DO/La12/web
mkdir -p src
git mv app src/app
git mv components src/components
git mv lib src/lib
git mv db src/db
git mv middleware.ts src/middleware.ts
```
(`scripts/`, `public/`, `drizzle.config.ts`, `next.config.ts`, `package.json`, `docker-compose.yml`, config files stay at `web/` root. `next.config.ts` needs no change — Next auto-detects `src/app`.)

- [ ] **Step 2: Point the `@/*` alias at `src/` in `web/tsconfig.json`**

Change the `paths` block to:
```json
    "paths": {
      "@/*": [
        "./src/*"
      ]
    }
```

- [ ] **Step 3: Update `web/drizzle.config.ts` schema path**

Change `schema: "./db/schema.ts"` to `schema: "./src/db/schema.ts"`.

- [ ] **Step 4: Update tailwind/shadcn content paths**

In `web/components.json`, update any `"tailwind"`/alias paths that reference `app/`, `components/`, `lib/` to their `src/` equivalents (e.g. `"css": "src/app/globals.css"`, aliases `"@/components"`, `"@/lib/utils"` are already alias-based and need no change). In `web/src/app/globals.css`, if a `@source` directive references `"../.stitch"` or similar relative path, re-resolve it from the new `src/app/` location (it becomes `"../../.stitch"`). Grep for hardcoded `./app`/`./components` globs in `postcss.config.mjs`/`next.config.ts` and fix any.

- [ ] **Step 5: Verify the build from the new layout**

Run: `cd web && pnpm build`
Expected: success. Next resolves `src/app`; all `@/…` imports resolve to `src/…`. If a hardcoded relative path broke (rare — most imports use `@/`), fix it and rebuild.

- [ ] **Step 6: Update `web/package.json` script paths broken by the move**

The move relocates `db/seed.ts` and `lib/db.roundtrip.test.ts`. Update the scripts:
- `"db:seed": "tsx db/seed.ts"` → `"db:seed": "tsx src/db/seed.ts"`
- `"test:db"`: change the `lib/db.roundtrip.test.ts` path to `src/lib/db.roundtrip.test.ts` (the `scripts/migrate-sqlite-to-pg.test.ts` path is unchanged — `scripts/` stays at `web/` root and imports via the `@/` alias).
(`db:migrate-pg` needs no change — `scripts/` did not move and its imports use `@/…`.)

- [ ] **Step 7: Verify scripts + migration still resolve under the alias**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (`scripts/migrate-sqlite-to-pg.ts` imports `@/lib/db`+`@/db/schema` → now `src/lib/db`+`src/db/schema` via the alias — no code change needed.)
Run: `cd web && ALLOW_DESTRUCTIVE_MIGRATION_TEST=1 pnpm test:db 2>&1 | tail -3 && pnpm db:migrate-pg 2>&1 | tail -3`
Expected: db tests pass at the `src/lib/` path; migration restores data. (Confirms the moved test path + seed/migrate scripts.)

- [ ] **Step 8: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add -A web
git commit -m "refactor(p0b): move app under src/ (import-root parity with reference)"
```

---

## Task 2: Add P0b dependencies + bump zod to v4

**Files:**
- Modify: `web/package.json`; the ~6 route handlers importing zod (`src/app/api/rounds/route.ts`, `src/app/api/account/wallet/route.ts`, `src/app/api/sync/route.ts`, `src/app/api/faucet/route.ts`, `src/app/api/faucet-usdt/route.ts`, `src/app/api/moonpay/route.ts`)

**Interfaces:**
- Produces: all P0b deps installed; `zod@^4`; existing zod schemas compile under v4.

- [ ] **Step 1: Add deps to `web/package.json`**

Add to `dependencies` (exact versions):
```json
    "elysia": "^1.4.28",
    "@elysiajs/cors": "^1.4.2",
    "@elysiajs/eden": "^1.4.9",
    "@elysiajs/openapi": "^1.4.15",
    "@elysiajs/server-timing": "^1.4.1",
    "eden-tanstack-react-query": "^0.1.10",
    "@tanstack/react-query": "^5.100.13",
    "@t3-oss/env-nextjs": "^0.13.11",
    "@logtape/logtape": "^2.2.1",
    "@logtape/elysia": "^2.2.1",
    "drizzle-zod": "^0.8.3"
```
Change the existing `"zod": "^3.24.0"` to `"zod": "^4.4.3"`.

- [ ] **Step 2: Install**

Run: `cd web && pnpm install`
Expected: resolves cleanly. (`elysia` peers on the installed TS; Eden bridge is standalone.)

- [ ] **Step 3: Codemod the existing zod v3 call sites to v4**

In each of the 6 handlers above, the schemas use `z.object`, `z.string`, `z.number`, `z.enum`, `.min`, `.optional` — all unchanged in v4. Only fix these if present: replace `z.string().email()` → `z.email()`, `z.string().url()` → `z.url()`. The `.safeParse(...)` + `.error.flatten()` pattern is unchanged in v4 (`flatten()` still exists). Grep each file for `.email(`/`.url(` and apply.

- [ ] **Step 4: Verify build + existing pure tests under zod v4**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build success. Then:
Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --test src/lib/walletMode.test.ts src/lib/format.test.ts`
Expected: pass (confirms nothing zod-adjacent regressed). (Tests live under `src/lib/` after Task 1.)

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/package.json web/pnpm-lock.yaml web/src/app/api
git commit -m "chore(p0b): add Elysia/Eden/logtape/t3-env deps + bump zod to v4"
```

---

## Task 3: Config split (`src/config`)

**Files:**
- Create: `web/src/config/env.ts`, `web/src/config/server-config.ts`, `web/src/config/client-config.ts`
- Modify: `web/.env.example` (document `NEXT_PUBLIC_APP_URL`)

**Interfaces:**
- Consumes: `process.env`.
- Produces: `env` (validated), `ServerConfig` (server-only reads), `ClientConfig` (`baseUrl` for eden + auth-client). Scoped to server env + app base URL — walletMode/chain env stays out (see Global Constraints).

- [ ] **Step 1: Create `web/src/config/env.ts`**

```ts
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
```

- [ ] **Step 2: Create `web/src/config/server-config.ts`**

```ts
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
```

- [ ] **Step 3: Create `web/src/config/client-config.ts`**

```ts
import { env } from "@/config/env";

export const ClientConfig = {
  baseUrl: env.NEXT_PUBLIC_APP_URL,
} as const;
```

- [ ] **Step 4: Add `NEXT_PUBLIC_APP_URL` to `web/.env.example` and `web/.env.local`**

In `web/.env.example`, under Better Auth, add:
```
# Public origin of this app — used by the Eden client + Better Auth client baseURL.
NEXT_PUBLIC_APP_URL=http://localhost:3000
```
Add the same line to `web/.env.local` (not committed).

- [ ] **Step 5: Verify**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0 (the three config files compile; nothing imports them yet).

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/config web/.env.example
git commit -m "feat(p0b): t3-env config split (ServerConfig/ClientConfig)"
```

---

## Task 4: Copy the Result/envelope commons (verbatim, then strip AI-quota)

**Files:**
- Create (cp verbatim): `web/src/server/common/responses/{result,app-error,status,api,error-converter,index}.ts` + `web/src/server/common/timed.ts`, and their `__tests__`.
- Modify (after cp): `app-error.ts`, `api.ts` — remove the AI-quota kind.

**Interfaces:**
- Produces: `CommonResponse`, `AppErrors`, `errorToResponse`, `ok`/`err`/`isOk`/`isErr`/`matchResult`, `successResponseSchema`/`createdResponseSchema`/`errorResponseSchema`, `STATUS_MAP`, types `APIResponse`/`AppResult`/`AsyncAppResult` — all from `@/server/common/responses`.

- [ ] **Step 1: `cp` the files verbatim**

```bash
SRC=/home/skkippie/work/myworkin/myworkin-client/apps/myworkin-b2c/src/server/common
DST=/home/skkippie/work/AI-DO/La12/web/src/server/common
mkdir -p "$DST/responses/__tests__" "$DST/__tests__"
cp "$SRC/responses/result.ts"          "$DST/responses/result.ts"
cp "$SRC/responses/app-error.ts"       "$DST/responses/app-error.ts"
cp "$SRC/responses/status.ts"          "$DST/responses/status.ts"
cp "$SRC/responses/api.ts"             "$DST/responses/api.ts"
cp "$SRC/responses/error-converter.ts" "$DST/responses/error-converter.ts"
cp "$SRC/responses/index.ts"           "$DST/responses/index.ts"
cp "$SRC/timed.ts"                      "$DST/timed.ts"
cp "$SRC/responses/__tests__/error-converter.test.ts" "$DST/responses/__tests__/error-converter.test.ts"
cp "$SRC/__tests__/timed.test.ts"      "$DST/__tests__/timed.test.ts"
```
(Do NOT copy `assert-course-access.ts` — course-specific to myworkin.)

- [ ] **Step 2: Strip the AI-quota error kind (La Doce has no AI)**

In `web/src/server/common/responses/app-error.ts`: delete the `AiQuotaExceededError` union member and the `aiQuotaExceeded(...)` constructor from `AppErrors`.
In `web/src/server/common/responses/api.ts`: in `APIErrorResponse`, remove the `detail?: { bucket; limit; plan }` field; in `errorResponseSchema`, remove the `detail: z.object({ bucket, limit, plan }).optional()` field.
(These are the only two AI references; leave everything else byte-for-byte.)

- [ ] **Step 3: Verify commons compile + their tests pass**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (The files `import { z } from "zod"` → v4, resolved by Task 2.)
Run: `cd web && pnpm exec tsx --test src/server/common/responses/__tests__/error-converter.test.ts src/server/common/__tests__/timed.test.ts`
Expected: pass. (If `error-converter.test.ts` references the removed AI-quota kind, delete just that case.)

- [ ] **Step 4: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/server/common
git commit -m "feat(p0b): copy Result/envelope commons from reference (AI-quota stripped)"
```

---

## Task 5: Better Auth rails + Elysia auth macros

**Files:**
- Move+Modify: `web/src/lib/auth.ts` → `web/src/server/auth/auth.ts`; `web/src/lib/auth-client.ts` → `web/src/frontend/auth/auth.ts`
- Create: `web/src/server/auth/middleware/authed.ts`, `web/src/server/auth/middleware/club-authed.ts`
- Modify: every importer of `@/lib/auth` / `@/lib/auth-client` (update to new paths)

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `ServerConfig`, `CommonResponse`, the `clubs` table.
- Produces: `auth` (pg adapter, basePath `/api/v1/auth`, `authenticate()` cache helper, `OpenAPI` export); `authClient` (`/api/v1/auth` baseURL); `authed` macro (injects `user`/`session`); `clubAuthed` macro (injects `club`).

- [ ] **Step 1: Move + rewrite the server auth to `web/src/server/auth/auth.ts`**

```bash
cd /home/skkippie/work/AI-DO/La12/web
mkdir -p src/server/auth/middleware src/frontend/auth
git mv src/lib/auth.ts src/server/auth/auth.ts
git mv src/lib/auth-client.ts src/frontend/auth/auth.ts
```
Rewrite `web/src/server/auth/auth.ts`:
```ts
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
```

- [ ] **Step 2: Rewrite the client auth `web/src/frontend/auth/auth.ts`**

```ts
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
```

- [ ] **Step 3: Repoint every importer of the old auth paths**

Run: `cd web && grep -rl "@/lib/auth\b\|@/lib/auth-client" src` — for each hit, change `@/lib/auth` → `@/server/auth/auth` and `@/lib/auth-client` → `@/frontend/auth/auth`. Known importers: `src/components/providers.tsx`, `src/app/api/auth/[...all]/route.ts`, `src/app/api/**` handlers, `src/lib/clubAuth.ts`, RSC pages under `src/app/(app)`/`(marketing)`, wallet/wdk consumers of `useCurrentUserId`. Also update `src/app/api/auth/[...all]/route.ts` import to `@/server/auth/auth` (it still mounts the legacy handler — leave the mount itself intact).

- [ ] **Step 4: Create the `authed` macro `web/src/server/auth/middleware/authed.ts`**

```ts
import { Elysia } from "elysia";
import { auth } from "@/server/auth/auth";
import { CommonResponse } from "@/server/common/responses";

/** When a route sets `authed: true`, resolves the session and injects
 *  `user`/`session`, else short-circuits with the 401 envelope. */
export const authed = new Elysia({ name: "authed" }).macro({
  authed: {
    async resolve({ status, request: { headers } }) {
      const session = await auth.api.getSession({ headers });
      if (!session) return status(401, CommonResponse.unauthorized());
      return { user: session.user, session: session.session };
    },
  },
});
```

- [ ] **Step 5: Create the `clubAuthed` macro `web/src/server/auth/middleware/club-authed.ts`**

Ports `src/lib/clubAuth.ts` `requireClub()` into a macro. When a route sets `clubAuthed: true`, it requires a session with `role === "club"` and a linked `clubs` row, injecting `club` (and `user`/`session`):
```ts
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
```

- [ ] **Step 6: Verify**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build success (all importers repointed; auth moved; macros compile).

- [ ] **Step 7: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add -A web/src
git commit -m "feat(p0b): move Better Auth to server/frontend parity paths + authed/clubAuthed macros"
```

---

## Task 6: Root Elysia router + Next bridge + health route

**Files:**
- Create: `web/src/server/router.ts`, `web/src/app/api/v1/[...slugs]/route.ts`

**Interfaces:**
- Consumes: `auth` + `OpenAPI`, `ServerConfig`, `authed`, `CommonResponse`, `STATUS_MAP`, `APIResponse`.
- Produces: the mounted API at `/api/v1/*`; `GET /api/v1/health` → `{ response: { ok: true }, code: "OK", status: 200 }`; `export type AppRouter`.

- [ ] **Step 1: Create `web/src/server/router.ts`**

```ts
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { serverTiming } from "@elysiajs/server-timing";
import { elysiaLogger } from "@logtape/elysia";
import { getLogger } from "@logtape/logtape";
import { Elysia } from "elysia";
import { z } from "zod";
import { ServerConfig } from "@/config/server-config";
import { auth, OpenAPI } from "@/server/auth/auth";
import {
  CommonResponse,
  successResponseSchema,
  type APIResponse,
  type STATUS_MAP,
} from "@/server/common/responses";

const apiErrorLogger = getLogger(["server", "error"]);

const betterAuth = new Elysia({ name: "better-auth" }).mount(auth.handler);

// OpenAPI docs (Scalar UI at /api/v1/openapi) are dev-only; mounted as an
// empty-typed sub-app so AppRouter stays identical across environments.
const docs = new Elysia({ name: "docs" });
if (ServerConfig.isDevelopment) {
  docs.use(
    openapi({
      documentation: {
        paths: await OpenAPI.getPaths(),
        components: await OpenAPI.components,
        info: {
          title: ServerConfig.info.name,
          version: ServerConfig.info.version,
          description: ServerConfig.info.description,
        },
      },
      mapJsonSchema: { zod: z.toJSONSchema },
    }),
  );
}

const app = new Elysia({ prefix: "/api/v1" })
  .use(betterAuth)
  .use(
    cors({
      origin: [ServerConfig.baseUrl],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(docs)
  .use(serverTiming())
  .use(elysiaLogger())
  .onError(({ error, code, request, path }) => {
    if (code === "VALIDATION")
      return {
        code,
        status: (error as { status?: number }).status as keyof typeof STATUS_MAP,
        response: (error as { valueError?: unknown }).valueError,
      } satisfies APIResponse<unknown>;
    apiErrorLogger.error("Unhandled API error {code} on {method} {path}: {error}", {
      code,
      method: request.method,
      path,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    return { code: "INTERNAL_SERVER_ERROR", status: 500 } satisfies APIResponse;
  })
  // Health probe — the P0b integration proof (no domain routers yet).
  .get("/health", ({ status }) => status(200, CommonResponse.successful({ response: { ok: true } })), {
    response: { 200: successResponseSchema(z.object({ ok: z.boolean() }), "Health") },
    detail: { tags: ["Common"], summary: "Liveness probe" },
  });

export default app;
export type AppRouter = typeof app;
```

- [ ] **Step 2: Create the Next→Elysia bridge `web/src/app/api/v1/[...slugs]/route.ts`**

```ts
import app from "@/server/router";

export const maxDuration = 60;

export const GET = app.fetch;
export const POST = app.fetch;
export const PUT = app.fetch;
export const PATCH = app.fetch;
export const DELETE = app.fetch;
export const OPTIONS = app.fetch;
```

- [ ] **Step 3: Verify typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build success. (`z.toJSONSchema` exists in zod v4; the `await OpenAPI.*` at module top works under Next's async route module eval.)

- [ ] **Step 4: Verify the health route returns the envelope (integration proof)**

Run: `cd web && pnpm dev` (background), then:
`curl -s http://localhost:3000/api/v1/health`
Expected: `{"response":{"ok":true},"code":"OK","status":200}`.
Also confirm auth still answers under the new mount: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/auth/ok` (or any Better Auth GET) → a 2xx/4xx, not a 404 (proves the mount). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/server/router.ts web/src/app/api/v1
git commit -m "feat(p0b): root Elysia router (auth mount + cors + docs + onError + health) + Next bridge"
```

---

## Task 7: Eden + TanStack Query client + provider wiring

**Files:**
- Create: `web/src/frontend/lib/eden.ts`, `web/src/frontend/lib/query-client.ts`
- Modify: `web/src/components/providers.tsx`

**Interfaces:**
- Consumes: `AppRouter` (Task 6), `ClientConfig`, `authClient` (Task 5).
- Produces: `useElysia()` proxy (rooted at `/api/v1`), `apiClient` treaty, `EdenProvider`, `getQueryClient()`; providers mounting `QueryClientProvider` → `EdenProvider` around the existing `@daveyplate` auth-ui.

- [ ] **Step 1: Create `web/src/frontend/lib/query-client.ts`**

```ts
import { environmentManager, QueryClient } from "@tanstack/react-query";

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { staleTime: 5000, throwOnError: true } },
  });
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
  if (environmentManager.isServer()) return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}
```

- [ ] **Step 2: Create `web/src/frontend/lib/eden.ts`**

```ts
import { treaty } from "@elysiajs/eden";
import { createEdenTanStackQuery } from "eden-tanstack-react-query";
import { ClientConfig } from "@/config/client-config";
import type { AppRouter } from "@/server/router";

const BASE_URL = ClientConfig.baseUrl;

const { EdenProvider, useEden } = createEdenTanStackQuery<AppRouter>();
const useElysia = () => useEden().api.v1;

const apiClient = treaty<AppRouter>(BASE_URL);

export { apiClient, EdenProvider, useElysia };
```

- [ ] **Step 3: Wrap the existing providers in `web/src/components/providers.tsx`**

Keep the existing `@daveyplate/better-auth-ui` `AuthUIProvider` and its config; wrap it with `QueryClientProvider` + `EdenProvider` (same queryClient). Update the `authClient` import to the moved path:
```tsx
"use client";

import { AuthUIProvider } from "@daveyplate/better-auth-ui";
import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/frontend/auth/auth";
import { apiClient, EdenProvider } from "@/frontend/lib/eden";
import { getQueryClient } from "@/frontend/lib/query-client";

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
          redirectTo="/post-auth"
          account={{ basePath: "/account", fields: ["name"] }}
        >
          {children}
        </AuthUIProvider>
      </EdenProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Verify typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build. (`AppRouter` types flow into `useElysia`; `apiClient` is typed by the router.)

- [ ] **Step 5: Verify providers mount + an Eden call is typed end-to-end**

Run: `cd web && pnpm dev` (background). In a browser or with curl, load a page under the app shell (e.g. `/wallet` — logged out redirects, that's fine) and confirm **no hydration/provider errors** in the dev console. Then, to prove the typed client end-to-end, temporarily add to any client component:
```ts
// throwaway smoke: const health = useElysia().health.get.queryOptions();
```
and confirm `tsc` types it (the `health` path exists on the proxy). Remove the smoke line. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/frontend/lib web/src/components/providers.tsx
git commit -m "feat(p0b): Eden + TanStack Query client + provider wiring"
```

---

## Task 8: LogTape instrumentation

**Files:**
- Create: `web/src/instrumentation.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: LogTape configured with a console sink so `getLogger([...])` calls (in the router `onError`, `error-converter`, `elysiaLogger`) actually emit. La Doce has no Sentry — console sink only.

- [ ] **Step 1: Create `web/src/instrumentation.ts`**

```ts
import { AsyncLocalStorage } from "node:async_hooks";
import { ansiColorFormatter, configure, getConsoleSink, withFilter } from "@logtape/logtape";

const isDev = process.env.NODE_ENV === "development";

/** Next server instrumentation: configure LogTape so getLogger([...]) emits. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  await configure({
    sinks: {
      console: withFilter(getConsoleSink({ formatter: ansiColorFormatter }), isDev ? "debug" : "info"),
    },
    loggers: [
      { category: ["logtape", "meta"], sinks: ["console"], lowestLevel: "error" },
      { category: [], lowestLevel: isDev ? "debug" : "info", sinks: ["console"] },
    ],
    contextLocalStorage: new AsyncLocalStorage(),
  });
}
```

- [ ] **Step 2: Verify logs emit + no console.* introduced**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build. Then `pnpm dev` (background) and `curl -s http://localhost:3000/api/v1/health` — the `elysiaLogger()` should print a request log line to the dev console (proves LogTape is configured). Force a 500 by curling a bad method/path and confirm the `onError` log appears. Stop the server.

- [ ] **Step 3: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/instrumentation.ts
git commit -m "feat(p0b): LogTape instrumentation (console sink)"
```

---

## Acceptance criteria (P0b done)

- `cd web && pnpm exec tsc --noEmit` green; `pnpm build` green.
- App reorganized under `src/`; `@/*` → `./src/*`; existing pages/handlers + `@daveyplate` auth UI still work.
- `GET /api/v1/health` returns `{"response":{"ok":true},"code":"OK","status":200}`.
- Better Auth mounted at `/api/v1/auth` (client repointed); legacy `/api/auth/[...all]` still present (removed in a later phase once nothing uses it).
- `AppRouter` exported and typed; `useElysia()` proxy usable in client components; providers mount `QueryClientProvider` + `EdenProvider` with no hydration errors.
- Commons (`server/common/responses/*` + `timed.ts`) present, AI-quota stripped, their tests green.
- `authed` + `clubAuthed` macros exist. Config split (`ServerConfig`/`ClientConfig`) in place. zod on v4. LogTape emitting.
- **No `core/<domain>` router yet** — that is P1.

## Notes / deferred

- `lib/walletMode.ts` + `lib/chain.ts` still read `process.env` directly (NEXT_PUBLIC inlining + conditional validation) — folding into `ClientConfig` is a later cleanup, not P0b.
- Better Auth adapter switched `provider: "sqlite"` → `"pg"` here (P0a left it "sqlite"; it worked, but pg is correct).
- The legacy `app/api/auth/[...all]` mount + the `middleware.ts` cookie gate stay as-is (myworkin has no middleware; moving gating to layout guards is a later alignment).
- `eden-server.ts` (RSC prefetch proxy) is intentionally NOT built in P0b — add it in the first domain (P1) that needs prefetch-hydration.
