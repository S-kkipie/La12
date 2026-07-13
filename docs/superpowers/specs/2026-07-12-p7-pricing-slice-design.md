# P7 — pricing slice (WDK Price Rates, fiat display) — design

**Status:** design, ready for plan.
**Phase:** P7, the final slice of the Elysia/Eden domain migration (follows P1 wallet → P2 account →
P3 clubs → P4 rounds → P5 directory → P6 ops, all merged to local `main` @ `4722dbc`).
**WDK tier:** 4 (Price Rates) — committed MVP. This turns the dead 1:1 stub into a real WDK call.
**Deadline:** 2026-07-14 (WDK hackathon).

Plan target: `docs/superpowers/plans/2026-07-12-p7-pricing-slice.md`.

---

## 1. Goal

Add a **`core/pricing`** domain that fetches a real **USD₮→fiat** rate from WDK Price Rates
(`@tetherto/wdk-pricing-bitfinex-http`) and **surfaces fiat value in the fan wallet UI** — the
`/wallet` balance and each position, in a user-selected currency (USD / EUR / GBP). USD₮ stays the
primary, on-chain-truth figure; fiat is a secondary, display-only line. Delete the orphaned
`lib/pricing.ts` 1:1 stub (it has **zero callers** today).

This makes WDK tier 4 real for the demo instead of a stub the pitch merely claims.

## 2. Scope

**In scope**
- `core/pricing` tri-layer (`domain → server/{rates, services, api} → client`), same shape as P1–P6.
- Real WDK call: `BitfinexPricingClient.getCurrentPrice("USDT", <ccy>)`, server-only, cached, with a
  graceful fallback so the demo never breaks.
- Public `GET /api/v1/pricing/rate?currency=EUR` route (rates aren't sensitive — no auth macro).
- Fiat display on `/wallet`: headline balance (`BalanceHero`) + each position (`PositionsList`).
- A currency `<select>` in the wallet header; choice persisted to `localStorage` (client-only, no DB).
- Delete `lib/pricing.ts` at cutover.

**Out of scope (YAGNI / roadmap)**
- Club dashboard fiat (stays USD₮-native — it's the operator's ledger, USD₮ is the unit of account).
- Currencies beyond USD/EUR/GBP; locale auto-detect; per-user server-persisted preference.
- Historical rate charts (`getHistoricalPrice`), 24h-change data (`getMultiPriceData`) — not needed
  for a value line.
- Feeding fiat back into any money computation. Fiat is **display only**, never money math.

## 3. Architecture — `core/pricing`

```
web/src/core/pricing/
  domain/
    schemas.ts   currencySchema (z.enum(["USD","EUR","GBP"])), rateSchema, rateQuerySchema
    types.ts     SupportedCurrency, RateSource ("live"|"fallback"), Rate + RateDTO,
                 toRateDTO/parseRate, pure convertUsdtToFiat(baseUnits: bigint, rate: number): number
    __tests__/pricing-domain.test.ts
  server/
    rates.ts                       server-only. getUsdtRate(currency): Promise<{rate,source}> —
                                   wraps BitfinexPricingClient, module-level TTL cache, 1.0 fallback
    services/get-rate-service.ts   deps-injected getRate(deps)+getRateService(currency); always ok(Rate)
    services/__tests__/get-rate-service.test.ts
    api/routes/rate.route.ts       PUBLIC GET /rate?currency=… -> 200 {currency, rate, source}
    api/router.ts                  pricingRouter, prefix /pricing
  client/
    hooks.ts        usePricing() -> { useRate(currency) }  (read, select: parseRate)
    use-currency.ts useCurrency() -> [currency, setCurrency]  (localStorage-backed, "USD" default)

Wire:   web/src/server/router.ts -> .use(pricingRouter)   (single wiring point)
Surface: components/wallet/BalanceHero.tsx, components/wallet/PositionsList.tsx,
         + a currency <select> in the wallet header (components/wallet/CurrencySelect.tsx)
Delete:  web/src/lib/pricing.ts
```

## 4. Domain layer (pure)

- `currencySchema = z.enum(["USD", "EUR", "GBP"])`; `SupportedCurrency = z.infer<typeof currencySchema>`.
- `rateSchema = z.object({ currency: currencySchema, rate: z.number(), source: z.enum(["live","fallback"]) })`.
  Rate is a plain `number` on the wire (a display multiplier, not money) — **no bigint/string dance here.**
- `rateQuerySchema = z.object({ currency: currencySchema.default("USD") })`.
- `Rate` / `RateDTO` are structurally identical (rate is already JSON-safe); `toRateDTO`/`parseRate`
  are identity-ish passthroughs kept for template symmetry and a validation boundary.
- **`convertUsdtToFiat(amountBaseUnits: bigint, rate: number): number`** —
  `Number(amountBaseUnits) / 1e6 * rate`. This is the **one sanctioned `Number()` on a money value**
  in this domain, exactly like the chart-axis exception — it produces a display float and its result
  MUST NOT re-enter any bigint money path. Comment it "display only".

## 5. Server layer

### `rates.ts` — the real WDK call (server-only)
```
import "server-only";
import { BitfinexPricingClient } from "@tetherto/wdk-pricing-bitfinex-http";
```
- One module-level `BitfinexPricingClient` instance + a module-level cache
  `Map<SupportedCurrency, { rate: number; source: "live"|"fallback"; at: number }>`, `TTL = 60_000` ms.
- `getUsdtRate(currency): Promise<{ rate: number; source: "live"|"fallback" }>`:
  1. **USD short-circuit:** return `{ rate: 1, source: "live" }` without a network call (USD₮ is
     USD-pegged; 1.0 is definitional, not a fallback).
  2. Cache hit within TTL → return cached.
  3. Else `await client.getCurrentPrice("USDT", currency)`:
     - a finite positive number → `{ rate, source: "live" }`, cache it.
     - `null` / non-finite / throw → `{ rate: 1, source: "fallback" }` (last-resort so a number still
       renders), cache it too (short TTL avoids hammering a failing upstream).
- Rationale for `source`: a non-USD **fallback** rate of 1.0 is not a true EUR/GBP rate, so the DTO
  carries `source` and the UI marks fallback values as approximate (see §6). This keeps the demo
  honest — never a fabricated precise-looking foreign rate.
- No API key / env var — Bitfinex HTTP is public; constructor options are reserved.

### `get-rate-service.ts` — deps-injected, always `ok`
- `getRate(deps: { getUsdtRate })(currency): AsyncAppResult<Rate>` and thin real-deps wrapper
  `getRateService(currency)`. Wraps `deps.getUsdtRate(currency)` and returns
  `ok({ currency, rate, source })`. Like the P3/P5 graceful-empty reads, it **never emits a 5xx** —
  worst case is `source: "fallback"`, `rate: 1`. (The only error surface is a validation 422 on a
  bad `currency`, handled by the route/zod, not the service.)

### `rate.route.ts` — public
- `new Elysia().get("/rate", …, { query: rateQuerySchema, response: { 200: …, 500: errorResponseSchema(500) } })`.
- No `authed`/`clubAuthed` macro — public read (rates are not sensitive; same visibility as the P5
  directory list). Standard `as 500` cast (service only ever ok's, so 500 is the unreachable-but-typed
  floor, consistent with the wallet template). Maps `result.data` → `CommonResponse.successful`.

### `router.ts` wiring
- `pricingRouter = new Elysia({ prefix: "/pricing" }).use(rateRoute)`; add exactly one
  `.use(pricingRouter)` to `web/src/server/router.ts` (root `onError` untouched — the single wiring point).

## 6. Client layer + UI surface

- `use-currency.ts`: `useCurrency()` returns `[currency, setCurrency]`, backed by `localStorage`
  key `ladoce:currency` (default `"USD"`), validated through `currencySchema` on read (ignore junk →
  `"USD"`). `"use client"`.
- `hooks.ts`: `usePricing()` → `{ useRate(currency: SupportedCurrency) }` =
  `useQuery({ ...elysia.pricing.rate.get.queryOptions({ query: { currency } }), select: parseRate })`.
  Canonical factory shape (matches `useClubs`/`useRounds`).
- `CurrencySelect.tsx`: small `<select>` (USD/EUR/GBP) wired to `useCurrency`, placed in the wallet
  page header.
- `BalanceHero.tsx`: below the USD₮ balance, render
  `convertUsdtToFiat(balanceBaseUnits, rate)` formatted for `currency` (Intl.NumberFormat). When
  `source === "fallback" && currency !== "USD"`, prefix with `≈` and a title/tooltip "live rate
  unavailable — showing USD". USD₮ figure stays the visual primary.
- `PositionsList.tsx`: each position shows its invested/value USD₮ (unchanged) + a secondary fiat line
  using the same rate. One `useRate(currency)` call per page (React Query dedupes), not per row.
- Money discipline: components pass **bigint base units** into `convertUsdtToFiat`; the float result
  is used only for the `Intl.NumberFormat` display string. No fiat float is stored, summed, or sent back.

## 7. Constraints (carried from P1–P6)

- Result/envelope: services return `Ok<T> = {ok:true;data:T}` / `Err<E> = {ok:false;error:E}`;
  success = `result.data`. Route maps data→200, error.status→4xx/5xx. `CommonResponse.successful` = 200.
- eden-tanstack read hooks use `useQuery({ ...x.queryOptions(), select })`. No mutation in this slice.
- Elysia validates with zod: bad `currency` → **422**, root `onError` derives `targets` from
  `valueError.path` (ARRAY) — MUST NOT be touched.
- Money truth on-chain; USD₮ = 6 decimals base-unit `bigint`. Fiat is display-only float
  (`convertUsdtToFiat` — the sanctioned `Number()` exception). Never `Number()` a money value elsewhere.
- Self-custody unaffected — pricing is a read, no keys, no tx. WDK client is server-only external HTTP.
- Do NOT edit `web/src/db/schema.ts`, `web/src/lib/sponsor.ts`, `web/src/lib/contracts.ts`.
- Type gate `pnpm exec tsc --noEmit` EXIT 0; `pnpm build` succeeds. Sequential after P6 (no parallel
  worktree) — `router.ts` is the only shared wiring line and P5+P6 is already merged, so no conflict.

## 8. WDK integration note (for the judges / README)

- Package `@tetherto/wdk-pricing-bitfinex-http` (Bitfinex-backed HTTP pricing). Call
  `getCurrentPrice("USDT", ccy) → Promise<number|null>` (null when Bitfinex can't quote the pair).
- **Why/trade-off:** USD₮≈USD, so fiat conversion is UX polish, not money math — hence USD is a 1.0
  peg baseline and any upstream failure degrades to 1.0 with a `source:"fallback"` marker rather than
  breaking the page. Real EUR/GBP rates prove the tier-4 surface is genuinely wired, honestly labeled.
- **Integration risk (single):** the exact export/import form and the installability of
  `@tetherto/wdk-pricing-bitfinex-http` against the pinned WDK beta line (`@tetherto/wdk` `1.0.0-beta.13`,
  `wdk-wallet-evm` `beta.15`) are confirmed at implementation (plan Task 2), not assumed here. **Mitigation
  is built into the design:** `rates.ts` is the only file that touches the package, behind the deps-injected
  `getUsdtRate` seam, and the whole slice already degrades to `source:"fallback"`, `rate:1`. If the package
  is unavailable or its API differs, Task 2 keeps the fallback path (the service/route/UI/tests are
  package-agnostic — they inject a fake), and Price Rates ships "wired with graceful degrade" rather than
  blocking the slice. Do NOT let a package hiccup cascade past `rates.ts`.

## 9. Test strategy

- **Domain (pure, `tsx --test`):** `convertUsdtToFiat` — 1_000000n @ rate 1 → 1; @ rate 0.92 → 0.92;
  large base units keep precision to the display float; `parseRate`/`toRateDTO` round-trip.
- **`rates.ts` (server, fake `BitfinexPricingClient`):** USD short-circuits to `{1,"live"}` with **no
  client call**; a real number → `{rate,"live"}`; `null` → `{1,"fallback"}`; a throw → `{1,"fallback"}`;
  a second call within TTL is served from cache (client called once). Inject the client so no network.
- **`get-rate-service.ts` (server, deps-injected):** maps `getUsdtRate` → `ok({currency,rate,source})`;
  a `getUsdtRate` throw still resolves to `ok(...,source:"fallback")` (never a 5xx).
- **Gates:** `tsc --noEmit` EXIT 0; `pnpm build` OK; grep-clean after deleting `lib/pricing.ts`
  (zero live importers — already true, it's orphaned). Optional live curl:
  `GET /api/v1/pricing/rate?currency=EUR` → 200 `{currency:"EUR", rate:…, source:…}`;
  `?currency=ZZZ` → 422 `targets:["currency"]`.

## 10. Task decomposition (preview for the plan)

1. pricing domain — schemas, types, `convertUsdtToFiat`, tests.
2. pricing server `rates.ts` — WDK Bitfinex wrapper + TTL cache + fallback + tests (add the dep).
3. pricing service — `get-rate-service` (deps-injected, always-ok) + tests.
4. pricing route + `pricingRouter` + wire into `server/router.ts`.
5. pricing client — `use-currency` + `usePricing()`/`useRate` hooks.
6. UI surface + cutover — `CurrencySelect`, fiat lines in `BalanceHero` + `PositionsList`, delete
   `lib/pricing.ts`, grep-clean, build.
