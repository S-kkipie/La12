# Security review

Scope: auth gating, secrets, data leakage, ownership/authorization, injection, and PII. Cross-cuts
backend and extension. Pairs with the `security-reviewer` agent.

---

## 1. AuthN — is the route actually protected? `BLOCKER`

- API route reading `user`/`session` must have **both** `.use(authed)` and `authed: true` — one
  without the other silently disables the guard. `server/auth/middleware/authed.ts`.
- Extension routes (`/extension/*`) must have both `.use(extensionAuthed)` and `extensionAuthed: true`;
  the macro enforces the `extension` permission scope server-side. `server/auth/middleware/extension-authed.ts`.
- Protected server components/pages call `requireOnboardedAuth` / `requireVerifiedAuth`, not raw
  `authenticate()` (which returns `null` on failure instead of redirecting).
- Do not remove `session: { freshAge: 0 }` in `auth.ts` — it is deliberate (Better Auth ≥1.6.12 403s
  otherwise). But also don't *add* freshness gating that breaks `/list-sessions`, unlink, change-email.

**Check:** every mutating/data-reading API route has an auth macro *and* its boolean flag; every
protected page has a guard helper.

---

## 2. AuthZ — ownership & entitlement `BLOCKER`

Authentication ≠ authorization. A logged-in user must not reach another user's data or unpaid content.

- **Ownership in the query:** reads/writes scope by `userId` in the DB query itself, not after fetch.
  (`per-job-cv-analysis-integration.md` — "in-query ownership".)
- **Course access:** gate content routes with `assertCourseAccess(userId, courseId)`
  (`server/common/assert-course-access.ts`). On denial it returns **`notFound`**, not `forbidden` —
  deliberate, so it doesn't leak that the course exists.
- **Entitlement is derived live** from subscription state (`isPro` / `toPlanStatus`), never a cached
  boolean — a lapsed Pro loses access on the next request.

**Check:** a route returning user-scoped or paid data proves ownership/entitlement *before*
returning it; denial responses don't leak existence.

---

## 3. Secrets & config `BLOCKER`

- Secrets come from `ServerConfig` (backed by t3-env `env.ts`), never `process.env` in feature code and
  never hardcoded. See [backend-data-services.md](./backend-data-services.md) §1.
- Secrets never cross to the client: only `ClientConfig` / `NEXT_PUBLIC_*` values are client-safe.
  A secret imported into a `"use client"` file or a client component is a BLOCKER.
- The two Stripe webhook secrets are distinct — verifying a subscription event with the payment secret
  (or vice versa) silently fails auth.

**Check:** grep the diff for literal keys/tokens; confirm no server secret reaches client bundles.

---

## 4. No data leakage in responses/logs `MAJOR`

- `errorToResponse` **strips `cause`** from the wire and logs 5xx internals server-side only. Don't
  bypass it by returning raw error objects or `err.message` to the client.
- Client copy maps error `code` → neutral Spanish strings (`frontend/lib/format.ts` `apiErrorMessage`,
  `frontend/lib/result.ts` `describeError`) — never surface raw errors in the UI.
- LogTape→Sentry sink is scoped to `[myworkin]`, not catch-all, to limit PII/volume — keep it scoped.
  (`sentry-setup.md`)
- Firestore docs are mapped through `toSelect*` before leaving the server — don't spread `doc.data()`
  (may carry internal fields).

**Check:** no `err.message`/stack/`cause` on the wire; no raw error rendered in a component.

---

## 5. Input validation & injection `MAJOR`

- Every route validates its body/query/params with a zod schema in the Elysia schema-options object —
  no unvalidated `body`. Derive types from the schema (see [types-schemas.md](./types-schemas.md)).
- Drizzle parameterizes queries; raw `sql`...`` fragments must not interpolate untrusted input as text.
- **CV import** has a security contract: response-envelope reads, `errorToResponse` no-leak flow, and a
  dual size cap on uploads. The text path currently has no length bound — treat unbounded
  user-controlled input to AI/parsers as a finding. (`cv-import-contract-security.md`)

**Check:** every external input is zod-validated; no untrusted string built into raw SQL; upload/text
sizes are bounded.

---

## 6. Extension surface `MAJOR`

- Don't widen `permissions` / `host_permissions` in `wxt.config.ts`. Page access is optional-perm-gated
  (`optional_host_permissions: ["*://*/*"]`); side-panel clicks must not silently grant host access.
- The `extensionAuthed` macro clones the permissions array (Better Auth mutates it) — don't regress
  that to a shared reference.
- Extension↔b2c payloads go through the shared zod protocol
  (`packages/extension-protocol/src/protocol.ts`) — validate at the boundary, don't trust raw messages.

**Check:** no permission widening without justification; message payloads validated against the protocol.

---

## 7. Webhooks & idempotency `BLOCKER`

- Verify webhook signatures over the **raw** body with the correct secret.
- Money-mutating handlers are idempotent (early-return on terminal state, unique idempotency keys) and
  return **non-2xx on partial failure** so the provider retries. See
  [backend-data-services.md](./backend-data-services.md) §6.

**Check:** signature verified, handler idempotent, partial failure surfaces as retryable non-2xx.
