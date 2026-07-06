# Spec A — Fan Wallet Dashboard (design)

> Part 1 of 2. Companion: `2026-07-06-club-revenue-dashboard-design.md` (Spec B).
> Both adopt the shared **dashboard shell** defined here (built in A, reused by B).

**Date:** 2026-07-06 · **Track:** WDK hackathon · **Deadline:** 2026-07-14

## 1. Goal

Turn the fan's `/wallet` page from a single stacked card into a **fully operable
wallet dashboard** in the "bold stadium" language, modeled on the Stitch
"FinNode Dashboard — Overview" mockup (`.stitch` / scratchpad reference). A fan
can see their USD₮ balance, **send** and **receive** USD₮, **add funds**
(MoonPay + testnet faucets), see their **positions** (rounds they hold shares
in) with per-round **claim**, and read their real **transaction activity**.

Money truth stays on-chain (CLAUDE.md). SQLite is UX/metadata + event cache only.

## 2. Scope

**In (Spec A):**
- Shared dashboard shell: `app/(app)/` route group + sidebar + topbar (role-aware).
- Fan Wallet Overview page (`/wallet`): hero balance, stat row, Positions, Activity.
- Full activity page (`/wallet/activity`).
- Operations as dialogs: **Send**, **Receive** (QR), **Add funds**.
- Per-position **Claim**.
- Plumbing: `lib/positions.ts`, wired `lib/indexer.ts` (real Indexer + `getLogs`
  fallback), `lib/moonpay.ts` signed-URL upgrade, `/api/wallet/positions`,
  `/api/wallet/history`.

**Out (Spec A):**
- Any club-side page (Spec B).
- Time-series balance chart — **no historical-balance source on Sepolia; faking
  it in a money UI is misleading.** The chart lives in Spec B (real `events`
  data). Fan centerpiece = real Positions.
- Swap (Velora) / lending (Aave) — WDK tiers 5–6, roadmap.
- Off-ramp (MoonPay sell) — roadmap.
- Editing/rotating the seed, multi-account switching — unchanged from today.

## 3. Design language (reuse, do not re-derive)

Tokens already shipped in `web/app/globals.css` (bold-stadium): `--background
#0b0f0d`, `--card #131a16`, `--foreground #e8f0ea`, `--primary #b6ff3c`,
`--primary-foreground #08120a`, `--muted-foreground #8fa397`, `--border
#1f2a23`, `--radius 0.625rem`, `.glow`, Bebas Neue `font-display`. **Do not
introduce new colors or fonts.** The lime hero card = `bg-primary
text-primary-foreground`; big numbers = `font-display`; addresses/amounts =
`font-mono`.

Icons: `lucide-react` (already a dep). shadcn style = **base-nova**
(`@base-ui/react`, NOT Radix): `Button` has no `asChild` — use
`buttonVariants()` + `cn()` on a `<Link>`; menu/dialog items use `render={...}`.

## 4. Architecture

### 4.1 Route group + shell

Introduce `app/(app)/` for authenticated dashboard pages. Move `/wallet`,
`/wallet/activity` (new), and later Spec B's `/dashboard` into it. The group's
`layout.tsx` renders the shell; the marketing surface (`/`, `/auth/*`,
`/account/*`) keeps the existing `Navbar`.

**Root layout change** (`app/layout.tsx`): remove `<Navbar />` from the root.
Add `<Navbar />` to the marketing pages instead — simplest concrete move:
create `app/(marketing)/layout.tsx` that renders `<Navbar/>{children}` and move
`app/page.tsx` (landing) under it; `/auth` and `/account` render `<Navbar/>`
inline in their own layouts (they already own their layout files). Root keeps
only `<Providers>`, `<Toaster>`, fonts, `<html>`. The `(app)` group renders the
shell, never the Navbar.

> Route groups (`(app)`, `(marketing)`) do not change URLs — `/wallet` stays
> `/wallet`. They only pick which layout wraps the page.

### 4.2 Shell components (`components/shell/`)

- **`DashboardShell({ children, role, title })`** — server component. CSS grid:
  fixed `Sidebar` (w-64, `hidden md:flex`), `Topbar`, scrollable `<main>`.
  Background inherits the body glow already in globals.css.
- **`Sidebar({ role })`** — client (needs `usePathname` for active state). LA
  DOCE display mark (links `/`), role-aware `NavList`, a primary CTA button at
  the bottom, a Support link. Active item: `text-primary` + left lime bar.
  - Fan items: `{ href:"/wallet", label:"Overview", icon:LayoutGrid }`,
    `{ href:"/", label:"Explore clubs", icon:Compass }`,
    `{ href:"/wallet/activity", label:"Activity", icon:ReceiptText }`,
    `{ href:"/account/settings", label:"Settings", icon:Settings }`.
  - Fan CTA: "Add funds" → opens Add-funds dialog (emits an event / uses a
    shared `useDialog` store — see 4.5). Club items/CTA defined in Spec B.
- **`Topbar({ title })`** — client. Left: `title` (the page name). Right:
  **`WalletModeChip`** + account dropdown (extract the dropdown from `Navbar`
  into `components/shell/AccountMenu.tsx`, reused by both Navbar and Topbar).
  Mobile: a hamburger that opens the Sidebar in a base-ui `Dialog` drawer.
- **`WalletModeChip`** — client. Reads `walletMode()`; renders `Gas in USD₮`
  (erc4337) or `Sepolia testnet` (standard) as a `Badge`.
- **`MobileNav`** — the drawer wrapper around `Sidebar` for `< md`.

### 4.3 Fan Wallet Overview (`app/(app)/wallet/page.tsx`)

Server component. Gates exactly as today: no session → `/auth/sign-in` (both
roles may hold a wallet, so no role gate). Renders `EnsureWallet` (unchanged
self-heal) then the client `WalletOverview`.

Layout (desktop 2-col, stacks on mobile):

```
┌───────────────────────── HERO (lime, .glow, col-span-2) ─────────────────────────┐
│ USD₮ BALANCE                                                                       │
│ 1,284.50 USD₮        [mode chip]              [ Send ] [ Receive ] [ Add funds ]   │
│ address 0x1234…abcd  [copy]                                                        │
└───────────────────────────────────────────────────────────────────────────────────┘
┌── STAT: Invested ──┐ ┌── STAT: Claimable ──┐ ┌── STAT: Positions ──┐
│ 300.00 USD₮        │ │ 42.10 USD₮          │ │ 3                   │
└────────────────────┘ └─────────────────────┘ └─────────────────────┘
┌──────────── POSITIONS (col-span-2 on md, list) ─────────┐  ┌──── ACTIVITY ────┐
│ Atlético El Porvenir   120 shares · 4.2% of round        │  │ ↑ Sent   50.00   │
│ funding ▓▓▓▓▓░░ 68%    claimable 12.30 USD₮   [ Claim ]   │  │ ↓ Recv  200.00   │
│ Racing del Norte       …                                  │  │ ↑ Sent   10.00   │
└──────────────────────────────────────────────────────────┘  │ View full ledger │
                                                               └──────────────────┘
```

- **`WalletOverview`** (client) — owns refresh. On mount: `createWallet(userId)`
  (no-op if exists) → `getWallet(userId)` → set `address`, `balance`
  (`wallet.getUsdtBalance()`), fetch `/api/wallet/positions?address=` and
  `/api/wallet/history?address=`. Skeletons while loading; friendly error card
  on failure (reuse `friendlyError`). Passes `onChanged` down so Send/Claim
  refresh balance + activity.
- **`BalanceHero`** — presentational: balance (`formatUsdt`), mode chip,
  truncated address + copy, three action buttons that open dialogs.
- **`StatCards`** — invested = Σ positions `investedUsdt`; claimable = Σ
  `pendingReward`; count. All derived from the positions payload.
- **`PositionsList`** / **`PositionRow`** — one row per position with
  `ClaimPositionButton`. Empty state: "You don't hold any club yet." + link to
  Explore clubs.
- **`ActivityPanel`** — top ~5 `HistoryEntry`; "View full ledger" → `/wallet/activity`.

### 4.4 Full activity (`app/(app)/wallet/activity/page.tsx`)

Server-gated like `/wallet`. Client `ActivityFull` fetches
`/api/wallet/history?address=` and renders the complete list: direction icon,
amount, counterparty (shortened), relative time, explorer link
(`{explorerBase}/tx/{hash}` — derive base from `activeChain.blockExplorers`).

### 4.5 Operation dialogs (`components/wallet/`)

All use shadcn **`dialog`** (base-nova; add via `pnpm dlx shadcn@latest add
dialog`). Opened from `BalanceHero` and the sidebar "Add funds" CTA. Simplest
wiring that satisfies both triggers: a tiny client context
`WalletDialogsProvider` (holds `open: null|"send"|"receive"|"addFunds"` +
setter) mounted in `WalletOverview`; the sidebar CTA on `/wallet*` dispatches
through it. If the sidebar CTA proves awkward to reach the provider (different
subtree), fall back to the CTA linking `/wallet?action=addFunds` and
`WalletOverview` reading the query param. **Pick the query-param approach** —
it is decoupled and needs no cross-subtree context.

- **`SendDialog({ wallet, balance, onSent })`** — fields: recipient
  (`viem.isAddress` validation, checksum-agnostic), amount (`parseUsdt`, must be
  `>0` and `≤ balance`). Step 1 form → step 2 **review** ("Send **X USD₮** to
  `0xRecipient`. This is irreversible.") → confirm calls
  `wallet.transferUsdt(recipient, amount)`; toast loading→success with tx hash
  link; `onSent()` refreshes. Standard-mode gas error (`insufficient funds` for
  ETH) maps through `friendlyError` to "You need a little gas ETH — use Add
  funds → Get gas ETH."
- **`ReceiveDialog({ address })`** — QR of the address (`qrcode.react`
  `<QRCodeSVG value={address} />`, new dep) on a white rounded tile (QR needs
  light background for scanners) + full address mono + copy button + a one-line
  "Only send USD₮ on Sepolia to this address."
- **`AddFundsDialog({ address, onFunded })`** — MoonPay primary button (POST
  `/api/moonpay` → `window.open(widgetUrl)`); in **standard** mode also the two
  testnet buttons (test USD₮ via `/api/faucet-usdt`, gas ETH via `/api/faucet`),
  exactly the handlers currently in `WalletCard`. `onFunded()` refreshes balance.
- **`ClaimPositionButton({ roundAddress, onClaimed })`** — extracted from
  `ClaimButton`'s claim logic: `getWallet` → `claim(wallet, roundAddress)` →
  toast → `onClaimed()`. Disabled when `pendingReward === 0`.

`WalletCard.tsx` and the standalone `ClaimButton.tsx` are **replaced** by these
composed pieces; delete them once `/wallet` no longer imports them.

## 5. Data flow & plumbing

### 5.1 Positions — `lib/positions.ts` (new, server-safe)

```ts
export type FanPosition = {
  roundId: number;
  contractAddress: `0x${string}`;
  clubName: string;
  clubSlug: string;
  shares: bigint;          // ERC-20 share balance
  totalShares: bigint;     // round.totalSupply (for % of round)
  investedUsdt: bigint;    // shares * sharePrice (base units)
  claimable: bigint;       // pendingReward(round, fan)
  raised: bigint;          // totalRaised(round)
  goal: bigint;
  status: "funding" | "active" | "closed";
};

// Scans DB `verified` rounds, reads on-chain share/reward per round for `fan`,
// returns only rounds where shares > 0. Verified-only (schema.ts allowlist) —
// never point a claim at an unvetted round.
export async function getFanPositions(fan: `0x${string}`): Promise<FanPosition[]>;
```

Reads: `shareBalance(round, fan)` (filter `>0`), `pendingReward`,
`totalRaised`, share `totalSupply` (add `totalShares(round)` helper to
`contracts.ts` reading ERC-20 `totalSupply`), plus `rounds`/`clubs` rows for
name/slug/goal/sharePrice. Wrap each read in `readSafely` so one dead contract
never fails the whole page. Handful of rounds in the demo ⇒ N sequential reads
is fine; batch with `Promise.all` per round.

### 5.2 History — `lib/indexer.ts` (wire the real thing + fallback)

Keep the `HistoryEntry` type. Implement `getHistory(address)`:
1. If `WDK_INDEXER_API_KEY` set → `GET
   https://wdk-api.tether.io/api/v1/{blockchain}/{token}/{address}/token-transfers`
   with header `x-api-key`. `blockchain` from env
   (`WDK_INDEXER_CHAIN`, default `ethereum`), `token` = `usdt` or the USD₮
   contract. Parse defensively into `HistoryEntry[]` (the reference doesn't
   pin the success shape — read fields by best-known names, tolerate missing).
2. Else / on error / empty → **fallback** `getLogs` for ERC-20 `Transfer`
   events where `from` or `to` == address on `NEXT_PUBLIC_USDT_ADDRESS`, over
   the last ~40k blocks (same window cap reasoning as `/api/sync`). Map to
   `HistoryEntry` (`kind` = "out" if `from==address` else "in", amount from
   `value`, counterparty = the other party, `timestamp` from block).

**This module is server-only** (holds the API key) — called from
`/api/wallet/history`, never imported client-side. Remove the stub's TODO.

### 5.3 API routes (server)

- **`GET /api/wallet/history?address=`** — validates `address` (regex),
  `getHistory`, returns `{ entries: HistoryEntry[] }` (bigints as strings —
  JSON can't carry bigint; client re-parses with `BigInt`). Holds the Indexer
  key server-side.
- **`GET /api/wallet/positions?address=`** — validates `address`,
  `getFanPositions`, returns `{ positions }` (bigints as strings). Reads DB +
  on-chain; no secrets, but server-side because it needs the DB.

Both are **reads for the address in the query** — no session mutation, no
money-out; safe to be unauthenticated reads (the data is public on-chain
anyway). Keep them GET.

### 5.4 MoonPay — `lib/moonpay.ts` (signed-URL upgrade)

Keep `buildOnRampSession(address, amountUsd)`. When `MOONPAY_SECRET_KEY`
present, sign the widget URL per MoonPay's scheme (HMAC-SHA256 of the query
string with the secret, appended as `signature=`), using
`MOONPAY_API_KEY`/`MOONPAY_PUBLISHABLE_KEY` as `apiKey`. When absent, keep the
current unsigned `buy.moonpay.com` fallback so the demo still opens. Stays
server-only. (Full `@tetherto/wdk-protocol-fiat-moonpay` `MoonPayProtocol`
swap is optional — the signed URL is enough for on-ramp.)

## 6. Dependencies to add

- shadcn **`dialog`** component (base-nova) via CLI.
- **`qrcode.react`** (npm) — QR in ReceiveDialog. Small, React-native-free,
  renders inline SVG (CSP-safe, no external calls).

Nothing else. `lucide-react`, `@base-ui/react`, sonner, viem already present.

## 7. Error handling

- All on-chain reads wrapped in `readSafely`; a dead/placeholder round address
  never takes down `/wallet` (seeded demo round may still be a placeholder).
- Send: validate before submit; catch + `friendlyError`; never leave a spinner
  stuck (finally-reset). Money-out review step is mandatory.
- History: Indexer failure silently falls back to `getLogs`; both failing →
  empty list with "No activity yet.", not an error card.
- `/api/wallet/*`: 400 on bad address, 200 with best-effort data otherwise;
  positions route returns `{ positions: [] }` rather than 500 if the DB has no
  verified rounds.

## 8. Security

- **Server never holds the fan key** — unchanged. Send signs in-browser via the
  WDK handle. The API routes only read public data.
- **Indexer `x-api-key`** and **MoonPay secret** live in server env, read only
  in server modules (`lib/indexer.ts`, `lib/moonpay.ts`) / API routes — never
  `NEXT_PUBLIC_*`, never shipped to the browser.
- **Money-out**: Send requires the review-and-confirm step; address validated
  with `isAddress`; amount clamped `≤ balance`.
- Faucet routes stay server-signed by the relayer key (`SPONSOR_PK`), never the
  fan's — unchanged.

## 9. Testing

- **`lib/positions.test.ts`** — unit: given mocked contract reads + DB rows,
  `getFanPositions` returns only `shares>0` rounds with correct `investedUsdt`
  (= shares×sharePrice) and `claimable`. Mock the viem reads.
- **`lib/indexer.test.ts`** — unit: with a fake `fetch` returning an Indexer
  payload, `getHistory` maps to `HistoryEntry[]`; with `fetch` throwing, it
  falls back to `getLogs` (mock `publicClient.getLogs`) and maps direction
  correctly.
- **`lib/moonpay.test.ts`** — unit: with `MOONPAY_SECRET_KEY` set the URL
  carries a `signature=`; without it, the unsigned fallback URL is returned.
- **Build/lint gate**: `pnpm --filter web build` and `lint` green (stop dev +
  `rm -rf web/.next` first — dev server shares `.next`).
- **Manual (Playwright, dark)**: `/wallet` renders shell + hero + positions +
  activity; Send dialog validates a bad address and blocks over-balance;
  Receive shows a QR; Add funds opens. Use `emulateMedia({colorScheme:'dark'})`.

## 10. Risks / open questions

- **Indexer Sepolia coverage** — the hosted Indexer may only index mainnet. The
  `getLogs` fallback is the load-bearing path for the demo; the Indexer call is
  "real WDK tier-2 wiring for mainnet." Accept this; the fallback guarantees a
  populated Activity panel.
- **`getLogs` window** — public RPCs cap `eth_getLogs` ranges (~40–50k blocks).
  40k-block window may miss old transfers; acceptable for a fresh demo wallet.
- **MoonPay on testnet** — MoonPay won't actually deliver USD₮ on Sepolia; the
  button proves the flow/opens the widget. Real delivery is a mainnet concern.
- **Sidebar CTA → dialog** — resolved to the query-param approach (4.5) to
  avoid cross-subtree context.
```
