# P9 — Aave lending slice ("Earn on idle USD₮") — design

**Status:** design, ready for plan. **Phase:** P9. **WDK tier:** 6 (Aave V3 lending).
**Deadline:** 2026-07-14 (semifinal build closes 2026-07-12 23:59 GMT-7).

> **BLUNT testnet reality (read first).** Aave V3 on Sepolia only lists **Aave's own faucet test
> tokens**, not our `MockUSDT`. So `supply({token:"USDT"})` of our demo token will revert "no market".
> This slice wires the **real WDK Aave call** and degrades gracefully to an honest "no Aave market for
> USD₮ on this network — available on supported markets (mainnet/Polygon)" state. The tier is genuinely
> wired; live *supply* works only where USD₮ has an Aave market. We do NOT fake a deposit or a yield
> number.
>
> **Scope guard:** this is **client-side personal yield** — a fan supplies idle wallet USD₮ to Aave and
> withdraws it. The other idea (a round's *funding-float* auto-supplied to Aave, a change to
> `RevenueShareRound.sol`) is **explicitly OUT** — a contract change + redeploy + re-audit under a
> few-hour deadline is too risky and would touch the working invest→claim loop. It stays roadmap
> (designed as an optional `IYieldStrategy` hook).

Plan target: `docs/superpowers/plans/2026-07-12-p9-aave-lending-slice.md`.

---

## 1. Goal

An **"Earn" card on `/wallet`**: a fan supplies idle USD₮ to Aave V3, sees their supplied position, and
withdraws — all fan-signed, self-custody. Proves the tier-6 surface is genuinely wired.

## 2. Architecture — client-side WDK protocol (same shape as P8, NOT a server tri-layer)

Aave protocol methods run **on the seed-holding account (client-only)**; the fan **signs their own
supply/withdraw**; the server never sees the key and **no new API route** is added.

```
web/src/lib/wdk.ts        register the Aave protocol on the standard-mode WDK account;
                          expose supply/withdraw/quote through a new getLending(userId) surface
web/src/core/lending/
  domain/
    schemas.ts            lendingAmountSchema, lendingQuoteSchema, positionSchema
    types.ts              LendingPosition type + pure helpers (format supplied/available; human↔base-unit)
    __tests__/lending-domain.test.ts
  client/
    hooks.ts              useLending() -> { usePosition(), supply(amount), withdraw(amount) }
    use-lending.ts        orchestration: quote + execute + graceful "no market" state + refetch
Surface: components/wallet/EarnCard.tsx  (new card on /wallet)
```

## 3. WDK integration (`@tetherto/wdk-protocol-lending-aave-evm`)

- Register on the existing standard-mode WDK core instance in `lib/wdk.ts`
  (`.registerProtocol("ethereum", "aave", AaveProtocolEvm)`). The decorated account exposes:
  - `quoteSupply({ token, amount, onBehalfOf? }) → { token, amount, fee, … }` (read).
  - `supply({ token, amount }) → { success, hash, … }` (fan-signed).
  - `quoteWithdraw({ token, amount })` / `withdraw({ token, amount }) → { success, hash, … }`.
- `token = "USDT"`, amounts **human-readable strings** (convert at the boundary from base-unit `bigint`).
- **Position read:** the API's `quote*` return `fee`, **not APY and not a live balance**. Show the
  supplied position as the **aToken balance** when the market's aToken address is configured
  (`NEXT_PUBLIC_AUSDT_ADDRESS`, read via the existing `account.getTokenBalance`); if unset, show the
  last-supplied amount from the successful `supply` result. APY is displayed as a static "variable
  (Aave V3)" label — a live APY read is **roadmap** (not in `quote*`).
- **Mode scope:** standard mode only; erc4337 protocol composition is roadmap →
  `getLending()` returns `{ available: false, reason: "erc4337" }` in erc4337 mode.

## 4. Flow (EarnCard on /wallet)

1. Card shows: wallet USD₮ balance, current Aave position (aToken balance or last-supplied), APY label.
2. **Supply:** enter amount → `quoteSupply` (fee preview) → confirm → `supply({token:"USDT", amount})`
   (fan signs) → poll receipt → refetch balance + position.
3. **Withdraw:** enter amount (or "max") → `withdraw(...)` → refetch.
4. **No market / not available:** `supply`/`quoteSupply` throws → render honest degrade **"No Aave
   market for USD₮ on this network — available on supported markets."** No crash, no fake number.

## 5. Money & self-custody constraints (carried from P1–P7)

- Base-unit `bigint` internally; Aave API takes **human strings** — convert only at the boundary
  (`formatUnits`/`parseUnits`), never float-math a balance.
- Fan signs their own supply/withdraw; **server never touches the key**; no server route; no contract
  change. Self-custody intact.
- Do NOT edit `db/schema.ts`, `lib/sponsor.ts`, `lib/contracts.ts`, or **any** `contracts/` Solidity.
  `router.ts` untouched (no server route).
- `tsc --noEmit` EXIT 0; `pnpm build` OK.

## 6. Test strategy

- **Domain (pure, `tsx --test`):** format supplied/available; human↔base-unit round-trip; quote/position
  DTO mapping.
- **`getLending`/protocol call:** needs a live WDK account + an Aave market, so **exercised
  live/manually** (like P3 `chain-reads`). The client `use-lending` orchestration (quote → execute →
  graceful `available:false` / no-market state, refetch) is the testable seam via a fake `getLending`.
- **Gates:** `tsc --noEmit` EXIT 0; `pnpm build` OK. Manual live check: card renders; supply either
  lands (on a USD₮-market chain) or degrades cleanly on Sepolia.

## 7. Risks

- **No USD₮ Aave market on testnet (primary):** the degrade path is the expected Sepolia demo state.
  For a live supply in the video, use a chain/fork where USD₮ has an Aave V3 market (mainnet/Polygon).
- **Position/APY gaps (secondary):** `quote*` exposes neither; position falls back to aToken balance or
  last-supplied, APY is a static label — documented, not hidden.
- **Package (secondary):** `@tetherto/wdk-protocol-lending-aave-evm` install/compat vs the pinned WDK
  beta line — confirmed at plan Task 1. Confine ALL Aave calls to `getLending()`; unavailable →
  `{ available: false }`, UI degrades, build never blocked.

## 8. Task decomposition (preview)

1. Install dep; register Aave protocol in `lib/wdk.ts`; add `getLending(userId)` seam (standard-mode;
   erc4337/no-package/no-market → `{available:false}` / graceful).
2. `core/lending/domain` — schemas + types + pure format/convert helpers + tests.
3. `core/lending/client` — `useLending()` (usePosition + supply + withdraw) with graceful no-market state.
4. `EarnCard.tsx` on `/wallet` — supply/withdraw flow, position + APY label, balance invalidation; build.
