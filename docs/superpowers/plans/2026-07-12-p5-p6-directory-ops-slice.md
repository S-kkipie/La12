# P5+P6 — directory + ops slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the public club/round catalog (`lib/clubDirectory.ts`) and the four server-relayer helper routes (`/api/faucet`, `/api/faucet-usdt`, `/api/moonpay`, `/api/sync`) into two new Elysia domains — `core/directory` and `core/ops` — behind the same tri-layer template P1/P2 established, executed in an isolated git worktree in parallel with the P3+P4 (clubs+rounds) work happening on `main`.

**Architecture:** Two independent `core/<domain>` slices sharing nothing but the wire-response/`AsyncAppResult` infrastructure. `core/directory` is a **public, table-direct** read (no `authed` macro, no dependency on `core/clubs`/`core/rounds` — those live on the P3+P4 branch, absent here): domain → repository (`clubs`⨝`rounds`, verified only) → service (chain-enrich `totalRaised`, sort by pct, graceful-empty) → route, consumed directly by RSC pages (no client hook — server-to-server). `core/ops` is four **public mutation** routes, each a thin service wrapping an existing engine lib (`@/lib/sponsor`, `@/lib/faucetUsdt`, `@/lib/moonpay`, plus a hand-rolled on-chain-log sync), consumed via a `useOps()` factory hook (`useFundGas`/`useMintUsdt`/`useMoonpay`) from `AddFundsDialog` and `useEnsureWallet`'s best-effort gas top-up. The **only file this plan shares with the parallel P3+P4 branch is `web/src/server/router.ts`** — one expected trivial merge conflict at integration time (see Global Constraints).

**Tech Stack:** Elysia 1.4, Eden + eden-tanstack-react-query, @tanstack/react-query 5, Drizzle (node-postgres), viem (chain reads/relayer writes), zod v4, `node:test` + tsx, pnpm.

**Spec:** `docs/superpowers/specs/2026-07-12-p5-p6-directory-ops-slice-design.md`.

## Global Constraints

**Inherited (spec §9, verbatim):**
- `pnpm exec tsc --noEmit` (in `web/`) EXIT 0 authoritative (`drizzle-orm` duplicate-instance TS2345 = known false positive).
- Server-only-importing tests: `node --conditions=react-server` + live `DATABASE_URL`; `pnpm db:migrate-pg` before live repo tests; live repo tests self-clean any temp rows.
- Elysia validates with zod (422, array `path`); root `onError` untouched.
- Money on wire = strings, parsed to bigint at the edge; never `Number()` on money.
- Self-custody: server never holds the fan key. faucet/sponsor use the server's OWN relayer key (`SPONSOR_PK`) — never the fan's. moonpay secret is server-only. Chain writes stay client-signed (ops helpers are the sanctioned server-relayer exceptions, unchanged from legacy).
- `useDirectory()`/`useOps()` factory-hook convention (canonical). (This plan finds no directory-domain client consumer — see Task 5 — so only `useOps()` is built; that is spec-compliant per §5.1: "No client hook: current consumers are RSC pages that import the service directly.")
- **Decoupling constraints §2.1–2.4 are binding for every task in this spec.**

**Decoupling constraints (spec §2, binding, verbatim intent):**
1. Do **NOT** edit `web/src/db/schema.ts`. Both domains use the existing `clubs`/`rounds`/`events` tables as-is.
2. Do **NOT** relocate `web/src/lib/sponsor.ts`. The fund-gas service imports `fundGas` from `@/lib/sponsor` **in place** (the P4 branch, on `main`, also imports it from there — moving it would conflict). `web/src/lib/faucetUsdt.ts` and `web/src/lib/moonpay.ts` *may* move into `core/ops/server` (only P6 imports them) — **this plan keeps them in place too**, to minimize touched-file surface under deadline (see Task 7/8 rationale).
3. `core/directory`'s repository is **table-direct** — it queries `clubs`/`rounds` directly via Drizzle and imports **neither** `core/clubs` nor `core/rounds` (those modules don't exist in this worktree; they live on the P3+P4 branch).
4. The **only** shared edit with the P3+P4 branch is `web/src/server/router.ts` (adding `.use(directoryRouter).use(opsRouter)`) — one expected trivial merge conflict at integration time, resolved by unioning the `.use()` chain.

**Worktree:** This plan executes in an isolated git worktree, branched from `main@d0f855c` (confirmed: has P0a–P2 landed; the two commits after it on `main` — `08a249e`, `518feb0` — are spec-doc-only, no code). Branch name `feat/p5-p6-directory-ops`. Task 1 sets this up via the `superpowers:using-git-worktrees` skill (git fallback, since this repo has no native worktree tool).

**Test commands (confirmed, exact):**
- Pure domain (no `server-only` in the import chain): `cd web && pnpm exec tsx --test <file>`.
- Server-only module, **fakes only, no live DB query** (still needs `DATABASE_URL` because the import chain eval-loads `@/lib/db`, even unused): `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test <file>`.
- Server-only module whose import chain does **NOT** reach `@/lib/db` (e.g. `@/lib/sponsor`, `@/lib/faucetUsdt`, `@/lib/moonpay` — none of them import the DB): `cd web && pnpm exec tsx --conditions=react-server --test <file>` (no `DATABASE_URL` needed — verified by reading each lib's import list in Task prep).
- Live repository test (real Postgres read): first `cd web && pnpm db:migrate-pg`, then the `--conditions=react-server` + `DATABASE_URL` command above.
- Type gate: `cd web && pnpm exec tsc --noEmit` → EXIT 0 (ignore the known `drizzle-orm` duplicate-instance TS2345 false positive).
- Seeded demo data: club `deportivo-san-martin` with a **verified** round (confirmed — the existing wallet repository test asserts this same round shows up in `findVerifiedRounds()`).

---

## File Structure

```
web/src/core/directory/
  domain/
    schemas.ts                          (create) clubWithRoundSchema (club DTO + round DTO + raised:string + pct)
    types.ts                            (create) ClubWithRound (Club/Round + bigint raised), computeFundedPct(),
                                                  toClubWithRoundDTO()/parseClubWithRoundDTO()
    __tests__/directory-domain.test.ts  (create) pure: computeFundedPct + DTO round-trip
  server/
    repository/
      list-clubs-with-rounds.ts               (create) table-direct: clubs ⨝ rounds (verified=true)
      __tests__/list-clubs-with-rounds.test.ts (create) live pg read test
    services/
      list-directory-service.ts               (create) deps-injected; chain-enrich totalRaised; sort by pct; graceful-empty
      __tests__/list-directory-service.test.ts (create) deps-injected, fakes
    api/
      routes/list-directory.route.ts    (create) public GET "/"
      router.ts                         (create) directoryRouter, prefix /directory
  # No client hook — RSC pages import listDirectoryService directly (server-to-server).

web/src/core/ops/
  domain/
    schemas.ts                    (create) addressBodySchema, moonpayBodySchema, syncBodySchema,
                                            faucetResultSchema, mintUsdtResultSchema, moonpaySessionSchema, syncResultSchema
    types.ts                      (create) EVENT_KIND, amountFromArgs() (pure, moved from the legacy sync route) +
                                            z.infer type aliases
    __tests__/ops-domain.test.ts  (create) pure: amountFromArgs + EVENT_KIND mapping
  server/
    services/
      fund-gas-service.ts                    (create) wraps fundGas from @/lib/sponsor (IN PLACE — constraint 2)
      mint-usdt-service.ts                   (create) wraps mintTestUsdt from @/lib/faucetUsdt (in place)
      moonpay-service.ts                     (create) wraps buildOnRampSession from @/lib/moonpay (in place)
      sync-service.ts                        (create) rebuilds `events` cache from on-chain logs (writes events table,
                                                        schema untouched — constraint 1)
      __tests__/fund-gas-service.test.ts     (create)
      __tests__/mint-usdt-service.test.ts    (create)
      __tests__/moonpay-service.test.ts      (create)
      __tests__/sync-service.test.ts         (create)
    api/
      routes/faucet.route.ts        (create) public POST /faucet
      routes/faucet-usdt.route.ts   (create) public POST /faucet-usdt
      routes/moonpay.route.ts       (create) public POST /moonpay
      routes/sync.route.ts          (create) public POST /sync
      router.ts                     (create) opsRouter, prefix /ops
  client/
    hooks.ts   (create) useOps() → useFundGas/useMintUsdt/useMoonpay (mutations, no client hook for sync — no caller)

web/src/server/router.ts                       (modify — THE shared file, one trivial conflict expected)
web/src/app/(marketing)/page.tsx               (modify — repoint to core/directory)
web/src/app/(marketing)/clubs/page.tsx         (modify — repoint to core/directory)
web/src/components/ClubCard.tsx                (modify — repoint type import)
web/src/components/wallet/AddFundsDialog.tsx   (modify — repoint to useOps())
web/src/core/account/client/use-ensure-wallet.ts (modify — fundGasBestEffort: fetch("/api/faucet") -> useFundGas)

web/src/lib/clubDirectory.ts        (delete — superseded by core/directory)
web/src/app/api/faucet/route.ts     (delete — superseded by core/ops)
web/src/app/api/faucet-usdt/route.ts (delete)
web/src/app/api/moonpay/route.ts    (delete)
web/src/app/api/sync/route.ts       (delete)

KEEP untouched: web/src/lib/sponsor.ts, web/src/lib/faucetUsdt.ts, web/src/lib/moonpay.ts,
web/src/lib/moonpay.test.ts, web/src/lib/contracts.ts, web/src/lib/chain.ts, web/src/db/schema.ts
```

---

## Task 1: Worktree setup

**Files:** none (environment only — no code, no commit).

- [ ] **Step 1: Detect existing isolation**

Run: `cd /home/skkippie/work/AI-DO/La12 && git rev-parse --git-dir && git rev-parse --git-common-dir && git branch --show-current`
Expected: both paths resolve to the same `.git` and the branch is `main` — confirms we are in the normal checkout, not already in a worktree. (No native worktree tool is available in this environment, so the git fallback below applies.)

- [ ] **Step 2: Verify `.worktrees/` is git-ignored**

Run: `git check-ignore -q .worktrees && echo IGNORED`
Expected: `IGNORED` (the repo's `.gitignore` already has `.worktrees/`).

- [ ] **Step 3: Create the worktree off `main@d0f855c`**

```bash
cd /home/skkippie/work/AI-DO/La12
git worktree add .worktrees/feat-p5-p6-directory-ops -b feat/p5-p6-directory-ops d0f855c
cd .worktrees/feat-p5-p6-directory-ops
```
Expected: `Preparing worktree ...` + `HEAD is now at d0f855c test(p2): add concurrent-upsert race regression for atomic wallet-link`.

- [ ] **Step 4: Copy the gitignored local env file**

`.env.local` is gitignored (holds `DATABASE_URL`, `SPONSOR_PK`, `NEXT_PUBLIC_USDT_ADDRESS`, etc.) so it does not exist in the fresh worktree checkout — copy it from the main checkout:
```bash
cp /home/skkippie/work/AI-DO/La12/web/.env.local /home/skkippie/work/AI-DO/La12/.worktrees/feat-p5-p6-directory-ops/web/.env.local
```

- [ ] **Step 5: Install deps + verify baseline**

```bash
cd /home/skkippie/work/AI-DO/La12/.worktrees/feat-p5-p6-directory-ops/web
pnpm install
pnpm exec tsc --noEmit
```
Expected: install succeeds; `tsc` EXIT 0 (P0a–P2 is a clean, already-verified baseline — this just confirms the fresh worktree checkout + install reproduces it).

- [ ] **Step 6: Report readiness**

All subsequent tasks run from `/home/skkippie/work/AI-DO/La12/.worktrees/feat-p5-p6-directory-ops/web` (referred to as `web/` below, matching the P1/P2 plans' convention). Report: "Worktree ready at `.worktrees/feat-p5-p6-directory-ops`, branch `feat/p5-p6-directory-ops`, `tsc --noEmit` clean. Ready to implement P5+P6."

---

## Task 2: Directory domain (schemas, types, pure tests)

**Files:**
- Create: `web/src/core/directory/domain/schemas.ts`
- Create: `web/src/core/directory/domain/types.ts`
- Test: `web/src/core/directory/domain/__tests__/directory-domain.test.ts`

**Interfaces:**
- Produces: `clubWithRoundSchema` (zod); `ClubWithRound = { club: Club; round: Round; raised: bigint; pct: number }` (domain type, reusing `Club`/`Round` from `@/db/schema`); `ClubWithRoundDTO = z.infer<typeof clubWithRoundSchema>`; `computeFundedPct(raised: bigint, goal: bigint): number`; `toClubWithRoundDTO(c: ClubWithRound): ClubWithRoundDTO`; `parseClubWithRoundDTO(d: ClubWithRoundDTO): ClubWithRound`.

- [ ] **Step 1: Write the failing test**

Create `web/src/core/directory/domain/__tests__/directory-domain.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import {
  computeFundedPct,
  toClubWithRoundDTO,
  parseClubWithRoundDTO,
  type ClubWithRound,
} from "../types";

test("computeFundedPct: raised/goal * 100, capped at 100, 0 when goal is 0", () => {
  assert.strictEqual(computeFundedPct(25_000000n, 100_000000n), 25);
  assert.strictEqual(computeFundedPct(999_000000n, 100_000000n), 100); // capped
  assert.strictEqual(computeFundedPct(1n, 0n), 0);
});

test("toClubWithRoundDTO -> parseClubWithRoundDTO round-trips bigints + dates", () => {
  const cw: ClubWithRound = {
    club: {
      id: 1,
      userId: null,
      name: "Deportivo Demo",
      slug: "deportivo-demo",
      logoUrl: null,
      description: null,
      walletAddress: "0xClub0000000000000000000000000000000000",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    round: {
      id: 1,
      clubId: 1,
      contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      goal: "500000000",
      sharePrice: "1000000",
      revenueBps: 800,
      capMultiple: 15000,
      deadline: new Date("2027-06-01T00:00:00.000Z"),
      status: "funding",
      verified: true,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    raised: 123456789012345678n, // beyond 2^53 — proves no float rounding
    pct: 24,
  };

  const dto = toClubWithRoundDTO(cw);
  assert.strictEqual(dto.raised, "123456789012345678");
  assert.strictEqual(dto.round.deadline, "2027-06-01T00:00:00.000Z");
  assert.strictEqual(dto.club.createdAt, "2026-01-01T00:00:00.000Z");

  const back = parseClubWithRoundDTO(dto);
  assert.strictEqual(back.raised, 123456789012345678n);
  assert.strictEqual(back.round.deadline.getTime(), cw.round.deadline.getTime());
  assert.strictEqual(back.club.createdAt.getTime(), cw.club.createdAt.getTime());
  assert.strictEqual(back.round.status, "funding");
  assert.strictEqual(back.club.slug, "deportivo-demo");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && pnpm exec tsx --test src/core/directory/domain/__tests__/directory-domain.test.ts`
Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Write `schemas.ts`**

Create `web/src/core/directory/domain/schemas.ts`:
```ts
import { z } from "zod";

const clubDtoSchema = z.object({
  id: z.number().int(),
  userId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().nullable(),
  description: z.string().nullable(),
  walletAddress: z.string(),
  createdAt: z.string(), // ISO instant
});

const roundDtoSchema = z.object({
  id: z.number().int(),
  clubId: z.number().int(),
  contractAddress: z.string(),
  goal: z.string(), // USD₮ base units, string for bigint precision
  sharePrice: z.string(), // USD₮ base units per share
  revenueBps: z.number().int(),
  capMultiple: z.number().int(),
  deadline: z.string(), // ISO instant
  status: z.enum(["funding", "active", "closed"]),
  verified: z.boolean(),
  createdAt: z.string(), // ISO instant
});

/** Wire shape of one directory entry — a club joined to its verified round,
 *  enriched with on-chain `raised` + the derived `pct`. */
export const clubWithRoundSchema = z.object({
  club: clubDtoSchema,
  round: roundDtoSchema,
  raised: z.string(), // USD₮ base units, string for bigint precision
  pct: z.number(),
});
```

- [ ] **Step 4: Write `types.ts`**

Create `web/src/core/directory/domain/types.ts`:
```ts
import type { z } from "zod";
import type { Club, Round } from "@/db/schema";
import type { clubWithRoundSchema } from "./schemas";

/** Domain shape — the enriched bigint-precise representation the server
 *  builds. `club`/`round` reuse the Drizzle row types verbatim (their
 *  `createdAt`/`deadline` are `Date`); `raised` is on-chain, bigint. */
export type ClubWithRound = {
  club: Club;
  round: Round;
  raised: bigint;
  pct: number;
};

export type ClubWithRoundDTO = z.infer<typeof clubWithRoundSchema>;

/** Same integer math RoundProgress.tsx's progress bar already uses
 *  (`Math.min(100, Number((raised * 100n) / goal))`) — moved verbatim out of
 *  the legacy `lib/clubDirectory.ts`. */
export function computeFundedPct(raised: bigint, goal: bigint): number {
  return goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
}

export function toClubWithRoundDTO(c: ClubWithRound): ClubWithRoundDTO {
  return {
    club: { ...c.club, createdAt: c.club.createdAt.toISOString() },
    round: {
      ...c.round,
      deadline: c.round.deadline.toISOString(),
      createdAt: c.round.createdAt.toISOString(),
    },
    raised: c.raised.toString(),
    pct: c.pct,
  };
}

/** Only exercised by the round-trip test today — the directory route has no
 *  client hook (RSC consumers import the service directly), but this keeps
 *  the DTO boundary symmetric and provable, matching the wallet domain template. */
export function parseClubWithRoundDTO(d: ClubWithRoundDTO): ClubWithRound {
  return {
    club: { ...d.club, createdAt: new Date(d.club.createdAt) },
    round: {
      ...d.round,
      deadline: new Date(d.round.deadline),
      createdAt: new Date(d.round.createdAt),
    },
    raised: BigInt(d.raised),
    pct: d.pct,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && pnpm exec tsx --test src/core/directory/domain/__tests__/directory-domain.test.ts`
Expected: 2 pass (5 asserts). (No `--conditions=react-server`/`DATABASE_URL` needed — `import type { Club, Round } from "@/db/schema"` is erased at compile time, so `@/db/schema` never actually loads at runtime.)
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/directory/domain
git commit -m "feat(p5): directory domain — schemas + types + computeFundedPct + DTO round-trip"
```

---

## Task 3: Directory repository (table-direct)

**Files:**
- Create: `web/src/core/directory/server/repository/list-clubs-with-rounds.ts`
- Test: `web/src/core/directory/server/repository/__tests__/list-clubs-with-rounds.test.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `clubs`/`rounds` (`@/db/schema`).
- Produces: `ClubRoundRow = { club: Club; round: Round }`; `listClubsWithRoundsRows(): Promise<ClubRoundRow[]>`.

- [ ] **Step 1: Write `list-clubs-with-rounds.ts`**

Create `web/src/core/directory/server/repository/list-clubs-with-rounds.ts`:
```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds, type Club, type Round } from "@/db/schema";

export type ClubRoundRow = { club: Club; round: Round };

/** Table-direct — queries `clubs`/`rounds` directly (per the P5 decoupling
 *  constraint: this worktree has no `core/clubs`/`core/rounds` to import;
 *  those live on the parallel P3+P4 branch). Every club with a VERIFIED
 *  round (RoundFactory.createRound is permissionless on-chain, so `verified`
 *  is the off-chain allowlist gate — same as the legacy lib/clubDirectory.ts). */
export async function listClubsWithRoundsRows(): Promise<ClubRoundRow[]> {
  return db
    .select({ club: clubs, round: rounds })
    .from(clubs)
    .innerJoin(rounds, and(eq(rounds.clubId, clubs.id), eq(rounds.verified, true)));
}
```

- [ ] **Step 2: Write the failing live test**

Create `web/src/core/directory/server/repository/__tests__/list-clubs-with-rounds.test.ts`. Read-only against local Postgres (seeded demo club `deportivo-san-martin` + its verified round — same seed the wallet repository test relies on). No writes, no cleanup needed.
```ts
import { test } from "node:test";
import assert from "node:assert";
import { listClubsWithRoundsRows } from "../list-clubs-with-rounds";

test("listClubsWithRoundsRows: returns clubs joined to their verified round", async () => {
  const rows = await listClubsWithRoundsRows();
  assert.ok(Array.isArray(rows));
  for (const r of rows) {
    assert.strictEqual(typeof r.club.id, "number");
    assert.strictEqual(typeof r.round.id, "number");
    assert.strictEqual(r.round.clubId, r.club.id);
    assert.strictEqual(r.round.verified, true); // join predicate guarantees this
  }
  assert.ok(rows.some((r) => r.club.slug === "deportivo-san-martin"));
});
```

- [ ] **Step 3: Restore seed, then run the test**

```bash
cd web && pnpm db:migrate-pg
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/directory/server/repository/__tests__/list-clubs-with-rounds.test.ts
```
Expected: 1 pass. (`--conditions=react-server` required — `import "server-only"` throws under plain tsx. `db:migrate-pg` guarantees the seeded club/round exist.)

- [ ] **Step 4: Verify types + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
git add web/src/core/directory/server/repository
git commit -m "feat(p5): directory repository — clubs joined to verified rounds (table-direct)"
```

---

## Task 4: Directory service (deps-injected, graceful-empty)

**Files:**
- Create: `web/src/core/directory/server/services/list-directory-service.ts`
- Test: `web/src/core/directory/server/services/__tests__/list-directory-service.test.ts`

**Interfaces:**
- Consumes: `listClubsWithRoundsRows`/`ClubRoundRow` (Task 3); `totalRaised`/`readSafely` (`@/lib/contracts`); `computeFundedPct`/`ClubWithRound` (Task 2); `ok`/`err`/`AppErrors`/`AsyncAppResult` (`@/server/common/responses`).
- Produces: `listDirectory(deps: ListDirectoryDeps): AsyncAppResult<ClubWithRound[]>` (deps-injected orchestration); `listDirectoryService(): AsyncAppResult<ClubWithRound[]>` (real-deps wrapper).

- [ ] **Step 1: Write the failing test**

Create `web/src/core/directory/server/services/__tests__/list-directory-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { listDirectory } from "../list-directory-service";
import type { ClubRoundRow } from "../../repository/list-clubs-with-rounds";
import type { Club, Round } from "@/db/schema";

function makeClub(overrides: Partial<Club>): Club {
  return {
    id: 1,
    userId: null,
    name: "Demo",
    slug: "demo",
    logoUrl: null,
    description: null,
    walletAddress: "0xClub0000000000000000000000000000000000",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeRound(overrides: Partial<Round>): Round {
  return {
    id: 1,
    clubId: 1,
    contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    goal: "100000000",
    sharePrice: "1000000",
    revenueBps: 800,
    capMultiple: 15000,
    deadline: new Date("2027-01-01T00:00:00Z"),
    status: "funding",
    verified: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

test("listDirectory: enriches each row with on-chain raised + pct, sorted most-funded first", async () => {
  const rowA: ClubRoundRow = {
    club: makeClub({ id: 1, slug: "club-a" }),
    round: makeRound({ id: 1, clubId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
  };
  const rowB: ClubRoundRow = {
    club: makeClub({ id: 2, slug: "club-b" }),
    round: makeRound({ id: 2, clubId: 2, contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
  };

  const result = await listDirectory({
    listRows: async () => [rowA, rowB],
    readTotalRaised: async (addr) =>
      addr === rowA.round.contractAddress ? 25_000000n : 90_000000n,
  });

  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 2);
  assert.strictEqual(result.data[0].club.slug, "club-b"); // 90% funded, sorts first
  assert.strictEqual(result.data[0].pct, 90);
  assert.strictEqual(result.data[1].pct, 25);
});

test("listDirectory: graceful-empty when there are no verified rounds", async () => {
  const result = await listDirectory({ listRows: async () => [], readTotalRaised: async () => 0n });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.ok && result.data, []);
});

test("listDirectory: a throwing repository yields err(unexpected) -> 500", async () => {
  const result = await listDirectory({
    listRows: async () => {
      throw new Error("db down");
    },
    readTotalRaised: async () => 0n,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/directory/server/services/__tests__/list-directory-service.test.ts`
Expected: FAIL — `Cannot find module '../list-directory-service'`.

- [ ] **Step 3: Write the service**

Create `web/src/core/directory/server/services/list-directory-service.ts`:
```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { totalRaised, readSafely } from "@/lib/contracts";
import { listClubsWithRoundsRows, type ClubRoundRow } from "../repository/list-clubs-with-rounds";
import { computeFundedPct, type ClubWithRound } from "@/core/directory/domain/types";

/** Deps injected so the enrich+sort orchestration is testable without a DB
 *  or a chain. */
type ListDirectoryDeps = {
  listRows: () => Promise<ClubRoundRow[]>;
  readTotalRaised: (addr: `0x${string}`) => Promise<bigint>;
};

/** Every verified-round club, enriched with on-chain `raised`, most-funded
 *  first. A round whose contract can't be read degrades to `raised = 0n`
 *  (readSafely, in the real-deps wrapper) rather than failing the whole
 *  list. A catastrophic failure (e.g. DB down) surfaces as err(unexpected). */
export async function listDirectory(deps: ListDirectoryDeps): AsyncAppResult<ClubWithRound[]> {
  try {
    const rows = await deps.listRows();
    const withRaised = await Promise.all(
      rows.map(async ({ club, round }) => {
        const raised = await deps.readTotalRaised(round.contractAddress as `0x${string}`);
        return { club, round, raised, pct: computeFundedPct(raised, BigInt(round.goal)) };
      }),
    );
    return ok(withRaised.sort((a, b) => b.pct - a.pct));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function listDirectoryService(): AsyncAppResult<ClubWithRound[]> {
  return listDirectory({
    listRows: listClubsWithRoundsRows,
    readTotalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/directory/server/services/__tests__/list-directory-service.test.ts`
Expected: 3 pass. (`DATABASE_URL` + `--conditions=react-server` required — the import chain eval-loads `@/lib/db` via the repository import, even though the test injects fakes and never queries.)
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/directory/server/services
git commit -m "feat(p5): directory service — listDirectory (deps-injected, sort by pct, graceful-empty)"
```

---

## Task 5: Directory route + router + wire + repoint RSC consumers + delete legacy

**Files:**
- Create: `web/src/core/directory/server/api/routes/list-directory.route.ts`
- Create: `web/src/core/directory/server/api/router.ts`
- Modify: `web/src/server/router.ts` (add `.use(directoryRouter)` — first half of the shared file)
- Modify: `web/src/app/(marketing)/page.tsx`
- Modify: `web/src/app/(marketing)/clubs/page.tsx`
- Modify: `web/src/components/ClubCard.tsx`
- Delete: `web/src/lib/clubDirectory.ts`

**Interfaces:**
- Consumes: `listDirectoryService` (Task 4); `clubWithRoundSchema` (Task 2); `ClubWithRound`/`toClubWithRoundDTO` (Task 2); `CommonResponse`/`errorResponseSchema`/`errorToResponse`/`successResponseSchema` (`@/server/common/responses`).
- Produces: `listDirectoryRoute` (Elysia sub-app), `directoryRouter` (prefix `/directory`). Final URL `GET /api/v1/directory`.

- [ ] **Step 1: Write the route**

Create `web/src/core/directory/server/api/routes/list-directory.route.ts`:
```ts
import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { clubWithRoundSchema } from "@/core/directory/domain/schemas";
import { toClubWithRoundDTO } from "@/core/directory/domain/types";
import { listDirectoryService } from "../../services/list-directory-service";

export const listDirectoryRoute = new Elysia().get(
  "/",
  async ({ status }) => {
    const result = await listDirectoryService();
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toClubWithRoundDTO) }));
  },
  {
    response: {
      200: successResponseSchema(z.array(clubWithRoundSchema), "Directory"),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Directory"],
      summary: "Every club with a verified round, most-funded first",
      description: "Public read — no auth. Money truth is on-chain (raised); Postgres holds display metadata.",
    },
  },
);
```
(Note: no `422` in the response map — this route has no `body`/`query` schema, so no zod validation can fail here. This mirrors the wallet/account route precedent, where `422` is generated entirely by the root `onError` for routes that DO validate input, and never appears in the local `response` map even then — the map documents only statuses the *handler* returns via `status(...)`.)

- [ ] **Step 2: Write the router**

Create `web/src/core/directory/server/api/router.ts`:
```ts
import { Elysia } from "elysia";
import { listDirectoryRoute } from "./routes/list-directory.route";

export const directoryRouter = new Elysia({ prefix: "/directory" }).use(listDirectoryRoute);
```

- [ ] **Step 3: Wire into the root router**

Modify `web/src/server/router.ts`. Add the import next to `accountRouter`'s:
```ts
import { directoryRouter } from "@/core/directory/server/api/router";
```
And chain `.use(directoryRouter)` immediately after `.use(accountRouter)`:
```ts
  .use(walletRouter)
  .use(accountRouter)
  .use(directoryRouter);
```
(This is the first half of the one shared edit with the P3+P4 branch — see Global Constraints. `opsRouter` is added the same way in Task 9.)

- [ ] **Step 4: Repoint the marketing home page**

Modify `web/src/app/(marketing)/page.tsx`. Replace the import:
```ts
// remove:
import { listClubsWithRounds } from "@/lib/clubDirectory";
// add:
import { listDirectoryService } from "@/core/directory/server/services/list-directory-service";
```
And the fetch line inside `Home()`:
```ts
// remove:
  const clubs = await listClubsWithRounds();
// add:
  const directoryResult = await listDirectoryService();
  const clubs = directoryResult.ok ? directoryResult.data : [];
```
Everything below (`clubs[0]`, `clubs.slice(1, 4)`, `<ClubCard {...c} />`, etc.) is unchanged — `ClubWithRound`'s shape (`club`/`round`/`raised`/`pct`) is identical to the legacy one.

- [ ] **Step 5: Repoint the clubs listing page**

Modify `web/src/app/(marketing)/clubs/page.tsx`. Same pattern:
```ts
// remove:
import { listClubsWithRounds } from "@/lib/clubDirectory";
// add:
import { listDirectoryService } from "@/core/directory/server/services/list-directory-service";
```
```ts
// remove:
  const clubs = await listClubsWithRounds();
// add:
  const directoryResult = await listDirectoryService();
  const clubs = directoryResult.ok ? directoryResult.data : [];
```

- [ ] **Step 6: Repoint `ClubCard`'s type import**

Modify `web/src/components/ClubCard.tsx`. Replace only the import line:
```ts
// remove:
import type { ClubWithRound } from "@/lib/clubDirectory";
// add:
import type { ClubWithRound } from "@/core/directory/domain/types";
```
The component body (destructuring `{ club, round, pct }`) is unchanged — same field names.

- [ ] **Step 7: Delete the legacy module + its orphaned test**

```bash
cd web && rm src/lib/clubDirectory.ts src/lib/clubDirectory.test.ts
```
`clubDirectory.test.ts` does `import { computeFundedPct } from "./clubDirectory"` (a RELATIVE import — the straggler grep below won't catch it). Deleting `clubDirectory.ts` without it would break Step 9's `tsc --noEmit` (tsconfig `include` covers `**/*.ts`) with an unresolved-module error. Its assertions are superseded by `directory-domain.test.ts` (Task 2).

- [ ] **Step 8: Grep for stragglers**

Run: `cd web && grep -rn "lib/clubDirectory\|from \"./clubDirectory\|from \"@/lib/clubDirectory" src --include="*.ts" --include="*.tsx"`
Expected: no output. (Confirmed during planning: the only three importers were `page.tsx`, `clubs/page.tsx`, `ClubCard.tsx` — all repointed above — plus the now-deleted `clubDirectory.test.ts`.)

- [ ] **Step 9: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: build succeeds.

- [ ] **Step 10: Live verify**

Start dev (`cd web && pnpm dev` in the background; note the actual port), then:
```bash
curl -s "http://localhost:3000/api/v1/directory"
```
Expected: `200` with `{"response":[...],"code":"OK","status":200}` — an array (possibly containing the seeded `deportivo-san-martin` entry with a `pct` field), sorted descending by `pct`. Then open `/` and `/clubs` in a browser (or `curl` them) and confirm they render without error — the featured-club hero and the club grid both come from the same data. Stop the dev server.

- [ ] **Step 11: Commit**

```bash
git add web/src/core/directory/server/api web/src/server/router.ts \
  "web/src/app/(marketing)/page.tsx" "web/src/app/(marketing)/clubs/page.tsx" web/src/components/ClubCard.tsx
git add -A web/src/lib
git commit -m "feat(p5): directory route + router + wire; repoint marketing RSCs; delete lib/clubDirectory"
```

---

## Task 6: Ops domain (schemas + pure fns + tests)

**Files:**
- Create: `web/src/core/ops/domain/schemas.ts`
- Create: `web/src/core/ops/domain/types.ts`
- Test: `web/src/core/ops/domain/__tests__/ops-domain.test.ts`

**Interfaces:**
- Produces: `addressBodySchema`, `moonpayBodySchema`, `syncBodySchema`, `faucetResultSchema`, `mintUsdtResultSchema`, `moonpaySessionSchema`, `syncResultSchema` (zod); `AddressBody`, `MoonpayBody`, `SyncBody`, `FaucetResult`, `MintUsdtResult`, `MoonpaySession`, `SyncResult` (`z.infer` type aliases); `EVENT_KIND: Record<string, "invest"|"distribute"|"claim"|"close">`; `amountFromArgs(args: Record<string, unknown>): bigint`.

- [ ] **Step 1: Write the failing test**

Create `web/src/core/ops/domain/__tests__/ops-domain.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { amountFromArgs, EVENT_KIND } from "../types";

test("amountFromArgs: prefers usdtAmount, falls back through revenueReceived/totalRaisedUsdt, else 0n", () => {
  assert.strictEqual(amountFromArgs({ usdtAmount: 5_000000n }), 5_000000n);
  assert.strictEqual(amountFromArgs({ revenueReceived: 3_000000n }), 3_000000n);
  assert.strictEqual(amountFromArgs({ totalRaisedUsdt: 9_000000n }), 9_000000n);
  assert.strictEqual(amountFromArgs({}), 0n);
});

test("amountFromArgs: usdtAmount wins over the other fields when several are present", () => {
  assert.strictEqual(
    amountFromArgs({ usdtAmount: 1_000000n, revenueReceived: 2_000000n, totalRaisedUsdt: 3_000000n }),
    1_000000n,
  );
});

test("EVENT_KIND maps every tracked RevenueShareRound event to its cache kind", () => {
  assert.strictEqual(EVENT_KIND.Invested, "invest");
  assert.strictEqual(EVENT_KIND.Distributed, "distribute");
  assert.strictEqual(EVENT_KIND.Claimed, "claim");
  assert.strictEqual(EVENT_KIND.FundingClosed, "close");
  assert.strictEqual(EVENT_KIND.SomeUnknownEvent, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && pnpm exec tsx --test src/core/ops/domain/__tests__/ops-domain.test.ts`
Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Write `schemas.ts`**

Create `web/src/core/ops/domain/schemas.ts`:
```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Duplicated per-domain deliberately (same
 *  shape as wallet's/account's addressSchema) — no cross-domain imports,
 *  matching the established convention. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

/** Body of POST /ops/faucet and /ops/faucet-usdt. */
export const addressBodySchema = z.object({ address: addressSchema });

/** Body of POST /ops/moonpay. */
export const moonpayBodySchema = z.object({
  address: addressSchema,
  amountUsd: z.number().positive(),
});

/** Body of POST /ops/sync. `fromBlock` is coerced (JSON has no bigint). */
export const syncBodySchema = z.object({
  roundId: z.number().int().positive(),
  fromBlock: z.coerce.bigint().optional(),
});

/** Result of the gas sponsor. A "skipped" result (no SPONSOR_PK configured)
 *  is a valid 200 outcome, not an error — see fund-gas-service.ts. */
export const faucetResultSchema = z.union([
  z.object({ hash: z.string() }),
  z.object({ skipped: z.literal(true), reason: z.string() }),
]);

/** Result of the test-USD₮ mint. `amount` is a wire string (bigint precision). */
export const mintUsdtResultSchema = z.union([
  z.object({ hash: z.string(), amount: z.string() }),
  z.object({ skipped: z.literal(true), reason: z.string() }),
]);

export const moonpaySessionSchema = z.object({
  sessionId: z.string(),
  widgetUrl: z.string(),
});

export const syncResultSchema = z.object({ synced: z.number().int() });
```

- [ ] **Step 4: Write `types.ts`**

Create `web/src/core/ops/domain/types.ts`:
```ts
import type { z } from "zod";
import type {
  addressBodySchema,
  moonpayBodySchema,
  syncBodySchema,
  faucetResultSchema,
  mintUsdtResultSchema,
  moonpaySessionSchema,
  syncResultSchema,
} from "./schemas";

export type AddressBody = z.infer<typeof addressBodySchema>;
export type MoonpayBody = z.infer<typeof moonpayBodySchema>;
export type SyncBody = z.infer<typeof syncBodySchema>;
export type FaucetResult = z.infer<typeof faucetResultSchema>;
export type MintUsdtResult = z.infer<typeof mintUsdtResultSchema>;
export type MoonpaySession = z.infer<typeof moonpaySessionSchema>;
export type SyncResult = z.infer<typeof syncResultSchema>;

/** Maps a decoded RevenueShareRound event name to the `events` cache's
 *  `kind` enum. Moved verbatim out of the legacy app/api/sync/route.ts. */
export const EVENT_KIND: Record<string, "invest" | "distribute" | "claim" | "close"> = {
  Invested: "invest",
  Distributed: "distribute",
  Claimed: "claim",
  FundingClosed: "close",
};

/** Picks the USD₮ amount field off whichever event fired (see the
 *  RevenueShareRound ABI — different events name the field differently).
 *  Moved verbatim out of the legacy sync route. */
export function amountFromArgs(args: Record<string, unknown>): bigint {
  return (
    (args.usdtAmount as bigint | undefined) ??
    (args.revenueReceived as bigint | undefined) ??
    (args.totalRaisedUsdt as bigint | undefined) ??
    0n
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd web && pnpm exec tsx --test src/core/ops/domain/__tests__/ops-domain.test.ts`
Expected: 3 pass (11 asserts). No special flags — `types.ts` has no `server-only` import and `import type` schema imports are erased at compile time.
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/ops/domain
git commit -m "feat(p6): ops domain — schemas + EVENT_KIND/amountFromArgs pure fns"
```

---

## Task 7: Ops services — fund-gas + mint-usdt

**Files:**
- Create: `web/src/core/ops/server/rate-limit.ts`
- Create: `web/src/core/ops/server/services/fund-gas-service.ts`
- Create: `web/src/core/ops/server/services/mint-usdt-service.ts`
- Test: `web/src/core/ops/server/services/__tests__/fund-gas-service.test.ts`
- Test: `web/src/core/ops/server/services/__tests__/mint-usdt-service.test.ts`

**Interfaces:**
- Consumes: `fundGas`/`FundGasResult` (`@/lib/sponsor`, imported **in place** — constraint 2); `mintTestUsdt`/`FaucetUsdtResult` (`@/lib/faucetUsdt`, in place); `FaucetResult`/`MintUsdtResult` (Task 6); `ok`/`err`/`AppErrors`/`AsyncAppResult` (`@/server/common/responses`).
- Produces: `checkRateLimit(address: string): boolean` (module-level per-address throttle); `fundGas(deps: FundGasDeps): AsyncAppResult<FaucetResult>` + `fundGasService(address): AsyncAppResult<FaucetResult>`; `mintUsdt(deps: MintUsdtDeps): AsyncAppResult<MintUsdtResult>` + `mintUsdtService(address): AsyncAppResult<MintUsdtResult>`.

**Rate-limiting (security — restored from legacy, spec §5.2 "preserve any rate-limit"):** the legacy `app/api/faucet/route.ts` and `app/api/faucet-usdt/route.ts` BOTH enforce a per-address in-memory throttle (one call per address per hour, 429 on repeat). `SPONSOR_PK` funds a real relayer, so an unthrottled public POST is a drain vector — this MUST be preserved. Both faucet services check the limiter before doing work and return `err(AppErrors.tooManyRequests())` (429) when throttled. moonpay + sync were NOT throttled in legacy, so they keep the plain `{200,500}`/`{200,403,404,500}` maps (Task 9).

- [ ] **Step 1: Write the failing tests**

Create `web/src/core/ops/server/services/__tests__/fund-gas-service.test.ts`. The three existing tests pass `isRateLimited: () => false` (they exercise the engine paths, not the throttle); a fourth test uses the REAL `checkRateLimit` to prove a second immediate call for the same address is throttled to 429:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { fundGas } from "../fund-gas-service";
import { checkRateLimit } from "../../rate-limit";

const ADDR = "0x1111111111111111111111111111111111111111" as const;
// Distinct address for the throttle test so the happy-path calls above (which
// use ADDR with a `() => false` stub, never touching the real Map) can't
// pre-limit it.
const RATE_ADDR = "0x3333333333333333333333333333333333333333" as const;

test("fundGas: returns ok with the sponsor's tx hash on success", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => ({ hash: "0xhash" as const }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { hash: "0xhash" });
});

test("fundGas: a 'skipped' (no SPONSOR_PK) result is still ok — not an error", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => ({ skipped: true, reason: "SPONSOR_PK no configurado" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { skipped: true, reason: "SPONSOR_PK no configurado" });
});

test("fundGas: a throwing sendGas yields err(unexpected) -> 500", async () => {
  const res = await fundGas({
    address: ADDR,
    isRateLimited: () => false,
    sendGas: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});

test("fundGas: a second immediate call for the same address is throttled -> 429", async () => {
  // First call records the address in the real module-level limiter and succeeds.
  const first = await fundGas({
    address: RATE_ADDR,
    isRateLimited: checkRateLimit,
    sendGas: async () => ({ hash: "0xhash" as const }),
  });
  assert.strictEqual(first.ok, true);
  // Second immediate call is within the 60-min window → 429, engine never runs.
  const second = await fundGas({
    address: RATE_ADDR,
    isRateLimited: checkRateLimit,
    sendGas: async () => {
      throw new Error("should not be called when rate-limited");
    },
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(!second.ok && second.error.status, 429);
});
```

Create `web/src/core/ops/server/services/__tests__/mint-usdt-service.test.ts` (same pattern — engine-path tests stub the limiter, plus one real-limiter 429 test):
```ts
import { test } from "node:test";
import assert from "node:assert";
import { mintUsdt } from "../mint-usdt-service";
import { checkRateLimit } from "../../rate-limit";

const ADDR = "0x1111111111111111111111111111111111111111" as const;
// Distinct address for the throttle test. NOTE: each test file runs in its own
// tsx process, so this Map does not collide with the fund-gas test's RATE_ADDR
// even though both files import the same module — but keep them distinct anyway
// for clarity.
const RATE_ADDR = "0x4444444444444444444444444444444444444444" as const;

test("mintUsdt: converts the engine's bigint amount to a wire string on success", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => ({ hash: "0xhash" as const, amount: 5_000000000n }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { hash: "0xhash", amount: "5000000000" });
});

test("mintUsdt: a 'skipped' result passes through unchanged", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => ({ skipped: true, reason: "no key" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { skipped: true, reason: "no key" });
});

test("mintUsdt: a throwing engine yields err(unexpected) -> 500", async () => {
  const res = await mintUsdt({
    address: ADDR,
    isRateLimited: () => false,
    mint: async () => {
      throw new Error("rpc down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});

test("mintUsdt: a second immediate call for the same address is throttled -> 429", async () => {
  const first = await mintUsdt({
    address: RATE_ADDR,
    isRateLimited: checkRateLimit,
    mint: async () => ({ hash: "0xhash" as const, amount: 5_000000000n }),
  });
  assert.strictEqual(first.ok, true);
  const second = await mintUsdt({
    address: RATE_ADDR,
    isRateLimited: checkRateLimit,
    mint: async () => {
      throw new Error("should not be called when rate-limited");
    },
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(!second.ok && second.error.status, 429);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && pnpm exec tsx --conditions=react-server --test src/core/ops/server/services/__tests__/fund-gas-service.test.ts src/core/ops/server/services/__tests__/mint-usdt-service.test.ts`
Expected: FAIL — `Cannot find module '../fund-gas-service'` / `'../mint-usdt-service'` (and `'../../rate-limit'`, written next).

- [ ] **Step 3: Write `rate-limit.ts`**

Create `web/src/core/ops/server/rate-limit.ts`:
```ts
import "server-only";

// In-memory per-address throttle — one call per address per hour. Restored
// from the legacy app/api/faucet + app/api/faucet-usdt routes (spec §5.2:
// "preserve any rate-limit"). `SPONSOR_PK` funds a real relayer, so an
// unthrottled public faucet POST is a drain vector. Module-level Map: resets
// on restart and isn't shared across instances — fine for the single-node
// hackathon box (same tradeoff the legacy routes documented). Swap for a
// real store (Redis/DB) before scaling out.
const RATE_LIMIT_MS = 60 * 60 * 1000;
const lastServedAt = new Map<string, number>();

/** Returns true if `address` called within the last hour (=> the caller
 *  should be rejected with 429). Returns false and records `Date.now()` when
 *  the call is allowed. Address is lowercased so `0xAbC…`/`0xabc…` share a
 *  bucket. (A service may read the clock directly; only Workflow scripts can't.) */
export function checkRateLimit(address: string): boolean {
  const key = address.toLowerCase();
  const last = lastServedAt.get(key);
  if (last !== undefined && Date.now() - last < RATE_LIMIT_MS) return true;
  lastServedAt.set(key, Date.now());
  return false;
}
```

- [ ] **Step 4: Write `fund-gas-service.ts`**

Create `web/src/core/ops/server/services/fund-gas-service.ts`:
```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { fundGas as sendGasSponsored, type FundGasResult } from "@/lib/sponsor";
import { checkRateLimit } from "../rate-limit";
import type { FaucetResult } from "@/core/ops/domain/types";

/** Deps injected so the wrapper is testable without a real relayer/RPC or the
 *  module-level throttle Map. */
type FundGasDeps = {
  address: `0x${string}`;
  isRateLimited: (address: string) => boolean;
  sendGas: (address: `0x${string}`) => Promise<FundGasResult>;
};

/** Best-effort Sepolia ETH sponsor (server's own relayer key, SPONSOR_PK —
 *  never the fan's, per self-custody). Throttled per-address (429 on a repeat
 *  within the hour — the relayer-drain guard) BEFORE any work. A "skipped"
 *  result (no SPONSOR_PK configured) is a valid 200 outcome, not an error —
 *  the caller (ensure-wallet's best-effort gas top-up) already tolerates it
 *  with a soft toast. Only a catastrophic throw surfaces as err(unexpected). */
export async function fundGas(deps: FundGasDeps): AsyncAppResult<FaucetResult> {
  if (deps.isRateLimited(deps.address)) return err(AppErrors.tooManyRequests());
  try {
    return ok(await deps.sendGas(deps.address));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. Imports `fundGas` from `@/lib/sponsor`
 *  IN PLACE — this lib is NOT relocated (decoupling constraint 2: the P4
 *  branch, on `main`, also imports it from this same path). */
export function fundGasService(address: `0x${string}`): AsyncAppResult<FaucetResult> {
  return fundGas({ address, isRateLimited: checkRateLimit, sendGas: sendGasSponsored });
}
```

- [ ] **Step 5: Write `mint-usdt-service.ts`**

Create `web/src/core/ops/server/services/mint-usdt-service.ts`:
```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { mintTestUsdt as mintUsdtEngine, type FaucetUsdtResult } from "@/lib/faucetUsdt";
import { checkRateLimit } from "../rate-limit";
import type { MintUsdtResult } from "@/core/ops/domain/types";

type MintUsdtDeps = {
  address: `0x${string}`;
  isRateLimited: (address: string) => boolean;
  mint: (address: `0x${string}`) => Promise<FaucetUsdtResult>;
};

/** Mints test USD₮ via the MockUSDT faucet (`@/lib/faucetUsdt`, same
 *  server-only relayer key as the gas sponsor). Throttled per-address (429 on
 *  a repeat within the hour) BEFORE any work — same drain guard as the gas
 *  faucet. Converts the engine's bigint `amount` to a wire-safe string —
 *  money on the wire is always a string, never `Number()`'d. A "skipped"
 *  result (no SPONSOR_PK / NEXT_PUBLIC_USDT_ADDRESS configured) passes through
 *  unchanged as a valid 200, not an error. */
export async function mintUsdt(deps: MintUsdtDeps): AsyncAppResult<MintUsdtResult> {
  if (deps.isRateLimited(deps.address)) return err(AppErrors.tooManyRequests());
  try {
    const result = await deps.mint(deps.address);
    return ok("skipped" in result ? result : { hash: result.hash, amount: result.amount.toString() });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function mintUsdtService(address: `0x${string}`): AsyncAppResult<MintUsdtResult> {
  return mintUsdt({ address, isRateLimited: checkRateLimit, mint: mintUsdtEngine });
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd web && pnpm exec tsx --conditions=react-server --test src/core/ops/server/services/__tests__/fund-gas-service.test.ts src/core/ops/server/services/__tests__/mint-usdt-service.test.ts`
Expected: 8 pass total (4+4 — the three engine-path tests plus the new throttle test in each file). Note: **no `DATABASE_URL` needed** here — `@/lib/sponsor`, `@/lib/faucetUsdt`, and the new `rate-limit.ts` import only viem + `@/lib/chain` + `@/lib/contracts` + the ABI JSONs (and `server-only`), never `@/lib/db` (confirmed by reading both libs during planning). `--conditions=react-server` is still required for `import "server-only"` to resolve to its empty export instead of throwing.
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 7: Commit**

```bash
git add web/src/core/ops/server/services/fund-gas-service.ts web/src/core/ops/server/services/mint-usdt-service.ts \
  web/src/core/ops/server/services/__tests__/fund-gas-service.test.ts web/src/core/ops/server/services/__tests__/mint-usdt-service.test.ts
git commit -m "feat(p6): ops services — fund-gas + mint-usdt (wrap lib/sponsor + lib/faucetUsdt in place)"
```

---

## Task 8: Ops services — moonpay + sync

**Files:**
- Create: `web/src/core/ops/server/services/moonpay-service.ts`
- Create: `web/src/core/ops/server/services/sync-service.ts`
- Test: `web/src/core/ops/server/services/__tests__/moonpay-service.test.ts`
- Test: `web/src/core/ops/server/services/__tests__/sync-service.test.ts`

**Interfaces:**
- Consumes: `buildOnRampSession`/`OnRampSession` (`@/lib/moonpay`, in place); `MoonpaySession`/`SyncResult` (Task 6); `EVENT_KIND`/`amountFromArgs` (Task 6); `db` (`@/lib/db`), `rounds`/`events`/`Round`/`NewEvent` (`@/db/schema`); `publicClient`/`revenueShareRoundAbi` (`@/lib/contracts`); `ok`/`err`/`AppErrors`/`AsyncAppResult` (`@/server/common/responses`).
- Produces: `buildOnRamp(deps): AsyncAppResult<MoonpaySession>` + `moonpayService(address, amountUsd): AsyncAppResult<MoonpaySession>`; `syncRoundEvents(deps): AsyncAppResult<SyncResult>` + `syncEventsService(roundId, fromBlock?): AsyncAppResult<SyncResult>`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/core/ops/server/services/__tests__/moonpay-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { buildOnRamp } from "../moonpay-service";

const ADDR = "0x1111111111111111111111111111111111111111" as const;

test("buildOnRamp: returns ok with the session from the engine", async () => {
  const res = await buildOnRamp({
    address: ADDR,
    amountUsd: 50,
    buildSession: async () => ({ sessionId: "wdk-onramp", widgetUrl: "https://buy.moonpay.com/?x=1" }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, {
    sessionId: "wdk-onramp",
    widgetUrl: "https://buy.moonpay.com/?x=1",
  });
});

test("buildOnRamp: a throwing engine yields err(unexpected) -> 500", async () => {
  const res = await buildOnRamp({
    address: ADDR,
    amountUsd: 50,
    buildSession: async () => {
      throw new Error("network down");
    },
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});
```

Create `web/src/core/ops/server/services/__tests__/sync-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { syncRoundEvents } from "../sync-service";
import type { Round, NewEvent } from "@/db/schema";

const ROUND: Round = {
  id: 7,
  clubId: 1,
  contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  goal: "500000000",
  sharePrice: "1000000",
  revenueBps: 800,
  capMultiple: 15000,
  deadline: new Date("2027-01-01T00:00:00Z"),
  status: "funding",
  verified: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

test("syncRoundEvents: 404 when the round doesn't exist", async () => {
  const result = await syncRoundEvents({
    roundId: 999,
    findRound: async () => undefined,
    getBlockNumber: async () => 1000n,
    getLogs: async () => [],
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 404);
});

test("syncRoundEvents: 403 when the round is not verified (allowlist check)", async () => {
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ({ ...ROUND, verified: false }),
    getBlockNumber: async () => 1000n,
    getLogs: async () => [],
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 403);
});

test("syncRoundEvents: maps known events, drops unknown ones, replaces the cache", async () => {
  let deletedFor: number | undefined;
  let inserted: NewEvent[] = [];
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 100_000n,
    getLogs: async () => [
      { eventName: "Invested", args: { usdtAmount: 5_000000n }, transactionHash: "0xtx1", blockNumber: 90_000n },
      { eventName: "SomeOtherEvent", args: {}, transactionHash: "0xtx2", blockNumber: 90_001n },
      { eventName: "FundingClosed", args: {}, transactionHash: "0xtx3", blockNumber: 90_002n },
    ],
    replaceEvents: async (roundId, rows) => {
      deletedFor = roundId;
      inserted = rows;
    },
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.ok && result.data, { synced: 2 }); // unknown event dropped
  assert.strictEqual(deletedFor, ROUND.id);
  assert.strictEqual(inserted.length, 2);
  assert.strictEqual(inserted[0].kind, "invest");
  assert.strictEqual(inserted[0].amount, "5000000");
  assert.strictEqual(inserted[1].kind, "close");
});

test("syncRoundEvents: defaults fromBlock to latest-40000 (or 0 when latest is small)", async () => {
  let seenFromBlock: bigint | undefined;
  await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 1000n, // < 40_000 -> clamps to 0n
    getLogs: async (_address, fromBlock) => {
      seenFromBlock = fromBlock;
      return [];
    },
    replaceEvents: async () => {},
  });
  assert.strictEqual(seenFromBlock, 0n);
});

test("syncRoundEvents: a throwing getLogs yields err(unexpected) -> 500", async () => {
  const result = await syncRoundEvents({
    roundId: ROUND.id,
    findRound: async () => ROUND,
    getBlockNumber: async () => 1000n,
    getLogs: async () => {
      throw new Error("rpc down");
    },
    replaceEvents: async () => {},
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(!result.ok && result.error.status, 500);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/ops/server/services/__tests__/moonpay-service.test.ts src/core/ops/server/services/__tests__/sync-service.test.ts`
Expected: FAIL — `Cannot find module '../moonpay-service'` / `'../sync-service'`.

- [ ] **Step 3: Write `moonpay-service.ts`**

Create `web/src/core/ops/server/services/moonpay-service.ts`:
```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { buildOnRampSession as buildOnRampEngine, type OnRampSession } from "@/lib/moonpay";
import type { MoonpaySession } from "@/core/ops/domain/types";

type BuildOnRampDeps = {
  address: `0x${string}`;
  amountUsd: number;
  buildSession: (address: `0x${string}`, amountUsd: number) => Promise<OnRampSession>;
};

/** WDK fiat on-ramp (spec §5 tier 3) — builds a MoonPay widget URL, signed
 *  server-side when MOONPAY_SECRET_KEY is present. */
export async function buildOnRamp(deps: BuildOnRampDeps): AsyncAppResult<MoonpaySession> {
  try {
    return ok(await deps.buildSession(deps.address, deps.amountUsd));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper. Imports `@/lib/moonpay` in place. */
export function moonpayService(address: `0x${string}`, amountUsd: number): AsyncAppResult<MoonpaySession> {
  return buildOnRamp({ address, amountUsd, buildSession: buildOnRampEngine });
}
```

- [ ] **Step 4: Write `sync-service.ts`**

Create `web/src/core/ops/server/services/sync-service.ts`:
```ts
import "server-only";
import { eq } from "drizzle-orm";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { db } from "@/lib/db";
import { rounds, events, type Round, type NewEvent } from "@/db/schema";
import { publicClient, revenueShareRoundAbi } from "@/lib/contracts";
import { EVENT_KIND, amountFromArgs } from "@/core/ops/domain/types";
import type { SyncResult } from "@/core/ops/domain/types";

/** Shape viem's `getContractEvents` decodes each log into (ABI is imported
 *  from JSON, so viem can't narrow `eventName`/`args` at the type level — it
 *  still decodes both correctly at runtime; the real-deps wrapper recasts
 *  the shape here, same as the legacy sync route did). */
type RawLog = {
  eventName: string;
  args: Record<string, unknown>;
  transactionHash: `0x${string}` | null;
  blockNumber: bigint | null;
};

type SyncDeps = {
  roundId: number;
  fromBlock?: bigint;
  findRound: (id: number) => Promise<Round | undefined>;
  getBlockNumber: () => Promise<bigint>;
  getLogs: (address: `0x${string}`, fromBlock: bigint) => Promise<RawLog[]>;
  replaceEvents: (roundId: number, rows: NewEvent[]) => Promise<void>;
};

/** Rebuilds the `events` cache for one VERIFIED round from on-chain logs.
 *  Rejects a round that doesn't exist (404) or isn't verified (403,
 *  allowlist) — RoundFactory.createRound() is permissionless on-chain, so a
 *  round address existing in our own table isn't itself proof it's
 *  legitimate; this never trusts the on-chain event feed for that check.
 *  Idempotent — the round's cache is fully replaced each sync (money truth
 *  stays on-chain regardless; this is a rebuildable UI cache). */
export async function syncRoundEvents(deps: SyncDeps): AsyncAppResult<SyncResult> {
  let round: Round | undefined;
  try {
    round = await deps.findRound(deps.roundId);
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
  if (!round) return err(AppErrors.notFound({ targets: ["roundId"] }));
  if (!round.verified) return err(AppErrors.forbidden());
  const verifiedRound = round; // new const binding — safe to close over below

  const address = verifiedRound.contractAddress as `0x${string}`;
  try {
    // Default window: most public RPC providers cap eth_getLogs at ~50k
    // blocks, so "from block 0" fails outright on an established testnet.
    let fromBlock = deps.fromBlock;
    if (fromBlock === undefined) {
      const latest = await deps.getBlockNumber();
      fromBlock = latest > 40_000n ? latest - 40_000n : 0n;
    }

    const rawLogs = await deps.getLogs(address, fromBlock);
    const rows: NewEvent[] = rawLogs
      .filter((log) => log.eventName in EVENT_KIND)
      .map((log) => ({
        roundId: verifiedRound.id,
        kind: EVENT_KIND[log.eventName],
        txHash: log.transactionHash ?? "",
        amount: String(amountFromArgs(log.args ?? {})),
        block: Number(log.blockNumber ?? 0n),
        // NOTE: sync time, not block time — good enough for UI ordering.
        ts: new Date(),
      }));

    await deps.replaceEvents(verifiedRound.id, rows);
    return ok({ synced: rows.length });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function syncEventsService(roundId: number, fromBlock?: bigint): AsyncAppResult<SyncResult> {
  return syncRoundEvents({
    roundId,
    fromBlock,
    findRound: async (id) => {
      const [row] = await db.select().from(rounds).where(eq(rounds.id, id));
      return row;
    },
    getBlockNumber: () => publicClient.getBlockNumber(),
    getLogs: async (address, from) => {
      const rawLogs = await publicClient.getContractEvents({
        address,
        abi: revenueShareRoundAbi,
        fromBlock: from,
        toBlock: "latest",
      });
      return rawLogs as unknown as RawLog[];
    },
    replaceEvents: async (roundId, rows) => {
      await db.delete(events).where(eq(events.roundId, roundId));
      if (rows.length > 0) await db.insert(events).values(rows);
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/ops/server/services/__tests__/moonpay-service.test.ts src/core/ops/server/services/__tests__/sync-service.test.ts`
Expected: 7 pass total (2+5). (`moonpay-service.test.ts` doesn't strictly need `DATABASE_URL` — `@/lib/moonpay` only imports `node:crypto` — but it's harmless to set it uniformly here since `sync-service.test.ts` genuinely needs it: `sync-service.ts` imports `@/lib/db` for its real-deps wrapper, even though every test above injects fakes and never queries.)
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/ops/server/services/moonpay-service.ts web/src/core/ops/server/services/sync-service.ts \
  web/src/core/ops/server/services/__tests__/moonpay-service.test.ts web/src/core/ops/server/services/__tests__/sync-service.test.ts
git commit -m "feat(p6): ops services — moonpay (wrap lib/moonpay) + sync (rebuild events cache, allowlist-checked)"
```

---

## Task 9: Ops routes + router + wire

**Files:**
- Create: `web/src/core/ops/server/api/routes/faucet.route.ts`
- Create: `web/src/core/ops/server/api/routes/faucet-usdt.route.ts`
- Create: `web/src/core/ops/server/api/routes/moonpay.route.ts`
- Create: `web/src/core/ops/server/api/routes/sync.route.ts`
- Create: `web/src/core/ops/server/api/router.ts`
- Modify: `web/src/server/router.ts` (add `.use(opsRouter)` — second half of the shared file)

**Interfaces:**
- Consumes: `fundGasService` (Task 7), `mintUsdtService` (Task 7), `moonpayService`/`syncEventsService` (Task 8); `addressBodySchema`/`moonpayBodySchema`/`syncBodySchema`/`faucetResultSchema`/`mintUsdtResultSchema`/`moonpaySessionSchema`/`syncResultSchema` (Task 6); `CommonResponse`/`errorResponseSchema`/`errorToResponse`/`successResponseSchema` (`@/server/common/responses`).
- Produces: `faucetRoute`, `faucetUsdtRoute`, `moonpayRoute`, `syncRoute` (Elysia sub-apps); `opsRouter` (prefix `/ops`). Final URLs: `POST /api/v1/ops/faucet`, `/faucet-usdt`, `/moonpay`, `/sync`.

**Confirmed legacy auth (read from source during planning — all four routes have ZERO auth check, only zod body validation):** all four ops routes are **public**, matching the spec's "faucet/moonpay are pre-wallet-funding helpers" rationale (extended to sync/faucet-usdt, which also had no auth in the legacy code). None use the `authed` macro.

**Resolved simplification (see plan report for detail):** the legacy in-memory per-address rate limiter (faucet, faucet-usdt) and the legacy 503-on-skip response are dropped — a "skipped" engine result now folds into the 200 payload (the union schemas from Task 6 model this explicitly). `sync`'s two real business-rule errors (round not found / not verified) are preserved as 404/403 — widening the route's response map beyond the generic `{200,500}`, per the P2 route-template convention for a service whose real error surface exceeds "500 only."

- [ ] **Step 1: Write `faucet.route.ts`**

Create `web/src/core/ops/server/api/routes/faucet.route.ts`:
```ts
import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressBodySchema, faucetResultSchema } from "@/core/ops/domain/schemas";
import { fundGasService } from "../../services/fund-gas-service";

export const faucetRoute = new Elysia().post(
  "/faucet",
  async ({ body, status }) => {
    const result = await fundGasService(body.address as `0x${string}`);
    // Widened past the wallet template's `as 500`: fundGasService also emits
    // err(tooManyRequests)=429 when the per-address throttle trips (spec §5.2).
    if (!result.ok) return status(result.error.status as 429 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: addressBodySchema,
    response: {
      200: successResponseSchema(faucetResultSchema, "FaucetResult"),
      429: errorResponseSchema(429),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Sponsor a small amount of Sepolia ETH for gas (best-effort, public)",
    },
  },
);
```

- [ ] **Step 2: Write `faucet-usdt.route.ts`**

Create `web/src/core/ops/server/api/routes/faucet-usdt.route.ts`:
```ts
import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressBodySchema, mintUsdtResultSchema } from "@/core/ops/domain/schemas";
import { mintUsdtService } from "../../services/mint-usdt-service";

export const faucetUsdtRoute = new Elysia().post(
  "/faucet-usdt",
  async ({ body, status }) => {
    const result = await mintUsdtService(body.address as `0x${string}`);
    // Widened past `as 500`: mintUsdtService also emits err(tooManyRequests)=429
    // when the per-address throttle trips (spec §5.2).
    if (!result.ok) return status(result.error.status as 429 | 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: addressBodySchema,
    response: {
      200: successResponseSchema(mintUsdtResultSchema, "MintUsdtResult"),
      429: errorResponseSchema(429),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Mint test USD₮ from the MockUSDT faucet (public, testnet-only)",
    },
  },
);
```

- [ ] **Step 3: Write `moonpay.route.ts`**

Create `web/src/core/ops/server/api/routes/moonpay.route.ts`:
```ts
import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { moonpayBodySchema, moonpaySessionSchema } from "@/core/ops/domain/schemas";
import { moonpayService } from "../../services/moonpay-service";

export const moonpayRoute = new Elysia().post(
  "/moonpay",
  async ({ body, status }) => {
    const result = await moonpayService(body.address as `0x${string}`, body.amountUsd);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: moonpayBodySchema,
    response: {
      200: successResponseSchema(moonpaySessionSchema, "MoonpaySession"),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Build a signed MoonPay on-ramp widget URL (public)",
    },
  },
);
```

- [ ] **Step 4: Write `sync.route.ts`**

Create `web/src/core/ops/server/api/routes/sync.route.ts`:
```ts
import { Elysia } from "elysia";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { syncBodySchema, syncResultSchema } from "@/core/ops/domain/schemas";
import { syncEventsService } from "../../services/sync-service";

export const syncRoute = new Elysia().post(
  "/sync",
  async ({ body, status }) => {
    const result = await syncEventsService(body.roundId, body.fromBlock);
    // WIDENED beyond {200,500}: syncEventsService's real error surface
    // includes 404 (round not found) and 403 (round not verified — the
    // allowlist check), not just a catastrophic 500. See sync-service.ts.
    if (!result.ok) {
      return status(result.error.status as 403 | 404 | 500, errorToResponse(result.error));
    }
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    body: syncBodySchema,
    response: {
      200: successResponseSchema(syncResultSchema, "SyncResult"),
      403: errorResponseSchema(403),
      404: errorResponseSchema(404),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Ops"],
      summary: "Rebuild the events cache for one verified round from on-chain logs (public)",
    },
  },
);
```

- [ ] **Step 5: Write the router**

Create `web/src/core/ops/server/api/router.ts`:
```ts
import { Elysia } from "elysia";
import { faucetRoute } from "./routes/faucet.route";
import { faucetUsdtRoute } from "./routes/faucet-usdt.route";
import { moonpayRoute } from "./routes/moonpay.route";
import { syncRoute } from "./routes/sync.route";

export const opsRouter = new Elysia({ prefix: "/ops" })
  .use(faucetRoute)
  .use(faucetUsdtRoute)
  .use(moonpayRoute)
  .use(syncRoute);
```

- [ ] **Step 6: Wire into the root router**

Modify `web/src/server/router.ts`. Add the import next to `directoryRouter`'s:
```ts
import { opsRouter } from "@/core/ops/server/api/router";
```
And chain `.use(opsRouter)` immediately after `.use(directoryRouter)`:
```ts
  .use(walletRouter)
  .use(accountRouter)
  .use(directoryRouter)
  .use(opsRouter);
```
(This completes the one shared edit with the P3+P4 branch — at merge time, union this `.use()` chain with whatever `.use(clubsRouter).use(roundsRouter)` that branch added.)

- [ ] **Step 7: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: build succeeds.

- [ ] **Step 8: Live verify**

Start dev (`cd web && pnpm dev` in the background; note the actual port), then:
```bash
# faucet — 200 whether or not SPONSOR_PK is configured (skipped folds into the 200 body)
curl -s -X POST "http://localhost:3000/api/v1/ops/faucet" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x1111111111111111111111111111111111111111"}'

# faucet-usdt — same shape
curl -s -X POST "http://localhost:3000/api/v1/ops/faucet-usdt" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x1111111111111111111111111111111111111111"}'

# moonpay — 200 with a widgetUrl
curl -s -X POST "http://localhost:3000/api/v1/ops/moonpay" \
  -H 'Content-Type: application/json' \
  -d '{"address":"0x1111111111111111111111111111111111111111","amountUsd":50}'

# sync — a nonexistent round -> 404
curl -s -X POST "http://localhost:3000/api/v1/ops/sync" \
  -H 'Content-Type: application/json' \
  -d '{"roundId":999999}'

# bad address -> 422 with targets:["address"] (zod validation, proven by P1's onError fix)
curl -s -X POST "http://localhost:3000/api/v1/ops/faucet" \
  -H 'Content-Type: application/json' -d '{"address":"nope"}'
```
Expected: first four all `200` (faucet/faucet-usdt bodies show either `{hash:...}` or `{skipped:true,reason:...}` depending on whether `SPONSOR_PK`/`NEXT_PUBLIC_USDT_ADDRESS` are set in `.env.local`; moonpay always has a real `widgetUrl`; sync 404s with `{"code":"NOT_FOUND","status":404}`). Last one: `422` with `"targets":["address"]`. To exercise sync's real 200 path, look up a real verified round id (`psql "$DATABASE_URL" -c "select id from rounds where verified;"`) and re-run with that `roundId`. Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add web/src/core/ops/server/api web/src/server/router.ts
git commit -m "feat(p6): ops routes (faucet/faucet-usdt/moonpay/sync) + opsRouter + wire"
```

---

## Task 10: Ops client hooks + cutover AddFundsDialog + repoint useEnsureWallet + delete legacy routes

**Files:**
- Create: `web/src/core/ops/client/hooks.ts`
- Modify: `web/src/components/wallet/AddFundsDialog.tsx`
- Modify: `web/src/core/account/client/use-ensure-wallet.ts`
- Delete: `web/src/app/api/faucet/route.ts`
- Delete: `web/src/app/api/faucet-usdt/route.ts`
- Delete: `web/src/app/api/moonpay/route.ts`
- Delete: `web/src/app/api/sync/route.ts`

**Interfaces:**
- Consumes: `useElysia` (`@/frontend/lib/eden`); `useMutation` (`@tanstack/react-query`).
- Produces: `useOps(): { useFundGas, useMintUsdt, useMoonpay }`.

- [ ] **Step 1: Write `hooks.ts`**

Create `web/src/core/ops/client/hooks.ts`:
```ts
"use client";
import { useMutation } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Ops-domain client hooks — best-effort server-relayer helpers (gas
 *  sponsor, test USD₮ mint, MoonPay on-ramp session). All three are public
 *  POSTs; a "skipped" result (e.g. no SPONSOR_PK configured) is still a 200
 *  — callers inspect `data.response` for a `skipped` field rather than
 *  catching an error. No `useSync` here — nothing in the client calls
 *  /ops/sync today (confirmed by grep during planning). */
export const useOps = () => {
  const elysia = useElysia();

  const useFundGas = () => useMutation(elysia.ops.faucet.post.mutationOptions());
  // Bracket access: "faucet-usdt" isn't a valid JS identifier for dot access.
  const useMintUsdt = () => useMutation(elysia.ops["faucet-usdt"].post.mutationOptions());
  const useMoonpay = () => useMutation(elysia.ops.moonpay.post.mutationOptions());

  return { useFundGas, useMintUsdt, useMoonpay };
};
```

- [ ] **Step 2: Typecheck the hooks against the router types**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (Proves `elysia.ops.faucet.post`/`elysia.ops["faucet-usdt"].post`/`elysia.ops.moonpay.post` are typed against `AppRouter` — guaranteed by Task 9's wiring. If the eden proxy call shape differs from `.mutationOptions()` taking no args, check `useAccount`'s `useLinkWallet` in `@/core/account/client/hooks.ts` for the reference shape.)

- [ ] **Step 3: Cut over `AddFundsDialog`**

Modify `web/src/components/wallet/AddFundsDialog.tsx` in full:
```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { walletMode } from "@/lib/walletMode";
import { friendlyError } from "@/lib/txError";
import { useOps } from "@/core/ops/client/hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AddFundsDialog({
  open,
  onOpenChange,
  address,
  onFunded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
  onFunded?: () => void;
}) {
  const [busy, setBusy] = useState<"moonpay" | "usdt" | "gas" | null>(null);
  const { useFundGas, useMintUsdt, useMoonpay } = useOps();
  const fundGas = useFundGas();
  const mintUsdt = useMintUsdt();
  const moonpay = useMoonpay();

  async function openMoonpay() {
    setBusy("moonpay");
    try {
      const result = await moonpay.mutateAsync({ address, amountUsd: 50 });
      window.open(result.response.widgetUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Could not open MoonPay.");
    } finally {
      setBusy(null);
    }
  }

  async function faucet(kind: "usdt" | "gas") {
    setBusy(kind);
    const toastId = toast.loading(kind === "usdt" ? "Getting test USD₮…" : "Getting gas ETH…");
    try {
      const result = kind === "usdt" ? await mintUsdt.mutateAsync({ address }) : await fundGas.mutateAsync({ address });
      if ("skipped" in result.response) {
        toast.warning(result.response.reason, { id: toastId });
      } else {
        toast.success(kind === "usdt" ? "Test USD₮ received" : "Gas ETH received", { id: toastId });
        onFunded?.();
      }
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Buy USD₮ with a card, straight to your self-custody wallet.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button onClick={openMoonpay} disabled={busy !== null}>
            {busy === "moonpay" ? "Opening MoonPay…" : "Buy with MoonPay"}
          </Button>
          {walletMode() === "standard" && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <span className="text-xs text-muted-foreground">Test funds — local/testnet demo</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => faucet("usdt")} disabled={busy !== null}>
                  {busy === "usdt" ? "Getting…" : "Get 5,000 test USD₮"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => faucet("gas")} disabled={busy !== null}>
                  {busy === "gas" ? "Getting…" : "Get gas ETH"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```
(Renamed the local `moonpay()` function to `openMoonpay()` to avoid shadowing the `moonpay` mutation object returned by `useMoonpay()`.)

- [ ] **Step 4: Repoint `useEnsureWallet`'s best-effort gas top-up**

Modify `web/src/core/account/client/use-ensure-wallet.ts` in full:
```ts
"use client";
import { toast } from "sonner";
import { createWallet, getWallet } from "@/lib/wdk";
import { walletMode } from "@/lib/walletMode";
import { useAccount } from "./hooks";
import { useOps } from "@/core/ops/client/hooks";

/**
 * Returns an imperative `ensureWallet(userId)` callback (a bare fn can't call
 * hooks, so this is a hook that closes over the link mutation). Creates (or
 * loads) this user's local WDK wallet and links its address to the server.
 * Idempotent — the server upserts, and createWallet() no-ops if a wallet
 * already exists on this device for this userId.
 *
 * A freshly minted wallet (isNew) has 0 ETH, so in `standard` mode its first
 * invest/approve would fail with "insufficient funds for gas" — best-effort
 * fund it via the gas sponsor (POST /ops/faucet, P6). Deliberately
 * best-effort: on a real testnet without SPONSOR_PK (or a dry relayer) it
 * degrades to a soft toast, since the "Get gas ETH" button in /wallet is the
 * fallback either way. Skipped in `erc4337` mode (that wallet pays gas in
 * USD₮ via the paymaster and never needs ETH).
 *
 * TODO(wire): only recovers the wallet on the SAME device that created it —
 * the seed never leaves the device by design (self-custody), so a fresh login
 * on a new device mints a new address rather than recovering the original. A
 * real recovery-phrase UX is out of scope.
 *
 * Links `getWallet(userId).address`, NOT createWallet's return — in erc4337
 * mode those differ (EOA vs the Safe smart-account address), and the smart
 * account is the one that holds funds and sends txs. createWallet is still
 * called for `isNew` (the gas-fund decision); getWallet's `.address` is acted on.
 */
export function useEnsureWallet() {
  const { useLinkWallet } = useAccount();
  const linkWallet = useLinkWallet();
  const { useFundGas } = useOps();
  const fundGas = useFundGas();

  return async function ensureWallet(userId: string): Promise<string> {
    const { isNew } = await createWallet(userId);
    const wallet = await getWallet(userId);

    // eden-tanstack's mutationFn throws result.error on an API error (verified
    // in dist: `if (result.error) throw result.error`), so mutateAsync rejects
    // on failure — no `.error` to check. Rethrow a friendly Spanish message so
    // EnsureWallet's friendlyError has one (matches the legacy fetch UX).
    try {
      await linkWallet.mutateAsync({ walletAddress: wallet.address });
    } catch {
      throw new Error("No se pudo vincular la billetera");
    }

    if (isNew && walletMode() === "standard") {
      await fundGasBestEffort(wallet.address, fundGas.mutateAsync);
    }
    return wallet.address;
  };
}

async function fundGasBestEffort(
  address: string,
  mutateFundGas: (body: { address: string }) => Promise<{
    response: { hash: string } | { skipped: true; reason: string };
  }>,
): Promise<void> {
  try {
    const result = await mutateFundGas({ address });
    if ("skipped" in result.response) {
      toast.warning(result.response.reason);
    }
  } catch {
    toast.warning(
      "No se pudo cubrir el gas automáticamente — usá 'Conseguir ETH de gas' en tu billetera.",
    );
  }
}
```

- [ ] **Step 5: Delete the four legacy ops routes**

```bash
cd web
rm src/app/api/faucet/route.ts src/app/api/faucet-usdt/route.ts src/app/api/moonpay/route.ts src/app/api/sync/route.ts
rmdir src/app/api/faucet src/app/api/faucet-usdt src/app/api/moonpay src/app/api/sync 2>/dev/null || true
```

- [ ] **Step 6: Grep for stragglers**

Run: `cd web && grep -rn "api/faucet\b\|api/faucet-usdt\|api/moonpay\|api/sync" src --include="*.ts" --include="*.tsx"`
Expected: no output (the three prior hits — `AddFundsDialog.tsx`'s two `fetch()` calls and `use-ensure-wallet.ts`'s `fetch("/api/faucet")` plus its doc-comment mention — are all gone; the DB-schema comment `// /api/sync; on-chain logs...` and `lib/contracts.ts`'s comment mentioning `/api/sync` are historical prose, not live code, and are out of scope to edit here). If a live `fetch("/api/...")` caller remains, repoint it to the matching `useOps()` hook before proceeding.

- [ ] **Step 7: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: succeeds. The `[...slugs]` catch-all now owns all four ops endpoints; the legacy `/api/faucet*`, `/api/moonpay`, `/api/sync` routes are gone.

- [ ] **Step 8: In-browser verify**

With `pnpm dev` running:
1. Open `/wallet` (or wherever `AddFundsDialog` is reachable — the "Add funds" action), click "Buy with MoonPay" → a new tab opens to a `buy.moonpay.com` URL. Click "Get 5,000 test USD₮" / "Get gas ETH" → a toast resolves to either a success or a "skipped" warning (depending on whether `SPONSOR_PK`/`NEXT_PUBLIC_USDT_ADDRESS` are configured in `.env.local`), matching the legacy UX.
2. Sign up a **fresh fan** account (triggers `useEnsureWallet` in `standard` wallet mode) → confirm no console error; if `SPONSOR_PK` is configured, a background gas top-up happens silently; if not, nothing breaks (best-effort).
3. In DevTools Network, all four calls hit `/api/v1/ops/*` — no `fetch("/api/faucet")`/`"/api/moonpay")` (non-`v1`) request appears.

- [ ] **Step 9: Commit**

```bash
git add web/src/core/ops/client web/src/components/wallet/AddFundsDialog.tsx web/src/core/account/client/use-ensure-wallet.ts
git add -A web/src/app/api
git commit -m "feat(p6): ops client hooks — useOps; cut AddFundsDialog + useEnsureWallet; delete 4 legacy ops routes"
```

---

## Task 11: Full verification + decoupling audit

**Files:** none (verification only).

- [ ] **Step 1: Run every new test file**

```bash
cd web && pnpm exec tsx --test src/core/directory/domain/__tests__/directory-domain.test.ts src/core/ops/domain/__tests__/ops-domain.test.ts
cd web && pnpm db:migrate-pg
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test \
  src/core/directory/server/repository/__tests__/list-clubs-with-rounds.test.ts \
  src/core/directory/server/services/__tests__/list-directory-service.test.ts \
  src/core/ops/server/services/__tests__/fund-gas-service.test.ts \
  src/core/ops/server/services/__tests__/mint-usdt-service.test.ts \
  src/core/ops/server/services/__tests__/moonpay-service.test.ts \
  src/core/ops/server/services/__tests__/sync-service.test.ts
```
Expected: all pass (directory-domain 2, ops-domain 3, directory-repository 1, directory-service 3, fund-gas 3, mint-usdt 3, moonpay 2, sync 5 = 22 tests total across the two commands).

- [ ] **Step 2: Type gate + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: succeeds.

- [ ] **Step 3: Decoupling audit**

```bash
cd /home/skkippie/work/AI-DO/La12/.worktrees/feat-p5-p6-directory-ops
git diff --stat main...HEAD -- web/src/db/schema.ts web/src/lib/sponsor.ts
```
Expected: **no output** — this branch touched neither file (constraint 1: schema untouched; constraint 2: sponsor.ts not relocated/edited, only imported in place).
```bash
grep -rn "@/core/clubs\|@/core/rounds\|from \"\.\./\.\./\.\./clubs\"\|from \"\.\./\.\./\.\./rounds\"" web/src/core/directory
```
Expected: **no output** — constraint 3: `core/directory` imports neither `core/clubs` nor `core/rounds`.
```bash
git diff --stat main...HEAD -- web/src/server/router.ts
```
Expected: shows exactly the two added imports + two added `.use()` lines from Tasks 5 and 9 — this is the one intentionally shared file (constraint 4); confirm no other file in the diff overlaps anything the P3+P4 branch would plausibly touch (no `core/clubs`, `core/rounds`, or shared component edits beyond what this plan lists).

- [ ] **Step 4: Full route smoke test**

With `pnpm dev` running, re-run the five endpoint checks from Tasks 5 and 9 (`GET /api/v1/directory`, `POST /api/v1/ops/{faucet,faucet-usdt,moonpay,sync}`) in one pass to confirm nothing regressed after the client cutover in Task 10. Stop the dev server.

- [ ] **Step 5: Report**

No commit needed if Steps 1–4 all pass cleanly (nothing new to stage — this task only verifies prior commits). If any audit check in Step 3 fails, STOP and fix the violation in the offending task before proceeding to merge — do not paper over a decoupling violation here.

---

## Self-Review

**Spec coverage:**
- §1 goal (directory GET, four ops POSTs) → Tasks 2–5 (directory), 6–10 (ops). ✓
- §2 decoupling constraints 1–4 → stated verbatim in Global Constraints; audited executably in Task 11 Step 3. ✓
- §3 legacy behavior reproduced (`listClubsWithRounds`, `computeFundedPct`, all four ops engines + their bodies) → Tasks 2–4 (directory logic moved verbatim), 6–8 (ops logic moved verbatim: `EVENT_KIND`/`amountFromArgs`, `fundGas`/`mintTestUsdt`/`buildOnRampSession` wrapped in place). ✓
- §4 file structure → File Structure section mirrors the spec's tree exactly (directory tri-layer with no client hook; ops tri-layer + `client/hooks.ts`). ✓
- §5.1 directory public/graceful-empty/table-direct → Task 3 (table-direct repo), Task 4 (`ok([])` on empty rows, `err(unexpected)` only on throw), Task 5 (no macro). ✓
- §5.2 ops mutations wrapping legacy libs, public, zod-validated → Tasks 7–9. ✓
- §5.3 sync rebuilds `events`, idempotent, schema untouched → Task 8 (`replaceEvents` deletes+reinserts), constraint 1 respected (no schema edit anywhere in this plan). ✓
- §5.4 client hooks (`useOps()`, no directory hook) → Task 10. ✓
- §6 error/status semantics table → Task 9 implements exactly `{200,500}` for faucet/faucet-usdt/moonpay and widens sync to `{200,403,404,500}` (a resolved, documented deviation from the literal table — see the ambiguity note directly above Task 9's Step 1). ✓
- §7 testing (pure/repo/service/manual-live) → every task's Steps. ✓
- §8 parallel-execution playbook → Task 1 (worktree via the skill, branched from `d0f855c`), Task 11 (decoupling audit mirrors §8 step 4's checklist exactly). ✓
- §9 global constraints → Global Constraints section, verbatim + expanded test commands. ✓

**Placeholder scan:** no "TBD"/"implement later"/"similar to Task N" anywhere. The one carried-over `TODO(wire)` doc-comment in Task 10 Step 4 is an intentional, pre-existing comment ported verbatim from the current `use-ensure-wallet.ts` (matches the P2 plan's precedent for this exact file). Every code step shows complete, runnable code — no elided bodies. ✓

**Type consistency:**
- `ClubWithRound`/`ClubWithRoundDTO`/`computeFundedPct`/`toClubWithRoundDTO`/`parseClubWithRoundDTO` signatures identical across Task 2 (define) → Task 3/4 (consume) → Task 5 (route). ✓
- `ClubRoundRow`/`listClubsWithRoundsRows` identical across Task 3 (define) → Task 4 (consume). ✓
- `listDirectory`/`listDirectoryService` signatures identical across Task 4 (define) → Task 5 (route). ✓
- `AddressBody`/`MoonpayBody`/`SyncBody`/`FaucetResult`/`MintUsdtResult`/`MoonpaySession`/`SyncResult`/`EVENT_KIND`/`amountFromArgs` identical across Task 6 (define) → Tasks 7–9 (consume). ✓
- `fundGas`/`fundGasService`, `mintUsdt`/`mintUsdtService`, `buildOnRamp`/`moonpayService`, `syncRoundEvents`/`syncEventsService` — deps-injected-fn/real-deps-wrapper naming pairs consistent across Tasks 7–8 (define) → Task 9 (route call sites). ✓
- `useOps()` → `useFundGas`/`useMintUsdt`/`useMoonpay` consistent across Task 10 (define) → its own AddFundsDialog/useEnsureWallet consumers in the same task. ✓

**Decoupling-audit note:** This plan does not touch `web/src/db/schema.ts` anywhere (no task creates, modifies, or references it as a Files entry beyond `import type`/read-only table imports). `web/src/lib/sponsor.ts` is never modified or relocated — Task 7 imports `fundGas`/`FundGasResult` from `@/lib/sponsor` at its existing path, aliased only at the call site (`sendGasSponsored`), never moved. `web/src/core/directory/server/repository/list-clubs-with-rounds.ts` (Task 3) imports only `drizzle-orm`, `@/lib/db`, and `@/db/schema` — no `@/core/clubs` or `@/core/rounds` import anywhere in the directory domain. The only file touched by both this plan and the parallel P3+P4 spec is `web/src/server/router.ts` (Tasks 5 and 9), exactly as constraint 4 anticipates — Task 11 Step 3 makes this an executable, re-runnable check rather than a one-time claim.
