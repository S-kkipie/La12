# P8 — Velora swap slice ("Fund with any token") — design

**Status:** design, ready for plan. **Phase:** P8. **WDK tier:** 5 (Velora / DEX swap).
**Deadline:** 2026-07-14 (semifinal build closes 2026-07-12 23:59 GMT-7).

> **BLUNT testnet reality (read first).** Velora (ParaSwap) aggregates real DEX liquidity. On Sepolia
> there is essentially **no liquidity**, so `swap()` will usually return "no route". This slice is
> therefore designed to **degrade gracefully**: the real WDK Velora call is wired, we show a live
> **quote** when a route exists, and when it doesn't we show an honest "no route on this network —
> available on mainnet" state instead of an error. The tier is genuinely wired; live *execution* is a
> mainnet capability. We do NOT fake a swap.

Plan target: `docs/superpowers/plans/2026-07-12-p8-velora-swap-slice.md`.

---

## 1. Goal

Let a fan **fund a club with any token they already hold** — pick a token (e.g. WETH), see a live
Velora quote to USD₮, confirm, and the swap lands USD₮ in their self-custody wallet ready to invest.
Surfaced inside the existing **`AddFundsDialog`** as a new "Swap a token → USD₮" path alongside MoonPay.

## 2. Architecture — client-side WDK protocol (NOT a server tri-layer)

Unlike P1–P7, the swap is **not** a `core/<domain>` server slice. WDK protocol methods
(`quoteSwap`/`swap`) run **on the seed-holding account, which is client-only** (`"use client"`,
IndexedDB). The fan **signs their own swap** — the server never sees the key and there is **no new API
route**. This is a wallet capability, like `transferUsdt`, not a server domain.

```
web/src/lib/wdk.ts        register the Velora protocol on the standard-mode WDK account;
                          expose quoteSwap/swap through a new getSwap(userId) surface
web/src/core/swap/
  domain/
    schemas.ts            swapTokenSchema (enum of offered tokens), swapQuoteSchema, swapParamsSchema
    types.ts              SwapQuote type + pure helpers (fee %/min-received display; parse human amounts)
    __tests__/swap-domain.test.ts
  client/
    hooks.ts              useSwap() -> { useQuote(params), swap(params) }  — client, wraps getSwap()
    use-swap.ts           orchestration: debounce quote, graceful "no route" state, execute + refetch balance
Surface: components/wallet/AddFundsDialog.tsx  (new "Swap to USD₮" tab/section)
```

## 3. WDK integration (`@tetherto/wdk-protocol-swap-velora-evm`)

- Register on the existing standard-mode WDK core instance in `lib/wdk.ts` (the same
  `new WDK(seed).registerWallet("ethereum", WalletManagerEvm, …)` chain), adding
  `.registerProtocol("ethereum", "velora", VeloraProtocolEvm)`. The decorated account then exposes:
  - `quoteSwap({ tokenIn, tokenOut, amount, side }) → { tokenInAmount, tokenOutAmount, fee, … }` (read).
  - `swap({ tokenIn, tokenOut, amount, side, to? }) → { success, hash, tokenOutAmount, … }` (fan-signed tx).
- Tokens are **symbols** ("WETH", "USDT"); amounts are **human-readable strings**. `tokenOut` is always
  `"USDT"`, `side: "sell"` (sell N of tokenIn for USD₮).
- **Mode scope:** standard mode only (the demo default + testnet EOA). erc4337 protocol composition is
  **roadmap** — `getSwap()` returns a `{ available: false, reason: "erc4337" }` surface in erc4337 mode
  rather than throwing.

## 4. Flow (AddFundsDialog "Swap to USD₮")

1. Fan picks `tokenIn` (small offered list, §6) + enters an amount.
2. Debounced `useQuote` → `quoteSwap(...)` → show **"you get ≈ X USD₮ (fee Y)"**.
3. On quote failure/no-route → render the honest degrade: **"No swap route for this pair on this
   network — available on mainnet."** No error toast, no crash.
4. Confirm → `swap(...)` (fan signs; erc4337 UserOp or EOA tx) → poll receipt → on success, invalidate
   the wallet balance query so the new USD₮ shows immediately.
5. Any execution failure → the same graceful message + the raw reason in a details line.

## 5. Money & self-custody constraints (carried from P1–P7)

- App money is base-unit `bigint`; the Velora API takes **human strings** — convert at the boundary
  only (`formatUnits`/`parseUnits`), never float-math a balance. The quote's `tokenOutAmount` is
  display + a `parseUsdt` back to bigint if it feeds any downstream money path.
- Fan signs their own swap; **server never touches the key**; no server route added. Self-custody intact.
- Do NOT edit `db/schema.ts`, `lib/sponsor.ts`, `lib/contracts.ts`. `router.ts` is **not** touched
  (no server route).
- `tsc --noEmit` EXIT 0; `pnpm build` OK.

## 6. Offered tokens (YAGNI)

`swapTokenSchema = z.enum(["WETH", "USDC"])` → always to `"USDT"`. Small, fixed list — enough to prove
the surface. More tokens = a one-line enum change later.

## 7. Test strategy

- **Domain (pure, `tsx --test`):** fee/min-received formatting; human↔base-unit conversion round-trip;
  quote DTO mapping.
- **`getSwap`/protocol call:** the actual Velora call needs a live WDK account + network, so it is
  **exercised live/manually** (like `chain-reads.ts` in P3), not unit-mocked. The client `use-swap`
  orchestration (debounce, graceful `available:false` / no-route state) is the testable seam — a fake
  `getSwap` proves the degrade path renders instead of throwing.
- **Gates:** `tsc --noEmit` EXIT 0; `pnpm build` OK. Manual live check on the demo network: quote shows
  or degrades cleanly; if a route exists, a swap lands USD₮ and the balance refetches.

## 8. Risks

- **Testnet liquidity (primary):** no route on Sepolia → the degrade path is the expected demo state.
  Mitigation is the design itself (§ top). If you want a live executed swap for the video, run it on a
  chain/fork where a WETH→USDT route exists.
- **Package (secondary):** `@tetherto/wdk-protocol-swap-velora-evm` install/compat against the pinned
  WDK beta line — confirmed at plan Task 1. Confine ALL Velora calls to `lib/wdk.ts`'s `getSwap()` seam;
  if the package is unavailable, `getSwap()` returns `{ available: false }` and the UI degrades — do not
  let it cascade or block the build.

## 9. Task decomposition (preview)

1. Install dep; register Velora protocol in `lib/wdk.ts`; add `getSwap(userId)` seam (standard-mode;
   erc4337/no-package → `{available:false}`).
2. `core/swap/domain` — schemas + types + pure format/convert helpers + tests.
3. `core/swap/client` — `useSwap()` (debounced `useQuote` + `swap`) with the graceful no-route state.
4. Wire into `AddFundsDialog` — "Swap to USD₮" section, confirm flow, balance invalidation; build.
