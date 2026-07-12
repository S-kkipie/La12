# Reusable components & files inventory

Catalog of shared helpers/components so reviewers push **reuse over reinvention**. If a change
re-implements one of these, flag it. All paths under `apps/myworkin-b2c/src` unless noted.

---

## Server helpers

| File | Purpose |
|------|---------|
| `server/common/responses/index.ts` | `CommonResponse`, `AppErrors`, `errorToResponse`, `ok`/`err`/`isOk`/`isErr`/`matchResult`, `successResponseSchema`/`createdResponseSchema`/`errorResponseSchema`, `STATUS_MAP`, types `APIResponse`/`AppResult`/`AsyncAppResult` — mandatory response/error toolkit |
| `server/common/timed.ts` | `timed(logger, label, fn)` — debug-logs async stage duration |
| `server/common/assert-course-access.ts` | `assertCourseAccess(userId, courseId)` — tier gate, `notFound` on denial (no existence leak) |
| `server/auth/middleware/authed.ts` · `extension-authed.ts` | the two API auth macros |
| `server/auth/require-onboarded-auth.ts` · `require-verified-auth.ts` | page-guard helpers |
| `server/auth/auth.ts` | `authenticate()` cached session read; Better Auth + Stripe subscription config |
| `server/firebase/repository.ts` | `BaseRepository<T>` for new Firestore collections |
| `server/drizzle/db.ts` · `schemas/index.ts` | single `db` handle + per-domain schema barrel |
| `server/stripe/client.ts` | single shared Stripe client |
| `core/billing/server/services/enforce-ai-quota.ts` | `assertAiQuota` / `recordAiUsage` for AI routes |

## Client hooks (`frontend/hooks/`)

| File | Purpose |
|------|---------|
| `use-data-table.ts` | `useDataTable` — manual-mode table engine (URL state, debounce, `pageCount`) |
| `use-mutation-refresh.ts` | `useMutationWithRefreshEden` + `EdenMutationOpts` |
| `use-mutate-search.ts` | `useMutateSearchParams` — `replaceSet/Delete`, `navigateWithParams` (`{scroll:false}`) |
| `use-tanstack-form.ts` | tanstack-form binding |
| `use-debounced-callback.ts` · `use-callback-ref.ts` · `use-mobile.ts` | debounce · ref · `useIsMobile` |

## Lib (`frontend/lib/`)

| File | Purpose |
|------|---------|
| `eden.ts` · `eden-server.ts` | `useElysia` client proxy · `ServerEden` prefetch proxy |
| `query-client.ts` | `getQueryClient()` singleton (`staleTime:5000`, `throwOnError:true`) |
| `result.ts` | `unwrapResult`/`resolveResult`/`describeError` — RSC error-unwrap seam |
| `format.ts` | `formatDate`/`formatRelativeTime`/`formatSoles`/`formatNumber`/`apiErrorMessage` (es locale) |
| `utils.ts` | `cn()` class merge |
| `routes.ts` | `routes` const — single source for internal paths |
| `stripe.ts` | `getStripe()` memoized `loadStripe` |
| `id.ts` · `parsers.ts` · `export.ts` · `nav-history.ts` · `compose-refs.ts` | `generateId` · nuqs parsers · CSV export · SPA history · ref compose |
| `data-table.ts` · `data-table-config.ts` | table operator/variant config |

## Shared UI components (`frontend/components/`)

| Path | Purpose |
|------|---------|
| `app/page-header.tsx` | `PageHeader` — standard `(app)` screen opener |
| `app/sidebar.tsx` · `top-bar.tsx` · `back-link.tsx` · `nav.ts` | app chrome + nav config |
| `app/coming-soon-panel.tsx` · `spotlight-grid.tsx` · `email-verification-banner.tsx` · `upcoming-webinars.tsx` | shared app widgets |
| `ui/*` | vendored shadcn primitives — **do not restyle** |
| `data-table/*` | table toolkit (toolbar, filters, pagination, skeleton, action-bar, description-cell) |
| `auth/*` | auth screens + settings (account/security) + `user/*` |
| `error-boundary.tsx` · `markdown.tsx` | `ErrorBoundary` (wired in providers) · Streamdown wrapper |
| `assistant-ui/*` · `landing/*` | coach chat primitives · marketing sections |

## Providers / context (`frontend/`)

| File | Purpose |
|------|---------|
| `providers/providers.tsx` | ordered root provider tree |
| `providers/theme-provider.tsx` | next-themes wrapper (drives `.dark`) |
| `context/auth-context.tsx` | `AuthProvider` + `useAuth()` |
| `context/logger-context.tsx` | `LoggerProvider` / `useChildLogger` |
| `auth/auth.ts` | `authClient` + `useSession()` |

## Domain schemas & types (`core/*/domain/`)

`schemas.ts` (zod) → `types.ts` (`z.infer`). Reuse these; don't redefine shapes. Table type surface:
`frontend/types/data-table.ts`.

## Cross-app

`packages/extension-protocol/src/protocol.ts` — the only shared zod wire protocol between extension and
b2c. `core/shared/domain/timestamp.ts` — the only thing under `core/shared` (timestamp helpers).
