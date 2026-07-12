# Frontend — UI components, hooks & providers

Scope: `frontend/components/*`, `frontend/hooks/*`, `frontend/providers/*`, `frontend/context/*`, and
per-domain `core/*/client/ui/*`. For data-access rules see
[frontend-data-fetching.md](./frontend-data-fetching.md); for colors/spacing see [styling.md](./styling.md).

---

## 1. Every `(app)` screen opens with `PageHeader` `MAJOR`

`frontend/components/app/page-header.tsx` — title (`font-display`) + muted `<p>` description + optional
`role="tablist"` hairline row (`border-b border-border`) where the active tab draws a **2px primary
bar** via `after:h-0.5 after:bg-primary`. Purely presentational; screens own tab state
(`activeTab`/`onTabChange`) or use `href` tabs.

- **Don't** hand-roll screen `<header>` blocks or hardcode the primary bar.
- **Exceptions:** workspace screens with their own chrome — coach chat, `(builder)` cv-builder.

**Check:** a new `(app)` screen renders `<PageHeader>` first; no reinvented title/tab markup.

---

## 2. Don't restyle vendored primitives `MAJOR`

- `frontend/components/ui/*` — vendored shadcn (cva variants keyed to semantic tokens). **Do not edit.**
  Extend via `className` / variants at the call site.
- `core/cv-builder/client/cv-preview/templates/*` — standalone/PDF export templates, intentionally
  inline-styled. Leave inline styles alone.

**Check:** any change under `ui/*` or `cv-preview/templates/*` is flagged for justification.

---

## 3. Tables compose the data-table toolkit `MAJOR`

- **Server-driven tables:** `useDataTable` (`frontend/hooks/use-data-table.ts`) — manual mode
  (`manualPagination/Sorting/Filtering: true`), state synced to URL via nuqs (`page`/`perPage`/`sort` +
  per-column filter parsers), 300ms debounced filter writes. Requires `TData extends { id }` and a
  `pageCount`. Compose with `frontend/components/data-table/*` (toolbar, filters, pagination, skeleton,
  action-bar). Don't hand-roll `useReactTable` with client-side filtering on top.
- **Client-held data** (e.g. jobs portal, first-50-no-pager): use `useReactTable` +
  `manualPagination` + `pageCount: 1` + `DataTable hidePagination`. (`jobs-table-first50-no-pager.md`)
- **URL-seeded text filters arrive as `string[]`** — normalize with `filterValueToSearch` before
  `.trim()`, or SSR `?col=` deep links crash (typing doesn't crash, so tests/build miss it).
  (`usedatatable-url-seeded-filter-array.md`)

**Check:** server tables use `useDataTable` + `pageCount`; text-filter reads normalize `string[]`.

---

## 4. Reusable hooks `MINOR`

| Hook (`frontend/hooks/`) | Purpose |
|-------------------------|---------|
| `use-data-table.ts` | `useDataTable` manual-mode table engine |
| `use-mutation-refresh.ts` | `useMutationWithRefreshEden` |
| `use-mutate-search.ts` | `useMutateSearchParams` — `replaceSet/Delete`, `navigateWithParams` (all `{scroll:false}`) |
| `use-tanstack-form.ts` | form binding |
| `use-debounced-callback.ts` · `use-callback-ref.ts` · `use-mobile.ts` | debounce · ref · `useIsMobile` |

Per-domain hooks live in `core/<domain>/client/hooks.ts` (`"use client"`) — the canonical examples of
the Eden pattern. **Check:** shared behavior belongs in a hook, not copy-pasted into components.

---

## 5. Providers & context `MINOR`

- `frontend/providers/providers.tsx` — ordered client provider tree:
  `ThemeProvider(forcedTheme="dark")` → `ErrorBoundary` → `NuqsAdapter` → `QueryClientProvider` →
  `EdenProvider(client=apiClient, queryClient)` → `TooltipProvider` → `AuthUIProvider` →
  `QuotaPaywallProvider`. New global providers slot into the correct layer here.
- `getQueryClient()` (`frontend/lib/query-client.ts`) singleton — never `new QueryClient()`.
  Defaults: `staleTime: 5000`, `throwOnError: true` (errors bubble to `ErrorBoundary`).
- `frontend/context/auth-context.tsx` — `AuthProvider` + `useAuth()` (throws outside provider);
  session injected server-side in `app/(app)/layout.tsx`.
- `frontend/auth/auth.ts` — `authClient` (+ Stripe subscription plugin) + `useSession()`.

**Check:** no ad-hoc `QueryClient`; `useAuth`/`useSession` used, not re-fetched session.

---

## 6. Prefer shadcn over raw HTML `MINOR`

Use the shared shadcn components rather than raw `<button>`/`<input>` in B2C UI.
(`prefer-shadcn-components.md`) Export templates stay inline-styled.

---

## 7. Class merging & formatting helpers

### 7.1 Dates — date-fns + `es` locale, via the shared helpers `MAJOR`

- Format every displayed date/timestamp through `frontend/lib/format.ts`, which is **date-fns + `es`
  locale**. **Prefer `formatRelativeTime`** for timestamps (created / updated / expires / last-seen) —
  it yields `"hace 5 días"` / `"en 2 meses"`.
- **Never** `new Date().toLocaleDateString()` / `toLocaleString()`, inline `Intl.DateTimeFormat`, or a
  local `formatDate` helper in a component.
- **Check:** a component that formats a date does it via `formatRelativeTime` (or a shared date-fns
  helper), not `toLocaleDateString`/inline `Intl`/a hand-rolled helper.
- **Discrepancy:** the shared `formatDate` in `format.ts` is still `Intl`-based, not date-fns —
  prefer `formatRelativeTime`, and see `corrections-log.md` for the open decision on migrating it.

### 7.2 Other helpers `MINOR`

- Merge classes via `cn()` (`frontend/lib/utils.ts`), never manual string concat with conditionals.
- Numbers/money via `frontend/lib/format.ts` (`formatSoles`, `formatNumber`, `formatDuration`).
- Internal paths via `routes` (`frontend/lib/routes.ts`), not hardcoded strings.

---

## Sanctioned here — do NOT flag

- `key={index}` on static, non-reordering `.map()` lists (`noArrayIndexKey` off in `biome.json`).
- Relaxed Biome rules inside `frontend/components/{ui,data-table,auth}/**`.
- `<Link><PillButton>` (button-inside-anchor) — pre-existing convention; MINOR at most.
- `useGSAP` scope auto-reverting `ScrollTrigger.create` in landing motion modules.
- shadcn `data-active:` variant bridging to `data-state="active"`.

See [sanctioned-patterns.md](./sanctioned-patterns.md).
