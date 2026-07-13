# P8 — Velora swap slice ("Invest with any token") — design

**Status:** design, ready for plan. **Phase:** P8. **WDK tier:** 5 (Velora / DEX aggregation swap).

> **Ambition note.** This is the full-scope design (no deadline cuts). Velora aggregates real DEX
> liquidity, so the slice is built and **tested against a mainnet fork** (`anvil --fork-url <mainnet>`),
> where WETH/USDC→USD₮ routes genuinely exist, and targets production chains with real liquidity. On a
> bare testnet with no route, execution still degrades gracefully (an honest "no route on this network"
> state) — degradation is a robustness property, not the headline.

Plan target: `docs/superpowers/plans/2026-07-12-p8-velora-swap-slice.md`.

---

## 1. Goal

Remove the "you need USD₮ first" barrier. A fan holding **any liquid token** can:
1. **Fund with any token** — swap → USD₮ into their self-custody wallet (in `AddFundsDialog`), and
2. **Invest with any token** — a composed *swap-then-invest* flow so a fan funds a club in one motion,
   batched into a **single ERC-4337 UserOperation** (approve + swap + invest) when in gasless mode.

Backed by real Velora quotes, slippage protection, price-impact warnings, and route transparency.

## 2. Architecture — server quote domain + client execution

A proper `core/swap` tri-layer, split by trust boundary:

- **Server (read-only, public, cached):** a Velora/ParaSwap **quote** service the marketing pages and
  dialogs can call *without a wallet* (fast preview: "1 WETH ≈ N USD₮, price impact X%"). No seed, no
  key — a public aggregator quote, cached briefly. This is what makes the server tri-layer worthwhile
  and gives snappy UX before the fan commits.
- **Client (authoritative, fan-signed):** the actual swap executes through the **WDK Velora protocol
  registered on the seed-holding account** (`@tetherto/wdk-protocol-swap-velora-evm`). WDK re-quotes at
  execution time and the fan signs — the server preview is never trusted for the on-chain amount.

```
web/src/core/swap/
  domain/
    schemas.ts     swapTokenSchema (configurable token registry), swapSideSchema, slippageSchema,
                   swapQuoteSchema, swapParamsSchema, swapResultSchema
    types.ts       SwapQuote/SwapResult + DTO + to/parse; pure helpers:
                   minReceived(out, slippageBps), priceImpactPct(in, out, spot), formatRoute()
    token-registry.ts   per-chainId token list (symbol → address, decimals, icon)
    __tests__/swap-domain.test.ts
  server/
    velora-quote.ts             server-only ParaSwap/Velora public quote fetch (no key), TTL cache
    services/get-swap-quote-service.ts  deps-injected; ok(SwapQuote) | graceful "no route" (ok w/ flag)
    api/routes/swap-quote.route.ts      PUBLIC GET /swap/quote?tokenIn&tokenOut&amount&side
    api/router.ts               swapRouter, prefix /swap
    __tests__/get-swap-quote-service.test.ts
  client/
    hooks.ts        useSwap() -> { useQuote(params), swap(params), status }
    use-swap.ts     debounced quote, approval handling, slippage state, execute + refetch
    use-swap-and-invest.ts   composed swap→invest (batched UserOp in erc4337; sequential in standard)
web/src/lib/wdk.ts   register Velora protocol on the WDK account; getSwap(userId) execution seam (both modes)
Surface: components/wallet/AddFundsDialog.tsx ("Swap to USD₮"),
         components/InvestForm.tsx ("Invest with any token" toggle)
Wire: web/src/server/router.ts -> .use(swapRouter)
```

## 3. WDK integration (`@tetherto/wdk-protocol-swap-velora-evm`)

- Register on the WDK core instance in `lib/wdk.ts`
  (`.registerProtocol("ethereum", "velora", VeloraProtocolEvm)`), for **both** wallet modes — the
  standard `new WDK(seed)` chain and the erc4337 manager. The account then exposes:
  - `quoteSwap({ tokenIn, tokenOut, amount, side }) → { tokenInAmount, tokenOutAmount, fee, … }`.
  - `swap({ tokenIn, tokenOut, amount, side, to? }) → { success, hash, tokenOutAmount, … }` (fan-signed).
- `getSwap(userId)` returns a mode-correct handle: `{ available, quote(params), execute(params) }`.
  In erc4337 mode, `execute` returns a UserOp path (gas paid in USD₮) and exposes a `buildCalls()` for
  the batched swap-then-invest composition (§5).
- Tokens are symbols; amounts human-readable strings — convert at the boundary from base-unit `bigint`.

## 4. Slippage, approvals, and safety

- **Slippage tolerance:** user-set (default 0.5%), enforced via `minReceived = out * (1 - slippageBps)`;
  the swap is submitted with the min-out guard so an adverse move reverts rather than fills badly.
- **Price-impact warning:** `priceImpactPct` computed from the quote vs a spot reference; > 3% shows a
  confirm-again warning, > 15% blocks by default.
- **ERC-20 approval:** before selling a non-native token, ensure allowance to the Velora spender;
  reuse the reset-to-0-then-approve pattern already used for USD₮ (`approveUsdt`) to stay safe with
  tokens that reject non-zero→non-zero approvals.
- **Route transparency:** show the aggregated route/hops and the fee from the quote, so the fan sees
  what they're getting (judge-facing "actually wired" evidence too).

## 5. Flagship flow — "Invest with any token" (batched)

1. In `InvestForm`, fan toggles "pay with" → picks `tokenIn` (registry) + amount.
2. `useQuote` (server preview) shows expected USD₮ + impact; on confirm, `use-swap-and-invest`:
   - **erc4337 (gasless):** build one UserOperation batching `[approve(velora), swap→USDT, approve(round), invest]`
     so the fan signs **once** and pays gas in USD₮ — the strongest demo of the WDK smart-account stack.
   - **standard:** sequential txs (approve → swap → approve → invest) with per-step status.
3. Poll receipt(s); on success, invalidate wallet balance + the round's on-chain reads so the new
   position shows immediately.
4. Any leg fails → surface the exact failing step + reason; nothing partially "succeeds" silently.

## 6. Money & self-custody constraints (carried from P1–P7)

- Base-unit `bigint` internally; Velora API takes human strings — convert only at the boundary
  (`formatUnits`/`parseUnits`). Never float-math a balance. The min-received guard is computed in bigint.
- Fan signs every swap; **server never touches the key**; the only server surface is the **public,
  read-only quote** (no signing, no seed). Self-custody intact.
- Do NOT edit `db/schema.ts`, `lib/sponsor.ts`, `lib/contracts.ts`. `router.ts` gains one `.use(swapRouter)`.
- `tsc --noEmit` EXIT 0; `pnpm build` OK.

## 7. Token registry (extensible)

`token-registry.ts` maps `chainId → [{ symbol, address, decimals }]`; default offered set WETH + USDC +
WBTC → USD₮, per chain. Adding a token is a registry entry, not code. `swapTokenSchema` derives its enum
from the active chain's registry so validation stays in sync.

## 8. Test strategy (full)

- **Domain (pure):** `minReceived`/`priceImpactPct` math (bigint precision, slippage bounds), route
  formatting, human↔base-unit round-trip, quote/result DTO round-trip.
- **Server quote service (deps-injected):** fake aggregator → maps a real ParaSwap response to `SwapQuote`;
  a no-route response → graceful `ok({ available:false })` (never a 5xx); a fetch throw → same;
  TTL cache serves a second identical request without re-fetching.
- **Client orchestration:** fake `getSwap` proves debounce, approval-first ordering, slippage-guard
  wiring, and the erc4337-batch vs standard-sequential branch selection.
- **Live integration (mainnet fork):** `anvil --fork-url <mainnet>`; deploy/seed a funded account with
  WETH; run a real WETH→USDT `quoteSwap` + `swap` and assert USD₮ arrives ≥ minReceived. This is the
  real proof the tier is wired end-to-end.
- **Gates:** `tsc --noEmit` EXIT 0; `pnpm build` OK; grep-clean of any dead pre-swap fund paths.

## 9. Risks & mitigations

- **Aggregator quote drift** between server preview and WDK execution → the WDK re-quote at execution +
  the min-received guard make the preview advisory only; no money decision trusts the cached quote.
- **Approval hazards** (non-zero→non-zero) → reset-to-0 pattern.
- **Package compat** (`@tetherto/wdk-protocol-swap-velora-evm` vs pinned WDK beta line) → confine ALL
  WDK Velora calls to `lib/wdk.ts`'s `getSwap()` seam; unavailable → `{ available:false }`, UI degrades.
- **Testnet liquidity** → develop/test on a mainnet fork; bare-testnet execution degrades honestly.

## 10. Task decomposition (preview)

1. Domain — schemas, types, token-registry, pure `minReceived`/`priceImpact`/route helpers + tests.
2. Server — `velora-quote` (public aggregator + cache), `get-swap-quote-service` (graceful), route +
   `swapRouter` + wire + tests.
3. `lib/wdk.ts` — register Velora protocol (both modes); `getSwap(userId)` execution seam incl.
   erc4337 `buildCalls()` for batching.
4. Client — `useSwap` (quote/approve/slippage/execute) + tests.
5. `AddFundsDialog` "Swap to USD₮" flow (fund-with-any-token) + balance invalidation.
6. `use-swap-and-invest` + `InvestForm` "invest with any token" (batched erc4337 UserOp / sequential
   standard) + on-chain refetch.
7. Live mainnet-fork integration test (WETH→USDT) + docs/permalink for the Tether-stack writeup.
