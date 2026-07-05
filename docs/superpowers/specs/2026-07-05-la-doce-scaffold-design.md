# La Doce — Design Spec (MVP scaffold)

**Date:** 2026-07-05
**Hackathon:** Tether Developers Cup · Track **WDK** · Submission deadline **Jul 14 2026, 23:59 GMT-7**
**Status:** Approved design — ready for implementation plan

Product context in `README.md`. WDK API notes in `docs/wdk-reference.md`.

---

## 1. Goal

Tokenized **revenue-share** for football clubs: fans fund a club in USD₮ and collect a
pro-rata share of a visible revenue stream (gate/merch), with self-custody wallets. No bank,
no custody by the platform. Demo skinned around a fictional Peruvian club "Deportivo San Martín".

Instrument = **revenue-share (economic rights), NOT equity** — keeps us out of securities
regulation and out of custody (README risk #1).

**Judging lever:** criterion #5 = "real use of the chosen Tether platform (WDK)". Strategy =
exploit a wide WDK surface (wallets, Indexer, MoonPay, Price Rates, Velora, Aave), not just transfers.

**Explicitly out of scope for the hackathon:** QVAC, Pears, any non-WDK track. USD₮0 cross-chain
bridge is roadmap-only. Secondary P2P market is enabled by the ERC-20 share but not built now.

---

## 2. Stack (decided)

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | **Next.js (App Router)**, web | Runs out-of-box for judges; fastest to build; easy 3-min video |
| Off-chain data | **SQLite** (better-sqlite3 + **Drizzle**) via **Next.js API routes** | Club/round/profile metadata + event cache; money truth stays on-chain |
| Smart contract | **Foundry + OpenZeppelin** | Solidity-native, audited primitives, fast tests/fuzz |
| Distribution | **Claim-based, share = ERC-20** (dividend-token / MasterChef `accRewardPerShare`) | O(1) payout, gas-safe with N holders, share is tradeable → future P2P |
| Wallet / payments | **WDK** client-side, USD₮ on **EVM (Sepolia testnet)** | Self-custody, USD₮ native, ERC-4337 available |
| Gas model | **Sponsor via pre-fund (approach B)** | Fan never needs ETH; server pays gas only, never touches the fan's key. ERC-4337 gasless = stretch |

Monorepo: **pnpm workspace**.

---

## 3. Architecture

Three planes:

- **On-chain (money truth):** USD₮, ERC-20 share, invest/claim/distribute. Contract is the
  source of truth for funds and ownership. If the DB is wiped, funds are still on-chain.
- **Off-chain (SQLite):** club metadata (name, logo, story), round display text, `wallet↔profile`
  map, cached contract events for fast UI.
- **Client (WDK):** fan seed phrase generated and stored **encrypted in the browser (IndexedDB)**.
  True self-custody — the server never sees the key.

### Repo layout
```
La12/
├── contracts/                  # Foundry + OpenZeppelin
│   ├── src/
│   │   ├── RevenueShareRound.sol
│   │   └── RoundFactory.sol
│   ├── test/                   # Solidity unit + fuzz tests
│   ├── script/Deploy.s.sol
│   └── foundry.toml
├── web/                        # Next.js App Router
│   ├── app/
│   │   ├── (ui routes)
│   │   └── api/                # clubs, rounds, faucet, sync, profiles, moonpay
│   ├── lib/
│   │   ├── wdk.ts              # WDK wrapper: create wallet, balance, USD₮ transfer
│   │   ├── contracts.ts        # viem + ABI (invest/claim/distribute calls)
│   │   ├── indexer.ts          # WDK Indexer API: balances + history
│   │   ├── moonpay.ts          # WDK fiat on-ramp
│   │   ├── pricing.ts          # WDK Price Rates: fiat value
│   │   ├── swap.ts             # WDK Velora swap (stretch)
│   │   ├── aave.ts             # WDK Aave lending (stretch)
│   │   ├── sponsor.ts          # gas relayer (server pays gas)
│   │   └── db.ts               # SQLite + Drizzle
│   └── db/schema.ts
├── packages/abi/               # shared ABI + deployed addresses (contract → web)
└── docs/
```

**Separation of concerns:** WDK moves USD₮ (fund, withdraw) + provides data (Indexer, pricing,
on-ramp). viem drives our custom contract, signing with the WDK-derived key. SQLite is UX/metadata only.

---

## 4. Smart contracts

### `RevenueShareRound.sol` (one per round; the contract *is* the share ERC-20)
Inherits OZ `ERC20` + `ReentrancyGuard` + `Ownable`.

**Round params:** `usdtToken`, `club` (payout wallet), `goal` (USD₮), `sharePriceUsdt`,
`revenueBps` (retained %, e.g. 800 = 8%), `capMultiple` (e.g. 1.5x scaled), `deadline`.

**States:** `Funding → Active → Closed`.

**Decimals:** USD₮ = 6 decimals. Share ERC-20 uses **6 decimals** to keep 1:1 pricing simple.
All amounts are `uint256` base units.

| Function | Caller | Behaviour |
|---|---|---|
| `invest(uint amount)` | fan | pulls USD₮ (`transferFrom`) → mints share = `amount / sharePriceUsdt` pro-rata. Only in `Funding`. |
| `closeFunding()` | anyone once `goal` hit or `deadline` past | (stretch: withdraw from Aave) transfers raised USD₮ → `club`; state → `Active`. |
| `distribute(uint revenue)` | club (demo oracle) | pulls USD₮ revenue; `accRewardPerShare += revenue * ACC / totalSupply`; respects `capMultiple`. |
| `claim()` | holder | pays `pending = balance*accRewardPerShare/ACC - rewardDebt[user]` in USD₮; updates debt. |
| `pendingReward(addr)` | view | UI: claimable amount. |

**Dividend pattern:** cumulative `accRewardPerShare` + per-user `rewardDebt` = O(1) payout,
gas-safe for many holders. Share transfers update `rewardDebt` (settle on transfer) so accounting
stays correct if shares move → enables P2P secondary market later without contract changes.

**Cap:** `distribute` enforces `capMultiple` — stops rewarding once holders recovered
`cap × invested`; excess returns to `club`.

### `RoundFactory.sol`
`createRound(params)` deploys a `RevenueShareRound`, emits `RoundCreated(round, club, ...)`
(frontend/`/api/sync` reads it). Simple club→rounds registry.

### Aave integration (tier 6, stretch)
During `Funding`, raised USD₮ is deposited to Aave (via WDK `protocol-lending-aave-evm`) to earn
yield; `closeFunding` withdraws principal + yield to the club. Adds treasury surface — built last,
behind a flag so the core path never depends on it.

---

## 5. WDK integration — build tiers (cut from the bottom under deadline)

| Tier | WDK piece | Product flow | Risk |
|---|---|---|---|
| 1 | `wdk-wallet-evm` + USD₮ transfer + gas-sponsor | embedded wallet, invest, withdraw | core, low |
| 2 | **Indexer API** | `/wallet`: real balance + tx history | core, low |
| 3 | **`protocol-fiat-moonpay`** | fund with card → USD₮ | medium |
| 4 | **Price Rates / pricing** | fiat value of USD₮ + position | low |
| 5 | **`protocol-swap-velora-evm`** | invest with any token → USD₮ | medium |
| 6 | **`protocol-lending-aave-evm`** | idle round capital earns yield | high (touches contract treasury) |

**Honest scope:** tiers 1–4 = a solid, demoable MVP and the realistic commitment. Tiers 5–6 are
added only if the core is firm with margin; whatever doesn't land ships as "integration ready,
demo in roadmap" rather than a broken path.

### `lib/wdk.ts` surface
```
createWallet()      -> WDK.getRandomSeedPhrase(); encrypt + store in IndexedDB; register wallet-evm
getAccount()        -> wdk.getAccount('ethereum', 0)   (same shape for fan and club)
getUsdtBalance()    -> account.getTokenBalance(USDT)
transferUsdt(to,amt)-> account.transfer({ token: USDT, recipient, amount })
signer()            -> WDK-derived signer for viem contract calls (invest/claim)
```

### Gas sponsor (approach B)
`/api/faucet` (server) sends a small fixed amount of Sepolia ETH from a relayer wallet
(`SPONSOR_PK` in env) to a newly created address; rate-limited per address. The fan signs their
own invest/claim tx with their WDK key (self-custody intact); the server only funds gas, never
touches the fan's key. Swap-to-ERC-4337 is a config-level change in `lib/wdk.ts` if pursued.

---

## 6. Off-chain data (SQLite + Drizzle)

```
clubs    (id, name, slug, logo_url, description, wallet_address)
rounds   (id, club_id, contract_address, goal, share_price, revenue_bps,
          cap_multiple, deadline, status, created_at)
profiles (id, wallet_address, display_name, created_at)
events   (id, round_id, kind, tx_hash, amount, block, ts)   -- UI cache; on-chain is truth
```

### API routes (`web/app/api/`)
| Route | Method | Purpose |
|---|---|---|
| `/api/clubs` | GET/POST | list/create club |
| `/api/rounds` | GET/POST | list/create round (POST after on-chain deploy) |
| `/api/faucet` | POST | gas sponsor |
| `/api/sync` | POST | read contract events (viem) → cache into `events` |
| `/api/profiles` | GET/POST | profile bound to address |
| `/api/moonpay` | POST | MoonPay on-ramp session/signature (tier 3) |

**Seed script:** 1 fictional club "Deportivo San Martín" + 1 pre-deployed demo round so a judge
starts with zero friction.

---

## 7. Frontend flows (demo = the 3-min video)

**Fan flow (primary):**
1. `/` — La Doce landing (football skin) + featured club.
2. `/club/[slug]` — club profile + active round (goal, %, cap, progress bar).
3. Onboarding: "Entrar" → WDK wallet auto-created (Yape-style, no seed in the user's face) + gas covered.
4. `/wallet` — USD₮ balance (**Indexer**) + fiat value (**Price Rates**); **fund via MoonPay** (card → USD₮).
5. Invest: amount slider → `invest()` → receives ERC-20 share; round bar rises.
   (If holding another token → **Velora** swap → USD₮ → invest.)
6. `/wallet` shows "your share" + **claim** button with `pendingReward`.

**Club flow (secondary, the wow):**
7. Club panel: `distribute()` — simulates gate revenue entering → triggers payout.
   (Idle round capital shown earning yield via **Aave**, tier 6.)
8. Fan sees `pendingReward` rise → `claim()` → USD₮ lands in wallet. **Wow moment of the video.**

---

## 8. Testing

- **Contract (Foundry) — highest priority to be correct:** unit tests for invest / closeFunding /
  distribute / claim / cap; fuzz on amounts; reentrancy; decimal rounding; N-holder pro-rata;
  share-transfer settles rewardDebt; (tier 6) Aave deposit/withdraw path.
- **Integration:** e2e script on Sepolia — deploy → invest from 2 wallets → distribute → claim,
  asserting USD₮ balances.
- **Web:** smoke tests of API routes; frontend validated by running the flow (no heavy UI E2E under deadline).

---

## 9. Open config to resolve during implementation
- Sepolia RPC provider + relayer wallet funding for gas sponsor.
- USD₮ test token address on Sepolia + faucet (Pimlico / Candide mock USD₮).
- MoonPay test credentials (`MOONPAY_*` env).
- Aave + Velora testnet availability on Sepolia (fallback: mark tier as roadmap if not available on testnet).
- License: add `LICENSE` (MIT) — hackathon requires permissive license + public repo.
