# P3+P4 — clubs + rounds slices design (combined)

**Date:** 2026-07-12
**Phase:** P3 (clubs) + P4 (rounds) of the Elysia migration roadmap — combined into one spec per user request ("move faster"). One combined implementation plan.
**Umbrella spec:** `docs/superpowers/specs/2026-07-11-la-doce-elysia-architecture-migration-design.md` §P2..N.
**Templates:** P1 wallet (`core/wallet/**`, reads + graceful-empty), P2 account (`core/account/**`, mutation + `authed`, atomic upsert, `useAccount()` factory hooks). The **`clubAuthed`** macro (`server/auth/middleware/club-authed.ts`) already exists (built in P0b) and is the P3/P4 write+club-read gate.

---

## 1. Goal

Migrate the club dashboard reads and the rounds lifecycle into the Elysia domain tri-layer:
- **clubs (P3):** `GET /clubs/overview | /clubs/distributions | /clubs/holders` behind `clubAuthed` — the richest read domain (on-chain joins, chart series, cap-table).
- **rounds (P4):** `GET /rounds` (public list), `POST /rounds` (create, `clubAuthed` + on-chain ownership verify), `POST /rounds/:id/close-check` (public, permissionless close).

This establishes the **`clubAuthed`** consumer template and the **multi-status route** template (holders 403, create 400/409) that later domains copy.

---

## 2. Decisions (locked with the user)

| Decision | Choice | Why |
|---|---|---|
| Spec structure | **One spec, both domains** | User: "haz p3 y p4 en una sola spec." |
| Execution plan | **One combined plan** (~13 tasks) | User choice. |
| Legacy-lib strategy | **Full move into domains + repoint RSC importers; delete `lib/clubRevenue.ts` + `lib/closeFunding.ts` + `lib/clubAuth.ts`** | Fiel 1:1, matches P1/P2 (which deleted their legacy libs). RSCs import the domain services directly (RSCs are server). |
| Client-hook convention | **`useClubs()` / `useRounds()` factory hooks** | Canonical per the P2 decision (myworkin style). |
| `rounds` list GET | **Público, zod query, no macro** | Matches the P1 "public reads by validated query" pattern; the round list is public catalog data. |
| `rounds` create gate | **`clubAuthed`** | The macro already emits exactly the legacy 401 (no session) / 403 (not club) / 409 (no club linked). Then the on-chain `club()` verify runs in the service. |
| `close-check` | **In P4 now**, keeps `lib/sponsor` as a legacy import | Umbrella lists it under rounds. The sponsored-close dep is ops (P6) — kept as-is, migrated later (same fence as P2's faucet). |
| Read failure UX | **Graceful-empty** (`ok(<empty shape>)` on catch) | Preserves the legacy 200-empty dashboards; P1-sanctioned for reads. |

---

## 3. Scope boundaries

- **`lib/sponsor.ts` stays legacy (ops/P6).** `close-check`'s moved `tryCloseFundingIfDue` still imports `closeFundingSponsored` from `@/lib/sponsor`. Not migrated here.
- **`lib/contracts.ts` stays** — it's the shared viem read/ABI layer (`publicClient`, `totalRaised`, `roundState`, `readSafely`, etc.), used across domains; not a migration target.
- **Directory (P5)** — the public club/round catalog (`lib/clubDirectory.ts`, marketing `page.tsx`/`clubs/page.tsx`/`ClubCard`) is NOT this phase. Those import `clubDirectory`, not `clubRevenue`, so they are untouched here.
- **Chain writes stay client-signed.** `create` only records a round after independently verifying ownership on-chain; it never signs. `close-check` performs the *permissionless* `closeFunding()` via the sponsor (anyone could send it) — the one sanctioned server-initiated tx, unchanged from legacy.

---

## 4. Legacy behavior being reproduced

### clubs
- `GET /api/club/overview` → `requireClub` (→ `clubAuthed`), `getClubOverview(club.id)` → `{ totals, rounds }`; try/catch → empty on failure.
- `GET /api/club/distributions` → `getClubDistributions(club.id)` → `{ distributions, series }`; empty on failure.
- `GET /api/club/holders?round=<addr>` → validate addr (400), verify the round belongs to this club **and is verified** (else **403**), `getRoundHolders(addr)` → `{ holders }`; empty on failure.

`lib/clubRevenue.ts` (server-only) holds: on-chain read orchestration (`getRoundInvestors`, `getRoundHolders`, `getClubOverview`, `getClubDistributions`), pure helpers (`cumulativeSeries`, `capUtilization`), domain types + DTO serializers. `LOG_WINDOW` (40k blocks) caps `eth_getLogs`.

### rounds
- `GET /api/rounds?clubId=&all=` → filters `clubId` + `verified` (unless `all=1`); returns raw round rows. Public.
- `POST /api/rounds` → session (401) + `role==="club"` (403) + club-linked (409) + zod body (400) + on-chain `club()` read matches `club.walletAddress` (400 on mismatch/unreadable) → insert `verified: true` → 201.
- `POST /api/rounds/:id/close-check` → round by id (404) → `tryCloseFundingIfDue` (reads on-chain, sponsors close if due, corrects `rounds.status`) → `{ status }`. Public, permissionless.

`lib/closeFunding.ts` holds pure `isFundingDue` / `mapOnChainStateToDb` + server-only `tryCloseFundingIfDue` (imports `lib/sponsor`).

Client consumers: `ClubOverview.tsx`, `RevenueDetail.tsx` (overview+distributions), `HoldersDialog.tsx` (holders), `CreateRoundForm.tsx` (create), `InvestForm.tsx` (close-check, fire-and-forget). Legacy-lib importers to repoint: `components/club/types.ts` (DTO types), `marketing/club/[slug]/page.tsx` (`tryCloseFundingIfDue`), the two `*.test.ts` (move to domain `__tests__`).

---

## 5. File structure

```
web/src/core/clubs/
  domain/
    schemas.ts        clubRoundSchema, clubTotalsSchema, distributionSchema, seriesPointSchema, holderSchema (DTOs), roundQuerySchema
    types.ts          ClubRound/ClubTotals/Distribution/SeriesPoint/Holder (bigints) + DTO z.infer + to/parse serializers
                      + pure capUtilization(), cumulativeSeries()
    __tests__/clubs-domain.test.ts   (moved from lib/clubRevenue.test.ts — pure helpers + DTO round-trip)
  server/
    repository/
      find-club-rounds.ts     verified rounds for a clubId (+ club name)
      find-owned-round.ts     round by (clubId, contractAddress, verified) → ownership check for holders
    services/
      get-club-overview-service.ts     deps-injected; on-chain totals + per-round enrich; graceful-empty
      get-club-distributions-service.ts deps-injected; Distributed logs → series; graceful-empty
      get-round-holders-service.ts     ownership check → err(forbidden 403) if not owned; getRoundHolders; graceful-empty
      chain-reads.ts                   getRoundInvestors/getRoundHolders on-chain orchestration (moved from clubRevenue)
    api/
      routes/{overview,distributions,holders}.route.ts   .use(clubAuthed)
      router.ts                        clubsRouter, prefix /clubs
  client/
    hooks.ts          useClubs() → useOverview, useDistributions, useHolders(roundAddress)

web/src/core/rounds/
  domain/
    schemas.ts        createRoundBodySchema, roundRowSchema (DTO), listRoundsQuerySchema, closeCheckParamsSchema, closeCheckResultSchema
    types.ts          Round DTO helpers + pure isFundingDue(), mapOnChainStateToDb()
    __tests__/rounds-domain.test.ts    (moved from lib/closeFunding.test.ts — pure fns)
  server/
    repository/
      list-rounds.ts          filter clubId / verified
      insert-round.ts         insert verified round → row
      find-round-by-id.ts     by numeric id
      update-round-status.ts  correct rounds.status
    services/
      list-rounds-service.ts  public; deps-injected filter → ok(rows)
      create-round-service.ts club + body → on-chain club() verify (400) → insert → ok(row) [201]
      close-check-service.ts  findById (404) → tryCloseFundingIfDue → ok({status})
      try-close-funding.ts    moved tryCloseFundingIfDue (imports @/lib/sponsor — P6 legacy)
    api/
      routes/{list-rounds,create-round,close-check}.route.ts
      router.ts               roundsRouter, prefix /rounds
  client/
    hooks.ts          useRounds() → useList(query), useCreate (mutation+invalidate), useCloseCheck (mutation)

Wire: web/src/server/router.ts → .use(clubsRouter).use(roundsRouter) after .use(accountRouter)
Delete: lib/clubRevenue.ts, lib/closeFunding.ts, lib/clubAuth.ts, app/api/club/** (3), app/api/rounds/** (2)
Repoint: components/club/types.ts (→ core/clubs/domain), marketing/club/[slug]/page.tsx (→ core/rounds/server/services/try-close-funding)
Cutover: ClubOverview.tsx, RevenueDetail.tsx, HoldersDialog.tsx, CreateRoundForm.tsx, InvestForm.tsx
```

---

## 6. Key design details

### 6.1 Graceful-empty in services (reads)
`overview`/`distributions`/`holders` services wrap orchestration in `try/catch`; on catch return `ok(<empty shape>)` (`{ totals: zeroTotals, rounds: [] }`, `{ distributions: [], series: [] }`, `[]`). Individual on-chain reads stay `readSafely`-wrapped (0n/[] fallback), so a single dead RPC degrades gracefully; only a catastrophic failure (DB down) hits the outer catch → still 200-empty, matching legacy UX. These routes therefore never emit 500 from the service.

### 6.2 holders 403 — the multi-status route exemplar
`get-round-holders-service` returns `err(AppErrors.forbidden())` when the requested `round` is not a verified round of the caller's club. So `holders.route.ts` MUST widen beyond the wallet template's `as 500`:
```ts
if (!result.ok) return status(result.error.status as 403 | 500, errorToResponse(result.error));
// response map: { 200, 401: errorResponseSchema(401), 403: errorResponseSchema(403), 500: errorResponseSchema(500) }
```
(401 documents the `clubAuthed` short-circuit; the service itself only ever emits 403 here, since reads are graceful-empty.) This is the concrete realization of the P1 TEMPLATE NOTE — P3+ copy this shape.

### 6.3 rounds create — clubAuthed + on-chain ownership verify
Route `.use(clubAuthed)` → injects `club` (401/403/409 handled by the macro). Service `createRoundService(club, body)`:
1. Read the deployed round's `club()` via `publicClient.readContract` (unreadable → `err(AppErrors.invalidBody({ targets: ["contractAddress"] }))` = 400).
2. If `onChainClub.toLowerCase() !== club.walletAddress.toLowerCase()` → `err(AppErrors.invalidBody({ targets: ["contractAddress"] }))` = 400 (contract not owned).
3. Else insert `verified: true` → `ok(row)`.
Route emits **201** on success (`CommonResponse.created`), maps `result.error.status as 400 | 500`; response map `{ 201, 400, 401, 403, 409, 500 }`. `RoundFactory.createRound` is permissionless, so this on-chain check is load-bearing security — a session+role gate alone is insufficient (comment carried over verbatim).

### 6.4 close-check — public mutation, permissionless
Route POST `/:id/close-check`, no macro, `params: closeCheckParamsSchema` (`{ id: z.coerce.number().int() }`). Service: `findRoundById` → `err(AppErrors.notFound())` (404) if missing; else `tryCloseFundingIfDue(round)` → `ok({ status })`. `tryCloseFundingIfDue` moves verbatim (still imports `@/lib/sponsor` — P6). Response map `{ 200, 404, 500 }`. Public + permissionless is preserved (legacy rationale: it only sends the same `closeFunding()` anyone could send).

### 6.5 Money discipline
All amounts (`goal`, `sharePrice`, `raised`, `distributed`, `received`, `credited`, `refunded`, `shares`, `claimable`) are USD₮ base-unit **bigints**, serialized to **strings** on the wire (JSON has no bigint), parsed back to bigint at the client edge (`select`/parse serializers) — exactly as P1 wallet. Scalars (`revenueBps`, `capMultiple`, `roundId`, `pct`, `capUtilizationPct`, `ts`, `timestamp`) stay numbers. `deadline` is ISO string on the wire.

### 6.6 Client hooks (factory, per P2 decision)
```ts
export const useClubs = () => {
  const elysia = useElysia();
  const useOverview = () => useQuery({ ...elysia.clubs.overview.get.queryOptions(), select: parse… });
  const useDistributions = () => useQuery({ ...elysia.clubs.distributions.get.queryOptions(), select: parse… });
  const useHolders = (round?: string) => useQuery({ ...elysia.clubs.holders.get.queryOptions({ query: { round: round ?? "" } }), enabled: !!round, select: parse… });
  return { useOverview, useDistributions, useHolders };
};
export const useRounds = () => {
  const elysia = useElysia(); const queryClient = useQueryClient();
  const useList = (query) => useQuery({ ...elysia.rounds.get.queryOptions({ query }) });
  const useCreate = () => useMutation(elysia.rounds.post.mutationOptions({ onSuccess: () => queryClient.invalidateQueries({ queryKey: elysia.rounds.get.queryKey() }) }));
  const useCloseCheck = () => useMutation(elysia.rounds({ id }).["close-check"].post.mutationOptions(...)); // fire-and-forget in InvestForm
  return { useList, useCreate, useCloseCheck };
};
```
`useCloseCheck` call-shape (path param `:id`) is confirmed against the eden treaty at plan time; `InvestForm` currently fires `fetch(.../close-check)` and ignores the result — the hook keeps that fire-and-forget behavior.

---

## 7. Error / status semantics

| Route | Statuses |
|---|---|
| `GET /clubs/overview` | 200 (+401/403/409 from `clubAuthed`) |
| `GET /clubs/distributions` | 200 (+401/403/409) |
| `GET /clubs/holders` | 200, **403** (not owned) (+401/409 macro), 422 (bad `round` addr → onError) |
| `GET /rounds` | 200, 422 (bad query → onError) |
| `POST /rounds` | 201, **400** (onchain verify), 401/403/409 (macro), 422 (bad body), 500 |
| `POST /rounds/:id/close-check` | 200, **404** (no round), 422 (bad id), 500 |

Validation (zod) errors are 422 with array `targets`, handled by the root `onError` (untouched — the P1 fix).

---

## 8. Testing

- **Pure domain:** `capUtilization`, `cumulativeSeries` (clubs); `isFundingDue`, `mapOnChainStateToDb` (rounds); DTO round-trip serializers (bigint precision). No DB — plain `tsx --test`.
- **Repository (live pg, `--conditions=react-server` + `DATABASE_URL`):** `find-club-rounds` (verified filter, seeded `deportivo-san-martin`), `find-owned-round` (owned vs not), `list-rounds` (clubId/all filters), `insert-round` + `find-round-by-id` + `update-round-status` (self-cleaning temp rows, like P2). `pnpm db:migrate-pg` before.
- **Services (deps-injected, fakes):** overview/distributions map correctly + graceful-empty on throw; holders → `err(forbidden)` when not owned; create → `err(invalidBody)` on ownership mismatch, `ok` + insert on match; close-check → `err(notFound)` on missing, `ok({status})` via injected `tryClose`.
- **Manual/live:** club session → `/dashboard` overview+distributions render (200); holders for an owned round → 200, for a foreign/unverified round → 403; `GET /api/v1/rounds?clubId=1` → 200 list; create with a non-owned contract → 400 `targets:["contractAddress"]`; close-check on a real round id → 200 `{status}`, bad id → 404.

---

## 9. Global constraints (inherited)

- `pnpm exec tsc --noEmit` (in `web/`) EXIT 0 authoritative (`drizzle-orm` duplicate-instance TS2345 = known stale-transitive false positive; PF removes it).
- Server-only-importing tests run with `node --conditions=react-server` + live `DATABASE_URL`; `pnpm db:migrate-pg` restores seeded data before live repo tests; live repo tests self-clean temp rows.
- Elysia validates with **zod** (422, array `path`); root `onError` already correct — do not touch.
- Money on wire = strings, parsed to bigint at the read edge. Never `Number()` on money.
- `clubAuthed` injects `club`+`user`+`session`, short-circuits 401/403/409. Identity from session, never body.
- Self-custody: server never holds keys; chain writes stay client-signed. `close-check`'s sponsored `closeFunding()` is the one sanctioned permissionless server tx (unchanged).
- `useAccount()`/`useClubs()`/`useRounds()` factory-hook convention is canonical.
