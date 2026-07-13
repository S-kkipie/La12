# La Doce — Pitch Script (2 speakers)

> Spoken script for the live pitch. Read in English. Follows the 12 slides in `pitch-deck.pdf`.
> **Adrian** = story & business. **Ryan** = product & tech (drives the demo).
> Target: ~5 min pitch + ~2 min demo. Lines in plain text are spoken; _italics in brackets_ are stage directions.

---

## Slide 1 — Cover  ·  Adrian
_[Slide: "LA DOCE / 12". Hold a beat before speaking.]_

**Adrian:** In football, the fans call themselves *the 12th player*. They give the club everything — except they can never own a piece of it. We're changing that. This is **La Doce**: own a piece of your club's revenue. Invest in USD₮, get paid in USD₮, and hold your own keys.

**Adrian:** I'm Adrian, I'll walk you through the problem and the product. My teammate —

**Ryan:** — I'm Ryan, and I'll show you it actually works, live.

---

## Slide 2 — The problem  ·  Adrian
_[Slide: "Banks skip the barrio club. Fans have no way in."]_

**Adrian:** Small football clubs are real businesses. They sell tickets, they sell merch, they have thousands of loyal fans. But no bank lends to the neighborhood club — the only option left is loan sharks.

**Adrian:** And on the other side, the fans *want* to put money in and win alongside their club. There has never been an instrument to connect the two. That's the gap.

---

## Slide 3 — The solution  ·  Adrian
_[Slide: "Tokenized revenue-share".]_

**Adrian:** So the club raises capital in USD₮, and in return shares a percentage of a visible income stream — the gate — up to a cap. The fan invests, gets an **ERC-20 token that is their stake**, and collects their cut of every payout. All in a self-custody wallet.

**Adrian:** No bank. No intermediary. We never custody a single cent. And here's the part that makes it work: the bank won't back the barrio club — **the fan will.** They invest for love *and* return. That's what kills the cold-start problem every marketplace dies from.

---

## Slide 4 — Example  ·  Adrian
_[Slide: "Deportivo San Martín" term sheet.]_

**Adrian:** Concretely: Deportivo San Martín needs forty thousand USD₮ for floodlights. It offers 8% of the gate, capped at one-and-a-half times. Four hundred fans put in about a hundred dollars each — and they get paid every matchday, automatically, in USD₮.

**Adrian:** That's the story. Ryan's going to show you the real thing.

---

## DEMO  ·  Ryan drives
_[Ryan takes the screen. Adrian advances slides / narrates value in one-liners.]_
_[Fallback: if the live app or network hiccups, cut to the recorded run — same steps.]_

**Ryan:** Everything you're about to see runs on Tether's WDK and moves real USD₮ on-chain. Two roles: the fan, and the club. I'll be the fan.

**1. Sign up → wallet appears**
_[Create a fan account.]_
**Ryan:** I just signed up with an email. Behind that, WDK generated a **self-custody wallet** and encrypted the seed in my browser. Notice what I did *not* see — a seed phrase, a network, a gas token. It feels like any payment app.

**2. Fund with test USD₮**
_[Use the USD₮ faucet.]_
**Ryan:** I fund it with test USD₮ — one tap from our faucet, so we can run this with no real money.

**3. Discover a club**
_[Open the clubs directory → Deportivo San Martín's round.]_
**Ryan:** Here's the marketplace — the clubs raising right now. I open San Martín's round: the goal, the revenue share, the cap, the deadline.
**Adrian:** This is the front door we just shipped.

**4. Invest → get the share**
_[Invest USD₮ into the round.]_
**Ryan:** I invest. My USD₮ goes into the round contract, and I receive an **ERC-20 token — that's my stake**, sitting in my own wallet.

**5. Auto-close → money reaches the club**
_[The investment that crosses the goal.]_
**Ryan:** And that investment just crossed the goal. Watch the club's balance — the raised USD₮ **swept to the club automatically, on-chain.** No admin, nobody flipped a switch. The round flips to Active on its own.
**Adrian:** That's the club getting funded. In seconds.

**6. Distribute → claim (the wow)**
_[Switch to club → distribute; switch back to fan → claim.]_
**Ryan:** Now the club plays, the gate money comes in, and the club distributes revenue. The contract withholds the agreed percentage and splits it **pro-rata to every holder** — then, as the fan, I claim. USD₮ lands in my wallet.
**Ryan:** No oracle. No trust. Every step was on-chain, every value was USD₮.

_[Hand back to Adrian for the close — Ryan stays on for tech questions.]_

---

## Slide 8 — Why WDK  ·  Ryan
_[Slide: "La Doce is money movement. WDK is the money layer." — quick, 20s.]_

**Ryan:** Quick note on *why WDK*, since it's the whole point of the track. La Doce *is* money movement, and WDK is Tether's money layer — so the product **is** the track. Self-custody means we build zero crypto infra and custody nothing. USD₮ is the unit of account for funding, payouts, and withdrawals. And gas is paid **in USD₮** through a WDK ERC-4337 paymaster — "the fan never touches another coin" is our production config, not a slogan.

---

## Slide 9 — What's built  ·  Ryan
_[Slide: status list.]_

**Ryan:** And this is real. The revenue-share contract is thirty-for-thirty on tests and adversarially hardened. The full loop — invest, distribute, claim — is tested end-to-end. Auto-close and club discovery are the two pieces we shipped this week. The only thing still in progress is live gasless on testnet, which is a provisioning step, not code.

---

## Slide 10 — Risk  ·  Adrian
_[Slide: "Revenue-share, not equity".]_

**Adrian:** Let's name the risk before you do. Issuing shares means securities regulation. So we deliberately start with **revenue-share — economic rights** — a light, non-custodial instrument, plus self-custody. The cautionary tale is Football Index: it collapsed as opaque gambling with no real ownership. We're the opposite — ownership that's on-chain, transparent, and self-custodied.

---

## Slide 11 — Vision  ·  Adrian
_[Slide: "Start with football. Scale to LATAM's private market."]_

**Adrian:** Football is the beachhead — clubs are small businesses with fans who are emotionally all-in. But the same engine works for any private company in Peru and Latin America: a digital private market where any business raises and anyone invests from small tickets. And because the stake is already an ERC-20, a secondary market for liquidity opens up with no rewrite.

---

## Slide 12 — Close  ·  Adrian + Ryan
_[Slide: "La Doce — The 12th player is on the cap table."]_

**Adrian:** So the 12th player stops being a spectator —
**Ryan:** — and becomes an owner.
**Adrian:** La Doce. Thank you.

---

## Q&A prep (not read — keep ready)

- **"Is this a security?"** → It's revenue-share / economic rights, non-custodial, self-custody. No equity, no custody of funds or keys. We chose the lightest instrument on purpose.
- **"What stops the club from never distributing?"** → Distribution is the club's action, but once it distributes it's trustless and pro-rata — no one can skim it. Transparency + on-chain history are the pressure; roadmap is escrow on gate receipts.
- **"How is this different from Football Index / Socios?"** → Real economic rights to revenue, on-chain and self-custodied — not fantasy points or fan tokens with no cash flow.
- **"Why USD₮ and WDK specifically?"** → The product is pure money movement; USD₮ is the unit, WDK is the wallet + gasless layer. Gas paid in the token itself.
- **"Custody / regulatory exposure for the platform?"** → We hold no funds and no keys. The user's wallet is generated and encrypted client-side.
- **"Secondary market / liquidity?"** → The stake is an ERC-20, so a P2P market is *enabled* today; we haven't built it yet.
