# P3+P4 — clubs + rounds slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the club dashboard reads (P3: `overview`/`distributions`/`holders`) and the rounds lifecycle (P4: public list, club-gated create, permissionless close-check) into the Elysia domain tri-layer, establishing the **`clubAuthed`** consumer template and the **multi-status route** template (holders 403, create 400/409) that later domains copy.

**Architecture:** Two new domains, `core/clubs` and `core/rounds`, each following the P1/P2 tri-layer (`domain → server/{repository,services,api} → client`). Clubs reads are **graceful-empty** (services return `ok(<empty shape>)` even on a catastrophic throw — never a service-level 500). Rounds create is club-gated (`clubAuthed`) plus an independent on-chain ownership re-check (the round factory is permissionless). `close-check` stays public/permissionless, and its moved `tryCloseFundingIfDue` keeps importing the ops-domain (P6) `lib/sponsor.ts` unchanged. `lib/clubRevenue.ts`, `lib/closeFunding.ts`, and `lib/clubAuth.ts` are deleted; their 1:1 logic moves into the domains. RSC importers (`marketing/club/[slug]/page.tsx`, `components/club/types.ts`) repoint to the new domain modules.

**Tech Stack:** Elysia 1.4, `clubAuthed` macro (Better Auth session + club-row resolve), Eden + eden-tanstack-react-query, zod v4, Drizzle (node-postgres), viem (chain reads), `node:test` + tsx, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-12-p3-p4-clubs-rounds-slice-design.md`.

---

## Global Constraints

- Work from `/home/skkippie/work/AI-DO/La12/web`. Package manager **pnpm**. Postgres running; `DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce` in `.env.local`; seeded demo club `deportivo-san-martin` (userId **null** — predates auth) + its verified round.
- **This plan runs on `main` in PARALLEL with the P5+P6 worktree.** The **only** file both touch is `web/src/server/router.ts` (this plan adds `.use(clubsRouter).use(roundsRouter)`) — expect one trivial merge conflict there at the sibling merge; resolve by keeping both `.use()` chains. Do **NOT** edit `web/src/db/schema.ts` or `web/src/lib/sponsor.ts` — both are owned elsewhere (schema is shared, sponsor is P6 ops).
- **Result shape (confirmed):** `Ok<T> = { ok: true; data: T }`, `Err<E> = { ok: false; error: E }` (`@/server/common/responses/result.ts`). Success value is `result.data`; error is `result.error` (`.status` numeric). Service tests assert `res.ok` + `res.data`/`res.error`.
- `ok`/`err`/`AppErrors`/`AsyncAppResult` are exported from `@/server/common/responses`. `AppErrors.forbidden()` → 403, `AppErrors.notFound()` → 404, `AppErrors.invalidBody({targets})` → 400, `AppErrors.unexpected(e)` → 500. `CommonResponse.successful({response})` → 200, `CommonResponse.created({response})` → 201.
- **eden-tanstack `mutationFn` THROWS `result.error` on an API error** → `mutateAsync` rejects on failure, resolves to the success envelope otherwise (no `.error` on the resolved value). POST body is the first positional arg → `mutateAsync(bodyObj)`.
- **Elysia validates with ZOD**: a validation error's status is **422**, `error.valueError.path` is an ARRAY of field names. The root `onError` (`web/src/server/router.ts`) already derives `targets` correctly from this — this plan MUST NOT touch `onError`.
- **`clubAuthed` macro** (`@/server/auth/middleware/club-authed.ts`): a route sets `clubAuthed: true` + `.use(clubAuthed)`; it injects `club` + `user` + `session`, short-circuiting **401** (no session) / **403** (`role !== "club"`) / **409** (`NO_CLUB_LINKED`, session ok but no `clubs` row). Club routes therefore get 401/403/409 free — never write handler code for those three.
- **holders route** MUST widen the wallet template's `as 500` cast to `as 403 | 500` + add `403: errorResponseSchema(403)` to the response map (the service emits `err(forbidden)` when the requested round isn't a verified round of the caller's club). This is the multi-status route exemplar; copy its TEMPLATE NOTE comment style. **create route**: the service can also emit 400 (on-chain ownership verify failed) → widen to `as 400 | 500` + response map `{201,400,401,403,409,500}`.
- **Test commands:**
  - Pure domain tests (no DB, no server-only import): `cd web && pnpm exec tsx --test <file>`.
  - Server-only tests (repo/service files `import "server-only"` + transitively `@/lib/db`): `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test <file>` — **both** flags are required even when the test injects fakes and never queries (the import chain eval-loads `@/lib/db`, which throws without `DATABASE_URL`).
  - Before a **live repository** test, run `cd web && pnpm db:migrate-pg` to restore the seeded `deportivo-san-martin` club + its verified round (a prior write/parity test can leave pollution).
  - Live repo tests that **write** must self-clean their temp rows in a `node:test` `after` hook (FK-safe delete order: children before `clubs`/`user`). Use `p4-test-*` / `p3-test-*`-style markers for temp slugs/ids so they're easy to spot and clean manually if a run aborts early.
  - Type gate: `cd web && pnpm exec tsc --noEmit` must **EXIT 0**. A `drizzle-orm` duplicate-instance TS2345 LSP false positive is known and stale — ignore it only if it's the sole reported error.
- **Factory hooks (canonical):** `useClubs()` returns `{ useOverview, useDistributions, useHolders }`; `useRounds()` returns `{ useList, useCreate, useCloseCheck }`. Reads use `useQuery({ ...x.queryOptions(), select: parse })`; mutations use `useMutation(x.mutationOptions({ onSuccess: invalidateQueries }))`.
- **Graceful-empty (clubs + rounds-list, NOT create/close-check):** `overview`/`distributions`/`holders` services wrap orchestration in try/catch and return `ok(<empty shape>)` even when the catch fires — this is a *different* choice than the wallet template (which returns `err(unexpected)`/500 on a catastrophic throw). Individual on-chain reads stay `readSafely`-wrapped (0n/[]/`"funding"` fallback) so one dead RPC only zeroes a single field; the outer catch only fires on something like a DB outage, and even then the route still answers 200-empty (matches the legacy dashboard's UX). `holders` still emits the ownership `err(forbidden)` **before** its own graceful-empty try/catch — ownership is a real 403, not an empty read. `list-rounds` (public catalog) is graceful-empty the same way. `create-round` and `close-check` are NOT graceful-empty — they can legitimately emit 400/404/500.
- **Money on the wire = strings** (bigint has no JSON representation), parsed to bigint at the client edge via domain `parse*` functions. Never call `Number()` on a money value except the one sanctioned legacy exception: chart-axis display (`seriesToPoints`, already commented "display only" in the code being moved).
- `deadline` is an ISO string on the wire, `Date` in the domain/DB layer.
- Self-custody: server never holds a fan/club private key; chain writes stay client-signed. `close-check`'s sponsored `closeFunding()` call is the one sanctioned permissionless server-initiated tx (unchanged from legacy) — keep `import { closeFundingSponsored } from "@/lib/sponsor"` verbatim in the moved `tryCloseFundingIfDue`.
- `lib/contracts.ts` stays in place (shared viem read/ABI layer) — not a migration target, only imported.
- `rounds` list `GET` is **public** (no macro, zod query `{clubId?, all?}`). `close-check` is **public** (no macro, zod params `{id}`).

---

## File Structure

```
web/src/core/clubs/
  domain/
    schemas.ts        addressSchema, roundStatusSchema, clubRoundSchema, clubTotalsSchema,
                       clubOverviewSchema, distributionSchema, seriesPointSchema,
                       clubDistributionsSchema, holderSchema, roundQuerySchema
    types.ts           ClubRound/ClubTotals/Distribution/SeriesPoint/Holder (bigint domain types)
                        + DTO z.infer types + to*DTO serializers + parse* client parsers
                        + pure capUtilization(), cumulativeSeries()
    __tests__/clubs-domain.test.ts   (git mv'd from lib/clubRevenue.test.ts, rewritten to node:test)
  server/
    repository/
      find-club-rounds.ts     verified rounds for a clubId (+ club display name)
      find-owned-round.ts     round by (clubId, contractAddress, verified) — ownership check
      __tests__/clubs-repository.test.ts   (live pg, read-only)
    services/
      chain-reads.ts                    getRoundInvestors / getRoundHolders (moved from clubRevenue.ts)
      get-club-overview-service.ts      deps-injected; on-chain totals + per-round enrich; graceful-empty
      get-club-distributions-service.ts deps-injected; Distributed logs -> distributions + series; graceful-empty
      get-round-holders-service.ts      ownership check -> err(forbidden) 403; else holders; graceful-empty
      __tests__/get-club-overview-service.test.ts
      __tests__/get-club-distributions-service.test.ts
      __tests__/get-round-holders-service.test.ts
    api/
      routes/overview.route.ts          .use(clubAuthed)
      routes/distributions.route.ts     .use(clubAuthed)
      routes/holders.route.ts           .use(clubAuthed) — TEMPLATE NOTE (widened 403 | 500 cast)
      router.ts                         clubsRouter, prefix /clubs
  client/
    hooks.ts          useClubs() -> useOverview, useDistributions, useHolders(round?)

web/src/core/rounds/
  domain/
    schemas.ts        addressSchema, roundStatusSchema, createRoundBodySchema, roundRowSchema,
                       listRoundsQuerySchema, closeCheckParamsSchema, closeCheckResultSchema
    types.ts           RoundStatus, RoundRowDTO, toRoundRowDTO() + pure isFundingDue(), mapOnChainStateToDb()
    __tests__/rounds-domain.test.ts  (git mv'd from lib/closeFunding.test.ts, rewritten to node:test)
  server/
    repository/
      list-rounds.ts          filter clubId / verified
      insert-round.ts         insert, always verified:true -> row
      find-round-by-id.ts     by numeric id
      update-round-status.ts  correct rounds.status from on-chain truth
      __tests__/rounds-repository.test.ts   (live pg, self-cleaning temp club+rounds)
    services/
      try-close-funding.ts    moved tryCloseFundingIfDue (imports @/lib/sponsor — P6 legacy, unchanged)
      list-rounds-service.ts  public; deps-injected filter -> ok(rows); graceful-empty
      create-round-service.ts club + body -> on-chain club() verify (400) -> insert -> ok(row) [201]
      close-check-service.ts  findById (404) -> tryClose -> ok({status})
      __tests__/list-rounds-service.test.ts
      __tests__/create-round-service.test.ts
      __tests__/close-check-service.test.ts
    api/
      routes/list-rounds.route.ts    public GET /
      routes/create-round.route.ts   .use(clubAuthed) POST / — TEMPLATE NOTE (widened 400 | 500 cast)
      routes/close-check.route.ts    public POST /:id/close-check
      router.ts                      roundsRouter, prefix /rounds
  client/
    hooks.ts          useRounds() -> useList(query?), useCreate, useCloseCheck(id)

Wire: web/src/server/router.ts -> .use(clubsRouter) (Task 5), then .use(roundsRouter) (Task 11)
Delete: lib/clubRevenue.ts, lib/clubAuth.ts, app/api/club/{overview,distributions,holders}/route.ts,
        lib/closeFunding.ts, app/api/rounds/route.ts, app/api/rounds/[id]/close-check/route.ts
Repoint: components/club/types.ts (-> core/clubs/domain), marketing/club/[slug]/page.tsx (-> core/rounds/server/services/try-close-funding)
Cutover: components/club/ClubOverview.tsx, RevenueDetail.tsx, HoldersDialog.tsx,
         components/CreateRoundForm.tsx, components/InvestForm.tsx
```

---

## Task 1: clubs domain (schemas, types, pure helpers, moved tests)

**Files:**
- Create: `web/src/core/clubs/domain/schemas.ts`
- Create: `web/src/core/clubs/domain/types.ts`
- Move+rewrite: `web/src/lib/clubRevenue.test.ts` → `web/src/core/clubs/domain/__tests__/clubs-domain.test.ts`

**Interfaces:**
- Produces: `addressSchema`, `roundStatusSchema`, `clubRoundSchema`, `clubTotalsSchema`, `clubOverviewSchema`, `distributionSchema`, `seriesPointSchema`, `clubDistributionsSchema`, `holderSchema`, `roundQuerySchema` (schemas); `RoundStatus`, `ClubRound`, `ClubTotals`, `Distribution`, `SeriesPoint`, `Holder`, `ClubRoundDTO`, `ClubTotalsDTO`, `DistributionDTO`, `SeriesPointDTO`, `HolderDTO`, `toClubRoundDTO`, `toClubTotalsDTO`, `toDistributionDTO`, `toSeriesPointDTO`, `toHolderDTO`, `parseClubRound`, `parseClubTotals`, `parseDistribution`, `parseSeriesPoint`, `parseHolder`, `cumulativeSeries`, `capUtilization` (types).

- [ ] **Step 1: Write `web/src/core/clubs/domain/schemas.ts`**

```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet/account domains'. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Wire shape of an enriched club round — bigints as strings, deadline as ISO. */
export const clubRoundSchema = z.object({
  roundId: z.number().int(),
  contractAddress: addressSchema,
  name: z.string(),
  goal: z.string(),
  raised: z.string(),
  totalShares: z.string(),
  distributed: z.string(),
  capMultiple: z.number().int(),
  revenueBps: z.number().int(),
  deadline: z.string(),
  status: roundStatusSchema,
  capUtilizationPct: z.number(),
});

export const clubTotalsSchema = z.object({
  raised: z.string(),
  distributed: z.string(),
  roundCount: z.number().int(),
  backerCount: z.number().int(),
});

/** GET /clubs/overview response payload. */
export const clubOverviewSchema = z.object({
  totals: clubTotalsSchema,
  rounds: z.array(clubRoundSchema),
});

export const distributionSchema = z.object({
  roundId: z.number().int(),
  roundName: z.string(),
  received: z.string(),
  credited: z.string(),
  refunded: z.string(),
  txHash: z.string(),
  timestamp: z.number().int(),
});

export const seriesPointSchema = z.object({ ts: z.number().int(), cumulative: z.string() });

/** GET /clubs/distributions response payload. */
export const clubDistributionsSchema = z.object({
  distributions: z.array(distributionSchema),
  series: z.array(seriesPointSchema),
});

export const holderSchema = z.object({
  address: addressSchema,
  shares: z.string(),
  claimable: z.string(),
  pct: z.number(),
});

/** GET /clubs/holders?round= query param. */
export const roundQuerySchema = z.object({ round: addressSchema });
```

- [ ] **Step 2: Write `web/src/core/clubs/domain/types.ts`**

```ts
import type { z } from "zod";
import type {
  clubRoundSchema,
  clubTotalsSchema,
  distributionSchema,
  seriesPointSchema,
  holderSchema,
} from "./schemas";

const BPS_DENOM = 10_000n;

export type RoundStatus = "funding" | "active" | "closed";

// Wire DTOs — derived from the zod schemas (bigints are strings here).
export type ClubRoundDTO = z.infer<typeof clubRoundSchema>;
export type ClubTotalsDTO = z.infer<typeof clubTotalsSchema>;
export type DistributionDTO = z.infer<typeof distributionSchema>;
export type SeriesPointDTO = z.infer<typeof seriesPointSchema>;
export type HolderDTO = z.infer<typeof holderSchema>;

// Domain shapes — bigint/Date-precise; what the server computes and the client renders.
export type ClubRound = Omit<
  ClubRoundDTO,
  "contractAddress" | "goal" | "raised" | "totalShares" | "distributed" | "deadline"
> & {
  contractAddress: `0x${string}`;
  goal: bigint;
  raised: bigint;
  totalShares: bigint;
  distributed: bigint;
  deadline: Date;
};
export type ClubTotals = Omit<ClubTotalsDTO, "raised" | "distributed"> & { raised: bigint; distributed: bigint };
export type Distribution = Omit<DistributionDTO, "received" | "credited" | "refunded" | "txHash"> & {
  received: bigint;
  credited: bigint;
  refunded: bigint;
  txHash: `0x${string}`;
};
export type SeriesPoint = Omit<SeriesPointDTO, "cumulative"> & { cumulative: bigint };
export type Holder = Omit<HolderDTO, "address" | "shares" | "claimable"> & {
  address: `0x${string}`;
  shares: bigint;
  claimable: bigint;
};

// --- server -> wire (DTO) serializers ---------------------------------------
export function toClubRoundDTO(r: ClubRound): ClubRoundDTO {
  return {
    ...r,
    goal: r.goal.toString(),
    raised: r.raised.toString(),
    totalShares: r.totalShares.toString(),
    distributed: r.distributed.toString(),
    deadline: r.deadline.toISOString(),
  };
}
export function toClubTotalsDTO(t: ClubTotals): ClubTotalsDTO {
  return { ...t, raised: t.raised.toString(), distributed: t.distributed.toString() };
}
export function toDistributionDTO(d: Distribution): DistributionDTO {
  return { ...d, received: d.received.toString(), credited: d.credited.toString(), refunded: d.refunded.toString() };
}
export function toSeriesPointDTO(p: SeriesPoint): SeriesPointDTO {
  return { ts: p.ts, cumulative: p.cumulative.toString() };
}
export function toHolderDTO(h: Holder): HolderDTO {
  return { ...h, shares: h.shares.toString(), claimable: h.claimable.toString() };
}

// --- wire (DTO) -> client parsers --------------------------------------------
export function parseClubRound(d: ClubRoundDTO): ClubRound {
  return {
    ...d,
    contractAddress: d.contractAddress as `0x${string}`,
    goal: BigInt(d.goal),
    raised: BigInt(d.raised),
    totalShares: BigInt(d.totalShares),
    distributed: BigInt(d.distributed),
    deadline: new Date(d.deadline),
  };
}
export function parseClubTotals(d: ClubTotalsDTO): ClubTotals {
  return { ...d, raised: BigInt(d.raised), distributed: BigInt(d.distributed) };
}
export function parseDistribution(d: DistributionDTO): Distribution {
  return {
    ...d,
    received: BigInt(d.received),
    credited: BigInt(d.credited),
    refunded: BigInt(d.refunded),
    txHash: d.txHash as `0x${string}`,
  };
}
export function parseSeriesPoint(d: SeriesPointDTO): SeriesPoint {
  return { ts: d.ts, cumulative: BigInt(d.cumulative) };
}
export function parseHolder(d: HolderDTO): Holder {
  return { ...d, address: d.address as `0x${string}`, shares: BigInt(d.shares), claimable: BigInt(d.claimable) };
}

// --- pure helpers -------------------------------------------------------------
/** Running total of `credited`, sorted by timestamp ascending. */
export function cumulativeSeries(dists: Distribution[]): SeriesPoint[] {
  const sorted = [...dists].sort((a, b) => a.timestamp - b.timestamp);
  let acc = 0n;
  return sorted.map((d) => {
    acc += d.credited;
    return { ts: d.timestamp, cumulative: acc };
  });
}

/** % of the round's revenue cap (raised * capMultipleBps / 1e4) already distributed, clamped to 100. */
export function capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number {
  const cap = (raised * BigInt(capMultipleBps)) / BPS_DENOM;
  if (cap === 0n) return 0;
  const pct = Number((distributed * 10_000n) / cap) / 100;
  return Math.min(100, pct);
}
```

- [ ] **Step 3: Move the legacy test and rewrite it to `node:test`**

```bash
cd /home/skkippie/work/AI-DO/La12/web
mkdir -p src/core/clubs/domain/__tests__
git mv src/lib/clubRevenue.test.ts src/core/clubs/domain/__tests__/clubs-domain.test.ts
```

Rewrite `web/src/core/clubs/domain/__tests__/clubs-domain.test.ts` to:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { cumulativeSeries, capUtilization, toClubRoundDTO, parseClubRound, type Distribution, type ClubRound } from "../types";

test("cumulativeSeries: sorts by ts ascending, running sum of credited", () => {
  const dists: Distribution[] = [
    { roundId: 1, roundName: "R", received: 0n, credited: 100n, refunded: 0n, txHash: "0xb", timestamp: 2 },
    { roundId: 1, roundName: "R", received: 0n, credited: 50n, refunded: 0n, txHash: "0xa", timestamp: 1 },
    { roundId: 1, roundName: "R", received: 0n, credited: 25n, refunded: 0n, txHash: "0xc", timestamp: 3 },
  ];
  const series = cumulativeSeries(dists);
  assert.deepStrictEqual(series.map((p) => [p.ts, p.cumulative]), [[1, 50n], [2, 150n], [3, 175n]]);
  assert.deepStrictEqual(cumulativeSeries([]), []);
});

test("capUtilization: cap = raised*capMultiple/1e4; pct = distributed*100/cap, clamp 100, 0 when cap 0", () => {
  assert.strictEqual(capUtilization(75_000000n, 100_000000n, 15000), 50); // cap 150 USDT, 75 used -> 50%
  assert.strictEqual(capUtilization(150_000000n, 100_000000n, 15000), 100);
  assert.strictEqual(capUtilization(200_000000n, 100_000000n, 15000), 100); // clamp
  assert.strictEqual(capUtilization(5n, 0n, 15000), 0); // no raise -> cap 0
  assert.strictEqual(capUtilization(5n, 100n, 0), 0); // capMultiple 0 -> cap 0
});

test("toClubRoundDTO -> parseClubRound round-trips bigints + Date (precision beyond 2^53)", () => {
  const cr: ClubRound = {
    roundId: 7,
    contractAddress: "0xabc0000000000000000000000000000000000d",
    name: "FC · Round #7",
    goal: 40_000000n,
    raised: 123456789012345678n,
    totalShares: 30_000000n,
    distributed: 1_000000n,
    capMultiple: 15000,
    revenueBps: 800,
    deadline: new Date("2026-08-01T00:00:00.000Z"),
    status: "active",
    capUtilizationPct: 2.22,
  };
  const dto = toClubRoundDTO(cr);
  assert.strictEqual(dto.raised, "123456789012345678");
  assert.strictEqual(dto.deadline, "2026-08-01T00:00:00.000Z");
  const round = parseClubRound(dto);
  assert.strictEqual(round.raised, 123456789012345678n); // no float rounding
  assert.strictEqual(round.deadline.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.strictEqual(round.status, "active");
});
```

- [ ] **Step 4: Run the tests**

Run: `cd web && pnpm exec tsx --test src/core/clubs/domain/__tests__/clubs-domain.test.ts`
Expected: 3 pass. Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/domain web/src/lib/clubRevenue.test.ts
git commit -m "feat(p3): clubs domain — schemas, types, pure helpers + moved tests"
```

---

## Task 2: clubs repository (find-club-rounds, find-owned-round)

**Files:**
- Create: `web/src/core/clubs/server/repository/find-club-rounds.ts`
- Create: `web/src/core/clubs/server/repository/find-owned-round.ts`
- Test: `web/src/core/clubs/server/repository/__tests__/clubs-repository.test.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`); `rounds`, `clubs`, `Round` (`@/db/schema`).
- Produces: `findClubRounds(clubId: number): Promise<{ clubName: string; rounds: Round[] }>`; `findOwnedRound(clubId: number, contractAddress: string): Promise<Round | undefined>`.

- [ ] **Step 1: Write `find-club-rounds.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs, type Round } from "@/db/schema";

export type ClubRoundsResult = { clubName: string; rounds: Round[] };

/** This club's verified rounds + its display name (defaults to "Club" if the
 *  clubId doesn't resolve — mirrors the legacy `club?.name ?? "Club"` fallback). */
export async function findClubRounds(clubId: number): Promise<ClubRoundsResult> {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const rows = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, clubId), eq(rounds.verified, true)));
  return { clubName: club?.name ?? "Club", rounds: rows };
}
```

- [ ] **Step 2: Write `find-owned-round.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

/** A round that belongs to `clubId`, matches `contractAddress`, and is
 *  verified — the ownership check the holders read (and, structurally,
 *  anything else that needs to prove a club owns a specific round) uses. */
export async function findOwnedRound(clubId: number, contractAddress: string): Promise<Round | undefined> {
  const [round] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, clubId), eq(rounds.contractAddress, contractAddress), eq(rounds.verified, true)));
  return round;
}
```

- [ ] **Step 3: Write the live test (read-only, non-destructive)**

Create `web/src/core/clubs/server/repository/__tests__/clubs-repository.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { findClubRounds } from "../find-club-rounds";
import { findOwnedRound } from "../find-owned-round";

test("findClubRounds: returns the seeded club's verified rounds + its name", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  assert.ok(club, "seeded demo club missing — run `pnpm db:migrate-pg` first");

  const { clubName, rounds: rows } = await findClubRounds(club.id);
  assert.strictEqual(clubName, "Deportivo San Martín");
  assert.ok(rows.length >= 1);
  assert.ok(rows.every((r) => r.clubId === club.id && r.verified));
});

test("findClubRounds: unknown clubId -> empty rounds, generic club name", async () => {
  const { clubName, rounds: rows } = await findClubRounds(999999);
  assert.strictEqual(clubName, "Club");
  assert.deepStrictEqual(rows, []);
});

test("findOwnedRound: the seeded verified round is owned by its own club", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  assert.ok(club, "seeded demo club missing — run `pnpm db:migrate-pg` first");
  const [round] = await db.select().from(rounds).where(eq(rounds.clubId, club.id));
  assert.ok(round, "seeded demo round missing");

  const owned = await findOwnedRound(club.id, round.contractAddress);
  assert.strictEqual(owned?.id, round.id);
});

test("findOwnedRound: a foreign clubId doesn't own the round", async () => {
  const [club] = await db.select().from(clubs).where(eq(clubs.slug, "deportivo-san-martin"));
  const [round] = await db.select().from(rounds).where(eq(rounds.clubId, club!.id));
  const owned = await findOwnedRound(club!.id + 999999, round!.contractAddress);
  assert.strictEqual(owned, undefined);
});
```

- [ ] **Step 4: Restore seed, then run the test**

```bash
cd web && pnpm db:migrate-pg
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/clubs/server/repository/__tests__/clubs-repository.test.ts
```
Expected: 4 pass. (`--conditions=react-server` REQUIRED — `import "server-only"` throws under plain tsx.)

- [ ] **Step 5: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/server/repository
git commit -m "feat(p3): clubs repository — find-club-rounds, find-owned-round"
```

---

## Task 3: clubs chain-reads (moved from clubRevenue.ts)

**Files:**
- Create: `web/src/core/clubs/server/services/chain-reads.ts`

**Interfaces:**
- Consumes: `publicClient`, `totalShares`, `shareBalance`, `pendingReward`, `readSafely` (`@/lib/contracts`); `Holder` (`@/core/clubs/domain/types`).
- Produces: `LOG_WINDOW`, `windowFromBlock(): Promise<bigint>`, `getRoundInvestors(roundAddress): Promise<`0x${string}`[]>`, `getRoundHolders(roundAddress): Promise<Holder[]>`.

This file is a straight move of on-chain log/read orchestration that the legacy `clubRevenue.test.ts` never unit-tested either (it needs a live RPC — no fakeable pure logic lives here). It's exercised indirectly: Task 4's services inject `getRoundInvestors`/`getRoundHolders` as fakes in their own tests, and Task 5's live curl/browser verification exercises the real implementation end-to-end. No dedicated test file for this task.

- [ ] **Step 1: Write `chain-reads.ts`**

```ts
import "server-only";
import { parseAbiItem } from "viem";
import { publicClient, totalShares, shareBalance, pendingReward, readSafely } from "@/lib/contracts";
import type { Holder } from "@/core/clubs/domain/types";

// getRoundInvestors/getRoundHolders/backer-count only see `Invested` events from
// roughly the last LOG_WINDOW blocks (public-RPC eth_getLogs cap), so on an old
// round the holder cap-table and backer count can undercount. `raised`/`distributed`
// totals are unaffected — they're direct contract reads, not log-derived.
export const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs (~40-50k blocks)

const INVESTED_EVENT = parseAbiItem(
  "event Invested(address indexed investor, uint256 usdtAmount, uint256 sharesMinted)",
);

/** Earliest block to scan for logs, bounded by LOG_WINDOW below the chain tip. */
export async function windowFromBlock(): Promise<bigint> {
  const latest = await publicClient.getBlockNumber();
  return latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;
}

/** Unique investor addresses for a round (from Invested logs). */
export async function getRoundInvestors(roundAddress: `0x${string}`): Promise<`0x${string}`[]> {
  const fromBlock = await windowFromBlock();
  const logs = await publicClient.getLogs({ address: roundAddress, event: INVESTED_EVENT, fromBlock, toBlock: "latest" });
  const set = new Set<string>();
  for (const log of logs) {
    const investor = (log as unknown as { args: { investor?: string } }).args.investor;
    if (investor) set.add(investor.toLowerCase());
  }
  return [...set] as `0x${string}`[];
}

/** Cap-table for a round: current holders (shares > 0) with claimable + %. */
export async function getRoundHolders(roundAddress: `0x${string}`): Promise<Holder[]> {
  const investors = await getRoundInvestors(roundAddress);
  const supply = await readSafely(() => totalShares(roundAddress), 0n);
  const holders = await Promise.all(
    investors.map(async (address): Promise<Holder | null> => {
      const shares = await readSafely(() => shareBalance(roundAddress, address), 0n);
      if (shares === 0n) return null;
      const claimable = await readSafely(() => pendingReward(roundAddress, address), 0n);
      const pct = supply === 0n ? 0 : Number((shares * 10_000n) / supply) / 100;
      return { address, shares, claimable, pct };
    }),
  );
  return holders.filter((h): h is Holder => h !== null);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/server/services/chain-reads.ts
git commit -m "feat(p3): clubs chain-reads — getRoundInvestors/getRoundHolders (moved)"
```

---

## Task 4: clubs services (overview, distributions, holders)

**Files:**
- Create: `web/src/core/clubs/server/services/get-club-overview-service.ts`
- Create: `web/src/core/clubs/server/services/get-club-distributions-service.ts`
- Create: `web/src/core/clubs/server/services/get-round-holders-service.ts`
- Test: `web/src/core/clubs/server/services/__tests__/get-club-overview-service.test.ts`
- Test: `web/src/core/clubs/server/services/__tests__/get-club-distributions-service.test.ts`
- Test: `web/src/core/clubs/server/services/__tests__/get-round-holders-service.test.ts`

**Interfaces:**
- Consumes: `findClubRounds`, `findOwnedRound` (Task 2); `getRoundInvestors`, `getRoundHolders`, `windowFromBlock` (Task 3); `totalRaised`, `totalShares`, `roundState`, `totalDistributedToHolders`, `readSafely`, `publicClient` (`@/lib/contracts`); `ok`/`err`/`AppErrors`/`AsyncAppResult` (`@/server/common/responses`); `ClubRound`/`ClubTotals`/`Distribution`/`SeriesPoint`/`Holder`/`capUtilization`/`cumulativeSeries` (Task 1).
- Produces: `getClubOverview(deps): AsyncAppResult<{totals,rounds}>` + `getClubOverviewService(clubId)`; `getClubDistributions(deps): AsyncAppResult<{distributions,series}>` + `getClubDistributionsService(clubId)`; `getRoundHoldersForClub(deps): AsyncAppResult<Holder[]>` + `getRoundHoldersService(clubId, contractAddress)`.

- [ ] **Step 1: Write the failing overview test**

Create `web/src/core/clubs/server/services/__tests__/get-club-overview-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { getClubOverview } from "../get-club-overview-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getClubOverview: enriches a round from chain reads, aggregates totals + unique backers", async () => {
  const result = await getClubOverview({
    clubId: 1,
    findClubRounds: async () => ({ clubName: "Demo", rounds: [ROUND] }),
    reads: {
      totalRaised: async () => 30_000000n,
      totalShares: async () => 30_000000n,
      roundState: async () => "funding",
      totalDistributedToHolders: async () => 1_000000n,
      getRoundInvestors: async () => ["0x1111111111111111111111111111111111111111"],
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.rounds.length, 1);
  const r = result.data.rounds[0];
  assert.strictEqual(r.name, "Demo · Round #7");
  assert.strictEqual(r.raised, 30_000000n);
  assert.strictEqual(r.capUtilizationPct, 2.22);
  assert.strictEqual(result.data.totals.raised, 30_000000n);
  assert.strictEqual(result.data.totals.backerCount, 1);
  assert.strictEqual(result.data.totals.roundCount, 1);
});

test("getClubOverview: a repository throw degrades to a 200-empty result (graceful-empty)", async () => {
  const result = await getClubOverview({
    clubId: 1,
    findClubRounds: async () => {
      throw new Error("db down");
    },
    reads: {
      totalRaised: async () => 0n, totalShares: async () => 0n, roundState: async () => "funding",
      totalDistributedToHolders: async () => 0n, getRoundInvestors: async () => [],
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { totals: { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 }, rounds: [] });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/clubs/server/services/__tests__/get-club-overview-service.test.ts`
Expected: FAIL — `Cannot find module '../get-club-overview-service'`.

- [ ] **Step 3: Write `get-club-overview-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { totalRaised, totalShares, roundState, totalDistributedToHolders, readSafely } from "@/lib/contracts";
import { findClubRounds } from "../repository/find-club-rounds";
import { getRoundInvestors } from "./chain-reads";
import { capUtilization, type ClubRound, type ClubTotals, type RoundStatus } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

type OverviewDeps = {
  clubId: number;
  findClubRounds: (clubId: number) => Promise<{ clubName: string; rounds: Round[] }>;
  reads: {
    totalRaised: (addr: `0x${string}`) => Promise<bigint>;
    totalShares: (addr: `0x${string}`) => Promise<bigint>;
    roundState: (addr: `0x${string}`) => Promise<RoundStatus>;
    totalDistributedToHolders: (addr: `0x${string}`) => Promise<bigint>;
    getRoundInvestors: (addr: `0x${string}`) => Promise<`0x${string}`[]>;
  };
};

/** Verified rounds for a club, on-chain enriched, aggregated into totals.
 *  Individual reads are readSafely-wrapped by the real deps below, so a dead
 *  RPC degrades a single field to its zero value; only a catastrophic failure
 *  (e.g. DB down) hits this catch — which still returns 200-empty, matching
 *  the legacy dashboard's graceful-empty UX (never a 500 from this service). */
export async function getClubOverview(deps: OverviewDeps): AsyncAppResult<{ totals: ClubTotals; rounds: ClubRound[] }> {
  try {
    const { clubName, rounds: rows } = await deps.findClubRounds(deps.clubId);
    const backerSet = new Set<string>();
    const enriched = await Promise.all(
      rows.map(async (row): Promise<ClubRound> => {
        const address = row.contractAddress as `0x${string}`;
        const [raised, supply, status, distributed, investors] = await Promise.all([
          deps.reads.totalRaised(address),
          deps.reads.totalShares(address),
          deps.reads.roundState(address),
          deps.reads.totalDistributedToHolders(address),
          deps.reads.getRoundInvestors(address),
        ]);
        investors.forEach((i) => backerSet.add(i));
        return {
          roundId: row.id,
          contractAddress: address,
          name: `${clubName} · Round #${row.id}`,
          goal: BigInt(row.goal),
          raised,
          totalShares: supply,
          distributed,
          capMultiple: row.capMultiple,
          revenueBps: row.revenueBps,
          deadline: row.deadline,
          status,
          capUtilizationPct: capUtilization(distributed, raised, row.capMultiple),
        };
      }),
    );
    const totals: ClubTotals = {
      raised: enriched.reduce((s, r) => s + r.raised, 0n),
      distributed: enriched.reduce((s, r) => s + r.distributed, 0n),
      roundCount: enriched.length,
      backerCount: backerSet.size,
    };
    return ok({ totals, rounds: enriched });
  } catch {
    return ok({ totals: { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 }, rounds: [] });
  }
}

/** Real-deps wrapper the route calls. Chain reads are readSafely-wrapped
 *  (0n/"funding"/[] fallback) so one dead RPC degrades a single field, not
 *  the whole dashboard. */
export function getClubOverviewService(clubId: number): AsyncAppResult<{ totals: ClubTotals; rounds: ClubRound[] }> {
  return getClubOverview({
    clubId,
    findClubRounds,
    reads: {
      totalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
      totalShares: (addr) => readSafely(() => totalShares(addr), 0n),
      roundState: (addr) => readSafely(async () => (await roundState(addr)).toLowerCase() as RoundStatus, "funding" as RoundStatus),
      totalDistributedToHolders: (addr) => readSafely(() => totalDistributedToHolders(addr), 0n),
      getRoundInvestors: (addr) => readSafely(() => getRoundInvestors(addr), [] as `0x${string}`[]),
    },
  });
}
```

- [ ] **Step 4: Run the overview test to verify it passes**

Run the Step 2 command again. Expected: 2 pass.

- [ ] **Step 5: Write the failing distributions test**

Create `web/src/core/clubs/server/services/__tests__/get-club-distributions-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { getClubDistributions } from "../get-club-distributions-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "active", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getClubDistributions: maps Distributed logs to Distribution rows + a cumulative series", async () => {
  const result = await getClubDistributions({
    clubId: 1,
    findClubRounds: async () => ({ clubName: "Demo", rounds: [ROUND] }),
    windowFromBlock: async () => 0n,
    fetchDistributedLogs: async () => [
      { args: { revenueReceived: 100n, creditedToHolders: 92n, refundedToClub: 8n }, blockNumber: 10n, transactionHash: "0xb" },
    ],
    blockTimestamp: async () => 1_700_000_000,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.distributions.length, 1);
  const d = result.data.distributions[0];
  assert.strictEqual(d.roundName, "Demo · Round #7");
  assert.strictEqual(d.credited, 92n);
  assert.strictEqual(d.timestamp, 1_700_000_000);
  assert.deepStrictEqual(result.data.series, [{ ts: 1_700_000_000, cumulative: 92n }]);
});

test("getClubDistributions: a repository throw degrades to a 200-empty result", async () => {
  const result = await getClubDistributions({
    clubId: 1,
    findClubRounds: async () => {
      throw new Error("db down");
    },
    windowFromBlock: async () => 0n,
    fetchDistributedLogs: async () => [],
    blockTimestamp: async () => null,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { distributions: [], series: [] });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/clubs/server/services/__tests__/get-club-distributions-service.test.ts`
Expected: FAIL — `Cannot find module '../get-club-distributions-service'`.

- [ ] **Step 7: Write `get-club-distributions-service.ts`**

```ts
import "server-only";
import { parseAbiItem } from "viem";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { publicClient, readSafely } from "@/lib/contracts";
import { findClubRounds } from "../repository/find-club-rounds";
import { windowFromBlock } from "./chain-reads";
import { cumulativeSeries, type Distribution, type SeriesPoint } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

const DISTRIBUTED_EVENT = parseAbiItem(
  "event Distributed(uint256 revenueReceived, uint256 creditedToHolders, uint256 refundedToClub)",
);

type DistributedLog = {
  args: { revenueReceived?: bigint; creditedToHolders?: bigint; refundedToClub?: bigint };
  blockNumber: bigint | null;
  transactionHash: string | null;
};

type DistributionsDeps = {
  clubId: number;
  findClubRounds: (clubId: number) => Promise<{ clubName: string; rounds: Round[] }>;
  windowFromBlock: () => Promise<bigint>;
  fetchDistributedLogs: (address: `0x${string}`, fromBlock: bigint) => Promise<DistributedLog[]>;
  blockTimestamp: (blockNumber: bigint) => Promise<number | null>;
};

/** Distributed-event history for a club's verified rounds + the running
 *  cumulative series. Graceful-empty: a catastrophic failure still returns
 *  200-empty (see get-club-overview-service.ts for the same rationale). */
export async function getClubDistributions(
  deps: DistributionsDeps,
): AsyncAppResult<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  try {
    const { clubName, rounds: rows } = await deps.findClubRounds(deps.clubId);
    const fromBlock = await deps.windowFromBlock();
    const perRound = await Promise.all(
      rows.map(async (row): Promise<Distribution[]> => {
        const address = row.contractAddress as `0x${string}`;
        const logs = await deps.fetchDistributedLogs(address, fromBlock);
        const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
        const times = new Map<bigint, number>();
        await Promise.all(
          blocks.map(async (bn) => {
            const ts = await deps.blockTimestamp(bn);
            if (ts !== null) times.set(bn, ts);
          }),
        );
        return logs.map((l) => ({
          roundId: row.id,
          roundName: `${clubName} · Round #${row.id}`,
          received: l.args.revenueReceived ?? 0n,
          credited: l.args.creditedToHolders ?? 0n,
          refunded: l.args.refundedToClub ?? 0n,
          txHash: (l.transactionHash ?? "0x") as `0x${string}`,
          timestamp: l.blockNumber ? (times.get(l.blockNumber) ?? 0) : 0,
        }));
      }),
    );
    const distributions = perRound.flat();
    return ok({ distributions, series: cumulativeSeries(distributions) });
  } catch {
    return ok({ distributions: [], series: [] });
  }
}

/** Real-deps wrapper the route calls. Moved verbatim from clubRevenue.ts's
 *  getClubDistributions — the viem Log -> DistributedLog cast mirrors the
 *  legacy `as unknown as {args:...}` (parseAbiItem's inferred arg types
 *  aren't easily narrowed further without a fight). */
export function getClubDistributionsService(
  clubId: number,
): AsyncAppResult<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  return getClubDistributions({
    clubId,
    findClubRounds,
    windowFromBlock,
    fetchDistributedLogs: async (address, fromBlock) => {
      const logs = await readSafely(
        () => publicClient.getLogs({ address, event: DISTRIBUTED_EVENT, fromBlock, toBlock: "latest" }),
        [] as Awaited<ReturnType<typeof publicClient.getLogs>>,
      );
      return logs.map((l) => ({
        args: (l as unknown as { args: DistributedLog["args"] }).args,
        blockNumber: l.blockNumber,
        transactionHash: l.transactionHash,
      }));
    },
    blockTimestamp: async (blockNumber) => {
      const block = await readSafely(() => publicClient.getBlock({ blockNumber }), null);
      return block ? Number(block.timestamp) : null;
    },
  });
}
```

- [ ] **Step 8: Run the distributions test to verify it passes**

Run the Step 6 command again. Expected: 2 pass.

- [ ] **Step 9: Write the failing holders test**

Create `web/src/core/clubs/server/services/__tests__/get-round-holders-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { getRoundHoldersForClub } from "../get-round-holders-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 7, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "active", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("getRoundHoldersForClub: err(forbidden) when the round isn't owned/verified by this club", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    findOwnedRound: async () => undefined,
    getRoundHolders: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 403);
});

test("getRoundHoldersForClub: ok(holders) when owned", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: ROUND.contractAddress,
    findOwnedRound: async () => ROUND,
    getRoundHolders: async () => [{ address: "0x1111111111111111111111111111111111111111", shares: 10n, claimable: 1n, pct: 100 }],
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 1);
});

test("getRoundHoldersForClub: a chain-read throw after ownership passes degrades to ok([]) (graceful-empty)", async () => {
  const result = await getRoundHoldersForClub({
    clubId: 1, contractAddress: ROUND.contractAddress,
    findOwnedRound: async () => ROUND,
    getRoundHolders: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, []);
});
```

- [ ] **Step 10: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/clubs/server/services/__tests__/get-round-holders-service.test.ts`
Expected: FAIL — `Cannot find module '../get-round-holders-service'`.

- [ ] **Step 11: Write `get-round-holders-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { findOwnedRound } from "../repository/find-owned-round";
import { getRoundHolders } from "./chain-reads";
import type { Holder } from "@/core/clubs/domain/types";
import type { Round } from "@/db/schema";

type HoldersDeps = {
  clubId: number;
  contractAddress: string;
  findOwnedRound: (clubId: number, contractAddress: string) => Promise<Round | undefined>;
  getRoundHolders: (address: `0x${string}`) => Promise<Holder[]>;
};

/** Ownership gate (err(forbidden) BEFORE the graceful-empty read) then the
 *  cap-table. A dead RPC after ownership passes still degrades to ok([]) —
 *  this service never emits 500, matching overview/distributions. */
export async function getRoundHoldersForClub(deps: HoldersDeps): AsyncAppResult<Holder[]> {
  const owned = await deps.findOwnedRound(deps.clubId, deps.contractAddress);
  if (!owned) return err(AppErrors.forbidden());
  try {
    return ok(await deps.getRoundHolders(deps.contractAddress as `0x${string}`));
  } catch {
    return ok([]);
  }
}

export function getRoundHoldersService(clubId: number, contractAddress: string): AsyncAppResult<Holder[]> {
  return getRoundHoldersForClub({ clubId, contractAddress, findOwnedRound, getRoundHolders });
}
```

- [ ] **Step 12: Run the holders test to verify it passes**

Run the Step 10 command again. Expected: 3 pass.

- [ ] **Step 13: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/server/services
git commit -m "feat(p3): clubs services — overview, distributions, holders (graceful-empty)"
```

---

## Task 5: clubs routes + router + wire

**Files:**
- Create: `web/src/core/clubs/server/api/routes/overview.route.ts`
- Create: `web/src/core/clubs/server/api/routes/distributions.route.ts`
- Create: `web/src/core/clubs/server/api/routes/holders.route.ts`
- Create: `web/src/core/clubs/server/api/router.ts`
- Modify: `web/src/server/router.ts` (add `.use(clubsRouter)`)

**Interfaces:**
- Consumes: `clubAuthed` (`@/server/auth/middleware/club-authed`); the three services (Task 4); the domain schemas/serializers (Task 1); `CommonResponse`/`errorResponseSchema`/`errorToResponse`/`successResponseSchema` (`@/server/common/responses`).
- Produces: `clubsRouter` mounted at `/api/v1/clubs`; `GET .../overview`, `GET .../distributions`, `GET .../holders?round=`.

- [ ] **Step 1: Write `overview.route.ts`**

```ts
import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { clubOverviewSchema } from "@/core/clubs/domain/schemas";
import { toClubTotalsDTO, toClubRoundDTO } from "@/core/clubs/domain/types";
import { getClubOverviewService } from "../../services/get-club-overview-service";

export const overviewRoute = new Elysia().use(clubAuthed).get(
  "/overview",
  async ({ club, status }) => {
    const result = await getClubOverviewService(club.id);
    // The service is graceful-empty (see get-club-overview-service.ts) — it never
    // returns err(...), so `as 500` is defensive only (matches get-positions.route.ts's
    // base template; there is no 500 this route can actually emit today).
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(
      200,
      CommonResponse.successful({
        response: { totals: toClubTotalsDTO(result.data.totals), rounds: result.data.rounds.map(toClubRoundDTO) },
      }),
    );
  },
  {
    clubAuthed: true,
    response: {
      200: successResponseSchema(clubOverviewSchema, "ClubOverview"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Club totals + verified rounds, on-chain enriched" },
  },
);
```

- [ ] **Step 2: Write `distributions.route.ts`**

```ts
import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { clubDistributionsSchema } from "@/core/clubs/domain/schemas";
import { toDistributionDTO, toSeriesPointDTO } from "@/core/clubs/domain/types";
import { getClubDistributionsService } from "../../services/get-club-distributions-service";

export const distributionsRoute = new Elysia().use(clubAuthed).get(
  "/distributions",
  async ({ club, status }) => {
    const result = await getClubDistributionsService(club.id);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(
      200,
      CommonResponse.successful({
        response: {
          distributions: result.data.distributions.map(toDistributionDTO),
          series: result.data.series.map(toSeriesPointDTO),
        },
      }),
    );
  },
  {
    clubAuthed: true,
    response: {
      200: successResponseSchema(clubDistributionsSchema, "ClubDistributions"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Distribution history + cumulative series for the caller's rounds" },
  },
);
```

- [ ] **Step 3: Write `holders.route.ts` (the multi-status TEMPLATE NOTE exemplar)**

```ts
import { Elysia } from "elysia";
import { z } from "zod";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { holderSchema, roundQuerySchema } from "@/core/clubs/domain/schemas";
import { toHolderDTO } from "@/core/clubs/domain/types";
import { getRoundHoldersService } from "../../services/get-round-holders-service";

export const holdersRoute = new Elysia().use(clubAuthed).get(
  "/holders",
  async ({ query, club, status }) => {
    const result = await getRoundHoldersService(club.id, query.round);
    // TEMPLATE NOTE: unlike the wallet template (get-positions.route.ts, `as 500`
    // only), get-round-holders-service can ALSO err(forbidden) — the requested
    // round isn't a verified round of the caller's club — so this route WIDENS
    // both the cast and the `response:` map to add 403, per that template's own
    // note ("WIDEN both: the error.status cast AND the response map").
    if (!result.ok) return status(result.error.status as 403 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toHolderDTO) }));
  },
  {
    clubAuthed: true,
    query: roundQuerySchema,
    response: {
      200: successResponseSchema(z.array(holderSchema), "Holders"),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Clubs"], summary: "Cap-table for a round owned + verified by the caller's club" },
  },
);
```

- [ ] **Step 4: Write `router.ts`**

```ts
import { Elysia } from "elysia";
import { overviewRoute } from "./routes/overview.route";
import { distributionsRoute } from "./routes/distributions.route";
import { holdersRoute } from "./routes/holders.route";

export const clubsRouter = new Elysia({ prefix: "/clubs" })
  .use(overviewRoute)
  .use(distributionsRoute)
  .use(holdersRoute);
```

- [ ] **Step 5: Wire `clubsRouter` into `web/src/server/router.ts`**

Add the import next to the account import:
```ts
import { clubsRouter } from "@/core/clubs/server/api/router";
```
And chain `.use(clubsRouter)` immediately after `.use(accountRouter)`:
```ts
  .use(accountRouter)
  .use(clubsRouter);
```

- [ ] **Step 6: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build succeeds.

- [ ] **Step 7: Live verify the auth gate + validation**

Start dev (`cd web && pnpm dev`) in a background shell, then:
```bash
curl -s http://localhost:3000/api/v1/clubs/overview
curl -s "http://localhost:3000/api/v1/clubs/holders?round=nope"
```
Expected:
- First: no session cookie → `401` envelope (`{"code":"UNAUTHORIZED","status":401}` — `clubAuthed` short-circuits before the handler runs).
- Second: either a `401` (no session, same short-circuit — most likely, since `resolve` typically runs before query validation) or a `422` with `targets:["round"]` if validation runs first. Either is acceptable; note which you observed (matches the P2 Task 4 caveat for the `authed` macro).

The authenticated 200 path (real totals/rounds/holders) is verified in-browser in Task 7, once the club dashboard is cut over to consume these routes.

- [ ] **Step 8: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/server/api web/src/server/router.ts
git commit -m "feat(p3): clubs routes + router — overview/distributions/holders behind clubAuthed"
```

---

## Task 6: clubs client hooks (useClubs)

**Files:**
- Create: `web/src/core/clubs/client/hooks.ts`

**Interfaces:**
- Consumes: `useElysia` (`@/frontend/lib/eden`); `useQuery` (`@tanstack/react-query`); `parseClubTotals`, `parseClubRound`, `parseDistribution`, `parseSeriesPoint`, `parseHolder` (Task 1).
- Produces: `useClubs(): { useOverview, useDistributions, useHolders }`.

- [ ] **Step 1: Write `hooks.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
import {
  parseClubTotals,
  parseClubRound,
  parseDistribution,
  parseSeriesPoint,
  parseHolder,
} from "@/core/clubs/domain/types";

/** Club-domain client hooks — all three reads sit behind clubAuthed on the
 *  server (401/403/409 come from the session, not from these hooks). */
export const useClubs = () => {
  const elysia = useElysia().clubs;

  const useOverview = () =>
    useQuery({
      ...elysia.overview.get.queryOptions(),
      select: (data) => ({
        totals: parseClubTotals(data.response.totals),
        rounds: data.response.rounds.map(parseClubRound),
      }),
    });

  const useDistributions = () =>
    useQuery({
      ...elysia.distributions.get.queryOptions(),
      select: (data) => ({
        distributions: data.response.distributions.map(parseDistribution),
        series: data.response.series.map(parseSeriesPoint),
      }),
    });

  const useHolders = (round?: string) =>
    useQuery({
      ...elysia.holders.get.queryOptions({ query: { round: round ?? "" } }),
      enabled: !!round,
      select: (data) => data.response.map(parseHolder),
    });

  return { useOverview, useDistributions, useHolders };
};
```

- [ ] **Step 2: Typecheck the hooks against the router types**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (Proves `useElysia().clubs.overview.get.queryOptions()` etc. are typed against `AppRouter` — a red squiggle here means Task 5's router wiring is missing, or the eden call-shape for the `holders` query differs; if so, adjust to match what `tsc` demands rather than guessing.)

- [ ] **Step 3: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/clubs/client
git commit -m "feat(p3): clubs client hooks — useClubs (useOverview/useDistributions/useHolders)"
```

---

## Task 7: clubs cutover — repoint types.ts, cut 3 components, delete legacy

**Files:**
- Modify: `web/src/components/club/types.ts`
- Modify: `web/src/components/club/ClubOverview.tsx`
- Modify: `web/src/components/club/RevenueDetail.tsx`
- Modify: `web/src/components/club/HoldersDialog.tsx`
- Delete: `web/src/lib/clubRevenue.ts`, `web/src/lib/clubAuth.ts`, `web/src/app/api/club/overview/route.ts`, `web/src/app/api/club/distributions/route.ts`, `web/src/app/api/club/holders/route.ts`

**Interfaces:**
- Consumes: `useClubs` (Task 6); `ClubTotals`/`ClubRound`/`Distribution`/`Holder`/`SeriesPoint` (Task 1).

- [ ] **Step 1: Repoint `components/club/types.ts` to the clubs domain**

`ClubHero.tsx`, `ClubRoundsList.tsx`, `DistributeDialog.tsx`, and `CloseRoundDialog.tsx` are NOT in this cutover (they take already-parsed data as props, no fetch of their own) — they still import `ClubTotalsView`/`ClubRoundView` from `./types`, so this file keeps those two names as re-exports rather than disappearing. Replace the whole file with:

```ts
// Re-exports the clubs domain's bigint "view" types for components that don't
// fetch data themselves (ClubHero, ClubRoundsList, DistributeDialog,
// CloseRoundDialog) — they only need the shapes, not the fetch/parse layer,
// which now lives in core/clubs/domain/types.ts + core/clubs/client/hooks.ts.
export type {
  ClubTotals as ClubTotalsView,
  ClubRound as ClubRoundView,
  Distribution as DistributionView,
  Holder as HolderView,
} from "@/core/clubs/domain/types";
import type { SeriesPoint } from "@/core/clubs/domain/types";

/** Series → chart points in whole USD₮ (display only; number is fine for an axis). */
export function seriesToPoints(series: SeriesPoint[]): { ts: number; usdt: number }[] {
  return series.map((p) => ({ ts: p.ts, usdt: Number(p.cumulative) / 1_000_000 }));
}
```

- [ ] **Step 2: Rewrite `ClubOverview.tsx` to use `useClubs`**

```tsx
"use client";

import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useClubs } from "@/core/clubs/client/hooks";
import { seriesToPoints, type ClubRoundView } from "./types";
import { ClubHero } from "./ClubHero";
import { RevenueChart } from "./RevenueChart";
import { ClubRoundsList } from "./ClubRoundsList";
import { DistributeDialog } from "./DistributeDialog";
import { CloseRoundDialog } from "./CloseRoundDialog";
import { HoldersDialog } from "./HoldersDialog";
import { CreateRoundDialog } from "./CreateRoundDialog";
import { Skeleton } from "@/components/ui/skeleton";

export function ClubOverview({
  clubName,
  clubWalletAddress,
  usdtAddress,
}: {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}` | undefined;
}) {
  const searchParams = useSearchParams();
  const { useOverview, useDistributions } = useClubs();
  const overviewQuery = useOverview();
  const distributionsQuery = useDistributions();

  const [distributeRound, setDistributeRound] = useState<ClubRoundView | null>(null);
  const [holdersRound, setHoldersRound] = useState<ClubRoundView | null>(null);
  const [closeRoundTarget, setCloseRoundTarget] = useState<ClubRoundView | null>(null);
  const [createOpen, setCreateOpen] = useState(searchParams.get("action") === "newRound");

  const handleNewRound = useCallback(() => {
    if (!usdtAddress) {
      toast.error("USD₮ address not configured — rounds can't be created.");
      return;
    }
    setCreateOpen(true);
  }, [usdtAddress]);

  const refresh = useCallback(() => {
    void overviewQuery.refetch();
    void distributionsQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loading = overviewQuery.isLoading || distributionsQuery.isLoading;

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  // The overview/distributions services are graceful-empty (200 on any read
  // failure) — a query error here is a network/transport failure, not an API
  // 4xx/5xx. Fall back to zeroed data rather than blocking the dashboard.
  const totals = overviewQuery.data?.totals ?? { raised: 0n, distributed: 0n, roundCount: 0, backerCount: 0 };
  const rounds = overviewQuery.data?.rounds ?? [];
  const points = seriesToPoints(distributionsQuery.data?.series ?? []);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ClubHero clubName={clubName} totals={totals} onNewRound={handleNewRound} />
      <RevenueChart points={points} />
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl uppercase tracking-wide">Your rounds</h2>
        <ClubRoundsList
          rounds={rounds}
          onDistribute={setDistributeRound}
          onHolders={setHoldersRound}
          onCloseRound={setCloseRoundTarget}
          onNewRound={handleNewRound}
        />
      </div>

      {distributeRound && (
        <DistributeDialog
          open={distributeRound !== null}
          onOpenChange={(v) => setDistributeRound(v ? distributeRound : null)}
          round={distributeRound}
          onDistributed={refresh}
        />
      )}
      {closeRoundTarget && (
        <CloseRoundDialog
          open={closeRoundTarget !== null}
          onOpenChange={(v) => setCloseRoundTarget(v ? closeRoundTarget : null)}
          round={closeRoundTarget}
          onClosed={refresh}
        />
      )}
      {holdersRound && (
        <HoldersDialog
          open={holdersRound !== null}
          onOpenChange={(v) => setHoldersRound(v ? holdersRound : null)}
          round={holdersRound}
        />
      )}
      {usdtAddress && (
        <CreateRoundDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          clubName={clubName}
          clubWalletAddress={clubWalletAddress}
          usdtAddress={usdtAddress}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `RevenueDetail.tsx` to use `useClubs`**

```tsx
"use client";

import { formatUsdt, formatRelativeTime, explorerTxUrl } from "@/lib/format";
import { useClubs } from "@/core/clubs/client/hooks";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RevenueDetail() {
  const { useOverview, useDistributions } = useClubs();
  const overviewQuery = useOverview();
  const distributionsQuery = useDistributions();

  const loading = overviewQuery.isLoading || distributionsQuery.isLoading;
  if (loading) return <Skeleton className="mx-auto h-64 w-full max-w-3xl" />;

  const rounds = overviewQuery.data?.rounds ?? [];
  const dists = distributionsQuery.data?.distributions ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Revenue</h1>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Cap utilization</h2>
        {rounds.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rounds yet.</div>
        ) : (
          rounds.map((r) => (
            <div key={r.roundId} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="text-muted-foreground">
                  {formatUsdt(r.distributed)} distributed · {r.capUtilizationPct}% of cap
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.capUtilizationPct}%` }} />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Distribution history</h2>
        {dists.length === 0 ? (
          <div className="text-sm text-muted-foreground">No distributions yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {dists.map((d) => (
              <li key={d.txHash} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm">{d.roundName}</div>
                  <a href={explorerTxUrl(d.txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                    {d.timestamp ? formatRelativeTime(d.timestamp) : ""}
                  </a>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-primary">+{formatUsdt(d.credited)} to holders</div>
                  {d.refunded > 0n && <div className="text-xs text-muted-foreground">{formatUsdt(d.refunded)} refunded (over cap)</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `HoldersDialog.tsx` to use `useClubs`**

```tsx
"use client";

import { formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { useClubs } from "@/core/clubs/client/hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export function HoldersDialog({
  open,
  onOpenChange,
  round,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: { contractAddress: `0x${string}`; name: string };
}) {
  const { useHolders } = useClubs();
  const holdersQuery = useHolders(round.contractAddress);
  const holders = holdersQuery.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backers</DialogTitle>
          <DialogDescription>{round.name}</DialogDescription>
        </DialogHeader>
        {holdersQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : holders.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No backers yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {holders.map((h) => (
              <li key={h.address} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <a href={explorerTxUrl(h.address).replace("/tx/", "/address/")} target="_blank" rel="noopener noreferrer" className="font-mono text-sm hover:text-primary">
                    {shortenAddress(h.address)}
                  </a>
                  <div className="text-xs text-muted-foreground">{h.pct}% of round</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatUsdt(h.shares)} shares</div>
                  <div className="text-xs text-muted-foreground">claimable {formatUsdt(h.claimable)} USD₮</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Delete the legacy files**

```bash
cd web
git rm src/lib/clubRevenue.ts src/lib/clubAuth.ts
git rm src/app/api/club/overview/route.ts src/app/api/club/distributions/route.ts src/app/api/club/holders/route.ts
rmdir src/app/api/club/overview src/app/api/club/distributions src/app/api/club/holders src/app/api/club 2>/dev/null || true
```

- [ ] **Step 6: Grep for stragglers**

Run: `cd web && grep -rn "lib/clubRevenue\|lib/clubAuth\|api/club/overview\|api/club/distributions\|api/club/holders" src`
Expected: no live imports/fetches remain. If a hit remains, repoint it (types → `@/core/clubs/domain/types`, reads → `useClubs`) rather than forcing the delete.

- [ ] **Step 7: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build succeeds.

- [ ] **Step 8: In-browser verify**

With `pnpm dev` running and signed in as the seeded club (or a fresh club account with a linked wallet):
1. `/dashboard` renders totals + the seeded round via `GET /api/v1/clubs/overview` (DevTools Network — confirm no `/api/club/*` request remains).
2. `/dashboard/revenue` renders cap-utilization + distribution history via `GET /api/v1/clubs/distributions`.
3. Click "Holders" on a round → `GET /api/v1/clubs/holders?round=0x...` → 200 (empty list is fine if nobody has invested yet).

- [ ] **Step 9: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/components/club web/src/lib web/src/app/api/club
git commit -m "feat(p3): cut ClubOverview/RevenueDetail/HoldersDialog to useClubs; delete legacy lib/clubRevenue + lib/clubAuth + /api/club/*"
```

---

## Task 8: rounds domain (schemas, types, pure helpers, moved tests)

**Files:**
- Create: `web/src/core/rounds/domain/schemas.ts`
- Create: `web/src/core/rounds/domain/types.ts`
- Move+rewrite: `web/src/lib/closeFunding.test.ts` → `web/src/core/rounds/domain/__tests__/rounds-domain.test.ts`

**Interfaces:**
- Produces: `addressSchema`, `roundStatusSchema`, `createRoundBodySchema`, `roundRowSchema`, `listRoundsQuerySchema`, `closeCheckParamsSchema`, `closeCheckResultSchema` (schemas); `RoundStatus`, `RoundRowDTO`, `toRoundRowDTO`, `isFundingDue`, `mapOnChainStateToDb` (types).

- [ ] **Step 1: Write `web/src/core/rounds/domain/schemas.ts`**

```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet/account/clubs domains'. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Body of POST /rounds — no clubId; identity comes from clubAuthed's `club`,
 *  never the request body (RoundFactory.createRound is permissionless on-chain,
 *  so this is re-verified against the chain in the service, not trusted here). */
export const createRoundBodySchema = z.object({
  contractAddress: addressSchema,
  goal: z.string().min(1), // USD₮ base units, string for bigint precision
  sharePrice: z.string().min(1),
  revenueBps: z.number().int().nonnegative(),
  capMultiple: z.number().int().positive(), // bps-scaled, e.g. 15000 = 1.5x
  deadline: z.coerce.date(),
});

/** Wire DTO of a rounds row — bigint-as-string columns pass through as-is;
 *  only the two timestamptz columns need Date -> ISO. */
export const roundRowSchema = z.object({
  id: z.number().int(),
  clubId: z.number().int(),
  contractAddress: addressSchema,
  goal: z.string(),
  sharePrice: z.string(),
  revenueBps: z.number().int(),
  capMultiple: z.number().int(),
  deadline: z.string(),
  status: roundStatusSchema,
  verified: z.boolean(),
  createdAt: z.string(),
});

/** GET /rounds query — clubId filters, `all=1` opts in to unverified rows too. */
export const listRoundsQuerySchema = z.object({
  clubId: z.coerce.number().int().optional(),
  all: z.string().optional(),
});

export const closeCheckParamsSchema = z.object({ id: z.coerce.number().int() });
export const closeCheckResultSchema = z.object({ status: roundStatusSchema });
```

- [ ] **Step 2: Write `web/src/core/rounds/domain/types.ts`**

```ts
import type { z } from "zod";
import type { Round } from "@/db/schema";
import type { roundRowSchema } from "./schemas";

export type RoundStatus = "funding" | "active" | "closed";
export type RoundRowDTO = z.infer<typeof roundRowSchema>;

/** Serialize a rounds row to the wire DTO — goal/sharePrice are already
 *  strings on the drizzle row; only the two timestamptz columns convert. */
export function toRoundRowDTO(r: Round): RoundRowDTO {
  return { ...r, deadline: r.deadline.toISOString(), createdAt: r.createdAt.toISOString() };
}

/**
 * Mirrors the contract's own due-condition (`totalRaised >= goal ||
 * block.timestamp >= deadline`) so a close is only attempted when it should
 * actually succeed on-chain.
 */
export function isFundingDue(totalRaised: bigint, goal: bigint, deadline: Date, now: Date): boolean {
  return totalRaised >= goal || now.getTime() >= deadline.getTime();
}

/** RevenueShareRound.State enum labels (see lib/contracts.ts ROUND_STATE) to the DB's lowercase enum. */
export function mapOnChainStateToDb(state: "Funding" | "Active" | "Closed"): RoundStatus {
  return state.toLowerCase() as RoundStatus;
}
```

- [ ] **Step 3: Move the legacy test and rewrite it to `node:test`**

```bash
cd /home/skkippie/work/AI-DO/La12/web
mkdir -p src/core/rounds/domain/__tests__
git mv src/lib/closeFunding.test.ts src/core/rounds/domain/__tests__/rounds-domain.test.ts
```

Rewrite `web/src/core/rounds/domain/__tests__/rounds-domain.test.ts` to:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { isFundingDue, mapOnChainStateToDb, toRoundRowDTO } from "../types";
import type { Round } from "@/db/schema";

test("isFundingDue: goal reached", () => {
  assert.strictEqual(isFundingDue(40_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
  assert.strictEqual(isFundingDue(41_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
  assert.strictEqual(isFundingDue(39_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);
});

test("isFundingDue: deadline passed, goal not reached", () => {
  assert.strictEqual(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-07-01"), new Date("2026-07-06")), true);
});

test("isFundingDue: neither condition met", () => {
  assert.strictEqual(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);
});

test("mapOnChainStateToDb: lowercases the on-chain enum label", () => {
  assert.strictEqual(mapOnChainStateToDb("Funding"), "funding");
  assert.strictEqual(mapOnChainStateToDb("Active"), "active");
  assert.strictEqual(mapOnChainStateToDb("Closed"), "closed");
});

test("toRoundRowDTO: ISO-izes deadline/createdAt, keeps string money fields", () => {
  const row: Round = {
    id: 1, clubId: 1, contractAddress: "0xabc", goal: "40000000000", sharePrice: "1000000",
    revenueBps: 800, capMultiple: 15000,
    deadline: new Date("2026-08-01T00:00:00.000Z"),
    status: "funding", verified: true,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
  };
  const dto = toRoundRowDTO(row);
  assert.strictEqual(dto.deadline, "2026-08-01T00:00:00.000Z");
  assert.strictEqual(dto.createdAt, "2026-07-01T00:00:00.000Z");
  assert.strictEqual(dto.goal, "40000000000");
  assert.strictEqual(dto.status, "funding");
});
```

- [ ] **Step 4: Run the tests**

Run: `cd web && pnpm exec tsx --test src/core/rounds/domain/__tests__/rounds-domain.test.ts`
Expected: 5 pass. Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/rounds/domain web/src/lib/closeFunding.test.ts
git commit -m "feat(p4): rounds domain — schemas, types, pure helpers + moved tests"
```

---

## Task 9: rounds repository (list, insert, findById, updateStatus)

**Files:**
- Create: `web/src/core/rounds/server/repository/list-rounds.ts`
- Create: `web/src/core/rounds/server/repository/insert-round.ts`
- Create: `web/src/core/rounds/server/repository/find-round-by-id.ts`
- Create: `web/src/core/rounds/server/repository/update-round-status.ts`
- Test: `web/src/core/rounds/server/repository/__tests__/rounds-repository.test.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`); `rounds`, `clubs`, `Round`, `NewRound` (`@/db/schema`); `RoundStatus` (Task 8).
- Produces: `listRounds(filter: {clubId?, includeAll?}): Promise<Round[]>`; `insertRound(values: Omit<NewRound,"verified">): Promise<Round>`; `findRoundById(id): Promise<Round|undefined>`; `updateRoundStatus(id, status): Promise<void>`.

- [ ] **Step 1: Write `list-rounds.ts`**

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

export type ListRoundsFilter = { clubId?: number; includeAll?: boolean };

/** Public catalog list — filters clubId + verified (unless includeAll). */
export async function listRounds(filter: ListRoundsFilter): Promise<Round[]> {
  const conditions = [
    filter.clubId !== undefined ? eq(rounds.clubId, filter.clubId) : undefined,
    filter.includeAll ? undefined : eq(rounds.verified, true),
  ].filter((c): c is NonNullable<typeof c> => c !== undefined);

  return conditions.length > 0 ? db.select().from(rounds).where(and(...conditions)) : db.select().from(rounds);
}
```

- [ ] **Step 2: Write `insert-round.ts`**

```ts
import "server-only";
import { db } from "@/lib/db";
import { rounds, type NewRound, type Round } from "@/db/schema";

/** Inserts a round row, always `verified: true` — only called after the
 *  on-chain ownership check in create-round-service.ts. */
export async function insertRound(values: Omit<NewRound, "verified">): Promise<Round> {
  const [round] = await db
    .insert(rounds)
    .values({ ...values, verified: true })
    .returning();
  return round;
}
```

- [ ] **Step 3: Write `find-round-by-id.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";

export async function findRoundById(id: number): Promise<Round | undefined> {
  const [round] = await db.select().from(rounds).where(eq(rounds.id, id));
  return round;
}
```

- [ ] **Step 4: Write `update-round-status.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import type { RoundStatus } from "@/core/rounds/domain/types";

/** Corrects rounds.status to match the on-chain truth (never the other way). */
export async function updateRoundStatus(id: number, status: RoundStatus): Promise<void> {
  await db.update(rounds).set({ status }).where(eq(rounds.id, id));
}
```

- [ ] **Step 5: Write the live test (self-cleaning temp club + rounds)**

Create `web/src/core/rounds/server/repository/__tests__/rounds-repository.test.ts`:

```ts
import { test, after } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds } from "@/db/schema";
import { listRounds } from "../list-rounds";
import { insertRound } from "../insert-round";
import { findRoundById } from "../find-round-by-id";
import { updateRoundStatus } from "../update-round-status";

const TEMP_SLUG = "p4-test-club";
const TEMP_ADDR_VERIFIED = "0xfeed000000000000000000000000000000fee1";
const TEMP_ADDR_UNVERIFIED = "0xfeed000000000000000000000000000000fee2";

let clubId: number;

async function ensureTempClub(): Promise<number> {
  const [existing] = await db.select().from(clubs).where(eq(clubs.slug, TEMP_SLUG));
  if (existing) return existing.id;
  const [club] = await db
    .insert(clubs)
    .values({ name: "P4 Test Club", slug: TEMP_SLUG, walletAddress: "0x1111111111111111111111111111111111111111" })
    .returning();
  return club.id;
}

after(async () => {
  if (clubId === undefined) return;
  await db.delete(rounds).where(eq(rounds.clubId, clubId));
  await db.delete(clubs).where(eq(clubs.id, clubId));
});

test("listRounds / insertRound / findRoundById / updateRoundStatus", async () => {
  clubId = await ensureTempClub();
  const deadline = new Date(Date.now() + 30 * 86_400_000);

  const verified = await insertRound({
    clubId, contractAddress: TEMP_ADDR_VERIFIED, goal: "1000000", sharePrice: "1000000",
    revenueBps: 800, capMultiple: 15000, deadline,
  });
  assert.strictEqual(verified.verified, true); // insertRound always forces verified:true

  // A directly-inserted unverified row (bypassing insertRound) to test the filter.
  const [unverified] = await db
    .insert(rounds)
    .values({
      clubId, contractAddress: TEMP_ADDR_UNVERIFIED, goal: "1000000", sharePrice: "1000000",
      revenueBps: 800, capMultiple: 15000, deadline, status: "funding", verified: false,
    })
    .returning();

  const verifiedOnly = await listRounds({ clubId });
  assert.ok(verifiedOnly.some((r) => r.id === verified.id));
  assert.ok(!verifiedOnly.some((r) => r.id === unverified.id));

  const all = await listRounds({ clubId, includeAll: true });
  assert.ok(all.some((r) => r.id === unverified.id));

  const found = await findRoundById(verified.id);
  assert.strictEqual(found?.contractAddress, TEMP_ADDR_VERIFIED);

  await updateRoundStatus(verified.id, "active");
  const updated = await findRoundById(verified.id);
  assert.strictEqual(updated?.status, "active");
});
```

- [ ] **Step 6: Restore seed, then run the test**

```bash
cd web && pnpm db:migrate-pg
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/rounds/server/repository/__tests__/rounds-repository.test.ts
```
Expected: 1 pass (all four functions asserted within it). If it fails partway, the `after` hook still cleans up (registered before the test body runs); if the process is killed mid-test, fall back to `DELETE FROM rounds WHERE club_id IN (SELECT id FROM clubs WHERE slug = 'p4-test-club'); DELETE FROM clubs WHERE slug = 'p4-test-club';`.

- [ ] **Step 7: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/rounds/server/repository
git commit -m "feat(p4): rounds repository — list, insert, findById, updateStatus"
```

---

## Task 10: rounds try-close-funding (moved) + services (list, create, close-check)

**Files:**
- Create: `web/src/core/rounds/server/services/try-close-funding.ts`
- Create: `web/src/core/rounds/server/services/list-rounds-service.ts`
- Create: `web/src/core/rounds/server/services/create-round-service.ts`
- Create: `web/src/core/rounds/server/services/close-check-service.ts`
- Test: `web/src/core/rounds/server/services/__tests__/list-rounds-service.test.ts`
- Test: `web/src/core/rounds/server/services/__tests__/create-round-service.test.ts`
- Test: `web/src/core/rounds/server/services/__tests__/close-check-service.test.ts`

**Interfaces:**
- Consumes: `listRounds`, `insertRound`, `findRoundById`, `updateRoundStatus` (Task 9); `isFundingDue`, `mapOnChainStateToDb` (Task 8); `totalRaised`, `roundState`, `publicClient`, `revenueShareRoundAbi` (`@/lib/contracts`); `closeFundingSponsored` (`@/lib/sponsor` — unchanged P6 legacy); `ok`/`err`/`AppErrors`/`AsyncAppResult` (`@/server/common/responses`).
- Produces: `listRoundsForQuery(deps): AsyncAppResult<Round[]>` + `listRoundsService(filter)`; `createRound(deps): AsyncAppResult<Round>` + `createRoundService(club, body)`; `closeCheck(deps): AsyncAppResult<{status}>` + `closeCheckService(id)`; `tryCloseFundingIfDue(round): Promise<RoundStatus>`.

- [ ] **Step 1: Write `try-close-funding.ts` (moved verbatim, updated imports)**

```ts
import "server-only";
import { totalRaised, roundState } from "@/lib/contracts";
import { closeFundingSponsored } from "@/lib/sponsor";
import { updateRoundStatus } from "../repository/update-round-status";
import { isFundingDue, mapOnChainStateToDb, type RoundStatus } from "@/core/rounds/domain/types";
import type { Round } from "@/db/schema";

/**
 * If `round` is still `funding` and due to close (goal reached or deadline
 * passed), sends the sponsor-paid `closeFunding()` call. Either way, finishes
 * by reading the contract's real `state()` and correcting `rounds.status` in
 * the DB if it's stale — the DB is never trusted, only ever corrected from
 * on-chain reads. Moved verbatim from lib/closeFunding.ts; still imports the
 * ops-domain (P6) sponsor relayer — unchanged, out of scope here.
 */
export async function tryCloseFundingIfDue(round: Round): Promise<RoundStatus> {
  if (round.status !== "funding") return round.status;

  const address = round.contractAddress as `0x${string}`;

  try {
    const raised = await totalRaised(address);
    if (isFundingDue(raised, BigInt(round.goal), round.deadline, new Date())) {
      await closeFundingSponsored(address);
    }
  } catch {
    // RPC read failed — fall through to the state() read below, which will
    // also fail and return the existing status unchanged.
  }

  let onChainStatus: RoundStatus;
  try {
    onChainStatus = mapOnChainStateToDb(await roundState(address));
  } catch {
    return round.status;
  }

  if (onChainStatus !== round.status) {
    try {
      await updateRoundStatus(round.id, onChainStatus);
    } catch {
      // DB write failed — stale status persists but caller still gets the correct
      // on-chain truth; the DB will be corrected on the next successful check.
    }
  }
  return onChainStatus;
}
```

No dedicated test for this file — it's chain+DB orchestration that swallows its own errors by design (matches the legacy `closeFunding.test.ts`, which also only tested the pure `isFundingDue`/`mapOnChainStateToDb` helpers, moved in Task 8). It's exercised via `close-check-service.test.ts`'s injected `tryClose` fake below, plus Task 11's live verification.

- [ ] **Step 2: Write the failing list-rounds-service test**

Create `web/src/core/rounds/server/services/__tests__/list-rounds-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { listRoundsForQuery } from "../list-rounds-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 1, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "1000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("listRoundsForQuery: forwards the filter to the repository", async () => {
  let seenFilter: unknown;
  const result = await listRoundsForQuery({
    filter: { clubId: 1 },
    listRounds: async (f) => {
      seenFilter = f;
      return [ROUND];
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, [ROUND]);
  assert.deepStrictEqual(seenFilter, { clubId: 1 });
});

test("listRoundsForQuery: a repository throw degrades to ok([]) (graceful-empty, public read)", async () => {
  const result = await listRoundsForQuery({
    filter: {},
    listRounds: async () => {
      throw new Error("db down");
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, []);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/rounds/server/services/__tests__/list-rounds-service.test.ts`
Expected: FAIL — `Cannot find module '../list-rounds-service'`.

- [ ] **Step 4: Write `list-rounds-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok } from "@/server/common/responses";
import { listRounds, type ListRoundsFilter } from "../repository/list-rounds";
import type { Round } from "@/db/schema";

type ListRoundsDeps = { filter: ListRoundsFilter; listRounds: (filter: ListRoundsFilter) => Promise<Round[]> };

/** Public catalog list — no auth, graceful-empty (a DB failure here degrades
 *  like any other public read rather than erroring the whole page). */
export async function listRoundsForQuery(deps: ListRoundsDeps): AsyncAppResult<Round[]> {
  try {
    return ok(await deps.listRounds(deps.filter));
  } catch {
    return ok([]);
  }
}

export function listRoundsService(filter: ListRoundsFilter): AsyncAppResult<Round[]> {
  return listRoundsForQuery({ filter, listRounds });
}
```

- [ ] **Step 5: Run the list-rounds test to verify it passes**

Run the Step 3 command again. Expected: 2 pass.

- [ ] **Step 6: Write the failing create-round-service test**

Create `web/src/core/rounds/server/services/__tests__/create-round-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { createRound } from "../create-round-service";
import type { Round } from "@/db/schema";

const CLUB = { id: 1, walletAddress: "0x1111111111111111111111111111111111111111" };
const BODY = {
  contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "40000000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"),
};
const INSERTED: Round = {
  id: 9, clubId: 1, contractAddress: BODY.contractAddress, goal: BODY.goal, sharePrice: BODY.sharePrice,
  revenueBps: BODY.revenueBps, capMultiple: BODY.capMultiple, deadline: BODY.deadline, status: "funding",
  verified: true, createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("createRound: matching on-chain club() -> inserts and returns ok(round)", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => CLUB.walletAddress,
    insertRound: async () => INSERTED,
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.id, 9);
});

test("createRound: mismatched on-chain club() -> err(invalidBody, targets:[contractAddress])", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => "0x9999999999999999999999999999999999999999",
    insertRound: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 400);
  assert.deepStrictEqual(result.error.targets, ["contractAddress"]);
});

test("createRound: an unreadable contract -> err(invalidBody, targets:[contractAddress])", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => {
      throw new Error("execution reverted");
    },
    insertRound: async () => {
      throw new Error("should not be called");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 400);
});

test("createRound: an insert failure -> err(unexpected) -> 500", async () => {
  const result = await createRound({
    club: CLUB, body: BODY,
    readClub: async () => CLUB.walletAddress,
    insertRound: async () => {
      throw new Error("db down");
    },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/rounds/server/services/__tests__/create-round-service.test.ts`
Expected: FAIL — `Cannot find module '../create-round-service'`.

- [ ] **Step 8: Write `create-round-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";
import { insertRound } from "../repository/insert-round";
import type { Round, NewRound } from "@/db/schema";

type CreateRoundBody = {
  contractAddress: string;
  goal: string;
  sharePrice: string;
  revenueBps: number;
  capMultiple: number;
  deadline: Date;
};

type Club = { id: number; walletAddress: string };

type CreateRoundDeps = {
  club: Club;
  body: CreateRoundBody;
  readClub: (address: `0x${string}`) => Promise<string>;
  insertRound: (values: Omit<NewRound, "verified">) => Promise<Round>;
};

/**
 * `RoundFactory.createRound()` is permissionless — anyone can deploy a round
 * naming any address as `club`. So a session + role check alone isn't
 * enough: we also read the deployed round's own `club()` and require it to
 * match this account's registered wallet before trusting the submission
 * (and only then mark it `verified`). This is on top of, not instead of, the
 * role gate — a fan session never reaches this service (clubAuthed rejects
 * it before the route calls in). Moved verbatim from app/api/rounds POST.
 */
export async function createRound(deps: CreateRoundDeps): AsyncAppResult<Round> {
  const { club, body } = deps;

  let onChainClub: string;
  try {
    onChainClub = await deps.readClub(body.contractAddress as `0x${string}`);
  } catch {
    return err(AppErrors.invalidBody({ targets: ["contractAddress"] }));
  }

  if (onChainClub.toLowerCase() !== club.walletAddress.toLowerCase()) {
    return err(AppErrors.invalidBody({ targets: ["contractAddress"] }));
  }

  try {
    const round = await deps.insertRound({
      clubId: club.id,
      contractAddress: body.contractAddress,
      goal: body.goal,
      sharePrice: body.sharePrice,
      revenueBps: body.revenueBps,
      capMultiple: body.capMultiple,
      deadline: body.deadline,
    });
    return ok(round);
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function createRoundService(club: Club, body: CreateRoundBody): AsyncAppResult<Round> {
  return createRound({
    club,
    body,
    readClub: (address) =>
      publicClient.readContract({ address, abi: revenueShareRoundAbi, functionName: "club" }) as Promise<string>,
    insertRound,
  });
}
```

- [ ] **Step 9: Run the create-round test to verify it passes**

Run the Step 7 command again. Expected: 4 pass.

- [ ] **Step 10: Write the failing close-check-service test**

Create `web/src/core/rounds/server/services/__tests__/close-check-service.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert";
import { closeCheck } from "../close-check-service";
import type { Round } from "@/db/schema";

const ROUND: Round = {
  id: 4, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "1000000", sharePrice: "1000000", revenueBps: 800, capMultiple: 15000,
  deadline: new Date("2026-12-01T00:00:00.000Z"), status: "funding", verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
};

test("closeCheck: err(notFound) when the round doesn't exist", async () => {
  const result = await closeCheck({ id: 999, findRoundById: async () => undefined, tryClose: async () => "funding" });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 404);
});

test("closeCheck: ok({status}) from the injected tryClose", async () => {
  const result = await closeCheck({ id: 4, findRoundById: async () => ROUND, tryClose: async () => "active" });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.deepStrictEqual(result.data, { status: "active" });
});

test("closeCheck: a repository throw -> err(unexpected) -> 500", async () => {
  const result = await closeCheck({
    id: 4,
    findRoundById: async () => {
      throw new Error("db down");
    },
    tryClose: async () => "funding",
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
});
```

- [ ] **Step 11: Run it to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/rounds/server/services/__tests__/close-check-service.test.ts`
Expected: FAIL — `Cannot find module '../close-check-service'`.

- [ ] **Step 12: Write `close-check-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { findRoundById } from "../repository/find-round-by-id";
import { tryCloseFundingIfDue } from "./try-close-funding";
import type { RoundStatus } from "@/core/rounds/domain/types";
import type { Round } from "@/db/schema";

type CloseCheckDeps = {
  id: number;
  findRoundById: (id: number) => Promise<Round | undefined>;
  tryClose: (round: Round) => Promise<RoundStatus>;
};

/** Public + permissionless — findById (404) -> tryClose -> the corrected status. */
export async function closeCheck(deps: CloseCheckDeps): AsyncAppResult<{ status: RoundStatus }> {
  try {
    const round = await deps.findRoundById(deps.id);
    if (!round) return err(AppErrors.notFound());
    const status = await deps.tryClose(round);
    return ok({ status });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function closeCheckService(id: number): AsyncAppResult<{ status: RoundStatus }> {
  return closeCheck({ id, findRoundById, tryClose: tryCloseFundingIfDue });
}
```

- [ ] **Step 13: Run the close-check test to verify it passes**

Run the Step 11 command again. Expected: 3 pass.

- [ ] **Step 14: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/rounds/server/services
git commit -m "feat(p4): rounds services — try-close-funding (moved) + list/create/close-check"
```

---

## Task 11: rounds routes + router + wire

**Files:**
- Create: `web/src/core/rounds/server/api/routes/list-rounds.route.ts`
- Create: `web/src/core/rounds/server/api/routes/create-round.route.ts`
- Create: `web/src/core/rounds/server/api/routes/close-check.route.ts`
- Create: `web/src/core/rounds/server/api/router.ts`
- Modify: `web/src/server/router.ts` (add `.use(roundsRouter)`)

**Interfaces:**
- Consumes: `clubAuthed` (`@/server/auth/middleware/club-authed`); the three services (Task 10); the domain schemas/serializers (Task 8); `CommonResponse`/`errorResponseSchema`/`errorToResponse`/`successResponseSchema`/`createdResponseSchema` (`@/server/common/responses`).
- Produces: `roundsRouter` mounted at `/api/v1/rounds`; `GET /`, `POST /`, `POST /:id/close-check`.

- [ ] **Step 1: Write `list-rounds.route.ts` (public)**

```ts
import { Elysia } from "elysia";
import { z } from "zod";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { listRoundsQuerySchema, roundRowSchema } from "@/core/rounds/domain/schemas";
import { toRoundRowDTO } from "@/core/rounds/domain/types";
import { listRoundsService } from "../../services/list-rounds-service";

export const listRoundsRoute = new Elysia().get(
  "/",
  async ({ query, status }) => {
    const result = await listRoundsService({ clubId: query.clubId, includeAll: query.all === "1" });
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toRoundRowDTO) }));
  },
  {
    query: listRoundsQuerySchema,
    response: {
      200: successResponseSchema(z.array(roundRowSchema), "Rounds"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Rounds"], summary: "Public round catalog (filterable by clubId; verified-only unless all=1)" },
  },
);
```

- [ ] **Step 2: Write `create-round.route.ts` (clubAuthed, TEMPLATE NOTE)**

```ts
import { Elysia } from "elysia";
import { clubAuthed } from "@/server/auth/middleware/club-authed";
import { CommonResponse, errorResponseSchema, errorToResponse, createdResponseSchema } from "@/server/common/responses";
import { createRoundBodySchema, roundRowSchema } from "@/core/rounds/domain/schemas";
import { toRoundRowDTO } from "@/core/rounds/domain/types";
import { createRoundService } from "../../services/create-round-service";

export const createRoundRoute = new Elysia().use(clubAuthed).post(
  "/",
  async ({ body, club, status }) => {
    const result = await createRoundService(club, body);
    // TEMPLATE NOTE: create can ALSO err with invalidBody(400) — the deployed
    // contract's on-chain club() doesn't match this club's registered wallet, or
    // couldn't be read at all — on top of the macro's 401/403/409 and the
    // deps-injected insert's possible 500. Widen both the cast and the response
    // map accordingly (see get-positions.route.ts's TEMPLATE NOTE for the base case,
    // and holders.route.ts for the sibling 403-widening exemplar).
    if (!result.ok) return status(result.error.status as 400 | 500, errorToResponse(result.error));
    return status(201, CommonResponse.created({ response: toRoundRowDTO(result.data) }));
  },
  {
    clubAuthed: true,
    body: createRoundBodySchema,
    response: {
      201: createdResponseSchema(roundRowSchema, "Round"),
      400: errorResponseSchema(400),
      401: errorResponseSchema(401),
      403: errorResponseSchema(403),
      409: errorResponseSchema(409),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Rounds"],
      summary: "Register a round for the caller's club, after verifying on-chain ownership",
    },
  },
);
```

- [ ] **Step 3: Write `close-check.route.ts` (public)**

```ts
import { Elysia } from "elysia";
import { CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema } from "@/server/common/responses";
import { closeCheckParamsSchema, closeCheckResultSchema } from "@/core/rounds/domain/schemas";
import { closeCheckService } from "../../services/close-check-service";

/**
 * Public and unauthenticated on purpose: it only ever reads on-chain state
 * and, if due, performs the same permissionless `closeFunding()` call anyone
 * could already send directly — there's no privileged action to gate here.
 */
export const closeCheckRoute = new Elysia().post(
  "/:id/close-check",
  async ({ params, status }) => {
    const result = await closeCheckService(params.id);
    if (!result.ok) return status(result.error.status as 404 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    params: closeCheckParamsSchema,
    response: {
      200: successResponseSchema(closeCheckResultSchema, "CloseCheckResult"),
      404: errorResponseSchema(404),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Rounds"], summary: "Permissionless: close the round on-chain if due, sync DB status" },
  },
);
```

- [ ] **Step 4: Write `router.ts`**

```ts
import { Elysia } from "elysia";
import { listRoundsRoute } from "./routes/list-rounds.route";
import { createRoundRoute } from "./routes/create-round.route";
import { closeCheckRoute } from "./routes/close-check.route";

export const roundsRouter = new Elysia({ prefix: "/rounds" })
  .use(listRoundsRoute)
  .use(createRoundRoute)
  .use(closeCheckRoute);
```

- [ ] **Step 5: Wire `roundsRouter` into `web/src/server/router.ts`**

Add the import next to the clubs import:
```ts
import { roundsRouter } from "@/core/rounds/server/api/router";
```
And chain `.use(roundsRouter)` immediately after `.use(clubsRouter)`:
```ts
  .use(clubsRouter)
  .use(roundsRouter);
```

- [ ] **Step 6: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build succeeds.

- [ ] **Step 7: Live verify — these routes are public, so fully verifiable now**

Start dev (`cd web && pnpm dev`) in a background shell, then:
```bash
# Public list — 200, an array containing at least the seeded verified round.
curl -s http://localhost:3000/api/v1/rounds

# Filtered by an unknown clubId — 200, empty array.
curl -s "http://localhost:3000/api/v1/rounds?clubId=999999"

# Unauthenticated create — 401 (clubAuthed short-circuits before the body is read).
curl -s -X POST http://localhost:3000/api/v1/rounds -H 'Content-Type: application/json' -d '{}'

# close-check on a nonexistent round — 404.
curl -s -X POST http://localhost:3000/api/v1/rounds/999999/close-check

# close-check on the seeded round (id likely 1) — 200 {"status":"funding"} (its
# placeholder contractAddress means the on-chain reads fail and tryClose falls
# back to the existing DB status — see try-close-funding.ts's catch branches).
curl -s -X POST http://localhost:3000/api/v1/rounds/1/close-check
```
Expected: all five match the description above. The authenticated 201 create path is verified in-browser in Task 13, once `CreateRoundForm` is cut over.

- [ ] **Step 8: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/rounds/server/api web/src/server/router.ts
git commit -m "feat(p4): rounds routes + router — list (public), create (clubAuthed), close-check (public)"
```

---

## Task 12: rounds client hooks (useRounds)

**Files:**
- Create: `web/src/core/rounds/client/hooks.ts`

**Interfaces:**
- Consumes: `useElysia` (`@/frontend/lib/eden`); `useQuery`/`useMutation`/`useQueryClient` (`@tanstack/react-query`).
- Produces: `useRounds(): { useList, useCreate, useCloseCheck }`.

- [ ] **Step 1: Write `hooks.ts`**

```ts
"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Round-domain client hooks. `useList` is public (no clubAuthed); `useCreate`
 *  requires a club session (enforced server-side by clubAuthed); `useCloseCheck`
 *  is public and permissionless (see close-check.route.ts) — InvestForm fires
 *  it and ignores the result, matching the legacy fire-and-forget fetch. */
export const useRounds = () => {
  const elysia = useElysia();
  const queryClient = useQueryClient();

  const useList = (query: { clubId?: number; all?: string } = {}) =>
    useQuery(elysia.rounds.get.queryOptions({ query }));

  const useCreate = () =>
    useMutation(
      elysia.rounds.post.mutationOptions({
        onSuccess: () => queryClient.invalidateQueries({ queryKey: elysia.rounds.get.queryKey() }),
      }),
    );

  // Path-param call-shape confirmed against the eden treaty in Step 2 below —
  // Elysia's `:id` segment becomes a callable `elysia.rounds({ id })`, and the
  // hyphenated `close-check` segment needs bracket access. `id` is taken as a
  // hook parameter (InvestForm already has `roundId` as a prop) rather than a
  // mutate-time argument, since the path itself must be known before the
  // mutation is constructed.
  const useCloseCheck = (id: number) => useMutation(elysia.rounds({ id })["close-check"].post.mutationOptions());

  return { useList, useCreate, useCloseCheck };
};
```

- [ ] **Step 2: Typecheck the hooks against the router types**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. If `tsc` rejects the `elysia.rounds({ id })["close-check"]` call-shape, open the generated Eden treaty type for `AppRouter` (hover the `elysia.rounds` type, or check `@elysiajs/eden`'s treaty output for a dynamic-segment route) and adjust the accessor to match — the `useCreate`/`useList` calls are the proven-shape reference (they mirror `elysia.account.wallet.post` and `elysia.wallet.positions.get` from Tasks already wired), so only the dynamic-`:id` + hyphenated-segment combination is new here.

- [ ] **Step 3: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/rounds/client
git commit -m "feat(p4): rounds client hooks — useRounds (useList/useCreate/useCloseCheck)"
```

---

## Task 13: rounds cutover — CreateRoundForm, InvestForm, marketing page, delete legacy

**Files:**
- Modify: `web/src/components/CreateRoundForm.tsx`
- Modify: `web/src/components/InvestForm.tsx`
- Modify: `web/src/app/(marketing)/club/[slug]/page.tsx`
- Delete: `web/src/lib/closeFunding.ts`, `web/src/app/api/rounds/route.ts`, `web/src/app/api/rounds/[id]/close-check/route.ts`

**Interfaces:**
- Consumes: `useRounds` (Task 12); `tryCloseFundingIfDue` (Task 10, for the RSC's own direct server-side call — not through HTTP).

- [ ] **Step 1: Rewrite `CreateRoundForm.tsx` to use `useRounds().useCreate()`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet } from "@/lib/wdk";
import { createRoundOnChain } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { useRounds } from "@/core/rounds/client/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}`;
  onCreated?: () => void;
};

/** Deploys a real RevenueShareRound via RoundFactory, then registers it. */
export function CreateRoundForm({ clubName, clubWalletAddress, usdtAddress, onCreated }: Props) {
  const router = useRouter();
  const { userId } = useCurrentUserId();
  const { useCreate } = useRounds();
  const createRound = useCreate();
  const [goal, setGoal] = useState("40000");
  const [sharePrice, setSharePrice] = useState("1");
  const [revenueBps, setRevenueBps] = useState("800");
  const [capMultiple, setCapMultiple] = useState("15000");
  const [deadlineDays, setDeadlineDays] = useState("90");
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!userId) return;
    setSubmitting(true);
    const toastId = toast.loading("Deploying round…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + Number(deadlineDays) * 86_400);

      const contractAddress = await createRoundOnChain(wallet, {
        name: `${clubName} Round`,
        symbol: "LDR",
        usdtToken: usdtAddress,
        club: clubWalletAddress,
        goal: parseUsdt(goal),
        sharePriceUsdt: parseUsdt(sharePrice),
        revenueBps: BigInt(revenueBps),
        capMultiple: BigInt(capMultiple),
        deadline,
      });

      toast.loading("Registering round…", { id: toastId });
      try {
        await createRound.mutateAsync({
          contractAddress,
          goal: parseUsdt(goal).toString(),
          sharePrice: parseUsdt(sharePrice).toString(),
          revenueBps: Number(revenueBps),
          capMultiple: Number(capMultiple),
          deadline: new Date(Number(deadline) * 1000).toISOString(),
        });
      } catch {
        // eden-tanstack's mutationFn throws result.error on an API error, so
        // mutateAsync rejects on failure — normalize to one friendly message,
        // caught uniformly below alongside the on-chain-deploy failure path.
        throw new Error("No se pudo registrar la ronda");
      }

      toast.success("Round created!", { id: toastId });
      onCreated?.();
      router.refresh();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-2xl tracking-wide">Create new round</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-goal">Goal (USD₮)</Label>
          <Input id="cr-goal" type="number" min="1" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-price">Price per share (USD₮)</Label>
          <Input id="cr-price" type="number" min="0.01" step="0.01" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-bps">Revenue share (bps, 800 = 8%)</Label>
          <Input id="cr-bps" type="number" min="1" max="10000" value={revenueBps} onChange={(e) => setRevenueBps(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-cap">Cap (bps, 15000 = 1.5x)</Label>
          <Input id="cr-cap" type="number" min="1" value={capMultiple} onChange={(e) => setCapMultiple(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-days">Deadline (days)</Label>
          <Input id="cr-days" type="number" min="1" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} />
        </div>
      </div>
      <Button className="self-start" onClick={handleCreate} disabled={!userId || submitting}>
        {submitting ? "Deploying…" : "Create round"}
      </Button>
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite `InvestForm.tsx` to use `useRounds().useCloseCheck()`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet } from "@/lib/wdk";
import { approveUsdt, invest, usdtAllowance } from "@/lib/contracts";
import { parseUsdt } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { useRounds } from "@/core/rounds/client/hooks";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  roundId: number;
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundId, roundAddress, onInvested }: Props) {
  const router = useRouter();
  const { userId } = useCurrentUserId();
  const { useCloseCheck } = useRounds();
  const closeCheck = useCloseCheck(roundId);
  const [amount, setAmount] = useState("10");
  const [status, setStatus] = useState<"idle" | "pending" | "done">("idle");

  async function handleInvest() {
    if (!userId) return;
    setStatus("pending");
    const toastId = toast.loading("Preparing…");
    try {
      await createWallet(userId); // no-ops if a wallet already exists
      const wallet = await getWallet(userId);
      const value = parseUsdt(amount);

      // invest() does a transferFrom under the hood — approve first if the
      // round doesn't already have enough allowance from a previous invest.
      const allowance = await usdtAllowance(wallet.address, roundAddress);
      if (allowance < value) {
        toast.loading("Approving USD₮…", { id: toastId });
        await approveUsdt(wallet, roundAddress, value);
      }

      toast.loading("Investing…", { id: toastId });
      const hash = await invest(wallet, roundAddress, value);

      // Best-effort: if this investment crossed the goal, close funding now
      // so the club receives the raised USD₮ immediately. A failure here
      // never blocks the fan's own successful investment.
      closeCheck.mutateAsync().catch(() => {});

      toast.success("Investment confirmed!", { id: toastId });
      setStatus("done");
      onInvested?.(hash);
      router.refresh();
    } catch (err) {
      setStatus("idle");
      toast.error(friendlyError(err), { id: toastId });
    }
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="invest-amount">Amount to invest (USD₮)</Label>
      <Input
        id="invest-amount"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-700 dark:text-amber-200">
        ⚠️ No refunds. You&apos;re buying a right to a % of the club&apos;s
        revenue, not a guarantee. If the round doesn&apos;t reach its goal,
        your USD₮ still goes to the club and you get paid based on real
        revenue. Your keys are yours.
      </p>
      <Button onClick={handleInvest} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Investing…" : "Invest"}
      </Button>
    </Card>
  );
}
```

- [ ] **Step 3: Repoint `marketing/club/[slug]/page.tsx`**

This is an RSC — it calls `tryCloseFundingIfDue` directly server-side (not through the HTTP route), so only the import path changes:

```ts
// remove:
import { tryCloseFundingIfDue } from "@/lib/closeFunding";
// add:
import { tryCloseFundingIfDue } from "@/core/rounds/server/services/try-close-funding";
```

The rest of the file (session check, club/round lookup, `RoundProgress`, `InvestForm` render) is unchanged.

- [ ] **Step 4: Delete the legacy files**

```bash
cd web
git rm src/lib/closeFunding.ts
git rm src/app/api/rounds/route.ts src/app/api/rounds/\[id\]/close-check/route.ts
rmdir "src/app/api/rounds/[id]/close-check" "src/app/api/rounds/[id]" src/app/api/rounds 2>/dev/null || true
```

- [ ] **Step 5: Grep for stragglers**

Run: `cd web && grep -rn "lib/closeFunding\|api/rounds\b" src`
Expected: only the now-updated import in `marketing/club/[slug]/page.tsx` (pointing at `@/core/rounds/server/services/try-close-funding`) and any doc comments referencing the new `/api/v1/rounds` path. No remaining `fetch("/api/rounds...")` or `from "@/lib/closeFunding"`.

- [ ] **Step 6: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build succeeds.

- [ ] **Step 7: In-browser verify**

With `pnpm dev` running:
1. As the seeded/a club account with a linked wallet + `NEXT_PUBLIC_ROUND_FACTORY`/`NEXT_PUBLIC_USDT_ADDRESS` configured: `/dashboard` → "New round" → fill the form → Create. DevTools Network shows `POST /api/v1/rounds` → `201`. `psql "$DATABASE_URL" -c "select id, contract_address, verified from rounds order by id desc limit 1;"` shows the new row with `verified = true`.
2. Visit the club's public page (`/club/<slug>`) as a signed-in fan and invest a small amount. DevTools Network shows `POST /api/v1/rounds/<id>/close-check` fired (fire-and-forget) alongside the on-chain `invest` tx.
3. Confirm no `/api/rounds` (non-`v1`) request appears anywhere in the network tab for either flow.

- [ ] **Step 8: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/components/CreateRoundForm.tsx web/src/components/InvestForm.tsx "web/src/app/(marketing)/club/[slug]/page.tsx" web/src/lib web/src/app/api/rounds
git commit -m "feat(p4): cut CreateRoundForm/InvestForm to useRounds; repoint marketing club page; delete legacy lib/closeFunding + /api/rounds/*"
```

---

## Self-Review

**Spec coverage:**
- §1 goal (clubs reads behind `clubAuthed`, rounds lifecycle) → Tasks 1–7 (clubs), 8–13 (rounds). ✓
- §2 decisions: one combined plan (~13 tasks) → 13 tasks delivered; legacy-lib full move + delete → Tasks 7, 13; `useClubs()`/`useRounds()` factory hooks → Tasks 6, 12; rounds list public/no macro → Task 11 Step 1; create gated by `clubAuthed` → Task 11 Step 2; close-check public, keeps `lib/sponsor` → Task 10 Step 1, Task 11 Step 3; graceful-empty reads → Tasks 4, 10 (list only). ✓
- §3 scope boundaries: `lib/sponsor.ts` / `lib/contracts.ts` untouched (only imported) → verified no plan step edits either file; Directory (P5) untouched → no plan step touches `lib/clubDirectory.ts` or marketing catalog pages; chain writes stay client-signed → `CreateRoundForm`/`InvestForm` still sign client-side, only the *registration* call moved. ✓
- §4 legacy behavior (clubs `getClubOverview`/`getClubDistributions`/`getRoundHolders`, rounds GET/POST/close-check) → transcribed 1:1 into Tasks 1–4 (clubs) and 8–10 (rounds); `LOG_WINDOW`/`INVESTED_EVENT`/`DISTRIBUTED_EVENT` preserved verbatim in Tasks 3–4. ✓
- §5 file structure → File Structure section above matches (with `roundQuerySchema`/`get-round-holders-service.ts` naming exactly as specified). ✓
- §6.1 graceful-empty → Task 4 (all three services, ok-on-catch) + Task 10 (`list-rounds-service` only). ✓
- §6.2 holders 403 multi-status exemplar → Task 5 Step 3 (widened cast + response map + TEMPLATE NOTE). ✓
- §6.3 create ownership verify → Task 10 Step 8 (`createRound`), Task 11 Step 2 (widened cast + TEMPLATE NOTE + 201). ✓
- §6.4 close-check public/permissionless → Task 10 Step 12, Task 11 Step 3. ✓
- §6.5 money discipline (strings on wire, bigint in domain, ISO deadline) → Task 1/8 schemas + serializers/parsers. ✓
- §6.6 factory client hooks → Task 6 (`useClubs`), Task 12 (`useRounds`), matching the spec's pseudocode shape (including the flagged `useCloseCheck` path-param uncertainty, resolved via a typecheck-and-adjust step rather than a guess). ✓
- §7 error/status semantics table → every route's `response:` map in Tasks 5 and 11 matches the table exactly (including which routes have NO 500: `overview`/`distributions`/`holders` still list 500 defensively per the wallet template's own convention, but the service layer is proven never to emit it). ✓
- §8 testing → pure domain (Tasks 1, 8), live repo (Tasks 2, 9), deps-injected services with fakes (Tasks 4, 10), manual/live curl+browser (Tasks 5, 7, 11, 13) all present. ✓
- §9 global constraints → copied verbatim into this plan's Global Constraints section, plus the test commands supplied in the task brief. ✓

**Placeholder scan:** no TBD/TODO/"similar to task N" anywhere; every code step is complete, copy-pasteable code. The one deliberately-flagged uncertainty (`useRounds().useCloseCheck`'s exact eden path-param call-shape) is resolved with an explicit typecheck-and-adjust instruction (Task 12 Step 2), not a guess presented as fact — same pattern P1/P2 used for their own eden-shape uncertainties. ✓

**Type consistency:** `Round`/`NewRound` (from `@/db/schema`) flow unchanged from Task 9's repository signatures through Task 10's services to Task 11's routes (`insertRound(values: Omit<NewRound,"verified">): Promise<Round>` used identically in `create-round-service.ts` and its test's fakes). `ClubRound`/`ClubTotals`/`Distribution`/`SeriesPoint`/`Holder` (Task 1) are the same domain types consumed by Task 4's services, Task 5's routes (via `to*DTO`), Task 6's hooks (via `parse*`), and Task 7's components (via the `components/club/types.ts` re-export) — no shape re-declared. `RoundStatus` is defined once (Task 8 `domain/types.ts`) and imported everywhere else that needs it (Task 9's `update-round-status.ts`, Task 10's `try-close-funding.ts`/`close-check-service.ts`, Task 4's `get-club-overview-service.ts`) rather than re-typed as a string union. `getRoundHolders` (Task 3, raw chain read) and `getRoundHoldersForClub`/`getRoundHoldersService` (Task 4, deps-injected orchestrator + real wrapper) are deliberately named apart to avoid a same-file shadow when Task 4 imports both. ✓
