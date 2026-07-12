# P1 — Wallet Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the wallet read domain (fan positions + USD₮ history) end-to-end onto the Elysia/Eden rails as the canonical `core/<domain>` template — public zod-validated reads through typed Eden hooks, the two legacy Next route handlers deleted, no hand-duplicated DTOs.

**Architecture:** New `src/core/wallet/{domain,server/{api,services,repository},client}`. `getFanPositions` is split into a `server/repository` (drizzle: verified rounds ⨝ clubs) + a `server/services` orchestrator (chain-enrich, returns `AsyncAppResult`). Thin Elysia routes wrap the services with the wire envelope; `walletRouter` mounts in the root router. `WalletOverview.tsx` swaps its two `fetch()` calls for `useWalletPositions`/`useWalletHistory` Eden hooks (keeping the client-side WDK wallet resolution). Bigints cross the wire as strings; domain serializers/parsers convert.

**Tech Stack:** Elysia 1.4, Eden + eden-tanstack-react-query, @tanstack/react-query 5, Drizzle + node-postgres, viem (chain reads), zod v4, node:test + tsx, pnpm.

## Global Constraints

- **Money truth on-chain.** Postgres = `verified` allowlist + display metadata only; balances/rewards/raised from the contract.
- **bigints as strings on the wire** (JSON has no bigint). Wire schema fields = `z.string()`; parse to `bigint` at the client edge.
- **WDK / self-custody stays client-side, untouched.** API is reads only — no key, no signing.
- **Public reads** — no `authed` macro on wallet routes. `?address` validated with `addressSchema` (zod), replacing the `ADDRESS_RE` regex.
- **Graceful-empty UX** — read services return `ok(data | [])`; empty is a valid result, not a 4xx. `err(AppErrors.unexpected)`→500 only on a catastrophic throw.
- **Domain tri-layer:** `domain/` pure + zod + `__tests__`; `server/{api/routes,services,repository}`; `client/`. Dependencies point inward. **A domain isn't wired until its router is `.use()`d in `src/server/router.ts`.**
- Repositories `import "server-only"` + shared `db` (`@/lib/db`). No `console.*` in server code. No `any`/`as any`/`as unknown as` (a post-regex `as \`0x${string}\`` narrowing is sanctioned). Files <500 lines.
- Authoritative gate: `cd web && pnpm exec tsc --noEmit` (EXIT 0). Ignore the known LSP `drizzle-orm` dup-instance false positive; trust the CLI exit code.
- **Testing server-only modules:** any test that imports a `server/repository` or `server/services` module (which `import "server-only"`, and transitively `@/lib/db`) must run with **`pnpm exec tsx --conditions=react-server --test`** (resolves `server-only`'s empty export instead of its throwing default) **and** `DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce` set (importing the service/repo eval-loads `@/lib/db`, which throws if `DATABASE_URL` is unset — even when the test injects fakes and never queries). Pure `domain/` tests need neither. Before a repository integration test, run `pnpm db:migrate-pg` to ensure pg holds the real seeded data (a prior parity-test run can leave `0xround`/`fixture-club` pollution).
- Work from `/home/skkippie/work/AI-DO/La12/web`. Package manager pnpm. Postgres running (`DATABASE_URL` in `.env.local`, seeded demo club `deportivo-san-martin` + its verified round). Tests: `pnpm exec tsx --test <file>`.
- Domain data shapes (preserve exactly):
  - `FanPosition`: `{ roundId:number; contractAddress:\`0x${string}\`; clubName:string; clubSlug:string; shares:bigint; totalShares:bigint; investedUsdt:bigint; claimable:bigint; raised:bigint; goal:bigint; status:"funding"|"active"|"closed" }`
  - `HistoryEntry`: `{ hash:\`0x${string}\`; kind:"in"|"out"; token:\`0x${string}\`; amount:bigint; counterparty:\`0x${string}\`; blockNumber:bigint; timestamp:number }`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/core/wallet/domain/schemas.ts` | zod: `addressSchema`, `fanPositionSchema`, `historyEntrySchema` | Create |
| `src/core/wallet/domain/types.ts` | domain types + DTO (`z.infer`) + pure fns + serializers/parsers | Create |
| `src/core/wallet/domain/__tests__/positions.test.ts` | moved pure-fn tests + parse round-trip | Move+extend |
| `src/core/wallet/server/repository/find-verified-rounds.ts` | drizzle verified rounds ⨝ clubs | Create |
| `src/core/wallet/server/repository/__tests__/find-verified-rounds.test.ts` | pg integration test | Create |
| `src/core/wallet/server/services/get-fan-positions-service.ts` | orchestrate repo + chain → `AsyncAppResult<FanPosition[]>` | Create |
| `src/core/wallet/server/services/get-wallet-history-service.ts` | wrap `getHistory` → `AsyncAppResult<HistoryEntry[]>` | Create |
| `src/core/wallet/server/services/__tests__/get-fan-positions-service.test.ts` | deps-injected mapping test | Create |
| `src/core/wallet/server/api/routes/get-positions.route.ts` | GET /positions | Create |
| `src/core/wallet/server/api/routes/get-history.route.ts` | GET /history | Create |
| `src/core/wallet/server/api/router.ts` | `walletRouter` (prefix /wallet) | Create |
| `src/server/router.ts` | `.use(walletRouter)` + onError `targets` + NOT_FOUND fix | Modify |
| `src/core/wallet/client/hooks.ts` | `useWalletPositions`/`useWalletHistory` | Create |
| `src/components/wallet/WalletOverview.tsx` | swap fetch → hooks | Modify |
| `src/components/wallet/types.ts` | drop the wallet-read DTO duplication | Modify |
| `src/app/api/wallet/positions/route.ts` · `history/route.ts` | delete (replaced) | Delete |
| `src/lib/positions.ts` | delete (logic → domain + repo + service) | Delete |

`src/lib/indexer.ts` stays (the history service imports `getHistory` from it). `src/lib/contracts.ts` stays (the positions service imports its chain reads).

---

## Task 1: Wallet domain layer (schemas, types, pure tests)

**Files:**
- Create: `src/core/wallet/domain/schemas.ts`, `src/core/wallet/domain/types.ts`
- Move+extend: `src/lib/positions.test.ts` → `src/core/wallet/domain/__tests__/positions.test.ts`

**Interfaces:**
- Produces: `addressSchema`, `fanPositionSchema`, `historyEntrySchema` (schemas); `FanPosition`, `HistoryEntry`, `FanPositionDTO`, `HistoryEntryDTO`, `investedFromShares`, `percentOfRound`, `toPositionDTO`, `toHistoryDTO`, `parsePosition`, `parseHistoryEntry` (types).

- [ ] **Step 1: Create `src/core/wallet/domain/schemas.ts`**

```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Replaces the old ADDRESS_RE regex. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roundStatusSchema = z.enum(["funding", "active", "closed"]);

/** Wire shape of a fan position — bigints serialized to strings (JSON has no bigint). */
export const fanPositionSchema = z.object({
  roundId: z.number().int(),
  contractAddress: addressSchema,
  clubName: z.string(),
  clubSlug: z.string(),
  shares: z.string(),
  totalShares: z.string(),
  investedUsdt: z.string(),
  claimable: z.string(),
  raised: z.string(),
  goal: z.string(),
  status: roundStatusSchema,
});

/** Wire shape of a USD₮ transfer history entry. `hash` is a 32-byte tx hash (not an address). */
export const historyEntrySchema = z.object({
  hash: z.string(),
  kind: z.enum(["in", "out"]),
  token: addressSchema,
  amount: z.string(),
  counterparty: addressSchema,
  blockNumber: z.string(),
  timestamp: z.number().int(),
});
```

- [ ] **Step 2: Create `src/core/wallet/domain/types.ts`**

```ts
import type { z } from "zod";
import type { fanPositionSchema, historyEntrySchema } from "./schemas";

const SHARE_UNIT = 1_000000n; // 1e6 — matches RevenueShareRound.SHARE_UNIT & USD₮ 6dp

// Wire DTOs — derived from the zod schemas (bigints are strings here).
export type FanPositionDTO = z.infer<typeof fanPositionSchema>;
export type HistoryEntryDTO = z.infer<typeof historyEntrySchema>;

// Domain shapes — the enriched bigint/address-precise representation the server
// builds and the client renders. Not a mirror of the wire schema: bigint vs string.
export type FanPosition = Omit<
  FanPositionDTO,
  "contractAddress" | "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  contractAddress: `0x${string}`;
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
};

export type HistoryEntry = Omit<
  HistoryEntryDTO,
  "hash" | "token" | "counterparty" | "amount" | "blockNumber"
> & {
  hash: `0x${string}`;
  token: `0x${string}`;
  counterparty: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
};

/** invested USD₮ = shares * sharePrice / SHARE_UNIT (see contract invest()). */
export function investedFromShares(shares: bigint, sharePrice: bigint): bigint {
  return (shares * sharePrice) / SHARE_UNIT;
}

/** Fan's % of the round's total shares, 2 decimals; 0 when supply is 0. */
export function percentOfRound(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}

export function toPositionDTO(p: FanPosition): FanPositionDTO {
  return {
    ...p,
    shares: p.shares.toString(),
    totalShares: p.totalShares.toString(),
    investedUsdt: p.investedUsdt.toString(),
    claimable: p.claimable.toString(),
    raised: p.raised.toString(),
    goal: p.goal.toString(),
  };
}

export function parsePosition(d: FanPositionDTO): FanPosition {
  return {
    ...d,
    contractAddress: d.contractAddress as `0x${string}`,
    shares: BigInt(d.shares),
    totalShares: BigInt(d.totalShares),
    investedUsdt: BigInt(d.investedUsdt),
    claimable: BigInt(d.claimable),
    raised: BigInt(d.raised),
    goal: BigInt(d.goal),
  };
}

export function toHistoryDTO(e: HistoryEntry): HistoryEntryDTO {
  return { ...e, amount: e.amount.toString(), blockNumber: e.blockNumber.toString() };
}

export function parseHistoryEntry(d: HistoryEntryDTO): HistoryEntry {
  return {
    ...d,
    hash: d.hash as `0x${string}`,
    token: d.token as `0x${string}`,
    counterparty: d.counterparty as `0x${string}`,
    amount: BigInt(d.amount),
    blockNumber: BigInt(d.blockNumber),
  };
}
```

- [ ] **Step 3: Move the pure-fn test and extend it**

```bash
cd /home/skkippie/work/AI-DO/La12/web
mkdir -p src/core/wallet/domain/__tests__
git mv src/lib/positions.test.ts src/core/wallet/domain/__tests__/positions.test.ts
```
Then rewrite `src/core/wallet/domain/__tests__/positions.test.ts` to import from the new domain module and add a `parsePosition` round-trip:

```ts
import { test } from "node:test";
import assert from "node:assert";
import {
  investedFromShares,
  percentOfRound,
  toPositionDTO,
  parsePosition,
  type FanPosition,
} from "../types";

test("investedFromShares: shares * sharePrice / 1e6", () => {
  assert.strictEqual(investedFromShares(10_000000n, 1_000000n), 10_000000n); // 10 shares @ 1 USDT = 10 USDT
  assert.strictEqual(investedFromShares(10_000000n, 2_000000n), 20_000000n); // @ 2 USDT/share = 20 USDT
});

test("percentOfRound: 2-decimal share of supply; 0 when supply 0", () => {
  assert.strictEqual(percentOfRound(25_000000n, 100_000000n), 25);
  assert.strictEqual(percentOfRound(1n, 0n), 0);
});

test("toPositionDTO -> parsePosition round-trips bigints (precision beyond 2^53)", () => {
  const p: FanPosition = {
    roundId: 1, contractAddress: "0xabc", clubName: "C", clubSlug: "c",
    shares: 10_000000n, totalShares: 40_000000n,
    investedUsdt: 10_000000n, claimable: 0n,
    raised: 123456789012345678n, goal: 500_000000n, status: "funding",
  };
  const round = parsePosition(toPositionDTO(p));
  assert.strictEqual(round.raised, 123456789012345678n); // no float rounding
  assert.strictEqual(round.shares, 10_000000n);
  assert.strictEqual(round.status, "funding");
});
```

- [ ] **Step 4: Run the tests**

Run: `cd web && pnpm exec tsx --test src/core/wallet/domain/__tests__/positions.test.ts`
Expected: 3 pass. Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/wallet/domain web/src/lib/positions.test.ts
git commit -m "feat(p1): wallet domain layer (schemas, types, pure fns) + moved tests"
```

---

## Task 2: Repository — verified rounds joined to clubs

**Files:**
- Create: `src/core/wallet/server/repository/find-verified-rounds.ts`, `src/core/wallet/server/repository/__tests__/find-verified-rounds.test.ts`

**Interfaces:**
- Consumes: `db` (`@/lib/db`), `rounds`/`clubs` (`@/db/schema`).
- Produces: `findVerifiedRounds(): Promise<VerifiedRoundRow[]>` where `VerifiedRoundRow = { roundId:number; contractAddress:\`0x${string}\`; sharePrice:string; goal:string; status:"funding"|"active"|"closed"; clubName:string; clubSlug:string }`.

- [ ] **Step 1: Create `src/core/wallet/server/repository/find-verified-rounds.ts`**

```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";

export type VerifiedRoundRow = {
  roundId: number;
  contractAddress: `0x${string}`;
  sharePrice: string; // USD₮ base units per share (string for bigint precision)
  goal: string; // USD₮ base units
  status: "funding" | "active" | "closed";
  clubName: string;
  clubSlug: string;
};

/** All allowlisted (verified) rounds joined to their club. Money truth is on-chain;
 *  this returns only the display metadata + the contract address to read. */
export async function findVerifiedRounds(): Promise<VerifiedRoundRow[]> {
  const rows = await db
    .select({
      roundId: rounds.id,
      contractAddress: rounds.contractAddress,
      sharePrice: rounds.sharePrice,
      goal: rounds.goal,
      status: rounds.status,
      clubName: clubs.name,
      clubSlug: clubs.slug,
    })
    .from(rounds)
    .innerJoin(clubs, eq(clubs.id, rounds.clubId))
    .where(eq(rounds.verified, true));

  return rows.map((r) => ({ ...r, contractAddress: r.contractAddress as `0x${string}` }));
}
```

- [ ] **Step 2: Write the failing pg integration test `.../__tests__/find-verified-rounds.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert";
import { findVerifiedRounds } from "../find-verified-rounds";

// Read-only against local Postgres (seeded demo club deportivo-san-martin + its
// verified round). Non-destructive: no writes, no truncate.
test("findVerifiedRounds returns verified rounds joined to their club", async () => {
  const rows = await findVerifiedRounds();
  assert.ok(Array.isArray(rows));
  // Every returned row carries club display fields + a contract address.
  for (const r of rows) {
    assert.strictEqual(typeof r.roundId, "number");
    assert.match(r.contractAddress, /^0x[a-fA-F0-9]{40}$/);
    assert.strictEqual(typeof r.clubName, "string");
    assert.strictEqual(typeof r.clubSlug, "string");
    assert.ok(["funding", "active", "closed"].includes(r.status));
  }
  // The seeded demo round is verified and joined to deportivo-san-martin.
  assert.ok(rows.some((r) => r.clubSlug === "deportivo-san-martin"));
});
```

- [ ] **Step 3: Run it**

Run (first restore real pg data, then test with the react-server condition — see Global Constraints):
```bash
cd web && pnpm db:migrate-pg
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/wallet/server/repository/__tests__/find-verified-rounds.test.ts
```
Expected: PASS. (`--conditions=react-server` is REQUIRED — the repo `import "server-only"` throws under plain `tsx`. `db:migrate-pg` clears any `0xround`/`fixture-club` pollution from a prior parity-test run and restores the real demo round.)

- [ ] **Step 4: Typecheck + commit**

Run: `cd web && pnpm exec tsc --noEmit` → EXIT 0.
```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/wallet/server/repository
git commit -m "feat(p1): wallet repository — verified rounds joined to clubs"
```

---

## Task 3: Services — fan positions + wallet history

**Files:**
- Create: `src/core/wallet/server/services/get-fan-positions-service.ts`, `src/core/wallet/server/services/get-wallet-history-service.ts`, `src/core/wallet/server/services/__tests__/get-fan-positions-service.test.ts`

**Interfaces:**
- Consumes: `findVerifiedRounds` (Task 2); chain reads `shareBalance`/`totalShares`/`pendingReward`/`totalRaised`/`readSafely` (`@/lib/contracts`); `getHistory` (`@/lib/indexer`); `AsyncAppResult`/`ok`/`AppErrors` (`@/server/common/responses`); domain types (Task 1).
- Produces: `getFanPositions(deps): AsyncAppResult<FanPosition[]>` + `getFanPositionsService(fan): AsyncAppResult<FanPosition[]>`; `getWalletHistory(deps): AsyncAppResult<HistoryEntry[]>` + `getWalletHistoryService(address): AsyncAppResult<HistoryEntry[]>`.

- [ ] **Step 1: Create `src/core/wallet/server/services/get-fan-positions-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { shareBalance, totalShares, pendingReward, totalRaised, readSafely } from "@/lib/contracts";
import { findVerifiedRounds, type VerifiedRoundRow } from "../repository/find-verified-rounds";
import { investedFromShares, type FanPosition } from "@/core/wallet/domain/types";

/** Deps injected so the orchestration is testable without a DB or a chain. */
type FanPositionsDeps = {
  fan: `0x${string}`;
  findRounds: () => Promise<VerifiedRoundRow[]>;
  reads: {
    shareBalance: (addr: `0x${string}`, fan: `0x${string}`) => Promise<bigint>;
    totalShares: (addr: `0x${string}`) => Promise<bigint>;
    pendingReward: (addr: `0x${string}`, fan: `0x${string}`) => Promise<bigint>;
    totalRaised: (addr: `0x${string}`) => Promise<bigint>;
  };
};

/** Verified rounds where `fan` holds > 0 shares, enriched with on-chain reads.
 *  Reads are individually fault-tolerant (readSafely in the wrapper); a
 *  catastrophic failure (e.g. DB down) surfaces as err(unexpected)→500. */
export async function getFanPositions(deps: FanPositionsDeps): AsyncAppResult<FanPosition[]> {
  try {
    const rounds = await deps.findRounds();
    const positions = await Promise.all(
      rounds.map(async (round): Promise<FanPosition | null> => {
        const shares = await deps.reads.shareBalance(round.contractAddress, deps.fan);
        if (shares === 0n) return null;
        const [supply, claimable, raised] = await Promise.all([
          deps.reads.totalShares(round.contractAddress),
          deps.reads.pendingReward(round.contractAddress, deps.fan),
          deps.reads.totalRaised(round.contractAddress),
        ]);
        return {
          roundId: round.roundId,
          contractAddress: round.contractAddress,
          clubName: round.clubName,
          clubSlug: round.clubSlug,
          shares,
          totalShares: supply,
          investedUsdt: investedFromShares(shares, BigInt(round.sharePrice)),
          claimable,
          raised,
          goal: BigInt(round.goal),
          status: round.status,
        };
      }),
    );
    return ok(positions.filter((p): p is FanPosition => p !== null));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. Chain reads are readSafely-wrapped (0n fallback). */
export function getFanPositionsService(fan: `0x${string}`): AsyncAppResult<FanPosition[]> {
  return getFanPositions({
    fan,
    findRounds: findVerifiedRounds,
    reads: {
      shareBalance: (addr, f) => readSafely(() => shareBalance(addr, f), 0n),
      totalShares: (addr) => readSafely(() => totalShares(addr), 0n),
      pendingReward: (addr, f) => readSafely(() => pendingReward(addr, f), 0n),
      totalRaised: (addr) => readSafely(() => totalRaised(addr), 0n),
    },
  });
}
```

- [ ] **Step 2: Create `src/core/wallet/server/services/get-wallet-history-service.ts`**

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { getHistory } from "@/lib/indexer";
import type { HistoryEntry } from "@/core/wallet/domain/types";

type HistoryDeps = {
  address: `0x${string}`;
  fetchHistory: (address: `0x${string}`) => Promise<HistoryEntry[]>;
};

/** USD₮ transfer history for an address. getHistory already degrades (indexer→RPC
 *  fallback, empty on error), so this returns ok([]) rather than 4xx for no data. */
export async function getWalletHistory(deps: HistoryDeps): AsyncAppResult<HistoryEntry[]> {
  try {
    return ok(await deps.fetchHistory(deps.address));
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function getWalletHistoryService(address: `0x${string}`): AsyncAppResult<HistoryEntry[]> {
  return getWalletHistory({ address, fetchHistory: getHistory });
}
```

- [ ] **Step 3: Write the failing service test `.../__tests__/get-fan-positions-service.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert";
import { getFanPositions } from "../get-fan-positions-service";
import type { VerifiedRoundRow } from "../../repository/find-verified-rounds";

const FAN = "0x1111111111111111111111111111111111111111" as const;
const round: VerifiedRoundRow = {
  roundId: 1, contractAddress: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  sharePrice: "1000000", goal: "500000000", status: "funding",
  clubName: "Demo", clubSlug: "demo",
};

test("maps a held round to a FanPosition (invested = shares*price/1e6), drops zero-share rounds", async () => {
  const zeroRound: VerifiedRoundRow = { ...round, roundId: 2, contractAddress: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" };
  const result = await getFanPositions({
    fan: FAN,
    findRounds: async () => [round, zeroRound],
    reads: {
      shareBalance: async (addr) => (addr === round.contractAddress ? 10_000000n : 0n),
      totalShares: async () => 40_000000n,
      pendingReward: async () => 0n,
      totalRaised: async () => 250_000000n,
    },
  });
  assert.strictEqual(result.ok, true);
  if (!result.ok) return;
  assert.strictEqual(result.data.length, 1); // zero-share round dropped
  assert.strictEqual(result.data[0].investedUsdt, 10_000000n); // 10 shares @ 1 USDT
  assert.strictEqual(result.data[0].goal, 500_000000n);
});

test("returns err(unexpected) when the repository throws", async () => {
  const result = await getFanPositions({
    fan: FAN,
    findRounds: async () => { throw new Error("db down"); },
    reads: { shareBalance: async () => 0n, totalShares: async () => 0n, pendingReward: async () => 0n, totalRaised: async () => 0n },
  });
  assert.strictEqual(result.ok, false);
  if (result.ok) return;
  assert.strictEqual(result.error.status, 500);
  assert.strictEqual(result.error.code, "INTERNAL_SERVER_ERROR");
});
```

- [ ] **Step 4: Run it + typecheck**

Run (needs the react-server condition + DATABASE_URL — importing the service eval-loads `@/lib/db`; see Global Constraints):
```bash
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/wallet/server/services/__tests__/get-fan-positions-service.test.ts
```
Expected: 2 pass (the test injects fakes, but the import chain still loads `@/lib/db`, so `DATABASE_URL` must be set). Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/wallet/server/services
git commit -m "feat(p1): wallet services (fan positions + history) returning AsyncAppResult"
```

---

## Task 4: Elysia routes + wire the router + onError fix

**Files:**
- Create: `src/core/wallet/server/api/routes/get-positions.route.ts`, `.../get-history.route.ts`, `src/core/wallet/server/api/router.ts`
- Modify: `src/server/router.ts`

**Interfaces:**
- Consumes: services (Task 3); `CommonResponse`/`errorToResponse`/`successResponseSchema`/`errorResponseSchema` (`@/server/common/responses`); `fanPositionSchema`/`historyEntrySchema`/`addressSchema` (Task 1) + `toPositionDTO`/`toHistoryDTO` (Task 1).
- Produces: `walletRouter` mounted at `/api/v1/wallet`; `GET /api/v1/wallet/positions?address=` and `.../history?address=` returning the envelope.

- [ ] **Step 1: Create `src/core/wallet/server/api/routes/get-positions.route.ts`**

```ts
import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressSchema, fanPositionSchema } from "@/core/wallet/domain/schemas";
import { toPositionDTO } from "@/core/wallet/domain/types";
import { getFanPositionsService } from "../../services/get-fan-positions-service";

export const getPositionsRoute = new Elysia().get(
  "/positions",
  async ({ query, status }) => {
    const result = await getFanPositionsService(query.address as `0x${string}`);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toPositionDTO) }));
  },
  {
    query: z.object({ address: addressSchema }),
    response: {
      200: successResponseSchema(z.array(fanPositionSchema), "FanPositions"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Wallet"], summary: "Fan positions (verified rounds the address holds shares in)" },
  },
);
```

- [ ] **Step 2: Create `src/core/wallet/server/api/routes/get-history.route.ts`**

```ts
import { Elysia } from "elysia";
import { z } from "zod";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { addressSchema, historyEntrySchema } from "@/core/wallet/domain/schemas";
import { toHistoryDTO } from "@/core/wallet/domain/types";
import { getWalletHistoryService } from "../../services/get-wallet-history-service";

export const getHistoryRoute = new Elysia().get(
  "/history",
  async ({ query, status }) => {
    const result = await getWalletHistoryService(query.address as `0x${string}`);
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data.map(toHistoryDTO) }));
  },
  {
    query: z.object({ address: addressSchema }),
    response: {
      200: successResponseSchema(z.array(historyEntrySchema), "WalletHistory"),
      500: errorResponseSchema(500),
    },
    detail: { tags: ["Wallet"], summary: "USD₮ transfer history for an address" },
  },
);
```

- [ ] **Step 3: Create `src/core/wallet/server/api/router.ts`**

```ts
import { Elysia } from "elysia";
import { getPositionsRoute } from "./routes/get-positions.route";
import { getHistoryRoute } from "./routes/get-history.route";

export const walletRouter = new Elysia({ prefix: "/wallet" })
  .use(getPositionsRoute)
  .use(getHistoryRoute);
```

- [ ] **Step 4: Wire `walletRouter` + fix `onError` in `src/server/router.ts`**

Add the import near the other imports:
```ts
import { walletRouter } from "@/core/wallet/server/api/router";
```
In the `.onError(...)` block, change the VALIDATION branch to include `targets`, and add a `NOT_FOUND` passthrough before the generic 500. **NOTE (verified empirically):** Elysia validates with **zod** here (not TypeBox as in the reference), so the validation error's `valueError.path` is an **array** (`["address"]`) and `error.status` is **422** — the reference's `typeof path === "string"` check never matches. Replace the current `onError` body with:
```ts
  .onError(({ error, code, request, path }) => {
    if (code === "VALIDATION") {
      // Elysia + zod: error.valueError is the first zod issue; its `path` is an
      // array of the failing field(s), e.g. ["address"] (status is 422).
      const valueError = (error as { valueError?: { path?: unknown } }).valueError;
      const targets = Array.isArray(valueError?.path)
        ? (valueError.path as unknown[]).map(String)
        : undefined;
      return {
        code,
        status: (error as { status?: number }).status as keyof typeof STATUS_MAP,
        response: valueError,
        targets,
      } satisfies APIResponse<unknown>;
    }
    if (code === "NOT_FOUND") return { code: "NOT_FOUND", status: 404 } satisfies APIResponse;
    apiErrorLogger.error("Unhandled API error {code} on {method} {path}: {error}", {
      code,
      method: request.method,
      path,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    return { code: "INTERNAL_SERVER_ERROR", status: 500 } satisfies APIResponse;
  })
```
Then mount the router — add `.use(walletRouter)` immediately after the `.get("/health", ...)` chain (before `export default app`):
```ts
  .use(walletRouter);
```
(Attach it to the same `app` chain. Confirm `export default app; export type AppRouter = typeof app;` still follow.)

- [ ] **Step 5: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build. (`AppRouter` now includes the wallet paths.)

- [ ] **Step 6: Verify the live endpoints + the onError fix**

Run: `cd web && pnpm dev` (background; note the actual port — may be 3001). Then (use the real port):
- `curl -s "http://localhost:3000/api/v1/wallet/positions?address=0x0000000000000000000000000000000000000001"` → `{"response":[],"code":"OK","status":200}` (empty is valid — that address holds nothing).
- `curl -s "http://localhost:3000/api/v1/wallet/history?address=0x0000000000000000000000000000000000000001"` → `{"response":[...],"code":"OK","status":200}` (array, possibly empty).
- Bad address (proves zod + the onError `targets` fix): `curl -s "http://localhost:3000/api/v1/wallet/positions?address=nope"` → a **422** envelope whose body includes `"code":"VALIDATION"` and `"targets":["address"]` (zod validation → 422, not 400).
Stop the dev server.

- [ ] **Step 7: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/src/core/wallet/server/api web/src/server/router.ts
git commit -m "feat(p1): wallet Elysia routes + mount walletRouter + onError targets/NOT_FOUND fix"
```

---

## Task 5: Client hooks + WalletOverview swap + delete legacy

**Files:**
- Create: `src/core/wallet/client/hooks.ts`
- Modify: `src/components/wallet/WalletOverview.tsx`, `src/components/wallet/types.ts`
- Delete: `src/app/api/wallet/positions/route.ts`, `src/app/api/wallet/history/route.ts`, `src/lib/positions.ts`

**Interfaces:**
- Consumes: `useElysia` (`@/frontend/lib/eden`); `parsePosition`/`parseHistoryEntry`/`FanPosition`/`HistoryEntry` (Task 1); `AppRouter` (typed via eden).
- Produces: `useWalletPositions(address?)` → `UseQueryResult<FanPosition[]>`; `useWalletHistory(address?)` → `UseQueryResult<HistoryEntry[]>`.

- [ ] **Step 1: Create `src/core/wallet/client/hooks.ts`**

```ts
"use client";
import { useQuery } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
import { parsePosition, parseHistoryEntry } from "@/core/wallet/domain/types";

/** Fan positions for `address`, parsed to bigint views. Disabled until address is known. */
export function useWalletPositions(address?: string) {
  const wallet = useElysia().wallet;
  return useQuery({
    ...wallet.positions.get.queryOptions({ query: { address: address ?? "" } }),
    enabled: !!address,
    select: (data) => (data.response ?? []).map(parsePosition),
  });
}

/** USD₮ transfer history for `address`, parsed to bigint views. */
export function useWalletHistory(address?: string) {
  const wallet = useElysia().wallet;
  return useQuery({
    ...wallet.history.get.queryOptions({ query: { address: address ?? "" } }),
    enabled: !!address,
    select: (data) => (data.response ?? []).map(parseHistoryEntry),
  });
}
```

- [ ] **Step 2: Typecheck the hooks against the router types**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (Proves `useElysia().wallet.positions.get.queryOptions({query:{address}})` is typed and `data.response` is `FanPositionDTO[]`. If the eden proxy call signature differs — e.g. it wants the query as the first arg — adjust to the shape the types demand; the `wallet.positions.get` path itself is guaranteed by Task 4.)

- [ ] **Step 3: Rewrite `src/components/wallet/WalletOverview.tsx` to use the hooks**

Keep the client-side WDK wallet resolution (address + balance); replace the two `fetch()` calls + `parsePositionDTO`/`parseHistoryDTO` with the hooks. Replace the top imports + the state/effect block:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentUserId } from "@/frontend/auth/auth";
import { createWallet, getWallet, type WalletHandle } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";
import { useWalletPositions, useWalletHistory } from "@/core/wallet/client/hooks";
import { BalanceHero } from "./BalanceHero";
import { StatCards } from "./StatCards";
import { PositionsList } from "./PositionsList";
import { ActivityPanel } from "./ActivityPanel";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { AddFundsDialog } from "./AddFundsDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletOverview() {
  const { userId } = useCurrentUserId();
  const searchParams = useSearchParams();

  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [resolving, setResolving] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<null | "send" | "receive" | "addFunds">(
    searchParams.get("action") === "addFunds" ? "addFunds" : null,
  );

  // Resolve the self-custody WDK wallet (address + USD₮ balance) client-side.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      setWalletError(null);
      try {
        await createWallet(userId); // no-op if it already exists
        const w = await getWallet(userId);
        if (cancelled) return;
        setWallet(w);
        setBalance(await w.getUsdtBalance());
      } catch (err) {
        if (!cancelled) setWalletError(friendlyError(err));
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  const address = wallet?.address;
  const posQuery = useWalletPositions(address);
  const histQuery = useWalletHistory(address);
  const positions = posQuery.data ?? [];
  const activity = histQuery.data ?? [];

  const loading = resolving || (!!address && (posQuery.isLoading || histQuery.isLoading));
  const error = walletError; // read failures degrade to empty per the API contract

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-5xl border-destructive/40 bg-destructive/10 p-5 text-destructive">
        Could not load your wallet: {error}
      </Card>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.investedUsdt, 0n);
  const totalClaimable = positions.reduce((sum, p) => sum + p.claimable, 0n);
```
Leave the JSX return body below that point **unchanged** — `wallet`, `balance`, `positions`, `activity`, `totalInvested`, `totalClaimable`, `dialog`/`setDialog` all keep the same names and types (`positions`/`activity` are still `FanPosition[]`/`HistoryEntry[]` — the hooks' `select` returns the parsed bigint views). Where a child previously received an `onDistributed`/`onClaimed` refresh callback that called `refresh()`, replace it with a query invalidation:
```tsx
import { useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";
// inside the component:
const queryClient = useQueryClient();
const walletProxy = useElysia().wallet;
const refetchWallet = () => {
  queryClient.invalidateQueries({ queryKey: walletProxy.positions.get.queryKey() });
  queryClient.invalidateQueries({ queryKey: walletProxy.history.get.queryKey() });
};
```
Pass `refetchWallet` wherever `refresh` was passed. (If no child used `refresh`, skip this block.)

- [ ] **Step 4: Delete the legacy routes, the DTO duplication, and lib/positions.ts**

```bash
cd /home/skkippie/work/AI-DO/La12/web
git rm src/app/api/wallet/positions/route.ts src/app/api/wallet/history/route.ts
git rm src/lib/positions.ts
```
Then in `src/components/wallet/types.ts`, delete `FanPositionDTO`, `parsePositionDTO`, `HistoryEntryDTO`, `parseHistoryDTO` (the wallet-read DTO duplication now living in `core/wallet/domain/types.ts`). Keep `FanPositionView`/`HistoryEntryView` ONLY if another file still imports them; otherwise delete the file. Resolve importers:
```bash
cd web && grep -rn "@/components/wallet/types\|@/lib/positions" src
```
For each hit, repoint:
- **Types/parsers/pure-fns** (`FanPositionView`→`FanPosition`, `HistoryEntryView`→`HistoryEntry`, `parsePositionDTO`→`parsePosition`, `parseHistoryDTO`→`parseHistoryEntry`, `investedFromShares`/`percentOfRound`/`toPositionDTO`) → import from `@/core/wallet/domain/types` (identical field shapes). Applies to `PositionsList`/`ActivityPanel`/`positions-view.ts` etc.
- **The `getFanPositions` FUNCTION** (if any server file imports it directly — e.g. an RSC page) → switch to `getFanPositionsService` from `@/core/wallet/server/services/get-fan-positions-service` and unwrap the Result: `const r = await getFanPositionsService(addr); const positions = r.ok ? r.data : [];`. (Its return type changed from `FanPosition[]` to `AsyncAppResult<FanPosition[]>`.)
If the grep reveals a consumer this plan didn't anticipate that can't be cleanly repointed, STOP and report it rather than forcing a delete.

- [ ] **Step 5: Typecheck, build, and drive the wallet page**

Run: `cd web && pnpm exec tsc --noEmit && pnpm build`
Expected: EXIT 0 + build (every importer repointed; no `@/lib/positions` or deleted-DTO reference remains — `grep -rn "@/lib/positions\|parsePositionDTO\|parseHistoryDTO" src` returns nothing).
Then `cd web && pnpm dev` (background) and confirm the wallet page renders through Eden:
- Sign in as a fan (or reuse a session), open `/wallet`. Positions + activity load with no console errors; no `/api/wallet/*` (non-v1) request appears in the network tab (grep the dev log / devtools). The Eden requests hit `/api/v1/wallet/positions` + `/history`.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add -A web/src
git commit -m "feat(p1): swap WalletOverview to Eden wallet hooks; delete legacy routes + duplicated DTOs"
```

---

## Acceptance criteria (P1 done)

- `pnpm exec tsc --noEmit` + `pnpm build` green; all wallet tests pass (domain 3, repository 1, service 2).
- `GET /api/v1/wallet/positions?address=` + `/history?address=` return the wire envelope; a bad address → 422 with `targets:["address"]` (onError fix proven).
- The wallet page renders positions + history through the typed Eden hooks; no `fetch("/api/wallet/*")` remains; `src/lib/positions.ts` + both legacy routes deleted; no duplicated wallet DTO parsers.
- `walletRouter` is `.use()`d in `src/server/router.ts` (domain wired).
- Money truth still on-chain; WDK self-custody untouched; no `authed` on wallet reads.

## Notes for later phases

- This is the template: P2..N create `core/<domain>/{domain,server/{api,services,repository},client}` the same way, `.use()` their router in `server/router.ts`, and (for authed/club-scoped domains) use the `authed`/`clubAuthed` macros from P0b.
- `authenticate()` logging (P0b-deferred) still pending — lands with the first authed RSC guard (clubs, P3).
- `lib/contracts.ts` relocation to `server/chain/` remains a later cleanup (imported in place here).
