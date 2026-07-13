# La Doce — Vision & Winning Strategy

> *The 12th player stops being a spectator and becomes an owner.*

This document is the north star for La Doce's push through the Tether Developers Cup.
It records **where we are**, **who we're up against**, and **the decisions** about how we
win. The implementation detail lives in the spec: `docs/superpowers/specs/`.

---

## 1. North star

Tokenized **revenue-share** for football clubs. Fans fund a club in USD₮ and collect a
pro-rata share of a real income stream (the gate), self-custodied and on-chain. Football is
the beachhead; the same engine becomes a **private capital market for LATAM** — any small
business raises, anyone invests from a small ticket, dividends in USD₮, blockchain invisible.

Because the fan's stake is already an ERC-20, a **secondary market opens with no contract
rewrite** — that unlocks the flagship feature below.

---

## 2. Competition context

- **Track:** WDK. **Status:** advanced to the Round of 16 → **Semifinal (submission Jul 12, 23:59 GMT-7)**; top 4 become finalists.
- **What judges score this round:** full **code review** (code quality, architecture, and how
  effectively we use the Tether stack) + an updated **demo video (≤3 min)** that carries ~80%
  of the impression.
- **Judges asked explicitly for:** commit-pinned permalinks to our best code, and an account
  of **every** Tether-stack piece we use — *why we chose it, how we wired it, the trade-off*.
  "We used it" scores far below "we chose it for X, wired it like Y, here's the trade-off."

### The field (5 WDK rivals)

| Rival | What it is | Their edge | Their gap |
|---|---|---|---|
| **Tarkam** | USDT prize escrow for grassroots tournaments | "Zero mocks", honest, polished, seed backed up once | Simple pool; no financial instrument |
| **FanBank** | Tips + fundraisers + parimutuel markets | Real transfers, audit tab, open mint | Operator wallet = escrow *and* demo fan; broad but shallow |
| **TTerminal** | CLI wallet → bridge → Polymarket bets | Multichain, real Relay + Polymarket | Money layer is external, not Tether; niche |
| **CupTreasury** | Team treasury (contributions, approvals) | WDK CI smoke test | **Browser payments simulated** |
| **MESHIPAY** | P2P ticketing over Pears + WDK | Novel P2P angle | Cross-track dilutes WDK depth; thin |

### Our differentiator

We are the **only** project in the field with a real **financial instrument**: a custom
`RevenueShareRound` (ERC-20 share + MasterChef dividend accumulator, cap+refund enforced
on-chain, tradeable via reward-debt settlement, 30/30 adversarial tests) plus **genuinely
wired gasless ERC-4337** (gas paid in USD₮ via a Candide paymaster, live). Everyone else is
wallet + USD₮ transfer. **That ambition is our moat — and our risk.**

---

## 3. Winning strategy

**Dominate on two axes: the judge rubric + technical wow.** Real-world traction and
narrative are secondary (still present, not the lead).

- **Rubric axis** is deterministic: clean code, honest claims, permalinks to the hard bits,
  a per-piece account of the Tether stack, and a demo that shows the money actually moving.
- **Wow axis** is where "infinite time" is spent: build what nobody else in the field has,
  and use it to light up more of the Tether stack.

**Guiding principle: never let claim exceed code.** A single stub found in code review
(e.g. a 1:1 price stub sold as "done") poisons trust in every other claim. We win by
delivering *more* than we promise — the way Tarkam does with "zero mocks".

---

## 4. The wow features (decided)

Built in this order. Each one separates us from the field **and** raises the "used the whole
Tether stack" score.

1. **Live P2P secondary market** *(flagship)* — the ERC-20 share is already tradeable
   (`_update` settles reward-debt on transfer). Build an in-app order-book / AMM so fans
   **buy and sell their revenue-share stake in USD₮**. No rival has a financial instrument,
   let alone a market for it. "Football Index — but real, on-chain, self-custodied, with a
   working secondary market."

2. **Full Tether stack, actually wired** — Indexer (real history), Price Rates (real fiat
   display, kill the 1:1 stub), MoonPay on-ramp, **Velora swap** (fan brings any token →
   USD₮ to invest), **Aave** (a round's funding float earns yield while it fills). Velora +
   Aave are the pieces nobody else touches — direct hit on the rubric's stack axis, each with
   why / how / trade-off.

3. **ERC-4337 maxed + social recovery** — batched approve+invest in **one** UserOp (no
   double-signing), session keys, and **guardian/social recovery** of the smart account.
   Fixes the device-loss = funds-lost flaw (see §5) *and* flexes account abstraction.

4. **On-chain revenue oracle (proof-of-gate)** — instead of the club calling `distribute` by
   hand, a signed feed / Chainlink Functions attests real gate revenue → **trust-minimized**
   distributions. Kills the "the club can lie about revenue" critique.

---

## 5. Honest current state

**Real & shipped:** `RevenueShareRound` + `RoundFactory` + `MockUSDT` (30/30 tests);
WDK standard + erc4337 wallet wiring; invest / approve / claim / distribute / closeRound /
createRound; auth with server-side role + on-chain ownership gates; self-custody seed
encryption; auto-close funding; positions / holders / distributions from **live on-chain
reads** (SQLite is metadata + `verified` allowlist only, recoverable from chain); live gasless
deploy on real Candide infra at https://la12.aido.lat.

**Stub / thin / risk (being addressed):**
- Price Rates = 1:1 stub → **do not claim as done** until wired (wow #2).
- Indexer `getBalances()` stub; MoonPay `sessionId` hardcoded — thin, not deep.
- Velora / Aave = not present (roadmap → wow #2).
- **Device-loss = permanent fund loss:** seed is encrypted with a non-extractable per-device
  key and never shown to the fan; clearing storage / switching phone strands the wallet.
  Worse self-custody than Tarkam (which backs the seed up once). → fixed by wow #3 + an
  opt-in backup.

---

## 6. Phase 0 — fix the tape first (before any wow feature)

Clean the foundation so code review finds no loose threads:

- **Done:** deleted dead unauthenticated write endpoints `/api/clubs` + `/api/profiles`
  (inserted rows with no session check); centralized the USD₮ address behind one
  `requireUsdt()` resolver and removed the hardcoded `0x…dEaD` fallback (was a silent
  gasless-break risk).
- **Next:** wire (or stop claiming) Price Rates; add opt-in seed backup; tighten the
  `signer()` `TODO(wire)` gaps; document the `LOG_WINDOW` holder-undercount caveat; retire
  legacy redirect stubs.

---

## 7. Demo (80% of the impression)

Script the wow moment end to end: **gasless invest** (show gas paid *in USD₮*, real Candide
tx hash) → club **distributes** → USD₮ **lands by itself** in the fan's wallet → fan **sells**
their stake on the secondary market. Show the thing working; narrate every decision.
