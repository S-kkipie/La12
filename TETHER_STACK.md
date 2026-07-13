# LA DOCE — Tether Stack: what we used, why, and how

**Track:** Build with WDK. **Product:** tokenized **revenue-share** for football clubs — fans fund a
club in USD₮, hold an ERC-20 share, and claim pro-rata revenue, all from a **self-custody** wallet.
The instrument is economic rights (revenue-share), **not equity** — no custody, no securities.

> **Permalinks:** links below point at `main`. Before final submission we pin them to the submission
> commit (open the file on GitHub, press `y`). File + line ranges are exact as of the linked commit.

Each piece follows the same shape the judges asked for: **What · Why we chose it · How we wired it
· Trade-off we accepted.**

---

## 1. WDK Wallet (EVM) + Core — self-custody embedded wallet · **tier 1**

**What.** `@tetherto/wdk` + `@tetherto/wdk-wallet-evm`: the fan's non-custodial wallet, created in the
browser.

**Why.** A fan should own their funds with zero seed-management friction and **the server must never
be able to move their money**. WDK gives us BIP-39 seed generation + an EVM account without us
hand-rolling key management.

**How.** The seed is generated client-side (`WDK.getRandomSeedPhrase()`), **AES-GCM encrypted with a
non-extractable per-device `CryptoKey`**, and stored in IndexedDB — it never leaves the browser and
the server never sees it. Wallets are **namespaced per Better-Auth `userId`** so a club and a fan
signing in on the same browser never share a wallet.
- Encryption + non-extractable device key: [`web/src/lib/wdk.ts#L47-L79`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/wdk.ts#L47-L79)
- Create/persist, per-user keying: [`web/src/lib/wdk.ts#L125-L136`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/wdk.ts#L125-L136)
- Browser-only KV store: [`web/src/lib/storage.ts`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/storage.ts)

**Trade-off.** A non-extractable device key means the seed is bound to that browser profile — great for
custody, but recovery needs an explicit export/import flow (roadmap: WDK social recovery via ERC-4337).
We accepted device-binding over storing anything server-side.

---

## 2. WDK-signed key drives our own contract via viem

**What.** WDK holds the key; **viem drives our `RevenueShareRound` contract**, signing through the
WDK-derived account. Two SDKs, one clean seam — we never conflate "WDK moves USD₮" with "viem calls
our contract."

**Why.** WDK is the money/wallet layer; our pro-rata split is a custom Solidity contract. WDK
deliberately never exposes the raw private key (memory-safe), so we bridge instead of extracting.

**How.** `signer()` builds a viem `LocalAccount` whose `signMessage`/`signTransaction`/`signTypedData`
delegate to the WDK account's own signing methods — the raw key is never materialized in JS.
- [`web/src/lib/wdk.ts#L165-L232`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/wdk.ts#L165-L232)

**Trade-off.** Delegated signing means adapting viem's transaction union to WDK's `EvmTransaction`
shape (a narrow cast at the boundary) rather than a one-line `privateKeyToAccount`. Worth it — the key
stays in WDK's custody.

---

## 3. USD₮ transfers + balances

**What.** USD₮ in/out of the fan wallet and balance reads, in both wallet modes.

**Why.** USD₮ is the unit of account for the whole product (fund, distribute, claim). WDK's account
gives us `transfer`/`getTokenBalance` for USD₮ (6-decimals, base-unit `bigint`) without touching ABIs.

**How.** A single `WalletHandle` (`getWallet(userId)`) hides the standard-EOA vs smart-account
difference so components and `contracts.ts` never branch on mode; `transferUsdt`/`getUsdtBalance`
route through the WDK account.
- [`web/src/lib/wdk.ts#L256-L341`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/wdk.ts#L256-L341)

**Trade-off.** Amounts are always base-unit `bigint` end-to-end (strings on the wire) — more ceremony
than floats, but no precision loss on money. Fiat is display-only (see §7).

---

## 4. Gas sponsorship — "approach B" (server pre-funds, never touches the fan key) · **tier 1**

**What.** The server relayer sends a small fixed amount of Sepolia ETH so a fan can pay gas for their
own invest/claim, and can call the permissionless `closeFunding()` on their behalf.

**Why.** New fans arrive with 0 ETH. We keep **self-custody intact** — the relayer only ever spends its
own ETH, never the fan's key. (ERC-4337 gas-in-USD₮ is the mainnet path; see §6.)

**How.** `fundGas()` sends from a server-only `SPONSOR_PK`; `closeFundingSponsored()` triggers the
round's own permissionless close. **The relayer key is a real funded account, so an unthrottled faucet
is a drain vector** — every faucet endpoint is rate-limited **per address, per endpoint** (independent
gas vs test-USD₮ buckets), 1 call/hour.
- Relayer, own-ETH-only: [`web/src/lib/sponsor.ts#L19-L61`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/sponsor.ts#L19-L61)
- Per-endpoint rate limiter (drain defense): [`web/src/core/ops/server/rate-limit.ts`](https://github.com/S-kkipie/La12/blob/main/web/src/core/ops/server/rate-limit.ts)

**Trade-off.** The in-memory limiter resets on restart and isn't shared across instances — fine for a
single-node demo box; we documented the swap to Redis/DB before horizontal scaling. We chose the simple
correct-for-now version over premature infra.

---

## 5. WDK Indexer API — USD₮ transfer history · **tier 2**

**What.** Real USD₮ transfer history for the wallet Activity view.

**Why.** Reading history straight from RPC logs is slow and range-capped on public nodes; the hosted
Indexer is the right tool for cross-block history.

**How.** REST call to `wdk-api.tether.io` with `x-api-key` (server-only), with a **graceful fallback to
viem `getLogs`** (40k-block window, from/to queried separately then de-duped) so Activity is **never
empty** even without an Indexer key on Sepolia. Tolerant field-mapping because payload shapes vary.
- Indexer + fallback + dedupe: [`web/src/lib/indexer.ts#L98-L162`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/indexer.ts#L98-L162)

**Trade-off.** The RPC fallback under-counts on very old rounds (the block window), which we accept as a
degradation path, not the primary — documented and demo-safe.

---

## 6. ERC-4337 gasless — dual-mode wallet (gas paid in USD₮) · **tier 1 (mainnet path)**

**What.** A build-time switch (`NEXT_PUBLIC_WALLET_MODE`) between a plain EOA (`standard`, local anvil
demo) and a **Safe smart account** (`erc4337`) whose gas is paid in USD₮ via a paymaster.

**Why.** The cleanest mainnet UX is "fan holds only USD₮, never ETH." ERC-4337 + a token paymaster
delivers exactly that; keeping `standard` mode preserves a zero-dependency local demo.

**How.** `getWallet()` returns one `WalletHandle` for both modes. In `erc4337` mode `execute()` sends a
**UserOperation** (arbitrary contract calldata verified against the installed package's types), and we
poll the bundler's own receipt endpoint for the real L1 tx hash so every downstream caller keeps using
plain viem receipt-waiting unchanged.
- Dual-mode handle + UserOp path: [`web/src/lib/wdk.ts#L234-L341`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/wdk.ts#L234-L341)
- Mode/paymaster config (fail-loud env): [`web/src/lib/walletMode.ts`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/walletMode.ts)

**Trade-off.** Live gasless proof on Sepolia is gated on paymaster provisioning (Candide token
paymaster); the code path is complete and type-verified, the hosted proof is the remaining step. We
chose to ship the abstraction correct now rather than block on external provisioning.

---

## 7. WDK Price Rates — USD₮ → fiat display · **tier 4**

**What.** Show the fan's USD₮ balance and positions in their chosen fiat (USD/EUR/GBP).

**Why.** Fans think in local currency. Price Rates (`@tetherto/wdk-pricing-bitfinex-http`, Bitfinex-
backed) gives real rates without us running a price feed.

**How.** Server-side `getCurrentPrice("USDT", ccy)`, cached (60s), surfaced on `/wallet` via a currency
selector. **USD short-circuits to 1.0 (the peg baseline); any upstream miss degrades to 1.0 with a
`source:"fallback"` marker** shown as `≈` — never a fabricated foreign rate. Conversion is display-only
(`Number()` on a `bigint`, never fed back into money math).
- Design + contract: [`docs/superpowers/specs/2026-07-12-p7-pricing-slice-design.md`](https://github.com/S-kkipie/La12/blob/main/docs/superpowers/specs/2026-07-12-p7-pricing-slice-design.md)

**Trade-off.** USD₮≈USD, so fiat is **UX polish, not money math** — which is exactly why the failure mode
is "show USD" rather than block the page. (Landing this cycle; until then `lib/pricing.ts` is a 1:1
stub, honestly labeled.)

---

## 8. WDK MoonPay — fiat on-ramp · **tier 3**

**What.** "Add funds" → card-in, USD₮-out, straight to the fan's self-custody address.

**Why.** Removes the "go get crypto first" barrier — a fan can fund a club with a card.

**How.** Builds a MoonPay widget URL **HMAC-signed server-side** with `MOONPAY_SECRET_KEY` (required for
a production widget); the secret never reaches the client.
- [`web/src/lib/moonpay.ts`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/moonpay.ts)

**Trade-off.** Signed URL over a fuller SDK embed — fastest correct integration for the demo; deeper
webhook reconciliation is roadmap.

---

## 9. Test USD₮ faucet (MockUSDT) — demo enablement

**What.** Mints test USD₮ so the full invest→distribute→claim loop is clickable with zero real money.

**How.** Mirrors the sponsor relayer (same server-only key, never the fan's), against `MockUSDT.mint()`;
rate-limited by the same per-endpoint bucket as gas (§4).
- [`web/src/lib/faucetUsdt.ts`](https://github.com/S-kkipie/La12/blob/main/web/src/lib/faucetUsdt.ts)

---

## Stack pieces we deliberately did NOT ship (honest scope)

- **Velora (swap)** — "fund with any token → swap to USD₮" — roadmap. Adds a pre-invest step; kept
  optional.
- **Aave (lending)** — idle funding-float earns yield while a round fills — roadmap; designed as an
  optional `IYieldStrategy` hook so the core contract stays simple and the no-yield path is unchanged.
- **USD₮0 bridge, TON/BTC/Solana wallets** — out of scope for an EVM revenue-share MVP.

We'd rather show fewer pieces **actually wired with a stated trade-off** than a longer list of "we
imported it."

---

## Architecture highlights (not WDK, but where the engineering lives)

- **Domain tri-layer** (`core/<domain>/{domain,server/{repository,services,api},client}`) — a faithful
  Elysia + Eden/TanStack-Query port; typed end-to-end, DTOs never hand-duplicated. Seven domains:
  wallet, account, clubs, rounds, directory, ops, pricing.
- **Permissionless-factory defense** — anyone can deploy a round via the factory, so `createRound`
  **independently re-verifies on-chain that the round's `club()` equals the caller's address** before
  the DB ever marks it verified; the insert is unreachable without a passing check.
  [`web/src/core/rounds/server/services/create-round-service.ts#L37-L47`](https://github.com/S-kkipie/La12/blob/main/web/src/core/rounds/server/services/create-round-service.ts#L37-L47)
- **Claim-based dividend contract** — `RevenueShareRound` (30/30 Foundry tests): `invest` → `closeFunding`
  → `distribute` → **pull-based `claim`/`pendingReward`** (magnified-dividend pattern, no push loops).
  [`contracts/src/RevenueShareRound.sol#L246-L261`](https://github.com/S-kkipie/La12/blob/main/contracts/src/RevenueShareRound.sol#L246-L261)
- **Money truth on-chain** — SQLite/Postgres is UX/cache only; every balance/position is read from the
  chain, never trusted from the DB.
