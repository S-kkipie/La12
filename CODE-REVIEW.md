<!-- Judge-facing code-review guide. Companion to TETHER_STACK.md (stack rationale) and
     docs/code-review/ (the full internal per-area review). All links commit-pinned to 5fa556d. -->

# LA DOCE — Code Review Guide

**What this is:** a guided tour of the codebase for reviewers — the verdict, the architecture in 60
seconds, and **commit-pinned links straight to the parts worth reading**. Don't go spelunking; start
with the eight links in *Read these first*.

- **Stack rationale (what/why/how/trade-off, per WDK piece):** [`TETHER_STACK.md`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/TETHER_STACK.md)
- **Full internal review (per area, with a corrections log):** [`docs/code-review/`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/docs/code-review/README.md)
- Every permalink here is pinned to commit `5fa556d` and its line range was re-validated against that
  commit's blob, so nothing drifts as work continues.

---

## Verdict

| Dimension | Assessment |
|---|---|
| **Architecture** | Domain tri-layer (`core/<domain>/{domain,server/{repository,services,api},client}`), 7 domains, typed end-to-end (Elysia + Eden/TanStack-Query), DTOs never hand-duplicated. One deliberate seam: **WDK owns the key/money; viem drives our contract**. |
| **Money integrity** | Truth is **on-chain**; Postgres is UX/cache only. Amounts are base-unit `bigint` end-to-end (strings on the wire) — no float money math anywhere. |
| **Contract** | `RevenueShareRound` = the ERC-20 share itself, MasterChef-style **pull-based** dividend (no push loops, safely tradeable P2P). **30/30 Foundry tests**, incl. a reentrancy mock. |
| **Security posture** | Self-custody (seed AES-GCM encrypted under a **non-extractable** device key, never server-side); gas sponsor spends **only its own ETH**; permissionless-factory input **re-verified on-chain** before trust; faucet/sponsor rate-limited as a drain defense. |
| **Tether stack usage** | Tiers 1–4 wired with stated trade-offs (wallet-evm, USD₮ transfers, gas-sponsor, Indexer, MoonPay, Price Rates) + dual-mode ERC-4337 gas-in-USD₮ path. 5–6 (Velora/Aave) honestly scoped out. |
| **Honesty** | Graceful-degrade paths and stubs are **labeled as such** (fiat→1.0 fallback, Indexer→getLogs fallback, ERC-4337 proof gated on paymaster provisioning). No "we imported it" padding. |

---

## Read these first (the eight)

1. **Claim-based dividend contract — the core instrument.**
   [`RevenueShareRound.distribute()` L199-L227](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/src/RevenueShareRound.sol#L199-L227)
   · [`claim()` + `pendingReward()` L246-L266](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/src/RevenueShareRound.sol#L246-L266)
   — revenue split (`revenueBps`) and lifetime cap (`capMultiple × totalRaised`) enforced **on-chain**, with the club auto-refunded the remainder. Pull-based payout, capped at real balance so rounding dust can never brick the last claimer.

2. **The `_update` reward-debt hook — why the share is safely tradeable.**
   [`RevenueShareRound._update()` L292-L305](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/src/RevenueShareRound.sol#L292-L305)
   — every mint/burn/transfer settles `rewardDebt` on both sides so a P2P share transfer never grants or revokes already-accrued revenue. This is the single hook that makes a secondary market possible with **zero** contract change.

3. **Two-SDK seam: WDK-held key drives our contract via viem.**
   [`signer()` L165-L232](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/wdk.ts#L165-L232)
   — builds a viem `LocalAccount` that delegates `signMessage`/`signTransaction`/`signTypedData` to the WDK account. The raw private key is **never materialized in JS**; we bridge instead of extracting.

4. **Dual-mode wallet handle (plain EOA ⇄ ERC-4337 smart account).**
   [`getWallet()` + UserOp receipt poller L234-L341](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/wdk.ts#L234-L341)
   — one `WalletHandle` hides the EOA-vs-smart-account difference so no component or `contracts.ts` ever branches on mode. ERC-4337 gas is paid in USD₮; we poll the bundler for the real L1 tx hash so every downstream caller keeps using plain viem receipt-waiting unchanged.

5. **Client-side self-custody: seed encryption under a non-extractable key.**
   [device key + encrypt/decrypt L47-L79](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/wdk.ts#L47-L79)
   — BIP-39 seed AES-GCM encrypted with a per-device `CryptoKey` that is **non-extractable** (raw bytes never reach JS) and stored in IndexedDB. The server never sees the seed.

6. **Gas sponsor that can't touch the fan's money ("approach B").**
   [`fundGas()` + `closeFundingSponsored()` L19-L61](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/sponsor.ts#L19-L61)
   — relayer spends only its own Sepolia ETH; also fires the round's **permissionless** `closeFunding()` on the fan's behalf. Self-custody stays intact.

7. **Permissionless-factory defense — never trust the client's contract address.**
   [`createRoundService` on-chain re-verify L37-L47](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/core/rounds/server/services/create-round-service.ts#L37-L47)
   — anyone can deploy a round via the factory, so before the DB marks it verified we **independently read `club()` on-chain** and require it to equal the caller's address. The insert is unreachable without a passing check.

8. **Graceful degradation: WDK Indexer with a viem `getLogs` fallback.**
   [Indexer → fallback → dedupe → sort L98-L162](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/indexer.ts#L98-L162)
   — hosted Indexer when an API key is present; otherwise a 40k-block `getLogs` window (from/to queried separately, then de-duped) so the Activity view is **never empty** on Sepolia.

---

## Architecture in 60 seconds

- **Domain tri-layer.** Each `core/<domain>` splits into `domain` (types/schemas, pure), `server/{repository,services,api}` (Elysia routes over services over repos), and `client` (Eden/TanStack-Query hooks). Types flow end-to-end from Zod schema → service → Eden client; DTOs are never re-typed by hand.
- **One honest seam.** WDK is the wallet/USD₮/data layer; our pro-rata split is custom Solidity. We keep them separate on purpose — see link #3. "WDK moves USD₮" and "viem calls our contract" never get conflated.
- **On-chain is the source of truth.** Postgres holds UX/metadata + an event cache; every balance, position, and round state is (re)read from chain and only *corrected* into the DB, never trusted from it.

## Code-quality signals

- **Contract tests: 30/30** — [`RevenueShareRound.t.sol`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/test/RevenueShareRound.t.sol) (27) + [`RoundFactory.t.sol`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/test/RoundFactory.t.sol) (3), including a [`MaliciousUSDT`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/contracts/test/mocks/MaliciousUSDT.sol) reentrancy mock exercising the `nonReentrant` guards.
- **Solvency-by-construction.** `invest` and `distribute` credit off the **measured balance delta**, not the amount param — the contract stays solvent even against a fee-on-transfer token.
- **Fail-loud config.** Wallet mode / paymaster env is validated at boot, not silently defaulted ([`walletMode.ts`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/web/src/lib/walletMode.ts)).
- **Corrections log.** The internal review keeps an honest [`corrections-log.md`](https://github.com/S-kkipie/La12/blob/5fa556d386a51caefa63ed294ab01791e9f19690/docs/code-review/corrections-log.md) of issues found and fixed.

## Honest limitations (documented, not hidden)

- **ERC-4337 live proof** is gated on token-paymaster provisioning; the code path is complete and type-verified, the hosted Sepolia proof is the remaining step.
- **In-memory rate limiter** resets on restart and isn't cross-instance — correct for a single-node demo; Redis/DB swap noted before horizontal scaling.
- **Fiat display** degrades to 1.0 (USD₮≈USD peg) with a `source:"fallback"` marker rather than blocking — fiat is UX polish, never money math.
- **Indexer fallback** under-counts on very old rounds (block window) — an accepted degradation path, not the primary.
