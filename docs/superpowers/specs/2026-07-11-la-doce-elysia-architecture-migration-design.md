# La Doce — Elysia + Better Auth + Eden architecture migration

**Date:** 2026-07-11
**Status:** Approved design (umbrella roadmap). P0a/P0b/P1 detailed here; P2..N get their own dated specs when reached.
**Reference architecture:** `myworkin-client/apps/myworkin-b2c` (Elysia API layer, Better Auth, Eden + TanStack Query, domain tri-layer, Result/envelope).

---

## 1. Goal & decisions

Migrate La Doce's web app from raw Next.js Route Handlers to the myworkin architecture, **faithfully (1:1)**, so La Doce becomes a real product on the same scalable patterns.

Decisions locked in brainstorming:

| Decision | Choice |
|---|---|
| Fidelity | **Faithful 1:1** — Elysia + Eden + Result/envelope + domain tri-layer + t3-env config split + **zod v4** + `@logtape` structured logging + OpenAPI docs + server-timing |
| Database | **Migrate SQLite → Postgres** (match myworkin; `drizzle-orm/node-postgres`) |
| Execution | **Strangler / incremental** — stand up rails, migrate one domain at a time; old handlers keep serving until replaced |
| Layout | Adopt `web/src/` to match myworkin import roots (`@/server`, `@/core`, `@/frontend`) |
| First canonical slice | **`wallet`** (reads: positions + history) |
| Hackathon deadline | **Not a constraint** — no time pressure, no risk-to-demo gating |

### 1.1 Non-negotiable invariants (carried from `CLAUDE.md`)

- **Money truth is on-chain.** Postgres = UX/metadata + event cache only. Wipe-and-rebuild safe.
- **Self-custody stays client-side.** The fan seed is generated + AES-GCM encrypted in the browser (IndexedDB). The server NEVER holds the key. This holds after migration.
- **Chain writes stay client-signed.** `invest / claim / distribute / closeRound` are signed in the browser via WDK + viem. The Elysia API is **reads + wallet-link + faucet + moonpay + sync only** — it never signs a fan transaction. This is the **biggest divergence from myworkin** (which has no client-signing); call it out so nobody moves signing server-side.
- **Instrument is revenue-share (economic rights), not equity.** No custody, no securities.
- Amounts are base units (`bigint`), USD₮ = 6 decimals. On the JSON wire they are **strings** (JSON has no bigint); parsed back to `bigint` at the read edge.

---

## 2. Verbatim copies (`cp tal cual`)

Two sets of files are copied **byte-for-byte** from myworkin, not rewritten. They are app-agnostic (proof: `myworkin-admin` reuses the same `responses/*` unchanged).

### 2.1 The reusable "commons" layer → copied in **P0b**

Source: `myworkin-client/apps/myworkin-b2c/src/server/common/`
Dest: `La12/web/src/server/common/`

```
cp responses/result.ts          → src/server/common/responses/result.ts
cp responses/app-error.ts        → src/server/common/responses/app-error.ts
cp responses/status.ts           → src/server/common/responses/status.ts
cp responses/api.ts              → src/server/common/responses/api.ts
cp responses/error-converter.ts  → src/server/common/responses/error-converter.ts
cp responses/index.ts            → src/server/common/responses/index.ts
cp timed.ts                      → src/server/common/timed.ts
cp responses/__tests__/error-converter.test.ts → src/server/common/responses/__tests__/error-converter.test.ts
cp __tests__/timed.test.ts       → src/server/common/__tests__/timed.test.ts
```

- **Skip** `assert-course-access.ts` — course-specific to myworkin, no analog here.
- After copy, the only edits allowed to `app-error.ts` / `api.ts`: **remove** the AI-quota error kind (`AiQuotaExceededError` / `aiQuotaExceeded` / `AI_QUOTA_EXCEEDED`) since La Doce has no AI quota, and **add** any La-Doce-specific error kinds as domains need them (e.g. a chain/RPC error). Keep the `STATUS_MAP` closed set (`200/201/400/401/403/404/409/422/429/500`).
- **Reason cp happens in P0b, not now:** the files import `zod/v4`, `elysia`, `server-only` and expect the `src/` tree — copying before those exist creates dangling/broken files.

### 2.2 Code-review guide → **already staged** (this commit)

Source: `myworkin-client/docs/code-review/*.md` (13 files)
Dest: `La12/docs/code-review/*.md` — **copied verbatim already.**

These are the review rules the migration must satisfy (backend-api, frontend-data-fetching, types-schemas, architecture-structure, security, testing, sanctioned-patterns, reusable-inventory, etc.). They reference myworkin paths/examples; treat them as the **rulebook**, adapting example paths to La Doce as we go. A follow-up pass (post-P1) may localize the examples, but the rules copy as-is.

---

## 3. Target architecture (the request loop)

```
React component
 → core/<domain>/client/hooks.ts     useElysia().wallet.positions.get.queryOptions()
  → frontend/lib/eden.ts             Eden treaty proxy, typed by AppRouter
   → HTTP GET /api/v1/wallet/positions
    → app/api/v1/[...slugs]/route.ts  export const GET = app.fetch
     → server/router.ts              root Elysia: cors, .mount(auth.handler), onError, .use(walletRouter)
      → core/wallet/server/api/router.ts        prefix /wallet
       → routes/get-positions.route.ts          .use(authed?), validate query (zod), call service
        → services/get-fan-positions-service.ts  returns AsyncAppResult<T> (ok/err)
         → repository/find-verified-rounds.ts     "server-only" Drizzle
         → server/chain/contracts.ts              viem reads (shareBalance, pendingReward, ...)
     ← service ok(data) / err(AppError)
    ← route: status(200, CommonResponse.successful({response})) | errorToResponse(err)
   ← JSON envelope { response, code, status }
 ← Eden unwraps typed data into TanStack Query cache
```

### 3.1 Target layout (`web/src/`)

```
src/
  config/            env.ts (t3-env) · server-config.ts · client-config.ts
  server/
    router.ts                         root Elysia, prefix /api/v1
    auth/{auth.ts, middleware/{authed.ts, club-authed.ts}}
    common/                           ← §2.1 verbatim cp
    drizzle/{db.ts, schemas/{auth,clubs,rounds,profiles,events}-schema.ts, index.ts}
    chain/{client.ts, contracts.ts, sponsor.ts, faucet.ts}   server-only viem layer
  core/<domain>/{domain,server,client}
  frontend/
    lib/{eden.ts, eden-server.ts, query-client.ts}
    providers/providers.tsx
    auth/auth.ts                      client Better Auth
    wdk/{wdk.ts, storage.ts, ensure-wallet.ts}   "use client", self-custody (unchanged behavior)
  app/
    api/v1/[...slugs]/route.ts        export const GET/POST/... = app.fetch
    (marketing)/ (app)/ ...           pages stay; become thin, call services or client hooks
```

`tsconfig` path `@/*` → `src/*`. Moving existing files into `src/` is mechanical, part of P0b.

### 3.2 Domain decomposition (`core/<domain>`)

| Domain | Wraps (current) | Surface |
|---|---|---|
| **wallet** | `lib/positions.ts`, `lib/indexer.ts`, `app/api/wallet/*` | fan positions, USD₮ history (reads) |
| **account** | `app/api/account/wallet`, `lib/ensureWallet.ts` | link wallet address → session (mutation) |
| **clubs** | `lib/clubRevenue.ts`, `app/api/club/*` | overview, distributions, holders (role = club) |
| **rounds** | `app/api/rounds/*`, `lib/closeFunding.ts` | list, create (on-chain club check), close-check |
| **directory** | `lib/clubDirectory.ts`, marketing pages | public club/round catalog |
| **ops** | `lib/sponsor.ts`, `lib/faucetUsdt.ts`, `lib/moonpay.ts`, `app/api/sync` | faucet gas, mint USDT, on-ramp URL, event sync |
| **pricing** | `lib/pricing.ts` | usdt → fiat (later WDK Price Rates) |

Server infra (not domains): `server/chain/` (viem + contracts + sponsor + faucet), `config/`.
Client-only (not a domain): `frontend/wdk/` (self-custody).

Per-domain tri-layer rule (from `docs/code-review/architecture-structure.md`):
- `domain/` — pure logic, zod `schemas.ts` + `types.ts`, `__tests__/`. No I/O.
- `server/` — `api/router.ts` (+ `api/routes/*.route.ts`), `repository/` (Drizzle, `server-only`), `services/` (orchestration, returns `AsyncAppResult<T>`, deps injected).
- `client/` — hooks at root, components under `client/ui/`.
- **A domain isn't wired until its router is `.use()`d in `server/router.ts`.**

---

## 4. Phases

Each phase is independently shippable and verifiable (strangler property): after each, both old and new code paths must be green (`next build` + `tsc --noEmit` + tests) and the app driven end-to-end before merge.

### P0a — Postgres cutover

Goal: existing Route Handlers run unchanged on Postgres. No architecture change yet.

1. **Provision Postgres.** Open decision (§6): Supabase (MCP connected → provisionable here) vs Neon vs self-host on the OCI box. Recommended: **Supabase**.
2. **Port schema** `drizzle-orm/sqlite-core` → `pg-core`:
   - **Better Auth tables** (`user`, `session`, `account`, `verification`): regenerate the exact pg shape with `npx @better-auth/cli generate` against the pg adapter — do **not** hand-port (avoids drift). Net type changes: `emailVerified` int-boolean → `boolean`; `*_at` `timestamp_ms` (integer) → `timestamp`; `role` text-enum → `text` (keep the `["club","fan"]` check or a `pgEnum`).
   - **App tables** (`clubs`, `rounds`, `profiles`, `events`): `id` autoincrement integer → pg identity (`integer generated always as identity` / `serial`); FKs preserved (`clubs.userId?→user.id`, `rounds.clubId→clubs.id`, `profiles.userId?→user.id`, `events.roundId→rounds.id`); indexes preserved (`session_userId_idx`, `account_userId_idx`, `verification_identifier_idx`). Timestamps → `timestamp`.
   - **KEEP `goal` / `sharePrice` / `amount` as `text`** — they are USD₮ base-units held as strings for exact bigint precision. Do **not** convert to `numeric`. Same for `revenueBps` / `capMultiple` (integer, bps-scaled) — unchanged.
   - `casing: "snake_case"` on the drizzle client (columns already snake in DB).
3. **Data migration script** (`web/scripts/migrate-sqlite-to-pg.ts`, run via `tsx`): open the live `ladoce.db` with better-sqlite3, read every table, insert into Postgres in FK order (`user → session/account/verification → clubs → rounds → profiles → events`). Prod has real data — this is a one-shot, idempotent-on-rerun (truncate-then-load or upsert by pk).
4. **Repoint the client:** `lib/db.ts` → `drizzle-orm/node-postgres` + `pg` Pool from `ServerConfig.databaseURL` (temporary: `ServerConfig` may not exist yet in P0a — read `process.env.DATABASE_URL` directly here, then fold into `ServerConfig` in P0b).
5. **Verify:** every existing `app/api/*` handler + every RSC page that queries Drizzle works against Postgres. This is the acceptance gate; no Elysia code exists yet.

Deps added: `pg`, `@types/pg` (dev). Drop nothing yet (better-sqlite3 stays until the data script has run and is verified; removed in PF).

### P0b — Elysia / Eden foundation rails

Goal: the empty-but-typed API stack compiles and serves a health route; providers wired; **no domain migrated yet**. Old handlers untouched.

1. **Introduce `src/`** and move `app/`, `lib/`, `components/`, `db/` under it; set `@/*` → `src/*`. (Cosmetic-but-faithful; can be skipped only if the user later reverses §1's layout choice.)
2. **`cp` the commons layer** (§2.1) → `src/server/common/`; strip AI-quota error kind.
3. **`config/env.ts`** (t3-env, `@t3-oss/env-nextjs`) with `server` / `client` / `runtimeEnv` triad; then `server-config.ts` (`ServerConfig`) + `client-config.ts` (`ClientConfig`). Fold in all current env reads: `BETTER_AUTH_URL/SECRET`, `DATABASE_URL`, the `NEXT_PUBLIC_*` chain/wallet vars currently parsed by `lib/walletMode.ts` + `lib/chain.ts`, `SPONSOR_PK`, `WDK_INDEXER_API_KEY`, `MOONPAY_SECRET_KEY`, etc. `walletMode.ts`/`chain.ts` become thin readers over `ServerConfig`/`ClientConfig`. Update `.env.example`; add a `vitest` env block so node tests don't throw at `createEnv`.
4. **`authed` macro** (`src/server/auth/middleware/authed.ts`) — Elysia `.macro` resolving the session → injects `user` + `session`, else 401 envelope. Verbatim shape from myworkin.
5. **`clubAuthed` macro** (`src/server/auth/middleware/club-authed.ts`) — port `lib/clubAuth.ts` `requireClub()` (session → role==="club" → load `clubs` row) into a macro injecting `club`; 401/403/409 envelopes. Maps 1:1.
6. **Better Auth server** (`src/server/auth/auth.ts`): keep current config, add `basePath: "/api/v1/auth"`. Add an `authenticate()` `cache()` helper for RSC.
7. **Root `server/router.ts`:** `new Elysia({ prefix: "/api/v1" })` + `.mount(auth.handler)` + `@elysiajs/cors` + `@elysiajs/openapi` (dev-only) + `@elysiajs/server-timing` + `@logtape/elysia` logger + root `.onError` (VALIDATION → 400 envelope; else log + 500 envelope). `export type AppRouter = typeof app`. Health route `GET /health`.
8. **`app/api/v1/[...slugs]/route.ts`:** `export const { GET, POST, PUT, PATCH, DELETE, OPTIONS } = ... = app.fetch`; `export const maxDuration = 60`.
9. **Frontend rails:** `frontend/lib/eden.ts` (`createEdenTanStackQuery<AppRouter>()` + `treaty`), `query-client.ts` (SSR singleton, `staleTime:5000`, `throwOnError:true`), and wrap `providers.tsx`: `QueryClientProvider` → `EdenProvider` (same queryClient) around the existing `better-auth-ui` provider. `frontend/auth/auth.ts`: repoint `authClient` baseURL to `/api/v1/auth`.
10. **zod v3 → v4** across the repo (`import { z } from "zod/v4"` in domain schemas; update the 6 existing `safeParse` sites).
11. **logtape** init (`@logtape/logtape`) — replace `console.*` in server code with `getLogger([...])` as domains migrate.

Deps added (exact versions from myworkin `package.json`): `elysia@^1.4.28`, `@elysiajs/cors@^1.4.2`, `@elysiajs/eden@^1.4.9`, `@elysiajs/openapi@^1.4.15`, `@elysiajs/server-timing@^1.4.1`, `eden-tanstack-react-query@^0.1.10`, `@tanstack/react-query@^5.100.13`, `@t3-oss/env-nextjs@^0.13.11`, `@logtape/logtape@^2.2.1`, `@logtape/elysia@^2.2.1`, `drizzle-zod@^0.8.3`, and bump `zod` to `^4.4.3`. Keep `better-auth@^1.6.23` (already newer than reference).

Acceptance: `/api/v1/health` returns the envelope; OpenAPI renders in dev; existing handlers + pages still green; providers mount without hydration errors.

### P1 — `wallet` canonical slice (the template)

The first full vertical. Everything after copies its shape.

```
src/core/wallet/
  domain/
    schemas.ts        zod v4: fanPositionSchema, historyEntrySchema (bigints as z.string())
    types.ts          z.infer FanPosition/HistoryEntry + pure fns moved from lib/positions.ts:
                        investedFromShares(shares, sharePrice), percentOfRound(shares, supply)
    __tests__/positions.test.ts   (moved from lib/positions.test.ts)
  server/
    api/router.ts                       new Elysia({ prefix: "/wallet" }).use(getPositionsRoute).use(getHistoryRoute)
    api/routes/get-positions.route.ts   GET /positions, validate query { address } with zod, → service → envelope
    api/routes/get-history.route.ts     GET /history,   validate query { address }, → service → envelope
    services/get-fan-positions-service.ts   AsyncAppResult<FanPosition[]> — wraps getFanPositions, ok/err, deps-injected
    services/get-wallet-history-service.ts   AsyncAppResult<HistoryEntry[]> — wraps lib/indexer getHistory
    repository/find-verified-rounds.ts       "server-only" Drizzle (verified rounds + club join)
  client/
    hooks.ts          useWalletPositions(address) / useWalletHistory(address)
                        via useElysia().wallet.positions.get.queryOptions() (enabled: !!address)
```

- Chain reads (`shareBalance`, `pendingReward`, `totalShares`, `totalRaised`, `readSafely`) move to `server/chain/contracts.ts`; the service composes repository + chain.
- Route shape (from `docs/code-review/backend-api.md`): thin — call service, `if (!result.ok) return status(result.error.status, errorToResponse(result.error))`, else `status(200, CommonResponse.successful({ response }))`. Declare `response: { 200: successResponseSchema(...), 4xx/5xx: errorResponseSchema(...) }` + `detail.tags`.
- Query validation replaces the current `ADDRESS_RE = /^0x.../` regex with a zod `z.string().regex(...)` in the route's `query` schema. `wallet/positions` is public (no `authed`); revisit whether history should be session-scoped.
- **bigint on the wire:** schema fields stay `z.string()`; a `parsePosition` helper maps string → `bigint` at the read edge in `client/hooks.ts` (or a `select`). This replaces the hand-duplicated `components/wallet/types.ts` DTO + `parsePositionDTO`. Eden types the string end-to-end.
- **Client swap:** `components/wallet/WalletOverview.tsx` drops its hand-rolled `fetch` + `useState`/`useEffect` + `refresh()` and consumes `useWalletPositions` / `useWalletHistory`. WDK balance read stays client-side as-is.
- **Delete after green:** `app/api/wallet/positions/route.ts`, `app/api/wallet/history/route.ts`, the duplicated DTO parsers in `components/wallet/types.ts`.

Acceptance: the wallet page renders positions + history through Eden; old wallet handlers deleted; types flow end-to-end with no `any`; `positions.test.ts` green.

### P2..N — remaining domains (one spec each when reached)

Migrate in this order, each copying the P1 template, each its own dated design spec + plan:

1. **account** — `POST /account/wallet` link (mutation template; touches `authed` + upsert club/profile). Smallest write.
2. **clubs** — `GET /clubs/overview | /distributions | /holders` behind `clubAuthed`; the richest read domain (joins, chart data).
3. **rounds** — `GET /rounds`, `POST /rounds` (keep the on-chain `club()` verification before insert), `POST /rounds/:id/close-check`.
4. **directory** — public catalog (`listClubsWithRounds`, club detail); wire the marketing pages.
5. **ops** — faucet gas, mint USDT, moonpay on-ramp URL, `/sync` event-cache rebuild. Keep in-memory rate limits or move to a proper limiter.
6. **pricing** — usdt→fiat; later swap the 1:1 stub for WDK Price Rates.

### PF — cleanup / decommission

- Delete every remaining legacy `app/api/*` Route Handler once its domain is migrated (auth catch-all `app/api/auth/[...all]` removed once the client fully targets `/api/v1/auth`).
- Delete dead hand-rolled DTO types + `fetch().then(r=>r.json())` callers.
- Remove `better-sqlite3` + `ladoce.db*` once Postgres is the sole store and the data script is retired.
- Localize `docs/code-review/*` examples to La Doce paths (optional).

---

## 5. Cross-cutting rules (enforced every phase)

- **Config:** no `process.env` in feature code — go through `ServerConfig` / `ClientConfig`. New env var touches `env.ts` + `.env.example` + vitest env.
- **Types:** zod is the single type source (`z.infer`), no hand-written mirror types. Validate every boundary incl. GET query.
- **Errors:** services return `AppResult` (`ok`/`err(AppErrors.x)`), never `throw` for expected 4xx. Routes convert with `errorToResponse`.
- **Auth:** a route reading `user` has both `.use(authed)` and `authed: true`. Role-gated club routes use `clubAuthed`.
- **Data access:** repositories are `import "server-only"` + shared `db`; no ad-hoc `drizzle(...)`.
- **Logging:** `getLogger([...])` from `@logtape/logtape`; no `console.*` in `server/` or `core/`.
- **File size:** files < 500 lines; split into modules/hooks/helpers. Shared helpers → `utils.ts` / `utils/` at the smallest common scope.
- **No `any` / `as any` / `as unknown as` / `@ts-ignore`.** (Sanctioned envelope narrowings per `docs/code-review/sanctioned-patterns.md` are allowed.)
- **Self-custody / signing stays client-side** (§1.1) — never move a fan key or fan tx signing into the API.
- **Verification per phase:** `next build` + `tsc --noEmit` + tests green + app driven end-to-end; old + new paths both green under the strangler.

---

## 6. Open decisions (resolve at the phase that needs them)

1. **Postgres host** (P0a): Supabase (recommended, MCP available) / Neon / self-host on OCI. Affects `DATABASE_URL`, SSL config, and the prod deploy (currently OCI ARM + Caddy + systemd `ladoce.service`).
2. **`wallet/history` auth** (P1): keep public-by-address, or session-scope it. Current code is public.
3. **Rate limiting for `ops`** (P5): keep in-memory faucet limiters or adopt a durable limiter.
4. **`src/` adoption** (P0b): confirmed yes in §1; listed here only as the one reversible layout choice.

---

## 7. Deliverables map

- **This doc** = umbrella roadmap + P0a/P0b/P1 detail. Feeds `writing-plans` for the first phase.
- **`docs/code-review/*`** = the review rulebook (staged, verbatim).
- **P2..N** = one dated design spec each, written when the phase is reached.
