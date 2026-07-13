# P5+P6 — directory + ops slices design (combined, parallel worktree)

**Date:** 2026-07-12
**Phase:** P5 (directory) + P6 (ops) of the Elysia migration roadmap — combined into one spec, executed in a **separate git worktree in parallel with P3+P4** (which runs on `main`).
**Umbrella spec:** `docs/superpowers/specs/2026-07-11-la-doce-elysia-architecture-migration-design.md` §P2..N.
**Sibling spec (parallel):** `docs/superpowers/specs/2026-07-12-p3-p4-clubs-rounds-slice-design.md` (clubs+rounds, on `main`).
**Templates:** P1 wallet (public reads, graceful-empty), P2 account (mutation + `useAccount()` factory hooks), P4 rounds public-route pattern.

---

## 1. Goal

- **directory (P5):** the public club/round catalog — `GET /directory` (every club with a verified round, most-funded first). Migrate `lib/clubDirectory.ts` into `core/directory/`; repoint the marketing RSC pages.
- **ops (P6):** the server-initiated helpers — `POST /ops/faucet` (sponsor gas), `POST /ops/faucet-usdt` (mint test USD₮), `POST /ops/moonpay` (on-ramp URL), `POST /ops/sync` (event-cache rebuild). Migrate the four `app/api/*` routes into `core/ops/`.

Pricing (`lib/pricing.ts`, usdt→fiat) is **P7**, not this phase.

---

## 2. Decisions (locked with the user)

| Decision | Choice | Why |
|---|---|---|
| Partition | **P5+P6 here (worktree), P3+P4 on main** | User: "p3 y p4 en main y p5 y p6 en worktree." |
| Execution | **Parallel git worktree**, branched from `main@d0f855c` (has P0a–P2, NOT P3/P4) | User: "en worktrees diferentes y en paralelo." |
| Router wiring | **Accept one trivial `server/router.ts` merge conflict** at merge time (union the `.use()` lines) | User choice; no new abstraction. |
| Client-hook convention | **`useDirectory()` / `useOps()` factory hooks** (only where a client consumer exists) | Canonical per P2. |

### Decoupling constraints (MANDATORY — these keep the parallel worktrees conflict-free)
1. **Do NOT edit `web/src/db/schema.ts`.** Both P5 and P6 use existing tables (`clubs`, `rounds`, `events`). Zero schema change. (P3+P4 also doesn't touch it — so no conflict there either.)
2. **Do NOT relocate `web/src/lib/sponsor.ts`.** It is a shared viem-relayer engine that P4 (`try-close-funding`, on `main`) imports. P6's faucet service **wraps** `fundGas` from `@/lib/sponsor` in place; it does not move or rename it. (`lib/faucetUsdt.ts` and `lib/moonpay.ts` are imported ONLY by their own routes, so they MAY move into `core/ops/server`; `lib/sponsor.ts` must not.)
3. **P5 directory stays table-direct.** `core/directory` repository queries the `clubs`/`rounds` tables directly (as `lib/clubDirectory.ts` already does). It does NOT import `core/clubs` or `core/rounds` (those live on `main`, absent from this worktree).
4. **Only `server/router.ts` is a shared edit** with the P3+P4 branch. This worktree adds `.use(directoryRouter).use(opsRouter)`; that is the single expected merge conflict.

---

## 3. Legacy behavior being reproduced

### directory
- `lib/clubDirectory.ts::listClubsWithRounds()` — inner-join `clubs`×`rounds` on `verified`, enrich each with on-chain `totalRaised` (`readSafely` → 0n on RPC failure), sort by funded `pct` desc. Pure `computeFundedPct(raised, goal)`. Type `ClubWithRound = { club, round, raised, pct }`.
- Importers (all RSC, server-side — no HTTP): `marketing/page.tsx`, `marketing/clubs/page.tsx`, `components/ClubCard.tsx` (type only).

### ops
- `POST /api/faucet` → `fundGas(address)` from `lib/sponsor` (sponsor Sepolia ETH; best-effort). Body `{ address }`.
- `POST /api/faucet-usdt` → `mintTestUsdt(address)` from `lib/faucetUsdt` (MockUSDT mint). Body `{ address }`.
- `POST /api/moonpay` → `buildOnRampSession(address, amountUsd)` from `lib/moonpay` (signed widget URL). Body `{ address, amountUsd }`.
- `POST /api/sync` → rebuild `events` cache from on-chain logs. Body `{ … }` (confirm shape in plan from the route source).

Client consumers: `useEnsureWallet` (P2, on `main`) `fetch("/api/faucet")` best-effort; `AddFundsDialog` (faucet / faucet-usdt / moonpay buttons); a sync trigger (confirm in plan). **Note:** `useEnsureWallet` lives on `main@d0f855c` (present in this worktree's base) — P6 repoints its `fetch("/api/faucet")` to the ops hook. P3+P4 does not touch `useEnsureWallet`, so this edit is conflict-free.

---

## 4. File structure

```
web/src/core/directory/
  domain/
    schemas.ts         clubWithRoundSchema (DTO: club fields + round fields + raised string + pct)
    types.ts           ClubWithRound (bigints) + DTO z.infer + to/parse serializers + pure computeFundedPct()
    __tests__/directory-domain.test.ts   (pure computeFundedPct + DTO round-trip)
  server/
    repository/
      list-clubs-with-rounds.ts   import "server-only"; inner-join clubs×rounds verified → rows (TABLE-DIRECT)
    services/
      list-directory-service.ts   deps-injected; enrich on-chain totalRaised, sort by pct; graceful-empty (ok([]))
    api/
      routes/list-directory.route.ts   public GET "/", { 200 }
      router.ts                        directoryRouter, prefix /directory
  # No client hook: current consumers are RSC pages that import the service directly (YAGNI on a hook).

web/src/core/ops/
  domain/
    schemas.ts         addressBodySchema ({address}), moonpayBodySchema ({address, amountUsd}), syncBodySchema,
                       faucetResultSchema, moonpaySessionSchema, syncResultSchema
  server/
    services/
      fund-gas-service.ts       wraps fundGas(@/lib/sponsor)   [sponsor stays in place — constraint 2]
      mint-usdt-service.ts      wraps mintTestUsdt (lib may move into core/ops/server or stay — only P6 imports it)
      moonpay-service.ts        wraps buildOnRampSession
      sync-service.ts           rebuild events cache (writes events table)
    api/
      routes/{faucet,faucet-usdt,moonpay,sync}.route.ts   public POSTs (auth per legacy — confirm in plan)
      router.ts                 opsRouter, prefix /ops
  client/
    hooks.ts           useOps() → useFundGas, useMintUsdt, useMoonpay (mutations); AddFundsDialog + useEnsureWallet consume

Wire (the one shared edit): web/src/server/router.ts → .use(directoryRouter).use(opsRouter)
Repoint (RSC, directory): marketing/page.tsx, marketing/clubs/page.tsx, components/ClubCard.tsx → core/directory (service + DTO type)
Repoint (client, ops): useEnsureWallet (@/core/account/client/use-ensure-wallet) fetch("/api/faucet") → useOps().useFundGas; AddFundsDialog → useOps()
Delete: lib/clubDirectory.ts; app/api/faucet, app/api/faucet-usdt, app/api/moonpay, app/api/sync (4 routes); optionally lib/faucetUsdt.ts + lib/moonpay.ts if moved into core/ops
KEEP (do not touch): lib/sponsor.ts, lib/contracts.ts, lib/chain.ts
```

---

## 5. Key design details

### 5.1 directory — public, graceful-empty, table-direct
`list-directory-service` mirrors P1 wallet reads: deps-injected (`listRows` + on-chain `totalRaised`), wraps orchestration in try/catch → `ok([])` on catastrophic failure; individual reads `readSafely`-wrapped (0n). Route is public (no macro), `{ 200: successResponseSchema(z.array(clubWithRoundSchema), "Directory") }`. RSC pages import `listDirectoryService` (or the repo/service) directly — server-to-server, no HTTP round trip.

`ClubWithRound` carries whole `club` + `round` rows. On the wire, the bigint money fields (`round.goal`, `raised`) are **strings**; `round.deadline`/`createdAt` are ISO strings; scalars stay numbers. The DTO serializer (`toClubWithRoundDTO`/`parse`) handles it — the plan spells out exactly which `round`/`club` fields serialize.

### 5.2 ops — mutations wrapping legacy engine libs
Each ops service is a thin `AsyncAppResult` wrapper around the existing engine (`fundGas`, `mintTestUsdt`, `buildOnRampSession`, sync logic). They are **best-effort side-effects**, not money-truth — so a failure returns `err(AppErrors.unexpected)` → 500, and the callers already tolerate it (the faucet toast, AddFundsDialog fallbacks). Bodies validate `address` (0x-40-hex) / `amountUsd` (positive) via zod (422 on bad input). Routes are **public** (faucet/moonpay are pre-wallet-funding helpers — no session yet); confirm each route's legacy auth in the plan and preserve it.

**`fund-gas-service` imports `fundGas` from `@/lib/sponsor` (unchanged path)** — constraint 2. This is the seam that keeps P4 (main) and P6 (worktree) independent: both import the same in-place `lib/sponsor.ts`.

### 5.3 sync — event-cache rebuild
`sync-service` rebuilds the `events` cache (invest/distribute/claim/close) from on-chain logs into the existing `events` table. It is rebuildable/idempotent (money truth stays on-chain — CLAUDE.md). Writes the `events` table but **does not alter its schema** (constraint 1). Preserve the legacy body shape + any rate-limit.

### 5.4 Client hooks
`useOps()` factory: `useFundGas`/`useMintUsdt`/`useMoonpay` as `useMutation(elysia.ops.<x>.post.mutationOptions(...))`. `useEnsureWallet`'s best-effort `fundGasBestEffort` switches from `fetch("/api/faucet")` to `useOps().useFundGas().mutateAsync(...)` — but note `fundGasBestEffort` is currently a bare function inside the hook; keep it best-effort (swallow errors to a toast). No directory client hook (RSC-only consumers).

---

## 6. Error / status semantics

| Route | Statuses |
|---|---|
| `GET /directory` | 200 (graceful-empty; no macro) |
| `POST /ops/faucet` | 200, **429** (per-address throttle — restored from legacy, §2), 422 (bad address), 500 |
| `POST /ops/faucet-usdt` | 200, **429** (throttle), 422, 500 |
| `POST /ops/moonpay` | 200, 422 (bad address/amount), 500 |
| `POST /ops/sync` | 200, **404** (round not found) / **403** (round not verified), 422, 500 |

faucet/faucet-usdt widen the wallet template cast to `as 429 | 500` + `429: errorResponseSchema(429)` (the per-address in-memory throttle: `SPONSOR_PK` funds a real relayer, so an unthrottled public POST is a drain vector — the legacy routes threw 429, this is preserved). sync widens to `as 403 | 404 | 500` (its allowlist check). moonpay stays `{200,500}`. Validation (zod) = 422 array `targets`, handled by root `onError` (untouched).

---

## 7. Testing

- **Pure domain:** `computeFundedPct` (directory) + DTO round-trips (bigint precision). Plain `tsx --test`.
- **Repository (live pg):** `list-clubs-with-rounds` returns the seeded `deportivo-san-martin` + its verified round (read-only, `--conditions=react-server` + `DATABASE_URL`, `db:migrate-pg` first).
- **Services (deps-injected, fakes):** directory maps + sorts by pct + graceful-empty on throw; ops services delegate to injected engine fakes and wrap results/errors correctly (no live relayer/RPC in tests).
- **Manual/live:** `GET /api/v1/directory` → 200 list sorted by pct; `POST /api/v1/ops/faucet {address}` → 200 (or graceful 500 if relayer dry); `POST /api/v1/ops/moonpay {address, amountUsd}` → 200 with widget URL; marketing home + `/clubs` still render the catalog via the repointed service.

---

## 8. Parallel-execution playbook (worktree)

1. **Worktree:** create off `main@d0f855c` (post-P2, pre-P3/P4) via the `superpowers:using-git-worktrees` skill → branch `feat/p5-p6-directory-ops` under `.worktrees/`.
2. Build P5 then P6 (or interleave) with subagent-driven-development inside the worktree. All domain code is new files → zero conflict with the P3+P4 branch except `server/router.ts`.
3. **Merge order (either first):** whichever of {P3+P4, P5+P6} merges to `main` second resolves the **one** `server/router.ts` conflict — union the imports and the `.use()` chain (`.use(walletRouter).use(accountRouter).use(clubsRouter).use(roundsRouter).use(directoryRouter).use(opsRouter)`). Re-run `tsc` + `build` on the merged result.
4. **Constraint audit before merge:** confirm this branch changed neither `db/schema.ts` nor `lib/sponsor.ts`, and `core/directory` imported no `core/clubs`/`core/rounds` — a `git diff --stat main...HEAD` that lists either is a decoupling violation to fix before merge.

---

## 9. Global constraints (inherited)

- `pnpm exec tsc --noEmit` (in `web/`) EXIT 0 authoritative (`drizzle-orm` duplicate-instance TS2345 = known false positive).
- Server-only-importing tests: `node --conditions=react-server` + live `DATABASE_URL`; `pnpm db:migrate-pg` before live repo tests; live repo tests self-clean any temp rows.
- Elysia validates with zod (422, array `path`); root `onError` untouched.
- Money on wire = strings, parsed to bigint at the edge; never `Number()` on money.
- Self-custody: server never holds the fan key. faucet/sponsor use the server's OWN relayer key (`SPONSOR_PK`) — never the fan's. moonpay secret is server-only. Chain writes stay client-signed (ops helpers are the sanctioned server-relayer exceptions, unchanged from legacy).
- `useDirectory()`/`useOps()` factory-hook convention (canonical).
- **Decoupling constraints §2.1–2.4 are binding for every task in this spec.**
