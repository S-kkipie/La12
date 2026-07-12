# Backend — services & data (config, logging, Drizzle, Firestore, AI, Stripe)

Scope: `server/config`, `server/drizzle`, `server/firebase`, `server/ai`, `server/stripe`,
`server/email`, and the `server/services/` + `server/repository/` layers under `core/*`.

---

## 1. Config access `MAJOR`

Never read `env` / `process.env` in feature code — go through `ServerConfig` (server) or
`ClientConfig` (client).

- `config/env.ts` is the only `createEnv` (t3-env + zod). Only `server-config.ts` / `client-config.ts`
  import it. The only sanctioned raw `process.env` reads are `NODE_ENV` inside `server-config.ts`.
- `ServerConfig` exposes: `databaseURL`, `baseUrl`, `extensionOrigin`,
  `google{clientId,clientSecret,apiKey}`, `firebase{serviceAccount,jobsServiceAccount,storageBucket}`,
  `apify{token}`, `cloudflare{...stream}`, `liveEvents{adminToken}`, `liveChat{signingKey,moderators,wsUrl}`,
  `stripe{secretKey,webhookSecret,proPriceId,subscriptionWebhookSecret}`, `ses{...}`,
  `jobs{revalidateToken}`, `info{...}`, `isProduction`, `isDevelopment`.
- **Two Stripe webhook secrets** — `stripe.webhookSecret` (one-time payments) vs
  `stripe.subscriptionWebhookSecret` (Better Auth plugin). Don't cross them.

**Checks:**
- Flag any `process.env.*` or `from "@/config/env"` outside `config/server-config.ts` /
  `config/client-config.ts`. (Known existing exception:
  `core/cv-builder/server/services/export/render-pdf-from-html.ts` reads `PUPPETEER_EXECUTABLE_PATH`.)
- New env var → add to `env.ts` schema **and** surface via `ServerConfig`/`ClientConfig`; also mirror
  to `turbo.json` build.env + `vitest.config.ts` test.env (see [architecture-structure.md](./architecture-structure.md)).

---

## 2. Logging `MAJOR`

Always `getLogger(["scope","sub-scope"])` from `@logtape/logtape`; never `console.*`.

```ts
const log = getLogger(["server", "commerce", "webhook"]);
log.error("fulfil failed for {orderId}: {reason}", { orderId, reason });
```

- Server domain loggers use `["server","<domain>"]`. Message templates use `{placeholder}` + a props
  object, **not** string interpolation.

**Check:** flag `console.log/error/warn/info/debug` in `server/` and `core/`. (Known violation:
`core/live-events/catalog/server/services/reconcile-live-event-service.ts`.)

---

## 3. Drizzle (Postgres — money, auth, usage, threads) `MAJOR`

Transactional/relational store. `server/drizzle/db.ts`, `schemas/*`.

- Single shared `db` (`casing: "snake_case"`). Every repo is `import "server-only"` + `import { db }`.
  No ad-hoc `drizzle(...)`.
- Schema files are the source of truth; row types via `$inferSelect` / `$inferInsert` (e.g.
  `commerce-schema.ts` `Order`/`NewOrder`). New tables go in the matching per-domain
  `schemas/<domain>-schema.ts`, exported via `schemas/index.ts`.
- **Money in integer minor units** with non-negative `check()` constraints.
- **Financial FKs `onDelete: "restrict"`** — never lose payment/order history.
- `provider*Id` + `idempotencyKey` columns are `unique`.
- Counters / idempotent writes use atomic SQL — never read-modify-write:
  ```ts
  .onConflictDoUpdate({ set: { count: sql`${aiUsage.count} + 1` } })
  ```
- Null-safe ordering: `orderBy(sql`... desc nulls last`)` (`find-latest-subscription.ts`).

**Checks:** new repo `import "server-only"` + shared `db`; money is minor units + non-negative check;
financial FKs restrict; provider/idempotency columns unique; counters atomic.

---

## 4. Firestore (catalog/enrollment documents) `MAJOR`

`server/firebase/repository.ts` + `core/**/repository/*-firestore-repo.ts`.

- Extend `BaseRepository<T>` as singletons; no `new Firestore()`.
- **Missing-key trap:** optional doc fields are *absent* (not null) on older docs. A `toSelectXxx`
  mapper defaults them (`?? 0`) and converts `Timestamp`→ISO before crossing the API boundary. Never
  spread `doc.data()` straight to the client. (`enrollments-firestore-repo.ts`)
- **zod `.nullable()` on a required key rejects a *missing* key** — Firestore omits absent fields →
  silent doc drops. Use `.optional()` / defaults for fields that may be absent.
  (`firestore-zod-nullable-missing-key.md`)
- In-memory sort (not `.orderBy`) is a deliberate choice to avoid composite-index requirements.
- Jobs domain uses a **second Firebase app** ("jobs" project); resolve the default app by `"[DEFAULT]"`.
  The jobs repo is **read-only** — never creates jobs. (`firebase-jobs-second-admin-app.md`, `jobs-repo-read-only.md`)

**Check:** new repo extends `BaseRepository`; optional fields defaulted in a `toSelect*` mapper;
Timestamps converted to ISO before leaving the server.

---

## 5. AI / LangChain / Gemini `MAJOR`

- Model IDs are constants inside the AI module; keys from `ServerConfig.google.apiKey`, never `env`.
  Clients are lazy singletons. `server/ai/gemini-embeddings.ts`, `core/coach/server/graph/coach-graph.ts`.
- **AI quota gate:** `assertAiQuota(userId, bucket)` **before** the model call (429
  `AI_QUOTA_EXCEEDED` with `detail{bucket,limit,plan}`), then `recordAiUsage(userId, bucket)` **after**
  success. `core/billing/server/services/enforce-ai-quota.ts`. Canonical:
  `core/cv-analysis/server/api/routes/analyze-cv.route.ts`.
- **The gate also applies to Next `app/api/**` streaming route handlers, not only the Elysia routers.**
  A model has TWO entry points — the gated Elysia `*.route.ts` and an ungated `app/api/.../stream/route.ts`
  used by the live streaming UI. Gating only the Elysia sibling leaves the model wide open, because the
  on-screen flow calls the stream route. Every `POST` in `app/api/**` that reaches Gemini must repeat the
  `assertAiQuota` → parse → `recordAiUsage` → stream sequence. Canonical:
  `app/api/cv-copilot/chat/route.ts`; both `app/api/cv-analyses/{from-builder,adapt}/stream/route.ts` were
  bypassing it (corrections-log #7). When auditing quota, grep `app/api` for `stream`/model calls, not just
  `*.route.ts`.
- Model IDs are scattered/hardcoded across ~16 files with no central config — a deprecated ID (e.g.
  `gemini-2.5-flash`) can 404 in prod. When a change touches models, verify the ID via an isolated
  `generateContent` curl (ListModels lies; sequential POSTs throttle to false 404).
- Embedding vectors assert exact `outputDimensionality` and deliberately omit `taskType` — documented
  subspace-matching invariant, not a bug.

**Check:** every AI-consuming route asserts quota before the model call and records usage only after
success (this caps our Gemini spend).

---

## 6. Stripe `BLOCKER`

- **Single shared client** `server/stripe/client.ts` (`import "server-only"`, from
  `ServerConfig.stripe.secretKey`, cached on `globalThis` outside prod). Never `new Stripe()` elsewhere.
- **Two payment flows:**
  1. **One-time course purchases** — custom, Drizzle-backed. `core/commerce/server/stripe/checkout.ts`
     creates a Hosted Checkout with `idempotencyKey = orderId` + `metadata{orderId,userId,courseId}`;
     service opens a `pending` order first. Order/payment state in `commerce-schema.ts` (Postgres).
  2. **Pro subscriptions** — Better Auth `@better-auth/stripe` plugin, configured in
     `server/auth/auth.ts`. Subscription rows live in the plugin-managed `subscription` table.
- **Webhooks verify the signature over the RAW request body** with the correct secret (payment vs
  subscription). `app/api/stripe/webhook/route.ts` → `verifyWebhookEvent`.
- **Webhook handlers are idempotent:** early-return on terminal state (`order.status === "completed"`),
  unique `idempotencyKey`, and return **non-2xx on partial failure** so Stripe retries and resumes
  from the failed step. `core/commerce/server/services/fulfill-order-service.ts`.
- **Entitlement is derived at request time** (`isPro` / `toPlanStatus` from the latest subscription row
  + `new Date()`), not a cached boolean. Same predicate powers `assertCourseAccess`.
  `core/billing/server/services/is-pro-service.ts`.

**Checks:** all Stripe calls go through `server/stripe/client.ts`; webhooks verify over the raw body
with the right secret; money-mutating handlers are idempotent and return non-2xx on partial failure;
Pro/entitlement checks derive from live subscription state.

---

## Reusable helpers (don't reinvent)

| File | Purpose |
|------|---------|
| `server/drizzle/db.ts` · `schemas/index.ts` | single `db` handle + schema barrel |
| `server/firebase/repository.ts` | `BaseRepository<T>` for new Firestore collections |
| `server/stripe/client.ts` | single shared Stripe client |
| `core/billing/server/services/enforce-ai-quota.ts` | `assertAiQuota` / `recordAiUsage` |
| `server/common/assert-course-access.ts` | tier-based course gate |
