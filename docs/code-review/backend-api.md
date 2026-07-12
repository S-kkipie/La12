# Backend — API layer (Elysia routing, envelope, errors, auth macros)

Scope: everything under `apps/myworkin-b2c/src/server/` and `core/*/server/api/`. Governs how HTTP
routes are shaped, how responses/errors cross the wire, and how routes opt into auth.

---

## 1. Route & router composition `BLOCKER`

One route = one Elysia instance = one `*.route.ts` file. A domain `router.ts` composes leaf routes
with `.use()`; the root `server/router.ts` composes all domain routers.

- **Root:** `server/router.ts` — `new Elysia({ prefix: "/api/v1" })`, mounts Better Auth, CORS,
  OpenAPI, serverTiming, logger, a root `.onError`, then `.use(<domainRouter>)` per domain. Mounted
  into Next at `app/api/v1/[...slugs]/route.ts` (`export const GET = app.fetch`, `maxDuration = 60`).
- **Domain router:** `core/billing/server/api/router.ts` —
  `new Elysia({ prefix: "/billing" }).use(routeA).use(routeB)`. **The prefix lives here.**
- **Leaf route:** `core/commerce/server/api/routes/create-checkout.route.ts` —
  `new Elysia().use(authed).<verb>(path, handler, schemaOpts)`. Relative path (`/checkout`), **no prefix**.

**Checks:**
- New route is its own `*.route.ts`, wired into its domain `router.ts`, which is `.use()`d in
  `server/router.ts`. The last step is easy to forget → the route silently 404s.
- Leaf route sets no `prefix` (prefixing belongs on the domain router).
- Route passes a schema-options object with `response`, `detail.tags`, `detail.summary` (drives OpenAPI).

---

## 2. Response envelope `BLOCKER`

Canonical wire shape — always a string `code` + numeric `status`, never bare data:

```ts
{ response?: T, code: string, status: number, targets?: string[], detail?: unknown }
```

- Success: `CommonResponse.successful({ response })` (200) / `CommonResponse.created({ response })`
  (201), wrapped in Elysia's `status(200, ...)`. `server/common/responses/api.ts`.
- The `response:` schema map uses factories per status:
  `successResponseSchema(dataSchema, "Name")`, `createdResponseSchema(...)`, `errorResponseSchema(<code>)`.
- `STATUS_MAP` (`server/common/responses/status.ts`) is the **closed set** of allowed statuses:
  `200/201/400/401/403/404/409/422/429/500`. No other status codes.

**Checks:**
- Handlers return via `CommonResponse.*` / `errorToResponse(...)` wrapped in `status(...)`; never
  `return data` directly.
- Every declared `response` status corresponds to a status the handler can actually return (and vice
  versa) — no dead branches, no undeclared statuses.

---

## 3. Errors via the Result pattern, not throws `BLOCKER`

Expected control flow (4xx) is modeled as values, not exceptions.

- Services return `AsyncAppResult<T>` = `Promise<Result<T, AppError>>`; build with `ok(...)` /
  `err(AppErrors.xxx(...))`. `server/common/responses/result.ts`, `app-error.ts`.
- Routes convert with `errorToResponse(result.error)` and forward `result.error.status`:

  ```ts
  if (isErr(result)) {
    return status(result.error.status as 404 | 409 | 422 | 500, errorToResponse(result.error));
  }
  ```
  `server/common/responses/error-converter.ts`, `create-checkout.route.ts`.

- `errorToResponse` logs 5xx `cause` to `getLogger(["server","error"])` but **strips `cause` from the
  wire**; 4xx stay quiet. `detail` only survives for `AI_QUOTA_EXCEEDED` (429).
- The root `.onError` in `server/router.ts` catches thrown/validation errors: validation →
  `{code:"VALIDATION", status:400}`; anything else logged + generic
  `{code:"INTERNAL_SERVER_ERROR", status:500}`.

**Checks:**
- Services return `AppResult` / `err(AppErrors.x)`, never `throw` for expected 4xx.
- New error kinds are added to the `AppError` union + `AppErrors` factory, not invented inline.
- No `throw` used as flow control in a service (throws are for truly exceptional / 500 cases).

---

## 4. Auth macros `BLOCKER`

Two distinct systems — API macros (Elysia) vs page guards (Next redirects). See
[security.md](./security.md) for the security-lens view.

- **API session:** `.use(authed)` **and** `authed: true` in the route options — **both**, or the
  macro doesn't run. Injects `user`/`session`; returns `CommonResponse.unauthorized()` (401) with no
  session. `server/auth/middleware/authed.ts`.
- **Extension API-key:** `.use(extensionAuthed)` + `extensionAuthed: true` on `/extension/*`. Injects
  `extensionUserId` (from apikey `referenceId`), enforces the `extension` permission scope server-side.
  `server/auth/middleware/extension-authed.ts`. It **clones** `extensionPermissions` because Better
  Auth mutates the passed array — don't pass the readonly record directly.
- **Page guards:** protected server components call `requireOnboardedAuth` / `requireVerifiedAuth`
  (`server/auth/`), not raw `authenticate()`. `redirect()` throws → the return is always non-null.
  `requireOnboardedAuth` **fails open** on onboarding-lookup error (deliberate; treats as onboarded).
- **`authenticate()`** (`server/auth/auth.ts`) — React `cache()`-wrapped session read; swallows errors
  → `null`. Use only where a null-tolerant read is intended.
- **freshAge gotcha:** `session: { freshAge: 0 }` in `auth.ts` is **deliberate** — Better Auth ≥1.6.12
  otherwise 403s (`SESSION_NOT_FRESH`) on `/list-sessions`, unlink-account, change-email. The apiKey
  `rateLimit.enabled: false` is deliberate too (per-user personal tokens, not public keys).

**Checks:**
- A route reading `user`/`session` has both `.use(authed)` and `authed: true`; extension routes have
  both `.use(extensionAuthed)` and `extensionAuthed: true`.
- Don't remove/alter `freshAge: 0` or the apiKey rateLimit disable without justification.
- Page-level protected server components use `requireOnboardedAuth`/`requireVerifiedAuth`, not raw
  `authenticate()`.

---

## 5. Reusable helpers (don't reinvent)

| File | Purpose |
|------|---------|
| `server/common/responses/index.ts` | `CommonResponse`, `AppErrors`, `errorToResponse`, `ok`/`err`/`isOk`/`isErr`/`matchResult`, `successResponseSchema`/`createdResponseSchema`/`errorResponseSchema`, `STATUS_MAP`, types `APIResponse`/`AppResult`/`AsyncAppResult` |
| `server/auth/middleware/authed.ts` · `extension-authed.ts` | the two API auth macros |
| `server/auth/require-onboarded-auth.ts` · `require-verified-auth.ts` | page-guard helpers |
| `server/common/assert-course-access.ts` | `assertCourseAccess(userId, courseId)` — tier gate, `notFound` on denial |
| `server/common/timed.ts` | `timed(logger, label, fn)` — debug-logs async stage duration |

## Sanctioned here — do NOT flag

- `status(result.error.status as 404 | 409 | ...)` narrowing and the `as { response: X }` unwrap —
  sanctioned envelope conventions, **not** `as unknown as`.
- Module-level `apiClient` alias in a `"use client"` file (non-hook context).

See [sanctioned-patterns.md](./sanctioned-patterns.md) for the full list.
