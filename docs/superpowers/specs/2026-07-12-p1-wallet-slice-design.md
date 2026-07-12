# La Doce — P1: wallet slice (canonical domain vertical)

**Date:** 2026-07-12
**Status:** Approved design.
**Phase:** P1 of the Elysia/Eden migration (umbrella spec: `docs/superpowers/specs/2026-07-11-la-doce-elysia-architecture-migration-design.md` §5). Builds on P0a (Postgres) + P0b (Elysia/Eden rails), both merged to `main`.

---

## 1. Goal

Migrate the **wallet** read domain (fan positions + USD₮ transfer history) end-to-end onto the Elysia/Eden rails, as the **canonical `core/<domain>` template** every later domain (account, clubs, rounds, directory, ops, pricing) copies. When done, the wallet page fetches through the typed Eden client, the two legacy Next route handlers are deleted, and there are no hand-duplicated DTOs.

## 2. Decisions (from brainstorming)

- **Public reads by `?address`** — no auth macro. Wallet position/history data is already public on-chain; the fan's address is client-derived from WDK (self-custody). `?address` is validated with **zod** (replaces the `ADDRESS_RE` regex). Session-scoping is deferred to when the account-link exists (P2).
- **Graceful-empty UX preserved** — reads are tolerant; services return `ok(data | [])`. Empty is a valid result, not a 4xx. `getFanPositions`/`getHistory` already degrade internally (`readSafely` per chain read; indexer→RPC fallback). `err(AppErrors.unexpected)`→500 only on a catastrophic throw.
- **Client swap included** — `WalletOverview.tsx` moves off hand-rolled `fetch`/`useState` onto the Eden hooks in this phase.
- **Fold in the P0b-deferred `onError` items** — P1 is the first real route consumer, so restore the VALIDATION `targets` + add the `NOT_FOUND`→404 passthrough in `server/router.ts` (per the P0b final review). `authenticate()` logging stays deferred (wallet reads don't use it).

## 3. Global constraints (carried)

- **Money truth on-chain.** Postgres = which rounds are `verified` (allowlist) + display metadata only; balances/rewards/raised come from the contract.
- **bigints as strings on the wire** (JSON has no bigint). Schema fields are `z.string()`; parsed to `bigint` at the client read edge.
- **WDK / self-custody stays client-side, untouched.** The API is reads only; no key, no signing.
- **Domain tri-layer** (`docs/code-review/architecture-structure.md`): `domain/` pure logic + zod schemas/types + `__tests__`; `server/{api/routes,services,repository}`; `client/` hooks. Dependencies point inward. **A domain isn't wired until its router is `.use()`d in `server/router.ts`.**
- zod v4; no `any`/`as any`/`as unknown as`; files <500 lines; `getLogger` not `console.*` in server code; repositories `import "server-only"` + shared `db`.
- Authoritative gate: `cd web && pnpm exec tsc --noEmit` (EXIT 0). Ignore the known LSP `drizzle-orm` dup-instance false positive.

## 4. Current state (what's being replaced)

- `src/app/api/wallet/positions/route.ts` — GET `?address`, `ADDRESS_RE` regex, `getFanPositions` + `toPositionDTO`, `catch → {positions: []}`.
- `src/app/api/wallet/history/route.ts` — GET `?address`, regex, `getHistory` + inline `toDTO` (stringify `amount`/`blockNumber`), `catch → {entries: []}`.
- `src/lib/positions.ts` — `getFanPositions(fan)` (drizzle verified rounds + per-round chain reads → `FanPosition`), pure `investedFromShares`/`percentOfRound`, `toPositionDTO`, `FanPosition`/`FanPositionDTO` types. Has `positions.test.ts`.
- `src/lib/indexer.ts` — server-only `getHistory(address)` (hosted WDK Indexer with `WDK_INDEXER_API_KEY`, RPC-logs fallback), `HistoryEntry` type, `mapIndexerTransfers`. Has `indexer.test.ts`.
- `src/components/wallet/WalletOverview.tsx` — client component: `createWallet`+`getWallet` (WDK), then `Promise.all([w.getUsdtBalance(), fetch("/api/wallet/positions?address="), fetch("/api/wallet/history?address=")])`, hand-rolled loading/error/`refresh`.
- `src/components/wallet/types.ts` — hand-duplicated DTO types + `parsePositionDTO`/`parseHistoryDTO` (`BigInt(...)` re-parse).

### Data shapes (preserve exactly)

```ts
// FanPosition (domain)
{ roundId: number; contractAddress: `0x${string}`; clubName: string; clubSlug: string;
  shares: bigint; totalShares: bigint; investedUsdt: bigint; claimable: bigint;
  raised: bigint; goal: bigint; status: "funding"|"active"|"closed" }

// HistoryEntry (domain)
{ hash: `0x${string}`; kind: "in"|"out"; token: `0x${string}`; amount: bigint;
  counterparty: `0x${string}`; blockNumber: bigint; timestamp: number }
```

## 5. Target structure — `src/core/wallet/`

```
domain/
  schemas.ts    fanPositionSchema, historyEntrySchema  (bigint fields = z.string())
  types.ts      FanPosition = z.infer<...>; HistoryEntry = z.infer<...>;
                pure: investedFromShares(shares, sharePrice), percentOfRound(shares, supply);
                client edge: parsePosition(dto) → bigints, parseHistoryEntry(dto) → bigints
  __tests__/positions.test.ts        (moved from lib/positions.test.ts)
server/
  api/router.ts                       new Elysia({ prefix: "/wallet" }).use(getPositionsRoute).use(getHistoryRoute)
  api/routes/get-positions.route.ts   GET /positions, query zod { address }, → service → envelope
  api/routes/get-history.route.ts     GET /history,   query zod { address }, → service → envelope
  services/get-fan-positions-service.ts   AsyncAppResult<FanPosition[]>
  services/get-wallet-history-service.ts  AsyncAppResult<HistoryEntry[]>
  repository/find-verified-rounds.ts      "server-only" drizzle: verified rounds ⨝ clubs
client/
  hooks.ts   useWalletPositions(address) / useWalletHistory(address)
```

### Layer responsibilities

- **`repository/find-verified-rounds.ts`** — the drizzle half of today's `getFanPositions`: select `verified = true` rounds joined to their club (`id, contractAddress, sharePrice, goal, status, clubName, clubSlug`). `import "server-only"` + shared `db`. No chain, no Result.
- **`services/get-fan-positions-service.ts`** — orchestration: call the repository, then per round enrich with chain reads (`shareBalance`, `totalShares`, `pendingReward`, `totalRaised` via `readSafely` from `lib/contracts`), drop zero-share rounds, map to `FanPosition` using the domain pure fns. Returns `AsyncAppResult<FanPosition[]>` — `ok(list)` (possibly empty). A thrown DB failure → `err(AppErrors.unexpected(e))`.
- **`services/get-wallet-history-service.ts`** — wraps `getHistory` (indexer/RPC, server-only, holds the key); `ok(entries|[])`; catastrophic throw → `err(unexpected)`.
- **`api/routes/*.route.ts`** — thin (per `docs/code-review/backend-api.md`): `query: z.object({ address: addressSchema })`; call service; `if (!result.ok) return status(result.error.status as 500, errorToResponse(result.error))`; else `status(200, CommonResponse.successful({ response: result.data }))`. `response: { 200: successResponseSchema(z.array(fanPositionSchema), "FanPositions"), 500: errorResponseSchema(500) }`; `detail: { tags: ["Wallet"], summary }`. No `prefix` on the leaf. No `authed`.
- **`client/hooks.ts`** — `"use client"`; `const wallet = useElysia().wallet`; `useWalletPositions(address)` = `useQuery({ ...wallet.positions.get.queryOptions({ query: { address } }), enabled: !!address })`; read `data?.response ?? []`, map through `parsePosition`. Same for history.

### `addressSchema`

`z.string().regex(/^0x[a-fA-F0-9]{40}$/, "invalid address")` in `domain/schemas.ts`, reused by both routes' query. Replaces `ADDRESS_RE`.

## 6. Wiring, deletions, and the onError fix

- **Wire** `walletRouter` into `src/server/router.ts` via `.use(walletRouter)` (after the health route). Without this the domain 404s.
- **Delete** `src/app/api/wallet/positions/route.ts` + `src/app/api/wallet/history/route.ts` (replaced by Elysia).
- **Delete** the hand-duplicated DTO parsers in `src/components/wallet/types.ts` (Eden types + the domain `parsePosition`/`parseHistoryEntry` replace them). If the file has other still-used exports, keep those and drop only the wallet-read DTO duplication.
- **`WalletOverview.tsx`** — replace the `fetch(...)` calls + `useState`/`refresh` for positions/history with `useWalletPositions`/`useWalletHistory`. The WDK balance read (`w.getUsdtBalance()`) stays client-side as-is. Loading/error come from the query hooks. Any parent `onCreated`/`onDistributed` refresh callback becomes `queryClient.invalidateQueries` on the wallet query keys (`wallet.positions.get.queryKey()`).
- **`server/router.ts` onError (P0b-deferred, fix here):**
  - VALIDATION branch: add `targets: typeof error.valueError?.path === "string" ? [error.valueError.path] : error.valueError?.path`.
  - Before the generic 500: `if (code === "NOT_FOUND") return { code: "NOT_FOUND", status: 404 } satisfies APIResponse;`.

## 7. Testing

- **`domain/__tests__/positions.test.ts`** (moved) — the existing pure-fn tests (`investedFromShares`, `percentOfRound`) run under the new path. Add cases for `parsePosition` (string→bigint round-trip, precision beyond 2^53).
- **`server/repository/__tests__/find-verified-rounds.test.ts`** — against local Postgres (seeded demo club/round): returns the verified round joined to its club; excludes unverified. Guard-free (read-only, non-destructive).
- **Route/service** — a thin service test with an injected repository + a fake chain-read fn asserting the `FanPosition` mapping (shares→invested, zero-share drop). Deps-injected like the reference services.
- **Live proof (verify skill / manual):** `curl "http://localhost:3000/api/v1/wallet/positions?address=0x..."` → `{response:[...],code:"OK",status:200}`; a bad address → 400 envelope with `targets:["address"]` (proves the onError fix); the wallet page renders positions/history through Eden with no hand-rolled fetch left.
- Run `node:test` via `pnpm exec tsx --test`. `tsc --noEmit` + `pnpm build` green.

## 8. Out of scope (P1)

- Account/wallet linking (P2) — the fan address still comes from the client.
- Chain writes (invest/claim) — stay client-signed via WDK, untouched.
- Moving `lib/contracts.ts` into `server/chain/` — P1 imports it in place (it is server-safe); the relocation is a later cleanup.
- `eden-server.ts` RSC-prefetch proxy — not needed (the wallet page is a client component reading via hooks); add when a server-rendered domain needs prefetch.

## 9. Deliverable

This spec → one P1 implementation plan (`docs/superpowers/plans/2026-07-12-p1-wallet-slice.md`) → subagent-driven execution. It establishes the file-by-file template P2..N reuse verbatim (swap the domain name + shapes).
