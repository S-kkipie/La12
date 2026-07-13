# P9 — Aave lending slice (funding-float yield + personal earn) — design

**Status:** design, ready for plan. **Phase:** P9. **WDK tier:** 6 (Aave V3 lending).

> **Ambition note.** Full-scope design (no deadline cuts). This includes the product-defining piece the
> earlier trimmed version deferred: **a round's funding float earns yield while it fills**, via an
> optional on-chain yield-strategy hook on `RevenueShareRound`. Built and **tested against a mainnet
> fork** (`anvil --fork-url <mainnet>`) where a real Aave V3 USD₮ market exists. Targets production
> chains with USD₮ markets (Ethereum/Polygon). On a chain with no USD₮ Aave market it degrades honestly
> (no-strategy path unchanged; personal-earn shows "no market on this network").

Plan target: `docs/superpowers/plans/2026-07-12-p9-aave-lending-slice.md`.

---

## 1. Goal

Two capabilities, one Aave integration:

- **A — Funding-float yield (flagship, on-chain).** While a round is in `Funding`, the raised USD₮ is
  supplied to Aave V3 instead of sitting idle. On `closeFunding`, principal + accrued yield is withdrawn;
  **principal backs the shares 1:1 as today, and the yield becomes a bonus revenue distribution to
  holders** through the existing claim-based dividend mechanism. "Your money works even before the
  season starts."
- **B — Personal earn (client, fan-signed).** An "Earn" card on `/wallet`: a fan supplies idle wallet
  USD₮ to Aave, sees APY + position, and withdraws — self-custody, fan-signed.

## 2. Architecture

### A — On-chain (the hard, product-defining part)

```
contracts/src/
  IYieldStrategy.sol        interface: deposit(uint256), withdraw(uint256)->uint256, totalAssets()->uint256
  AaveYieldStrategy.sol     Aave V3 adapter: supplies/withdraws USD₮ to the Aave Pool, holds the aToken
  RevenueShareRound.sol     gains an OPTIONAL immutable IYieldStrategy (constructor param, address(0)=off)
  RoundFactory.sol          passes the strategy address through when deploying a round
```

- **Optional + backwards-compatible:** `strategy == address(0)` ⇒ the current behavior, byte-for-byte
  unchanged (the existing 30 Foundry tests must still pass untouched).
- **Deposit path:** `invest()` (or a batched sweep) routes newly-raised USD₮ into `strategy.deposit()`
  during `Funding`. The round's share accounting is unchanged — shares still mint 1:1 to USD₮ invested;
  the strategy just holds the float.
- **Close path:** `closeFunding()` calls `strategy.withdraw(all)` → principal + yield returns to the
  round. Principal is retained to back shares 1:1; **yield is recorded and distributed via the existing
  `distribute()`/`pendingReward` dividend accounting** (reusing the audited pull-based mechanism — no
  new claim path).

### B — Client (personal earn, same shape as P8's client seam)

```
web/src/lib/wdk.ts        register Aave protocol on the WDK account; getLending(userId) execution seam
web/src/core/lending/
  domain/     schemas + types + pure helpers (format position, APY, human↔base-unit) + tests
  server/     read-only APY/reserve service (Aave UiPoolDataProvider / getReserveData), cached, public
  client/     useLending() -> { usePosition(), useApy(), supply(amount), withdraw(amount) }
Surface: components/wallet/EarnCard.tsx
Wire: web/src/server/router.ts -> .use(lendingRouter)  (for the public APY read)
```

## 3. Contract design detail (A) — the parts that need care

- **`IYieldStrategy`** keeps the round decoupled from Aave: `deposit`, `withdraw(amount) → actualOut`,
  `totalAssets()`. A future strategy (other lending market) drops in without touching the round.
- **`AaveYieldStrategy`** wraps `IPool.supply`/`IPool.withdraw`; `totalAssets()` reads the aToken balance
  (rebasing → represents principal + accrued interest). Only the round can call it (owner = round).
- **Reentrancy & CEI:** all Aave interactions in `invest`/`closeFunding` sit behind the existing
  `nonReentrant` guard and follow checks-effects-interactions — state transitions commit before/after
  external Aave calls deliberately, never interleaved with untrusted callbacks.
- **Withdrawal-liquidity risk at close:** Aave withdraw can be capped if utilization is extreme.
  Mitigations: `withdraw` returns `actualOut` and the round tolerates `actualOut ≤ requested`
  (distributes whatever yield actually came back; principal-shortfall path reverts close and retries),
  plus a **max-exposure cap** (supply at most `capBps` of raised funds; remainder stays liquid in the
  round) so a close is never fully blocked by Aave liquidity.
- **Rounding/rebasing:** aToken is rebasing; compute yield as `totalAssets() - trackedPrincipal` at
  close, floor to avoid over-distributing; dust stays in the round.
- **Yield disposition (default):** to holders as bonus revenue (strongest fan story); a
  `yieldToClub` flag routes it to the club instead. Documented, configurable at deploy.

## 4. Client integration (B) — `@tetherto/wdk-protocol-lending-aave-evm`

- Register on the WDK account (`.registerProtocol("ethereum","aave",AaveProtocolEvm)`), both modes.
  `getLending(userId)` seam exposes `supply`/`withdraw`/`quoteSupply`/`quoteWithdraw` (fan-signed).
- **APY + position:** the WDK `quote*` methods expose fee, not APY — so APY comes from a **server-side
  read** of Aave's `UiPoolDataProvider`/`getReserveData` (public, cached, no key), and position from the
  aToken balance (`account.getTokenBalance(aUSDT)`). Both surfaced in `EarnCard`.
- token = "USDT", human-string amounts; convert at the boundary from base-unit `bigint`.

## 5. Money & self-custody constraints

- Base-unit `bigint` internally; Aave/WDK APIs take human strings — convert only at the boundary.
- **A (on-chain):** the round contract already custodies *round* funds by design; the strategy only
  routes those funds — **no change to fan-wallet self-custody**, no fan key involved.
- **B (personal):** fan signs their own supply/withdraw; server never touches the key; the only server
  surface is the **public read-only APY** (no signing).
- Do NOT edit `db/schema.ts`, `lib/sponsor.ts`, `lib/contracts.ts` (TS side). `router.ts` gains one
  `.use(lendingRouter)`. Contract changes are additive + optional (default-off preserves current behavior).
- `tsc --noEmit` EXIT 0; `pnpm build` OK; `forge build` + `forge test` green.

## 6. Test strategy (full)

- **Contracts (Foundry, mainnet fork):** `anvil --fork-url <mainnet>` against real Aave V3 USD₮ market.
  Cases: round with strategy → invest supplies to Aave → `vm.warp` accrues interest → `closeFunding`
  withdraws principal + yield → yield distributes to holders → `claim` pays out the bonus; principal
  backs shares 1:1; exposure-cap keeps `capBps` liquid; withdraw-shortfall path handled;
  reentrancy attempt reverts. **No-strategy path: the existing 30 tests pass unchanged.**
- **Contracts (unit):** `IYieldStrategy` accounting (`totalAssets` = principal + yield; dust floors),
  access control (only round calls the strategy).
- **Client domain (pure):** APY/position formatting, human↔base-unit round-trip, DTO round-trip.
- **Client server (deps-injected):** APY read maps `getReserveData` → DTO; graceful `available:false`
  when no market; TTL cache.
- **Client orchestration:** fake `getLending` proves quote→execute→refetch + graceful no-market state.
- **Live (fork):** personal supply/withdraw against the forked Aave market lands + reflects in position.

## 7. Deployment / migration

- Deploy `AaveYieldStrategy` (per chain, wired to that chain's Aave Pool + USD₮), update `RoundFactory`
  to pass the strategy address (or `address(0)` to disable). Existing deployed rounds are unaffected
  (immutable strategy set at construction). Document the new deploy step in `contracts/` + env
  (`AAVE_POOL`, `AUSDT_ADDRESS`, `YIELD_CAP_BPS`, `YIELD_TO_CLUB`).

## 8. Risks & mitigations

- **On-chain complexity (primary):** yield accounting + Aave external calls in the money path. Mitigated
  by the optional default-off design (zero blast radius when unused), the exposure cap, `actualOut`
  tolerance, CEI + `nonReentrant`, and full fork tests before any redeploy.
- **Aave liquidity at close** → exposure cap keeps a liquid remainder; shortfall reverts+retries close.
- **No USD₮ Aave market on a chain** → strategy deployed only where a market exists; elsewhere
  `address(0)` (float stays in-round) and personal-earn shows "no market on this network".
- **Package compat** (`@tetherto/wdk-protocol-lending-aave-evm` vs pinned WDK beta) → confined to
  `getLending()` seam; unavailable → `{ available:false }`, UI degrades, build never blocked.

## 9. Task decomposition (preview)

1. `IYieldStrategy.sol` + `AaveYieldStrategy.sol` (Aave V3 adapter, access-controlled) + unit tests.
2. `RevenueShareRound.sol` optional-strategy integration (deposit on invest, withdraw+distribute-yield
   on close, exposure cap, CEI/reentrancy) — TDD; **no-strategy path leaves the 30 existing tests green**.
3. `RoundFactory.sol` strategy pass-through + deploy script + env; mainnet-fork integration tests.
4. `lib/wdk.ts` — register Aave protocol (both modes); `getLending(userId)` seam.
5. `core/lending/domain` + `server` (public APY read via UiPoolDataProvider, cached) + `lendingRouter` + wire + tests.
6. `core/lending/client` — `useLending` (position/APY/supply/withdraw) + tests.
7. `EarnCard.tsx` on `/wallet` (personal supply/withdraw, APY, position, invalidation) + docs/permalinks.
