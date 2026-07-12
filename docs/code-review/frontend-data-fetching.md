# Frontend — data fetching (Eden `useElysia` proxy, RSC services, Next 16 caching)

Scope: how the client and server components reach the API. The single most-violated area, so review
it closely.

---

## 1. `useElysia()` options proxy — mandatory in client hooks/components `MAJOR`

Defined in `frontend/lib/eden.ts`:

```ts
const { EdenProvider, useEden } = createEdenTanStackQuery<AppRouter>();
const useElysia = () => useEden().api.v1;        // typed options proxy, rooted at /api/v1
const apiClient = treaty<AppRouter>(BASE_URL);   // raw treaty (restricted — see §5)
```

### 1.1 Bind the domain once
```ts
const client = useElysia()["cv-builder"];   // then everything hangs off `client`
```
Canonical: `core/cv-builder/client/hooks.ts`, `core/cv-analysis/client/hooks.ts`.
**Check:** no repeated `useElysia()[...]` chains inline.

### 1.2 Options factories, not hand-rolled keys
```ts
useQuery(client.me.get.queryOptions());
useMutation(client.x.post.mutationOptions());
const LIST_KEY = client.me.get.queryKey();                 // for invalidation
// disabled-until-id:
useQuery({ ...client({ id }).get.queryOptions(), enabled: !!id });
```
Runtime-variable path (id unknown at hook build) → per-call fetcher:
```ts
mutationFn: (id) => client({ id }).proc.mutationOptions().mutationFn(input);
```
**Check:** no hand-built `queryFn`/`queryKey`/`mutationFn` when the proxy expresses it.

### 1.3 Read from the envelope
Consumers read `data.response`, never `data` directly:
```ts
const items = listQuery.data?.response ?? [];
```

### 1.4 Unwrap mutation results with a plain cast `MINOR`
Eden's `mutationOptions().mutationFn` returns `TData = unknown`, so read the result via a precise
plain accessor — this is **sanctioned**, it is not `as unknown as`:
```ts
const { response } = result as { response: CvAnalysis };
```
Queries are fully typed and need no cast. Canonical: `core/cv-analysis/client/use-direct-adapt-cv.ts`,
`core/jobs/matching/client/hooks-match.ts`. A typed proxy alias is also fine when needed:
```ts
type BillingProxy = EdenOptionsProxy<AppRouter>["api"]["v1"]["billing"];
const billing = useElysia().billing as BillingProxy;
```

### 1.5 `useMutationWithRefreshEden` for server-rendered invalidation `MAJOR`
Mutations that change server-rendered data use `useMutationWithRefreshEden`
(`frontend/hooks/use-mutation-refresh.ts`) — it chains the caller's `onSuccess`, then
`invalidateQueries({queryKey}) + router.refresh()`. Canonical: `core/cv-analysis/client/hooks.ts`.

> **Caveat:** `router.refresh()` re-suspends `use()`/Suspense subtrees back to skeleton. For
> client-only state (e.g. the "Buscando…" bug) use a plain mutation + `isPending`, not `router.refresh()`.
> (`router-refresh-resuspends-streamed-rsc.md`)

**Check:** mutations that mutate server-rendered data use `useMutationWithRefreshEden`, not a bare
`router.refresh()`; client-only state does the opposite.

---

## 2. Raw `apiClient` only outside hooks/components `MAJOR`

`apiClient` (raw treaty) is allowed **only** in:
- provider wiring — `frontend/providers/providers.tsx`
- assistant-ui runtime adapters — `core/coach/client/ui/runtime/*-adapter.ts`
- other imperative module/factory code — `core/extension/client/hooks.ts`,
  `core/linkedin/client/hooks/use-linkedin-connection.ts`

It is **forbidden** in a `.tsx` component or a React-Query hook — those go through `useElysia()`.
A module-level `apiClient` alias in a `"use client"` file (non-hook context) is sanctioned.

**Check:** `import { apiClient }` inside a component or a `useQuery`/`useMutation` hook is a violation.

---

## 3. Server components fetch via service functions, NOT `ServerEden` `MAJOR`

RSCs import server service functions directly (`core/*/server/services/*`, which return `AppResult`),
then unwrap with `resolveResult` / `unwrapResult` (`frontend/lib/result.ts`) for Suspense +
`ErrorBoundary`. They must never call `useElysia`/`apiClient`.

- `ServerEden` (`frontend/lib/eden-server.ts`) exists only for explicit prefetch-hydration cases — not
  the default. (`no-servereden-use-services.md`)
- Pages are thin: `await params`, run the auth guard, render a client screen.
  `app/(app)/jobs/[id]/page.tsx`, `app/(app)/cv/page.tsx`.

**Check:** an RSC importing `useElysia`/`apiClient`, or reaching for `ServerEden` where a direct
service call fits, is a violation. `params` is a `Promise` — must be `await`ed.

---

## 4. Next 16 caching `MAJOR`

- Caching is `use cache` + `cacheLife` / `cacheTag` (`next/cache`). Cache profiles live in
  `core/jobs/catalog/server/cache/*` (`"jobMatch"`, `"catalogBucket"`, shared `CATALOG_CACHE_TAG`).
- Invalidate via `cacheTag` + `updateTag` / `revalidateTag` (**two-arg** form), not route-level revalidate.
- **No `export const runtime` / `dynamic` / `revalidate` / `fetchCache` in route files** — incompatible
  with `use cache`; a grep across `app/` returns zero. Adding one is a violation.
- `_folders` are unrouted; Data-Cache entries >2MB need sharding. (`next16-caching-gotchas.md`)
- The `use client` function-prop warning (Next 71007) is non-fatal — don't rename handlers to `*Action`.
  (`next-71007-advisory.md`)

**Check:** no `export const runtime`/`dynamic`/`revalidate`; invalidation uses `cacheTag`/`updateTag`.

---

## Reusable helpers

| File | Purpose |
|------|---------|
| `frontend/lib/eden.ts` · `eden-server.ts` | `useElysia` proxy · `ServerEden` prefetch |
| `frontend/lib/query-client.ts` | `getQueryClient()` singleton (`staleTime:5000`, `throwOnError:true`) |
| `frontend/lib/result.ts` | `unwrapResult`/`resolveResult`/`describeError` — RSC error-unwrap seam |
| `frontend/hooks/use-mutation-refresh.ts` | `useMutationWithRefreshEden` + `EdenMutationOpts` |
