# La Doce — Winning MVP Design

**Date:** 2026-07-11 · **Status:** draft for review · **Context:** Tether Developers Cup,
WDK track, Semifinal (submission Jul 12). Strategy & field analysis: [`vision.md`](../../../vision.md).

## 1. Goal & principles

Push La Doce from "most ambitious build in the field" to "clearly the winner" by dominating
the two axes judges score: **rubric** (code quality, architecture, Tether-stack usage) and
**technical wow** (features nobody else has). Sequenced in phases; **Phase 0 must land before
any wow feature.**

**Principles**
- **Claim ≤ code.** Never present a stub as done. One stub found in review poisons every claim.
- **On-chain is source of truth.** SQLite stays metadata + cache only.
- **Self-custody, never custody.** Server never holds keys; every new surface preserves this.
- **Every new surface lights up more of the Tether stack**, with a why / how / trade-off.
- **Isolation:** each feature is a bounded unit (own contract and/or lib module + page) that
  can be understood and tested independently.

## 2. Phase 0 — Foundation hardening (blocker for everything)

Clean the tape so full code review finds no loose threads.

| Item | State | Action |
|---|---|---|
| Unauth write endpoints `/api/clubs`, `/api/profiles` (insert rows, no session) | **done** | deleted; zero callers; real path is session-gated `/api/account/wallet` |
| Hardcoded `0x…dEaD` USD₮ fallback in 5 places | **done** | one `requireUsdt()` resolver in `walletMode.ts`; fail-loud; deduped `wdk.ts`/`contracts.ts` |
| Price Rates 1:1 stub sold as tier 4 | todo | wire real rates (Feature 2) OR mark roadmap in all copy |
| Device-loss = permanent fund loss (seed never shown, per-device key) | todo | opt-in seed backup now; guardian recovery in Feature 3 |
| `signer()` `TODO(wire)`: raw-bytes + typed-data unverified | todo | implement + unit-test round-trip, or document the boundary |
| `LOG_WINDOW = 40_000` undercounts holders on old rounds | todo | paginate the range, or document the cap in the UI |
| Legacy redirect stubs (`/login`, `/signup`, `club/[slug]/panel`) | todo | retire once no inbound links remain |

**Verification:** `next build` green + a manual pass of invest→distribute→claim on Sepolia in
`erc4337` mode after each change.

## 3. Feature 1 — Live P2P secondary market *(flagship)*

The share is a real ERC-20 whose `_update` settles reward-debt on transfer (a sale moves
future rewards to the buyer; the seller keeps what accrued up to the sale). So a market only
needs to **swap shares ↔ USD₮ atomically** — no change to `RevenueShareRound`.

**Design choice:** on-chain **order book, escrow-free** (approval-based). Rejected: an AMM
(constant-product pricing + impermanent loss is semantically wrong for a revenue-bearing
token and needs seeded liquidity); off-chain signed orders (0x-style — more moving parts than
a hackathon demo needs). An order book is the most **judge-legible** "working market".

**Contract — `contracts/src/ShareMarket.sol`** (`Ownable`, `ReentrancyGuard`):
- `createOrder(address round, uint256 shares, uint256 priceUsdtPerShare) → uint256 orderId`
  — maker keeps custody; must have granted this contract an allowance on `round`. Stores
  `{maker, round, shares, price, filled}`. Emits `OrderCreated`.
- `fillOrder(uint256 orderId, uint256 sharesToBuy)` — supports **partial fills**. Pulls
  `sharesToBuy` from maker→taker on `round`, pulls `sharesToBuy * price` USD₮ from
  taker→maker, takes a small protocol fee in USD₮ (bps, to `owner`). Reverts if maker's
  allowance/balance dropped (stale order). Emits `OrderFilled`.
- `cancelOrder(uint256 orderId)` — maker only. Emits `OrderCancelled`.
- Views: `order(id)`, `openOrdersByRound(round)`, `ordersByMaker(addr)`.
- Tests (`ShareMarket.t.sol`): create/fill/partial-fill/cancel, fee math, stale-order revert,
  reentrancy (malicious USD₮), self-fill guard, fee-on-transfer safety. Target parity with the
  round's adversarial suite.

**Web:**
- `web/lib/market.ts` — typed client (create/fill/cancel/read) over `WalletHandle`, mirroring
  `contracts.ts`. Reads via `publicClient`; writes gasless in `erc4337`.
- `web/app/(marketing)/market/[slug]/page.tsx` — order book per round; live bid/ask from chain.
- Components: `SellShareForm` (approve `ShareMarket` on the round, then `createOrder`),
  `OrderBook` (open orders), `FillOrderButton` (approve USD₮, `fillOrder`).
- Entry points: a "Sell / Trade" action in `wallet` `PositionsList` and on the club page.
- **Data:** orders read live from chain; SQLite may cache an `orders` view for listing speed,
  never as source of truth (same rule as `events`).

**WDK/self-custody:** every action is the fan's own signed tx; gasless via the paymaster.
Deploy `ShareMarket` via a script; address in env (`NEXT_PUBLIC_SHARE_MARKET`).

## 4. Feature 2 — Full Tether stack, actually wired

Each piece gets a lib module, a real call, and a why/how/trade-off note for the judges.

- **Price Rates** — replace the 1:1 stub in `pricing.ts` with a real WDK Price Rates call;
  support non-USD display. Trade-off: USD₮≈USD, so this is UX polish, not money math.
- **Indexer** — already REST-with-fallback; implement the `getBalances()` stub and lean on the
  hosted API in the live deploy (set `WDK_INDEXER_API_KEY`).
- **MoonPay** — verify the signed widget end-to-end; drop the hardcoded `sessionId`.
- **Velora (swap)** — `web/lib/swap.ts`: fan holds any token → swap to USD₮ before invest.
  Surface as "Fund with any token" in `AddFundsDialog`. Trade-off: adds a pre-invest step;
  keep it optional.
- **Aave (lending)** — a round's **funding float earns yield while it fills**: raised USD₮ is
  supplied to Aave during `Funding`, withdrawn on `closeFunding` before the sweep. This
  touches `RevenueShareRound` — design as an **optional strategy hook** (a pluggable
  `IYieldStrategy` the round can be constructed with) so the core stays simple and the
  no-yield path is unchanged. Trade-off: yield vs. withdrawal-liquidity risk at close — cap
  it and document.

## 5. Feature 3 — ERC-4337 maxed + social recovery

Builds on the live Safe smart-account setup.
- **Batched approve+invest** — one UserOperation instead of two signatures (approve USD₮ +
  `invest`), via the smart account's multi-call. Big UX + AA-depth win.
- **Session keys** — scoped, time-boxed keys for low-friction repeat actions.
- **Guardian / social recovery** — recover the Safe on a new device via guardians, **closing
  the device-loss = funds-lost hole** (Phase 0). This is the account-abstraction flex *and* a
  real product fix.
- Preserve self-custody: guardians are the user's choice; server never a guardian by default.

## 6. Feature 4 — On-chain revenue oracle (proof-of-gate)

Make distributions **trust-minimized** instead of "club clicks distribute".
- A signed revenue feed (operator-signed to start; Chainlink Functions pulling a ticketing
  API as the trustless target) attests gate revenue for a round.
- `RevenueShareRound.distribute` (or a wrapper) accepts an attested amount; the club can't
  inflate/deflate beyond what's attested.
- Trade-off: full trustlessness needs a real data source; ship the signed-feed MVP and name
  the Chainlink path as the next step. Kills the "the club can lie about revenue" critique.

## 7. Demo (≤3 min, carries ~80%)

One continuous take of the money moving: **gasless invest** (show gas paid *in USD₮* + Candide
tx hash) → club **distributes** → USD₮ **auto-lands** in the fan's wallet → fan **sells** the
stake on the secondary market → (optional) recover the wallet on a "new device" via a guardian.
Narrate each decision. Add commit-pinned permalinks to: the dividend math
(`RevenueShareRound.sol` distribute/claim/`_update`), the WDK→viem signer bridge (`wdk.ts`),
the on-chain ownership check (`api/rounds/route.ts`), and `ShareMarket.fillOrder`.

## 8. Build order

1. **Phase 0** finish (blocker). 2. **Feature 1** secondary market (flagship — biggest
separation, already half-enabled by the ERC-20). 3. **Feature 2** stack breadth (rubric
points; independent, parallelizable). 4. **Feature 3** AA + recovery (fixes real flaw).
5. **Feature 4** oracle (trust-minimization). 6. **Demo + permalinks** last, over the finished
build.

## 9. Open questions

- Aave float-yield: worth the `RevenueShareRound` surface change for the demo, or keep as a
  documented design with a standalone proof? (Leaning: standalone proof to protect the core.)
- Secondary market fee: protocol fee on, or off for the demo to keep it clean?
- Oracle: signed-feed only for the demo, or attempt a live Chainlink Functions call?
