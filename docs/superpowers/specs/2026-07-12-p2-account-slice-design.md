# P2 — account slice (wallet-link mutation) design

**Date:** 2026-07-12
**Phase:** P2 (first mutation domain) of the Elysia migration roadmap.
**Umbrella spec:** `docs/superpowers/specs/2026-07-11-la-doce-elysia-architecture-migration-design.md` §P2..N.
**Template:** P1 wallet slice (`core/wallet/**`) + reference `create-cv` route/hook
(`myworkin-b2c/src/core/cv-builder`).

---

## 1. Goal

Migrate the legacy `POST /api/account/wallet` (link a WDK wallet address → the
authenticated user's `clubs` or `profiles` row) into the Elysia domain tri-layer,
behind the `authed` macro, consumed on the client via an Eden `useMutation` hook.
This is the **first mutation** and **first `authed` consumer** in the new stack —
it establishes the write-side template that P3 (clubs) and P4 (rounds) copy.

**Not in scope (explicit):**
- The best-effort gas-faucet call (`/api/faucet`) inside `ensureWalletLinked` — that
  is the **ops domain (P6)**. Keep it as the existing legacy `fetch`; do not migrate.
- Reads (positions/history) — already shipped in P1.

---

## 2. Decisions (locked with the user)

| Decision | Choice | Why |
|---|---|---|
| Client cutover style | **Eden `useMutation` + `invalidateQueries` refresh** (copy myworkin) | User: "check how myworkin uses useMutation eden with refresh copy it". Faithful to reference. |
| Response DTO | **Minimal normalized** `{ role, walletAddress, linkedId }` | Client ignores the body (only `res.ok`); a club/profile union on the wire is noise. |
| Success status | **200 upsert** (single) | Idempotent upsert; no consumer distinguishes create vs update. Simpler route. |
| Auth macro | **`authed`** (NOT `clubAuthed`) | `clubAuthed` 409s when no club row exists — but this route *creates* it. Branch on `user.role` inside the service, mirroring legacy. |
| Identity source | **session `user`** (`id`, `role`, `name`) — never body | A client must not claim another user's club/fan identity. Body carries only `walletAddress`. |

---

## 3. Legacy behavior being reproduced

`web/src/app/api/account/wallet/route.ts` (to be deleted at end of phase):

- `getSession` → 401 if none.
- Parse body `{ walletAddress }` (0x-40-hex).
- Identity `{ id, role, name }` from session.
- **role === "club":** upsert `clubs` by `userId`. On insert, derive a unique
  `slug` from `name` (`slugify` + `-2/-3/…` collision loop). `walletAddress` set.
- **role === "fan":** upsert `profiles` by `userId`; `displayName = name` on insert.
- Returned the full row (201 insert / 200 update). **We collapse to a normalized DTO + 200.**

Client caller `web/src/lib/ensureWallet.ts::ensureWalletLinked(userId)` — a bare
imperative async fn (createWallet → getWallet → POST link → best-effort faucet).
Only runtime caller of it is `web/src/components/EnsureWallet.tsx` (an effect that
calls it then `router.refresh()`). The `(app)/wallet`, `(app)/dashboard`,
`auth/sign-up`, `post-auth` pages + `providers.tsx` merely render `<EnsureWallet>`
or are server components — they do **not** call the fn. Blast radius is contained
to `EnsureWallet.tsx` + `ensureWallet.ts`.

---

## 4. File structure

```
web/src/core/account/
  domain/
    schemas.ts        linkWalletBodySchema, linkedWalletSchema, roleSchema
    types.ts          LinkedWallet type; slugify(name) pure fn + COMBINING_MARKS
  server/
    repository/
      upsert-club-wallet.ts      import "server-only"; upsertClubWallet(userId,name,addr) → {id}
      upsert-profile-wallet.ts   import "server-only"; upsertProfileWallet(userId,name,addr) → {id}
    services/
      link-wallet-service.ts     linkWalletService(user, body) → AsyncAppResult<LinkedWallet>
    api/
      routes/link-wallet.route.ts  new Elysia().use(authed).post("/wallet", …, {authed:true,…})
      router.ts                    accountRouter = new Elysia({prefix:"/account"}).use(linkWalletRoute)
  client/
    hooks.ts               useAccount().useLinkWallet()  — useMutation + invalidate wallet keys
    use-ensure-wallet.ts   useEnsureWallet() — composes wdk + linkWallet.mutateAsync + faucet
```

Wire: `web/src/server/router.ts` → `.use(accountRouter)` after `.use(walletRouter)`.
Delete: `web/src/app/api/account/wallet/route.ts`, `web/src/lib/ensureWallet.ts`.
Modify: `web/src/components/EnsureWallet.tsx`.

---

## 5. Domain

### `domain/schemas.ts`
```ts
import { z } from "zod";

/** 0x-prefixed 20-byte EVM address. Same shape as wallet domain's. */
export const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address");

export const roleSchema = z.enum(["club", "fan"]);

/** Body of POST /account/wallet — walletAddress ONLY; identity comes from session. */
export const linkWalletBodySchema = z.object({ walletAddress: addressSchema });

/** Wire DTO — normalized across the club/profile branches. `linkedId` is the
 *  serial pk of the upserted clubs/profiles row. */
export const linkedWalletSchema = z.object({
  role: roleSchema,
  walletAddress: addressSchema,
  linkedId: z.number().int(),
});
```

### `domain/types.ts`
```ts
import { z } from "zod";
import { linkedWalletSchema } from "./schemas";

export type LinkedWallet = z.infer<typeof linkedWalletSchema>;

/** Matches Unicode combining diacritical marks (U+0300–U+036F) so accents
 *  dropped by NFD normalization (e.g. "í" → "i" + mark) get stripped. */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/** Slugify a club name: strip accents, lowercase, dash-separate, trim dashes.
 *  Empty result falls back to "club". Moved verbatim out of the legacy route. */
export function slugify(name: string): string {
  const noAccents = name.normalize("NFD").replace(COMBINING_MARKS, "");
  const dashed = noAccents.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return dashed.replace(/(^-+|-+$)/g, "") || "club";
}
```

---

## 6. Repository (`import "server-only"`)

`upsert-club-wallet.ts` — upsert by `userId`; on insert compute a unique slug via
`slugify` + a `-2/-3/…` collision loop (mirrors legacy). Returns `{ id }`.
`upsert-profile-wallet.ts` — upsert `profiles` by `userId`; `displayName = name`
on insert. Returns `{ id }`.

Both take the drizzle `db` and use `eq(clubs.userId, userId)` / `eq(profiles.userId, userId)`.
The slug collision loop keeps the legacy TOCTOU-tolerant `for` loop (hackathon-fine;
the `slug` unique constraint is the backstop).

```ts
// upsert-club-wallet.ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { slugify } from "@/core/account/domain/types";

export async function upsertClubWallet(
  userId: string, name: string, walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(clubs).where(eq(clubs.userId, userId));
  if (existing) {
    const [u] = await db.update(clubs).set({ walletAddress })
      .where(eq(clubs.id, existing.id)).returning({ id: clubs.id });
    return u;
  }
  const base = slugify(name);
  let slug = base;
  for (let n = 2; (await db.select().from(clubs).where(eq(clubs.slug, slug))).length > 0; n++) {
    slug = `${base}-${n}`;
  }
  const [c] = await db.insert(clubs).values({ userId, name, slug, walletAddress })
    .returning({ id: clubs.id });
  return c;
}
```
```ts
// upsert-profile-wallet.ts
import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { profiles } from "@/db/schema";

export async function upsertProfileWallet(
  userId: string, name: string, walletAddress: string,
): Promise<{ id: number }> {
  const [existing] = await db.select().from(profiles).where(eq(profiles.userId, userId));
  if (existing) {
    const [u] = await db.update(profiles).set({ walletAddress })
      .where(eq(profiles.id, existing.id)).returning({ id: profiles.id });
    return u;
  }
  const [p] = await db.insert(profiles).values({ userId, walletAddress, displayName: name })
    .returning({ id: profiles.id });
  return p;
}
```

---

## 7. Service (deps-injected, `AsyncAppResult`)

Mirrors the wallet-service shape: a pure `linkWallet(deps)` for testing + a
real-deps `linkWalletService(user, body)` wrapper the route calls.

```ts
import "server-only";
import { type AsyncAppResult, ok, err, AppErrors } from "@/server/common/responses";
import { upsertClubWallet } from "../repository/upsert-club-wallet";
import { upsertProfileWallet } from "../repository/upsert-profile-wallet";
import type { LinkedWallet } from "@/core/account/domain/types";

type SessionUser = { id: string; role: "club" | "fan"; name: string };

type LinkWalletDeps = {
  user: SessionUser;
  walletAddress: string;
  upsertClub: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
  upsertProfile: (userId: string, name: string, addr: string) => Promise<{ id: number }>;
};

export async function linkWallet(deps: LinkWalletDeps): AsyncAppResult<LinkedWallet> {
  try {
    const { user, walletAddress } = deps;
    const { id } = user.role === "club"
      ? await deps.upsertClub(user.id, user.name, walletAddress)
      : await deps.upsertProfile(user.id, user.name, walletAddress);
    return ok({ role: user.role, walletAddress, linkedId: id });
  } catch (e) {
    return err(AppErrors.unexpected(e));
  }
}

export function linkWalletService(
  user: SessionUser, body: { walletAddress: string },
): AsyncAppResult<LinkedWallet> {
  return linkWallet({
    user,
    walletAddress: body.walletAddress,
    upsertClub: upsertClubWallet,
    upsertProfile: upsertProfileWallet,
  });
}
```

`user.role` is `"club" | "fan"` — Better Auth's `role` additionalField enum. `user.name`
is Better Auth's required name. Both present on `authed`'s injected `user`.

---

## 8. Route + router

```ts
// routes/link-wallet.route.ts
import { Elysia } from "elysia";
import { authed } from "@/server/auth/middleware/authed";
import {
  CommonResponse, errorResponseSchema, errorToResponse, successResponseSchema,
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
    // return notFound/forbidden/conflict must WIDEN both the cast and the map
    // (see wallet get-positions.route.ts).
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
    detail: { tags: ["Account"], summary: "Link the caller's WDK wallet address to their account" },
  },
);
```
`401` in the response map documents the `authed` macro's short-circuit (it returns
`CommonResponse.unauthorized()` before the handler runs).

```ts
// api/router.ts
import { Elysia } from "elysia";
import { linkWalletRoute } from "./routes/link-wallet.route";

export const accountRouter = new Elysia({ prefix: "/account" }).use(linkWalletRoute);
```

Final URL: `POST /api/v1/account/wallet`.

---

## 9. Client — Eden `useMutation` + refresh (copy myworkin)

### `client/hooks.ts`
```ts
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useElysia } from "@/frontend/lib/eden";

/** Account-domain client hooks. useLinkWallet posts the caller's wallet address;
 *  on success it invalidates the wallet read caches so positions/history refetch
 *  once the address is known (mirrors myworkin's mutation+invalidate pattern). */
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

### `client/use-ensure-wallet.ts`
Replaces the bare `ensureWalletLinked` fn (a fn can't call hooks). Returns an
imperative `ensureWallet(userId)` callback that composes WDK + the mutation.

```ts
"use client";
import { toast } from "sonner";
import { createWallet, getWallet } from "@/lib/wdk";
import { walletMode } from "@/lib/walletMode";
import { useAccount } from "./hooks";

export function useEnsureWallet() {
  const { useLinkWallet } = useAccount();
  const linkWallet = useLinkWallet();

  return async function ensureWallet(userId: string): Promise<string> {
    const { isNew } = await createWallet(userId);
    const wallet = await getWallet(userId);

    // eden-tanstack's mutationFn THROWS result.error on an API error (verified in
    // dist: `if (result.error) throw result.error`), so mutateAsync rejects on
    // failure and resolves to the success envelope otherwise — no `.error` to check.
    // Rethrow a friendly Spanish message so EnsureWallet's friendlyError has one
    // (matches the legacy fetch UX).
    try {
      await linkWallet.mutateAsync({ walletAddress: wallet.address });
    } catch {
      throw new Error("No se pudo vincular la billetera");
    }

    if (isNew && walletMode() === "standard") {
      await fundGasBestEffort(wallet.address); // ops(P6) — legacy /api/faucet, unchanged
    }
    return wallet.address;
  };
}
```
`fundGasBestEffort` moves here verbatim from `lib/ensureWallet.ts` (still `fetch("/api/faucet")` —
ops migration is P6). All the doc-comments on `ensureWalletLinked` (self-custody,
erc4337 vs standard, same-device recovery TODO) carry over.

### `EnsureWallet.tsx`
```ts
// swap the import + call site; everything else (healing skeleton, router.refresh) unchanged
import { useEnsureWallet } from "@/core/account/client/use-ensure-wallet";
// …
const ensureWallet = useEnsureWallet();
useEffect(() => {
  if (hasWalletLinked || ran.current) return;
  ran.current = true;
  ensureWallet(userId)
    .then(() => router.refresh())
    .catch((err) => toast.error(friendlyError(err)))
    .finally(() => setHealing(false));
  // ensureWallet identity is stable enough for this run-once effect; keep deps as-is
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [hasWalletLinked, router, userId]);
```
`router.refresh()` **stays** — the `/wallet` + `/dashboard` RSCs read `hasWalletLinked`
server-side to gate `<EnsureWallet>` vs `<WalletOverview>`; that is server state and
only `router.refresh()` re-runs it. The `onSuccess` invalidation refreshes the
TanStack read caches. Both are needed.

---

## 10. Error / status semantics

- Happy path: `200 { response: {role,walletAddress,linkedId}, code:"OK", status:200 }`.
- Unauthenticated: `authed` macro → `401 { code:"UNAUTHORIZED", status:401 }`.
- Bad body (`walletAddress` not 0x-40-hex): Elysia `VALIDATION` → root `onError` →
  `422` + `targets:["walletAddress"]` (zod path is an array — the P1 onError fix).
- DB failure: service `err(unexpected)` → `500 { code:"INTERNAL_SERVER_ERROR", status:500 }`.

---

## 11. Testing

- **`slugify` pure fn** (`domain/types.ts`): "Club Atlético" → "club-atletico"; "  " → "club";
  "FC 123!!" → "fc-123". No DB.
- **repository** (`--conditions=react-server` + `DATABASE_URL`, per P1 constraint):
  `upsertClubWallet` inserts then updates same userId (one row, address changes);
  slug collision produces `-2`. `upsertProfileWallet` insert/update.
- **service** (`linkWallet(deps)` with stub upserts, no DB): club branch calls
  `upsertClub` and returns `{role:"club",…,linkedId}`; fan branch calls `upsertProfile`;
  a throwing upsert → `err(unexpected)` / status 500.
- **Manual**: sign up fan → land `/wallet` → self-heal links → `profiles` row + address
  shows; sign up club → `/dashboard` → `clubs` row with derived slug; POST bad address →
  422 `targets:["walletAddress"]`; POST without session → 401.

---

## 12. Global constraints (inherited)

- `pnpm exec tsc --noEmit` (in `web/`) EXIT 0 is authoritative — the `drizzle-orm`
  duplicate-instance LSP TS2345 is a known stale-transitive false positive (PF removes it).
- Server-only-importing tests run with `node --conditions=react-server` + a live
  `DATABASE_URL` (P1). Real data restored via `pnpm db:migrate-pg` if a test pollutes pg.
- Money on the wire = strings (n/a here — this domain carries no amounts).
- Self-custody: the seed never leaves the browser; only the public address is linked.
- Never move chain signing server-side.
