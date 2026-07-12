# P2 — account slice (wallet-link mutation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the legacy `POST /api/account/wallet` (link a WDK wallet address → the caller's `clubs`/`profiles` row) into the Elysia domain tri-layer behind the `authed` macro, consumed on the client via an Eden `useMutation`+invalidate hook.

**Architecture:** First **mutation** + first **`authed`** consumer of the new stack. Copies the P1 wallet tri-layer (domain → repository → services → api/route) and the reference `create-cv` route/hook shape. Identity comes from the session `user`, never the body; the body carries only `walletAddress`. Service returns a normalized `{role,walletAddress,linkedId}` DTO (single 200 upsert).

**Tech Stack:** Elysia 1.4, Better Auth 1.6 (`authed` macro), Eden + eden-tanstack-react-query, zod v4, Drizzle (node-postgres), `node:test` + tsx.

**Spec:** `docs/superpowers/specs/2026-07-12-p2-account-slice-design.md`.

## Global Constraints

- Work from `/home/skkippie/work/AI-DO/La12/web`. Package manager **pnpm**. Postgres running; `DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce` in `.env.local`; seeded demo club `deportivo-san-martin` (userId **null** — predates auth) + its verified round.
- **`pnpm exec tsc --noEmit` (in `web/`) EXIT 0 is the authoritative type gate.** The `drizzle-orm` duplicate-instance LSP TS2345 is a known stale-transitive false positive (PF removes it) — ignore it if `tsc` is green.
- **Testing server-only modules:** any test importing a `server/repository` or `server/services` module (they `import "server-only"` and transitively `@/lib/db`) MUST run with `--conditions=react-server` (resolves `server-only`'s empty export instead of its throwing default) **and** `DATABASE_URL` set (importing the module eval-loads `@/lib/db`, which throws if unset — even when the test injects fakes and never queries). Pure `domain/` tests need neither.
- Before a **live repository** test, run `pnpm db:migrate-pg` first to restore real seeded data (a prior write/parity test can leave pollution). Repo tests here WRITE — they MUST clean up their temp rows in a `finally`/`after` hook.
- **Elysia validates with ZOD, not TypeBox.** A body/query validation error has `error.status = 422` and `error.valueError.path = ARRAY` of field names (e.g. `["walletAddress"]`). The root `onError` already derives `targets` via `Array.isArray(valueError.path).map(String)` — do not touch it.
- Identity (`id`, `role`, `name`) comes from the session `user` (injected by `authed`), never the request body. Self-custody: only the public address is linked; the seed never leaves the browser. Never move chain signing server-side.
- **Out of scope:** the best-effort gas faucet (`/api/faucet`) inside the ensure-wallet flow is the **ops domain (P6)** — keep it as the existing legacy `fetch`, do not migrate.

---

## File Structure

```
web/src/core/account/
  domain/
    schemas.ts                         (create) addressSchema, roleSchema, linkWalletBodySchema, linkedWalletSchema
    types.ts                           (create) LinkedWallet type; slugify() + COMBINING_MARKS
    __tests__/slugify.test.ts          (create) pure-fn tests
  server/
    repository/
      upsert-club-wallet.ts            (create) upsertClubWallet(userId,name,addr) → {id}
      upsert-profile-wallet.ts         (create) upsertProfileWallet(userId,name,addr) → {id}
      __tests__/upsert-wallet.test.ts  (create) live pg test, self-cleaning
    services/
      link-wallet-service.ts           (create) linkWallet(deps) + linkWalletService(user,body)
      __tests__/link-wallet-service.test.ts (create) deps-injected, fakes
    api/
      routes/link-wallet.route.ts      (create) .use(authed).post("/wallet", …)
      router.ts                        (create) accountRouter, prefix /account
  client/
    hooks.ts                           (create) useAccount().useLinkWallet()
    use-ensure-wallet.ts               (create) useEnsureWallet()

web/src/server/router.ts               (modify) .use(accountRouter)
web/src/components/EnsureWallet.tsx    (modify) swap ensureWalletLinked → useEnsureWallet
web/src/app/api/account/wallet/route.ts (delete) legacy route
web/src/lib/ensureWallet.ts            (delete) bare imperative fn
```

---

## Task 1: domain (schemas + slugify)

**Files:**
- Create: `web/src/core/account/domain/schemas.ts`
- Create: `web/src/core/account/domain/types.ts`
- Test: `web/src/core/account/domain/__tests__/slugify.test.ts`

**Interfaces:**
- Produces: `linkWalletBodySchema` (`z.object({ walletAddress })`), `linkedWalletSchema` (`z.object({ role, walletAddress, linkedId })`), `roleSchema` (`z.enum(["club","fan"])`), `addressSchema`; `type LinkedWallet = z.infer<typeof linkedWalletSchema>`; `slugify(name: string): string`.

- [ ] **Step 1: Write the failing test**

Create `web/src/core/account/domain/__tests__/slugify.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { slugify } from "../types";

test("slugify: lowercases, dashes, strips accents", () => {
  assert.strictEqual(slugify("Club Atlético"), "club-atletico");
  assert.strictEqual(slugify("Deportivo San Martín"), "deportivo-san-martin");
});

test("slugify: collapses non-alphanumerics and trims edge dashes", () => {
  assert.strictEqual(slugify("  FC 123!! "), "fc-123");
  assert.strictEqual(slugify("--Boca--"), "boca");
});

test("slugify: empty / punctuation-only falls back to 'club'", () => {
  assert.strictEqual(slugify(""), "club");
  assert.strictEqual(slugify("!!!"), "club");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && pnpm exec tsx --test src/core/account/domain/__tests__/slugify.test.ts`
Expected: FAIL — `Cannot find module '../types'`.

- [ ] **Step 3: Write `schemas.ts`**

Create `web/src/core/account/domain/schemas.ts`:
```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as the wallet domain's. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

/** Account role — Better Auth's `role` additionalField enum. */
export const roleSchema = z.enum(["club", "fan"]);

/** Body of POST /account/wallet — walletAddress ONLY; identity comes from the session. */
export const linkWalletBodySchema = z.object({ walletAddress: addressSchema });

/** Wire DTO — normalized across the club/profile branches. `linkedId` is the
 *  serial pk of the upserted clubs/profiles row. */
export const linkedWalletSchema = z.object({
  role: roleSchema,
  walletAddress: addressSchema,
  linkedId: z.number().int(),
});
```

- [ ] **Step 4: Write `types.ts`**

Create `web/src/core/account/domain/types.ts`:
```ts
import { z } from "zod";
import { linkedWalletSchema } from "./schemas";

export type LinkedWallet = z.infer<typeof linkedWalletSchema>;

/** Matches Unicode combining diacritical marks (U+0300–U+036F) so accents
 *  dropped by NFD normalization (e.g. "í" → "i" + mark) get stripped. */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/** Slugify a club name: strip accents, lowercase, dash-separate, trim dashes.
 *  Empty result falls back to "club". Moved verbatim out of the legacy
 *  app/api/account/wallet route. */
export function slugify(name: string): string {
  const noAccents = name.normalize("NFD").replace(COMBINING_MARKS, "");
  const dashed = noAccents.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return dashed.replace(/(^-+|-+$)/g, "") || "club";
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd web && pnpm exec tsx --test src/core/account/domain/__tests__/slugify.test.ts`
Expected: PASS (3 tests / 6 asserts). Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/account/domain
git commit -m "feat(p2): account domain — schemas + slugify pure fn"
```

---

## Task 2: repository (upsert club / profile)

**Files:**
- Create: `web/src/core/account/server/repository/upsert-club-wallet.ts`
- Create: `web/src/core/account/server/repository/upsert-profile-wallet.ts`
- Test: `web/src/core/account/server/repository/__tests__/upsert-wallet.test.ts`

**Interfaces:**
- Consumes: `slugify` from `@/core/account/domain/types`; `db` from `@/lib/db`; `clubs`, `profiles`, `user` from `@/db/schema`.
- Produces: `upsertClubWallet(userId: string, name: string, walletAddress: string): Promise<{ id: number }>`; `upsertProfileWallet(userId: string, name: string, walletAddress: string): Promise<{ id: number }>`.

- [ ] **Step 1: Write `upsert-club-wallet.ts`**

Create `web/src/core/account/server/repository/upsert-club-wallet.ts`:
```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { slugify } from "@/core/account/domain/types";

/** Upsert the caller's club row by userId, setting walletAddress. On insert,
 *  derive a unique slug from `name` (slugify + `-2/-3/…` collision loop —
 *  the slug UNIQUE constraint is the backstop). Returns the row id. */
export async function upsertClubWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(clubs).where(eq(clubs.userId, userId));
  if (existing) {
    const [updated] = await db
      .update(clubs)
      .set({ walletAddress })
      .where(eq(clubs.id, existing.id))
      .returning({ id: clubs.id });
    return updated;
  }
  const base = slugify(name);
  let slug = base;
  for (let n = 2; (await db.select().from(clubs).where(eq(clubs.slug, slug))).length > 0; n++) {
    slug = `${base}-${n}`;
  }
  const [club] = await db
    .insert(clubs)
    .values({ userId, name, slug, walletAddress })
    .returning({ id: clubs.id });
  return club;
}
```

- [ ] **Step 2: Write `upsert-profile-wallet.ts`**

Create `web/src/core/account/server/repository/upsert-profile-wallet.ts`:
```ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/db/schema";

/** Upsert the caller's profile row by userId, setting walletAddress.
 *  `displayName` seeded from `name` on insert. Returns the row id. */
export async function upsertProfileWallet(
  userId: string,
  name: string,
  walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (existing) {
    const [updated] = await db
      .update(profiles)
      .set({ walletAddress })
      .where(eq(profiles.id, existing.id))
      .returning({ id: profiles.id });
    return updated;
  }
  const [profile] = await db
    .insert(profiles)
    .values({ userId, walletAddress, displayName: name })
    .returning({ id: profiles.id });
  return profile;
}
```

- [ ] **Step 3: Write the live test (self-cleaning)**

Create `web/src/core/account/server/repository/__tests__/upsert-wallet.test.ts`.
Uses a throwaway `user` row (FK: `clubs.userId`/`profiles.userId` → `user.id`). Deletes its temp rows in an `after` hook. The club test leans on the seeded `deportivo-san-martin` to force a slug collision (`slugify("Deportivo San Martín")` == that seeded slug → expect `-2`).
```ts
import { test, after } from "node:test";
import assert from "node:assert";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user, clubs, profiles } from "@/db/schema";
import { upsertClubWallet } from "../upsert-club-wallet";
import { upsertProfileWallet } from "../upsert-profile-wallet";

const CLUB_USER = "p2-test-club-user";
const FAN_USER = "p2-test-fan-user";
const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";

async function ensureUser(id: string) {
  await db
    .insert(user)
    .values({ id, name: "P2 Test", email: `${id}@test.local`, emailVerified: false })
    .onConflictDoNothing();
}

after(async () => {
  await db.delete(clubs).where(eq(clubs.userId, CLUB_USER));
  await db.delete(profiles).where(eq(profiles.userId, FAN_USER));
  await db.delete(user).where(eq(user.id, CLUB_USER));
  await db.delete(user).where(eq(user.id, FAN_USER));
});

test("upsertClubWallet: inserts (unique slug on collision) then updates in place", async () => {
  await ensureUser(CLUB_USER);

  // Insert — name collides with the seeded "deportivo-san-martin" → slug "-2".
  const first = await upsertClubWallet(CLUB_USER, "Deportivo San Martín", ADDR_A);
  const [row1] = await db.select().from(clubs).where(eq(clubs.id, first.id));
  assert.strictEqual(row1.walletAddress, ADDR_A);
  assert.strictEqual(row1.slug, "deportivo-san-martin-2");

  // Second call for the same user → UPDATE (same id), new address, slug unchanged.
  const second = await upsertClubWallet(CLUB_USER, "Deportivo San Martín", ADDR_B);
  assert.strictEqual(second.id, first.id);
  const [row2] = await db.select().from(clubs).where(eq(clubs.id, second.id));
  assert.strictEqual(row2.walletAddress, ADDR_B);
  assert.strictEqual(row2.slug, "deportivo-san-martin-2");
});

test("upsertProfileWallet: inserts with displayName then updates address in place", async () => {
  await ensureUser(FAN_USER);

  const first = await upsertProfileWallet(FAN_USER, "Fan Uno", ADDR_A);
  const [row1] = await db.select().from(profiles).where(eq(profiles.id, first.id));
  assert.strictEqual(row1.walletAddress, ADDR_A);
  assert.strictEqual(row1.displayName, "Fan Uno");

  const second = await upsertProfileWallet(FAN_USER, "Fan Uno", ADDR_B);
  assert.strictEqual(second.id, first.id);
  const [row2] = await db.select().from(profiles).where(eq(profiles.id, second.id));
  assert.strictEqual(row2.walletAddress, ADDR_B);
});
```

- [ ] **Step 4: Restore seed, then run the test**

Run:
```bash
cd web && pnpm db:migrate-pg
cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/account/server/repository/__tests__/upsert-wallet.test.ts
```
Expected: 2 pass. (`--conditions=react-server` is REQUIRED — `import "server-only"` throws under plain tsx. `db:migrate-pg` guarantees the seeded `deportivo-san-martin` exists so the collision assertion holds.)

If it fails partway and leaves temp rows, re-run `pnpm db:migrate-pg` (does not touch the `p2-test-*` rows) then delete them: the `after` hook normally handles this; a manual `DELETE FROM clubs WHERE user_id LIKE 'p2-test-%'` etc. is the fallback.

- [ ] **Step 5: Verify types**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/core/account/server/repository
git commit -m "feat(p2): account repository — upsert club/profile wallet by userId"
```

---

## Task 3: service (deps-injected, AsyncAppResult)

**Files:**
- Create: `web/src/core/account/server/services/link-wallet-service.ts`
- Test: `web/src/core/account/server/services/__tests__/link-wallet-service.test.ts`

**Interfaces:**
- Consumes: `upsertClubWallet`, `upsertProfileWallet` (Task 2); `ok/err/AppErrors/AsyncAppResult` from `@/server/common/responses`; `LinkedWallet` from `@/core/account/domain/types`.
- Produces:
  - `linkWallet(deps: LinkWalletDeps): AsyncAppResult<LinkedWallet>` (pure orchestration, injectable).
  - `linkWalletService(user: { id: string; role: "club" | "fan"; name: string }, body: { walletAddress: string }): AsyncAppResult<LinkedWallet>` (real-deps wrapper the route calls).

- [ ] **Step 1: Write the failing test**

Create `web/src/core/account/server/services/__tests__/link-wallet-service.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert";
import { linkWallet } from "../link-wallet-service";

const ADDR = "0x1111111111111111111111111111111111111111";

test("linkWallet: club role calls upsertClub and returns a club DTO", async () => {
  let clubCalls = 0;
  let profileCalls = 0;
  const res = await linkWallet({
    user: { id: "u1", role: "club", name: "Boca" },
    walletAddress: ADDR,
    upsertClub: async () => { clubCalls++; return { id: 7 }; },
    upsertProfile: async () => { profileCalls++; return { id: 99 }; },
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { role: "club", walletAddress: ADDR, linkedId: 7 });
  assert.strictEqual(clubCalls, 1);
  assert.strictEqual(profileCalls, 0);
});

test("linkWallet: fan role calls upsertProfile and returns a fan DTO", async () => {
  const res = await linkWallet({
    user: { id: "u2", role: "fan", name: "Fan" },
    walletAddress: ADDR,
    upsertClub: async () => { throw new Error("should not be called"); },
    upsertProfile: async () => ({ id: 42 }),
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.ok && res.data, { role: "fan", walletAddress: ADDR, linkedId: 42 });
});

test("linkWallet: a throwing upsert yields err(unexpected) → 500", async () => {
  const res = await linkWallet({
    user: { id: "u3", role: "club", name: "X" },
    walletAddress: ADDR,
    upsertClub: async () => { throw new Error("db down"); },
    upsertProfile: async () => ({ id: 1 }),
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(!res.ok && res.error.status, 500);
});
```

> **Result shape (confirmed):** `Ok<T> = { ok: true; data: T }`, `Err<E> = { ok: false; error: E }` (see `web/src/server/common/responses/result.ts`). Success value is `res.data`; error is `res.error` (`.status` is the numeric status). The asserts above already use these.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/account/server/services/__tests__/link-wallet-service.test.ts`
Expected: FAIL — `Cannot find module '../link-wallet-service'`.

- [ ] **Step 3: Write the service**

Create `web/src/core/account/server/services/link-wallet-service.ts`:
```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { upsertClubWallet } from "../repository/upsert-club-wallet";
import { upsertProfileWallet } from "../repository/upsert-profile-wallet";
import type { LinkedWallet } from "@/core/account/domain/types";

type SessionUser = { id: string; role: "club" | "fan"; name: string };

/** Deps injected so the branch logic is testable without a DB. */
type LinkWalletDeps = {
  user: SessionUser;
  walletAddress: string;
  upsertClub: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
  upsertProfile: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
};

/** Upsert the caller's club/profile row by role, normalized to a LinkedWallet DTO. */
export async function linkWallet(deps: LinkWalletDeps): AsyncAppResult<LinkedWallet> {
  try {
    const { user, walletAddress } = deps;
    const { id } =
      user.role === "club"
        ? await deps.upsertClub(user.id, user.name, walletAddress)
        : await deps.upsertProfile(user.id, user.name, walletAddress);
    return ok({ role: user.role, walletAddress, linkedId: id });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

/** Real-deps wrapper the route calls. */
export function linkWalletService(
  user: SessionUser,
  body: { walletAddress: string },
): AsyncAppResult<LinkedWallet> {
  return linkWallet({
    user,
    walletAddress: body.walletAddress,
    upsertClub: upsertClubWallet,
    upsertProfile: upsertProfileWallet,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && DATABASE_URL=postgres://postgres:postgres@localhost:5432/ladoce pnpm exec tsx --conditions=react-server --test src/core/account/server/services/__tests__/link-wallet-service.test.ts`
Expected: 3 pass. (`DATABASE_URL` + `--conditions=react-server` required — the import chain eval-loads `@/lib/db` even though the test injects fakes.)
Then `cd web && pnpm exec tsc --noEmit` → EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/core/account/server/services
git commit -m "feat(p2): account service — linkWallet (deps-injected, role branch)"
```

---

## Task 4: route + router + wire

**Files:**
- Create: `web/src/core/account/server/api/routes/link-wallet.route.ts`
- Create: `web/src/core/account/server/api/router.ts`
- Modify: `web/src/server/router.ts` (add `.use(accountRouter)`)

**Interfaces:**
- Consumes: `authed` from `@/server/auth/middleware/authed`; `linkWalletService` (Task 3); `linkWalletBodySchema`, `linkedWalletSchema` (Task 1); `CommonResponse`, `errorResponseSchema`, `errorToResponse`, `successResponseSchema` from `@/server/common/responses`.
- Produces: `linkWalletRoute` (Elysia sub-app), `accountRouter` (Elysia, prefix `/account`). Final URL `POST /api/v1/account/wallet`.

- [ ] **Step 1: Write the route**

Create `web/src/core/account/server/api/routes/link-wallet.route.ts`:
```ts
import { Elysia } from "elysia";
import { authed } from "@/server/auth/middleware/authed";
import {
  CommonResponse,
  errorResponseSchema,
  errorToResponse,
  successResponseSchema,
} from "@/server/common/responses";
import { linkWalletBodySchema, linkedWalletSchema } from "@/core/account/domain/schemas";
import { linkWalletService } from "../../services/link-wallet-service";

export const linkWalletRoute = new Elysia().use(authed).post(
  "/wallet",
  async ({ body, user, status }) => {
    const result = await linkWalletService(
      { id: user.id, role: user.role as "club" | "fan", name: user.name },
      body,
    );
    // TEMPLATE NOTE: link only ever errs with 500 (unexpected DB failure), so
    // `as 500` + a {200,500} response map suffices. A domain whose service can
    // return notFound(404)/forbidden(403)/conflict(409) must WIDEN both the cast
    // and the `response:` map (see wallet get-positions.route.ts).
    if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error));
    return status(200, CommonResponse.successful({ response: result.data }));
  },
  {
    authed: true,
    body: linkWalletBodySchema,
    response: {
      200: successResponseSchema(linkedWalletSchema, "LinkedWallet"),
      401: errorResponseSchema(401),
      500: errorResponseSchema(500),
    },
    detail: {
      tags: ["Account"],
      summary: "Link the caller's WDK wallet address to their account",
      description:
        "Upserts the authenticated user's clubs (role=club) or profiles (role=fan) row with the given wallet address. Identity comes from the session, never the body.",
    },
  },
);
```

> **Note:** `user.role` is typed by Better Auth's session; the `as "club" | "fan"` narrows it to the app's enum. If `tsc` reports `result.data` possibly-undefined on the success line, that means the `Result` success field differs — reconcile with `result.ok` narrowing exactly as `get-positions.route.ts` does (it reads `result.data`). Match that file.

- [ ] **Step 2: Write the router**

Create `web/src/core/account/server/api/router.ts`:
```ts
import { Elysia } from "elysia";
import { linkWalletRoute } from "./routes/link-wallet.route";

export const accountRouter = new Elysia({ prefix: "/account" }).use(linkWalletRoute);
```

- [ ] **Step 3: Wire into the root router**

Modify `web/src/server/router.ts`. Add the import next to the wallet import:
```ts
import { accountRouter } from "@/core/account/server/api/router";
```
And chain `.use(accountRouter)` immediately after `.use(walletRouter)`:
```ts
  .use(walletRouter)
  .use(accountRouter);
```

- [ ] **Step 4: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: build succeeds (Elysia routes compile into the `[...slugs]` catch-all).

- [ ] **Step 5: Live verify the auth gate + validation**

Start dev (`cd web && pnpm dev`) in a background shell, then:
```bash
# good body, NO session cookie → 401 UNAUTHORIZED (authed macro short-circuits)
curl -s -X POST http://localhost:3000/api/v1/account/wallet \
  -H 'Content-Type: application/json' \
  -d '{"walletAddress":"0x1111111111111111111111111111111111111111"}'

# malformed address → 422 with targets:["walletAddress"]
curl -s -X POST http://localhost:3000/api/v1/account/wallet \
  -H 'Content-Type: application/json' -d '{"walletAddress":"nope"}'
```
Expected:
- First: `{"code":"UNAUTHORIZED","status":401}`.
- Second: `422` envelope with `"targets":["walletAddress"]` (zod path is an array — the P1 onError fix). **If** the second returns `401` instead, this Elysia version runs `resolve` before body validation — that is acceptable; the authed gate works and the 422 path is already proven by P1's onError. Note which you observed.

The authenticated 200 path is verified in-browser in Task 6 (needs a real session).

- [ ] **Step 6: Commit**

```bash
git add web/src/core/account/server/api web/src/server/router.ts
git commit -m "feat(p2): account route + router — POST /account/wallet behind authed"
```

---

## Task 5: client hooks (useAccount + useEnsureWallet)

**Files:**
- Create: `web/src/core/account/client/hooks.ts`
- Create: `web/src/core/account/client/use-ensure-wallet.ts`

**Interfaces:**
- Consumes: `useElysia` from `@/frontend/lib/eden`; `useMutation`, `useQueryClient` from `@tanstack/react-query`; `createWallet`, `getWallet` from `@/lib/wdk`; `walletMode` from `@/lib/walletMode`; `toast` from `sonner`.
- Produces: `useAccount(): { useLinkWallet }`; `useEnsureWallet(): (userId: string) => Promise<string>`.

- [ ] **Step 1: Write `hooks.ts` (copy myworkin's useMutation+invalidate)**

Create `web/src/core/account/client/hooks.ts`:
```ts
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Account-domain client hooks. `useLinkWallet` posts the caller's wallet
 *  address; on success it invalidates the wallet read caches so positions/
 *  history refetch once the address is known — mirrors myworkin's
 *  mutation-then-invalidateQueries pattern (cv-builder useCreate). */
export const useAccount = () => {
  const elysia = useElysia();
  const queryClient = useQueryClient();

  const useLinkWallet = () =>
    useMutation(
      elysia.account.wallet.post.mutationOptions({
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: elysia.wallet.positions.get.queryKey() });
          queryClient.invalidateQueries({ queryKey: elysia.wallet.history.get.queryKey() });
        },
      }),
    );

  return { useLinkWallet };
};
```

- [ ] **Step 2: Write `use-ensure-wallet.ts`**

Create `web/src/core/account/client/use-ensure-wallet.ts`. Ports the whole doc-comment + `fundGasBestEffort` verbatim from the legacy `lib/ensureWallet.ts`; only the link step changes (fetch → `linkWallet.mutateAsync`):
```ts
"use client";
import { toast } from "sonner";
import { createWallet, getWallet } from "@/lib/wdk";
import { walletMode } from "@/lib/walletMode";
import { useAccount } from "./hooks";

/**
 * Returns an imperative `ensureWallet(userId)` callback (a bare fn can't call
 * hooks, so this is a hook that closes over the link mutation). Creates (or
 * loads) this user's local WDK wallet and links its address to the server.
 * Idempotent — the server upserts, and createWallet() no-ops if a wallet
 * already exists on this device for this userId.
 *
 * A freshly minted wallet (isNew) has 0 ETH, so in `standard` mode its first
 * invest/approve would fail with "insufficient funds for gas" — best-effort
 * fund it via the gas sponsor (/api/faucet). Deliberately best-effort: on a
 * real testnet without SPONSOR_PK (or a dry relayer) it fails silently past a
 * soft toast, since the "Get gas ETH" button in /wallet is the fallback either
 * way. Skipped in `erc4337` mode (that wallet pays gas in USD₮ via the
 * paymaster and never needs ETH). The faucet call is the ops domain (P6) —
 * kept as a legacy fetch here on purpose.
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
      await fundGasBestEffort(wallet.address);
    }
    return wallet.address;
  };
}

async function fundGasBestEffort(address: string): Promise<void> {
  try {
    const res = await fetch("/api/faucet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.warning(
        data.error ?? "No se pudo cubrir el gas automáticamente — usá 'Conseguir ETH de gas' en tu billetera.",
      );
    }
  } catch {
    toast.warning(
      "No se pudo cubrir el gas automáticamente — usá 'Conseguir ETH de gas' en tu billetera.",
    );
  }
}
```

> **Eden call-shape check:** confirm the mutation input is the body directly. For an Eden POST, `client.account.wallet.post(bodyObject)` takes the body as the first positional arg, so `mutateAsync({ walletAddress })` is correct (the mutationFn forwards its input straight to `.post`). If `tsc` complains about the input type, open a reference mutation caller (e.g. `myworkin` cv-builder `useCreate` consumer) and match how the body is passed.

- [ ] **Step 3: Typecheck**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0. (No test — these are React hooks; correctness is proven by the tsc gate + the Task 6 in-browser flow. `elysia.account.wallet.post.mutationOptions` and `elysia.wallet.*.get.queryKey` must resolve against the `AppRouter` type — a red squiggle here means the router wiring from Task 4 is missing.)

- [ ] **Step 4: Commit**

```bash
git add web/src/core/account/client
git commit -m "feat(p2): account client hooks — useLinkWallet (mutation+invalidate) + useEnsureWallet"
```

---

## Task 6: cutover EnsureWallet + delete legacy

**Files:**
- Modify: `web/src/components/EnsureWallet.tsx`
- Delete: `web/src/app/api/account/wallet/route.ts`
- Delete: `web/src/lib/ensureWallet.ts`

**Interfaces:**
- Consumes: `useEnsureWallet` from `@/core/account/client/use-ensure-wallet` (Task 5).

- [ ] **Step 1: Swap EnsureWallet to the hook**

Modify `web/src/components/EnsureWallet.tsx`. Replace the import:
```ts
// remove:
import { ensureWalletLinked } from "@/lib/ensureWallet";
// add:
import { useEnsureWallet } from "@/core/account/client/use-ensure-wallet";
```
Inside the component, get the callback from the hook (top level, with the other hooks) and call it in the effect:
```ts
export function EnsureWallet({ userId, hasWalletLinked }: Props) {
  const router = useRouter();
  const ensureWallet = useEnsureWallet();
  const [healing, setHealing] = useState(!hasWalletLinked);
  const ran = useRef(false);

  useEffect(() => {
    if (hasWalletLinked || ran.current) return;
    ran.current = true;

    ensureWallet(userId)
      .then(() => router.refresh())
      .catch((err) => toast.error(friendlyError(err)))
      .finally(() => setHealing(false));
    // ensureWallet closes over a stable mutation; the run-once ref guards re-entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWalletLinked, router, userId]);

  // …unchanged healing skeleton + return null…
}
```
`router.refresh()` stays — the `/wallet` + `/dashboard` RSCs read `hasWalletLinked` server-side to gate `<EnsureWallet>` vs `<WalletOverview>`; only `router.refresh()` re-runs that. The mutation's `onSuccess` invalidation refreshes the TanStack read caches. Both are needed.

- [ ] **Step 2: Delete the legacy route + fn**

```bash
cd web && rm src/app/api/account/wallet/route.ts src/lib/ensureWallet.ts
# prune the now-empty dir if git leaves it
rmdir src/app/api/account/wallet src/app/api/account 2>/dev/null || true
```

- [ ] **Step 3: Grep for stragglers**

Run: `cd web && grep -rn "ensureWalletLinked\|api/account/wallet\|lib/ensureWallet" src --include="*.ts" --include="*.tsx"`
Expected: only historical mentions in comments (e.g. `src/middleware.ts` route-list comment). NO live imports or `fetch("/api/account/wallet")`. If a live caller remains, repoint it to `useEnsureWallet` (client component) or fix the comment.

- [ ] **Step 4: Typecheck + build**

Run: `cd web && pnpm exec tsc --noEmit`
Expected: EXIT 0.
Run: `cd web && pnpm build`
Expected: succeeds. The `[...slugs]` catch-all now owns `/api/v1/account/wallet`; the legacy `/api/account/wallet` is gone.

- [ ] **Step 5: In-browser 200-path verify**

With `pnpm dev` running:
1. Sign up a **fan** → land `/wallet` → the "Setting up your wallet…" self-heal runs → refresh shows the address; confirm a `profiles` row exists: `psql "$DATABASE_URL" -c "select user_id, wallet_address, display_name from profiles order by id desc limit 1;"`.
2. Sign up a **club** → land `/dashboard` → confirm a `clubs` row with a derived slug: `psql "$DATABASE_URL" -c "select user_id, slug, wallet_address from clubs order by id desc limit 1;"`.
3. In DevTools Network, the link call hits `POST /api/v1/account/wallet` and returns `200 {code:"OK",status:200,response:{role,walletAddress,linkedId}}`.

Clean up the two throwaway accounts afterward if desired (delete their `user`/`clubs`/`profiles` rows) so they don't linger in the seed.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/EnsureWallet.tsx
git add -A web/src/app/api web/src/lib
git commit -m "feat(p2): cut EnsureWallet to useEnsureWallet; delete legacy /api/account/wallet + lib/ensureWallet"
```

---

## Self-Review

**Spec coverage:**
- §4 auth macro (`authed`) → Task 4 route (`.use(authed)`, `authed: true`). ✓
- §5 minimal DTO → Task 1 `linkedWalletSchema` + Task 3 service returns `{role,walletAddress,linkedId}`. ✓
- §6 upsert repo + slug collision → Task 2. ✓
- §7 deps-injected service, role branch → Task 3. ✓
- §8 route 200 upsert + `as 500` template note → Task 4. ✓
- §9 client useMutation+invalidate + `useEnsureWallet` + EnsureWallet cutover → Tasks 5–6. ✓
- §3 delete legacy route + `lib/ensureWallet.ts` → Task 6. ✓
- §10 error/status (401/422/500) → Task 4 verify + response map. ✓
- §11 tests (slugify / repo / service) → Tasks 1–3. ✓
- Scope fence: faucet stays legacy fetch → Task 5 `fundGasBestEffort` unchanged, commented. ✓

**Placeholder scan:** no TBD/TODO except the carried-over `TODO(wire)` doc-comment (intentional, mirrors legacy). All code steps show full code. ✓

**Type consistency:** `upsertClubWallet`/`upsertProfileWallet` signatures identical across Tasks 2→3. `linkWallet`/`linkWalletService` signatures identical across Tasks 3→4. `LinkedWallet` shape (`role`/`walletAddress`/`linkedId`) consistent across schema (T1), service (T3), test (T3). `useEnsureWallet` return type (`(userId)=>Promise<string>`) consistent T5→T6. Two flagged reconciliation points (Result success field `value`/`data`; Eden mutation input shape) call out reading the source rather than guessing — deliberate, given the P1 Task-4 reference-shape bug. ✓
