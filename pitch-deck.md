---
marp: true
theme: default
paginate: true
size: 16:9
title: La Doce — Tokenized Revenue-Share for Football Clubs
description: WDK track semifinal deck. Own a piece of your club's revenue. Invest in USD₮, get paid in USD₮, self-custody.
---

<!--
La Doce — pitch deck (source of truth = this file; export to PDF with `marp pitch-deck.md --pdf`).
Track: Build with WDK. Audience: Tether semifinal judges (full code review + demo).
Content sourced from TETHER_STACK.md, docs/pitch/propuesta-de-valor-y-producto.md,
docs/pitch/tether-como-y-por-que.md, aligned with pitch-script.md (2-speaker: Adrian=story, Ryan=demo).
Speaker notes live in HTML comments under each slide.
-->

<style>
section { font-size: 26px; }
section h1 { color: #0a7cff; }
section.lead h1 { font-size: 72px; }
section.lead h2 { color: #444; font-weight: 400; }
strong { color: #0a7cff; }
table { font-size: 22px; }
</style>

<!-- _class: lead -->

# LA DOCE · 12

## Own a piece of your club's revenue.

Invest in **USD₮**. Get paid in **USD₮**. Hold your own keys.

*Tokenized revenue-share for football clubs — built on Tether WDK.*

<!--
Adrian: In football, fans call themselves the 12th player. They give the club everything — except they can never own a piece of it. We're changing that. This is La Doce.
Hold a beat on the cover before speaking.
-->

---

# The problem

**Two sides that were never connected.**

- 🏟️ **The barrio club is a real business** — tickets, merch, thousands of loyal fans. But **no bank lends to it.** The only door left is the loan shark.
- 🙋 **The fan wants to put money in and win alongside the club** — not a donation into a void. **No instrument ever existed** to link the two.

A LatAm-shaped gap: businesses without credit + people who want to invest small tickets, no easy access to dollars or markets.

<!--
Adrian: Small clubs are real businesses — but the bank skips them, and the fan has no way in. That's the gap.
-->

---

# The solution

**Tokenized revenue-share.**

Club raises capital in USD₮ → shares a % of a **visible income stream (the gate)**, up to a cap.

Fan invests → receives an **ERC-20 token that *is* their stake** → collects a pro-rata cut of every payout.

All in a **self-custody** wallet. **We never custody a cent.**

> The bank won't back the barrio club — **the fan will.** Love *and* return. That's what kills the cold-start every marketplace dies from.

<!--
Adrian: No bank, no intermediary, we custody nothing. The fan is the liquidity the club never had.
-->

---

# Example — Deportivo San Martín

| Term | Value |
|---|---|
| Raise | **40,000 USD₮** (floodlights) |
| Revenue share | **8% of the gate** |
| Cap | **1.5×** |
| Backers | ~400 fans · ~100 USD₮ each |

Every matchday they get paid **automatically, in USD₮**, until the cap is hit.

The club financed itself with its own people. The people win with their club.

<!--
Adrian: Concrete numbers. Then — Ryan shows the real thing.
-->

---

# The product — one contract, two roles

**Club:** create a round (goal, %, cap, deadline) → round fills → USD₮ **auto-sweeps to the club, on-chain** → income arrives → **distribute** (contract withholds the % and splits pro-rata).

**Fan:** sign up (wallet appears) → fund in USD₮ → browse the **club directory** → **invest** (get the ERC-20 stake) → **claim** payouts to your wallet.

Around it: **gas sponsored** (fan never sees ETH), club + fan dashboards, **fiat on-ramp**, real transfer history.

<!--
Ryan: This is the whole loop — and it's clickable. Let me show it.
-->

---

<!-- _class: lead -->

# DEMO

**Everything runs on WDK and moves real USD₮ on-chain.**

Two roles: fan + club. I'll be the fan.

<!--
Ryan drives the screen; Adrian narrates value in one-liners.
Fallback: if the app or network hiccups, cut to the recorded run — same steps.
-->

---

# Demo — the 6 beats

1. **Sign up → wallet appears.** WDK made a self-custody wallet, seed encrypted in my browser. I saw **no seed, no network, no gas token.** Feels like a payment app.
2. **Fund in USD₮** — one tap (card via MoonPay, or test faucet in the demo).
3. **Discover a club** — the directory of rounds raising now → open San Martín.
4. **Invest → get the stake** — my USD₮ enters the round contract, an **ERC-20 stake** lands in my wallet.
5. **Auto-close → sweep** — the round crossed goal; USD₮ **swept to the club automatically, on-chain. Nobody flipped a switch.**
6. **Distribute → claim (the wow)** — contract splits pro-rata; I claim; USD₮ hits my wallet. **No oracle, no trust. Every value in USD₮.**

<!--
Beat 6 is the payoff — land it slowly.
-->

---

# Why WDK — USD₮ is the product, not a detail

La Doce doesn't "use crypto." **USD₮ is the unit of account for everything** — invest, fund, distribute, claim.

For a LatAm fan (inflation, no easy dollars, no bank that holds), a **global, bankless, cross-border digital dollar is exactly the missing instrument.** Take USD₮ out → there is no product.

We needed **self-custody without friction + a full stack** (wallet, transfers, history, fiat on-ramp, prices, swap, lending). WDK gives both — so we build **native to the stack, not bolted on.**

<!--
Ryan: La Doce IS money movement, and WDK is Tether's money layer — the product is the track.
-->

---

# The Tether stack — chosen, wired, with trade-offs

| Piece | Why | How (wired) | Trade-off |
|---|---|---|---|
| **Wallet self-custody** (tier 1) | fan owns funds, server can't move them | seed made client-side, AES-GCM + non-extractable device key, IndexedDB | key bound to browser → recovery via export (roadmap: ERC-4337 social) |
| **USD₮ transfers** (tier 1) | invest & claim are USD₮ moves | one `WalletHandle`, base-unit `bigint`, 6-decimals | `bigint` discipline end-to-end vs floats |
| **Gas sponsor + ERC-4337** (tier 1) | new fan has 0 ETH; mainnet pays gas in USD₮ | relayer spends only its own ETH (approach B); Safe + paymaster; **per-address rate-limit = drain defense** | live gasless gated on paymaster provisioning |
| **Indexer** (tier 2) | real USD₮ history, fast | REST + **viem `getLogs` fallback** → never empty | fallback under-counts very old rounds |
| **MoonPay** (tier 3) | fund with a card, no crypto first | HMAC-signed widget URL, server-side secret | signed URL vs full SDK; webhook recon = roadmap |
| **Price Rates** (tier 4) | show balance in local fiat | Bitfinex rate, cached, **USD peg → 1.0 fallback** | UX polish, not money math |

<!--
Judges score "we used it" far below "we chose it for X, wired it like Y, accepted trade-off Z." This slide is that, per piece. Permalinks in TETHER_STACK.md.
-->

---

# What's built (honest)

- ✅ **Contracts** — `RevenueShareRound` + `RoundFactory` + `MockUSDT`, **30/30 Foundry tests**, deployed on Sepolia.
- ✅ **Full loop tested** — invest → auto-close/sweep → distribute → claim.
- ✅ **Self-custody wallet** (seed encrypted in browser), club + fan dashboards, club directory, MoonPay signed on-ramp, gas sponsor, **ERC-4337 dual-mode in code**.
- ✅ **Backend** migrated to a clean tri-layer (Elysia + Eden), typed end-to-end.
- 🔜 **Roadmap (designed, not claimed):** Price Rates fiat, P2P secondary market, invest-with-any-token (Velora), funding-float yield (Aave).

> **Rule:** the promise never exceeds the code. One stub found in review poisons every other claim.

<!--
Ryan: The only thing still in progress on the committed tiers is live gasless on testnet — a provisioning step, not code.
-->

---

# Revenue-share, NOT equity (naming the risk)

The instrument is **economic rights over a revenue stream** — deliberately **not equity**. That's what makes it viable:

- **No custody** of funds or keys (full self-custody).
- **Not a corporate security** — no ownership sold; a capped income share, on-chain and transparent.
- Club **cedes no control**; fan **assumes no liabilities**.

Cautionary tale: **Football Index** collapsed as opaque gambling with no real ownership. We're the opposite — ownership that is on-chain, transparent, self-custodied.

<!--
Adrian: We picked the lightest instrument on purpose. Compliance-first.
-->

---

# Why we win — the moat

We are the **only** project in the field with a **real financial instrument**:

- Custom `RevenueShareRound` contract — **ERC-20 share + MasterChef-style dividend accumulator**, on-chain cap + forced refund, transferable via reward-debt settlement, **30/30 adversarial tests**.
- **ERC-4337 gasless genuinely wired** — gas paid in USD₮ via paymaster.

Most of the field is *wallet + a USD₮ transfer.* That ambition is the moat.

**We win by delivering more than we promise.**

<!--
Ryan: Point the judges at the permalinks — the contract and the self-custody seam are what we're proud of.
-->

---

# Vision — beyond football

Football is the **beachhead**. The same engine is a **private capital market for LatAm**:

any small business raises, anyone invests from a small ticket, dividends land in USD₮, and the blockchain is invisible.

Because the stake is **already an ERC-20**, a **secondary market opens with no contract rewrite** — fans buy and sell their share.

> *Football Index — but real, on-chain, self-custody, with a secondary market that works.*

<!--
Adrian: Start with football. Scale to LatAm's private market.
-->

---

<!-- _class: lead -->

# La Doce

## The 12th player is on the cap table.

**Adrian:** The 12th player stops being a spectator —
**Ryan:** — and becomes an owner.

*Thank you.*

<!--
Close together. Ryan stays on for tech Q&A.
Q&A prep: security? → revenue-share/economic rights, non-custodial. Club never distributes? → trustless & pro-rata once it does; roadmap escrow on gate. Vs Football Index/Socios? → real cash-flow rights, on-chain, self-custody. Why WDK? → product is pure money movement. Platform custody/reg? → hold no funds, no keys. Secondary market? → ERC-20 enables it, not built yet.
-->
