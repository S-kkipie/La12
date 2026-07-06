# Spec B — Club Revenue Management Dashboard (design)

> Part 2 of 2. Companion: `2026-07-06-fan-wallet-dashboard-design.md` (Spec A, shipped).
> Reuses the **dashboard shell** built in Spec A (`app/(app)/`, sidebar+topbar, role-aware).

**Date:** 2026-07-06 · **Track:** WDK hackathon · **Deadline:** 2026-07-14

## 1. Goal

Give a **club** an operable revenue-management dashboard in the "bold stadium"
language: see money raised across its rounds, **distribute revenue** to holders,
watch **revenue distributed over time**, inspect each round's **cap-table
(holders)**, track **cap utilization**, and **create rounds** — all inside the
shell Spec A already built. Money truth stays on-chain; the SQLite `events`
cache is not authoritative and is not used for the chart or cap-table (it lacks
investor addresses and real block timestamps — see §5).

## 2. Scope

**In (Spec B):**
- Club **Overview** page (`/dashboard`, rewrite): hero totals, revenue chart,
  rounds list (progress + state + Distribute + Holders), create-round dialog.
- Club **Revenue** page (`/dashboard/revenue`, new): distribution history +
  per-round cap-utilization breakdown.
- Dialogs: **Distribute**, **Holders** (cap-table), **Create round**.
- Plumbing: `lib/clubRevenue.ts` (server-only), `GET /api/club/overview`,
  `GET /api/club/distributions`, `GET /api/club/holders?round=`, and small
  `contracts.ts` reads (`totalDistributedToHolders`).
- Chart via **recharts** (new dep).

**Out (Spec B):**
- Closing a round on-chain (`closeRound`/`closeFunding`) — roadmap; state is
  read-only here.
- Off-chain revenue accounting / bank reconciliation — out of scope; distribute
  takes a USD₮ amount the club enters.
- Editing round parameters after deploy (they're immutable on-chain anyway).
- Fan-side changes (Spec A, shipped).

## 3. Design language (reuse, do not re-derive)

Bold-stadium tokens already in `web/app/globals.css`. Lime hero = `bg-primary
text-primary-foreground`; big numbers = `font-display` (Bebas); addresses/amounts
= `font-mono`; focal cards get `.glow`. shadcn = **base-nova** (`@base-ui/react`,
NOT Radix): `Button` has no `asChild` → use `buttonVariants()`+`cn()` on a
`<Link>`; dialogs use the `Dialog` component from Spec A
(`web/components/ui/dialog.tsx`). Icons = `lucide-react`. English copy.

## 4. Architecture

### 4.1 Pages (already inside the `(app)` shell)

`/dashboard` and `/dashboard/revenue` live under `app/(app)/dashboard/` (the
club nav in `components/shell/nav-items.ts` already points at both; the shell
CTA already links `/dashboard?action=newRound`). Both keep the existing
server-side gate: no session → `/auth/sign-in`; `role !== "club"` → `/wallet`;
no linked club → render `EnsureWallet` self-heal (unchanged from today's
`dashboard/page.tsx`).

Each page is a thin server component (auth gate + club resolve) that renders a
client orchestrator (`ClubOverview` / `RevenueDetail`) which fetches from the
`/api/club/*` routes — mirroring Spec A's `WalletOverview` pattern.

### 4.2 Overview page (`app/(app)/dashboard/page.tsx`, rewrite)

```
┌───────────────── HERO (lime, .glow) ─────────────────┐
│ CLUB REVENUE — {club name}                            │
│ Raised 42,000 USD₮   Distributed 3,150 USD₮           │
│ 2 rounds · 37 backers                [ New round ]    │
└───────────────────────────────────────────────────────┘
┌──────────── REVENUE DISTRIBUTED (chart, recharts) ────────────┐
│  cumulative USD₮ credited to holders over time (area)          │
└───────────────────────────────────────────────────────────────┘
┌──────────────────────── YOUR ROUNDS ──────────────────────────┐
│ {RoundProgress}   [active]      [ Distribute ] [ Holders ]     │
│ {RoundProgress}   [funding]     [ Distribute ] [ Holders ]     │
└───────────────────────────────────────────────────────────────┘
```

- **`ClubOverview`** (client) — on mount fetches `/api/club/overview` (totals +
  per-round list) and `/api/club/distributions` (chart series). Skeletons while
  loading; friendly error card on failure. Reads `?action=newRound` (via
  `useSearchParams`, wrapped in `<Suspense>` like Spec A) to auto-open the
  create-round dialog. Passes `onChanged=refresh` into every dialog so a
  distribute/create refreshes totals + chart + rounds.
- **`ClubHero`** — totals (raised, distributed, round count, backer count) +
  "New round" button (opens `CreateRoundDialog`).
- **`RevenueChart`** — recharts `AreaChart` of the cumulative-distributed series
  (`{ ts, cumulative }[]`); empty state ("No distributions yet") when the series
  is empty. Colors via CSS tokens (`var(--primary)`).
- **`ClubRoundsList`/`ClubRoundRow`** — reuse the existing pure `RoundProgress`
  for each round; a state badge; **Distribute** button (opens `DistributeDialog`,
  disabled unless on-chain state is `active` and supply > 0 — `distribute()`
  reverts otherwise) and **Holders** button (opens `HoldersDialog`). Empty
  state: "You haven't created a round yet." + the New-round button.

### 4.3 Revenue page (`app/(app)/dashboard/revenue/page.tsx`, new)

Server-gated club-only (same gate). Renders **`RevenueDetail`** (client):
- **Distribution history** table — every `Distributed` event across the club's
  rounds: date, round name, credited-to-holders, refunded-to-club, tx link.
  From `/api/club/distributions`.
- **Per-round cap utilization** — for each round: `distributed / cap` where
  `cap = totalRaised × capMultiple / 10000`, as a bar + `X% of cap used`, so the
  club sees remaining payout headroom before the on-chain cap stops crediting
  holders. From `/api/club/overview` (per-round `distributed`, `raised`,
  `capMultiple`).

### 4.4 Dialogs (`components/club/`)

All use the Spec A `Dialog`. Consistent with the fan wallet.

- **`DistributeDialog({ open, onOpenChange, round, onDistributed })`** — amount
  input (USD₮) → review ("Distribute **X USD₮** as revenue to this round's
  holders.") → confirm runs the existing invest-style flow: `getWallet(userId)`
  → approve USD₮ if allowance short → `distribute(wallet, roundAddress, amount)`
  (all already in `lib/contracts.ts`). Money-out (club spends its own revenue
  into its own round contract) → one confirm step. `friendlyError` on failure;
  `onDistributed()` refreshes. Supersedes the current `DistributeForm.tsx`.
- **`HoldersDialog({ open, onOpenChange, round })`** — fetches
  `/api/club/holders?round={address}` and renders the cap-table: holder address
  (shortened + explorer link), shares, % of round, claimable. Loading skeleton;
  "No backers yet" empty state.
- **`CreateRoundDialog({ open, onOpenChange, clubName, clubWalletAddress, usdtAddress, onCreated })`**
  — wraps the existing `CreateRoundForm` logic (deploy via `createRoundOnChain`
  + register via `/api/rounds`) inside a dialog; `onCreated()` refreshes.

## 5. Data flow & plumbing

### 5.1 Why on-chain logs, not the `events` cache

The `events` table (`db/schema.ts`) stores `{kind, txHash, amount, block, ts}`
per round but **has no investor address** and its `ts` is *sync time, not block
time* (documented in `/api/sync`). So a real cap-table and a real
revenue-over-time chart cannot come from it. Both read on-chain logs directly
via viem `getLogs` (same 40k-block-window + per-block-timestamp technique the
Spec A `lib/indexer.ts` fallback already uses), where `Invested` carries an
indexed `investor` and `Distributed` carries `creditedToHolders`.

### 5.2 `lib/clubRevenue.ts` (new, server-only)

```ts
export type ClubRound = {
  roundId: number;
  contractAddress: `0x${string}`;
  name: string;          // rounds row has no name; use `${club.name} · Round #{id}`
  goal: bigint;
  raised: bigint;        // totalRaised (on-chain)
  totalShares: bigint;
  distributed: bigint;   // totalDistributedToHolders (on-chain)
  capMultiple: number;   // bps (from DB row)
  revenueBps: number;    // from DB row
  deadline: Date;        // from DB row
  status: "funding" | "active" | "closed"; // on-chain roundState
};

export type ClubTotals = {
  raised: bigint;
  distributed: bigint;
  roundCount: number;
  backerCount: number;   // distinct investors across the club's rounds
};

export type Distribution = {
  roundId: number;
  roundName: string;
  received: bigint;      // Distributed.revenueReceived
  credited: bigint;      // Distributed.creditedToHolders
  refunded: bigint;      // Distributed.refundedToClub
  txHash: `0x${string}`;
  timestamp: number;     // block time, unix seconds
};

export type Holder = {
  address: `0x${string}`;
  shares: bigint;
  claimable: bigint;     // pendingReward
};

// verified-only, club-scoped (caller resolves `club` from the session).
export async function getClubOverview(clubId: number): Promise<{ totals: ClubTotals; rounds: ClubRound[] }>;
export async function getClubDistributions(clubId: number): Promise<Distribution[]>;
export async function getRoundHolders(roundAddress: `0x${string}`): Promise<Holder[]>;

// pure helpers (unit-tested):
export function cumulativeSeries(dists: Distribution[]): { ts: number; cumulative: bigint }[]; // sorted by ts, running sum of credited
export function capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number; // % 0..100, 0 when cap is 0
```

- `getClubOverview` — read the club's rounds from DB (verified), then per round
  read on-chain `totalRaised`, `totalSupply`, `roundState`,
  `totalDistributedToHolders` (each wrapped in `readSafely`). `backerCount` =
  size of the union of `Invested.investor` across rounds (from `getRoundHolders`
  address sets, or a dedicated getLogs). Demo scale (≤ a few rounds) → sequential
  `Promise.all` is fine.
- `getClubDistributions` — for each of the club's rounds, `getLogs` the
  `Distributed` event over the block window, map to `Distribution` with real
  block timestamps, sort ascending by time.
- `getRoundHolders` — `getLogs` `Invested` for the round → unique `investor`
  addresses → per address read `shareBalance` + `pendingReward`; drop
  addresses whose current `shares === 0` (fully transferred out).

### 5.3 `contracts.ts` additions

```ts
export async function totalDistributedToHolders(roundAddress: `0x${string}`): Promise<bigint>; // reads public var
```

(`totalRaised`, `totalShares`, `roundState`, `pendingReward`, `shareBalance`,
`distribute`, `approveUsdt`, `usdtAllowance`, `createRoundOnChain` already
exist.)

### 5.4 API routes (server, club derived from session)

Each route derives the club from the session (`auth.api.getSession`) exactly
like `/api/rounds` POST — never trusts a `clubId` from the client. Returns 401
if no session, 403 if `role !== "club"`, 409 if no linked club. Bigints
serialized as strings; clients re-parse.

- **`GET /api/club/overview`** → `{ totals, rounds }` (DTOs, bigints as strings).
- **`GET /api/club/distributions`** → `{ distributions }` (for chart + history).
- **`GET /api/club/holders?round=0x…`** → `{ holders }`. Validates `round`
  format AND that it belongs to the caller's club's verified rounds (else 403) —
  never scans an arbitrary contract on request.

### 5.5 Client DTO types (`components/club/types.ts`)

Client-safe (no server/DB import). Mirrors Spec A's `components/wallet/types.ts`:
`ClubTotalsDTO`/`ClubRoundDTO`/`DistributionDTO`/`HolderDTO` (bigint fields as
strings) + `parse*` functions converting back to bigint. A client-safe
`capUtilizationView` / `holderPercentView` twin (same reason as Spec A's
`percentOfRoundView`: client must not import `@/lib/clubRevenue`, which pulls
the DB into the browser bundle).

## 6. Dependencies to add

- **`recharts`** (npm) — the revenue area chart. Client-only component.

Nothing else. `qrcode.react`, `@base-ui/react`, sonner, viem, lucide already present.

## 7. Error handling

- All on-chain reads wrapped in `readSafely`; a dead/placeholder round never
  takes down `/dashboard` (the seeded demo round may still be a placeholder).
- Distribute: `friendlyError`; the on-chain `distribute()` reverts (`not active`,
  `no holders`, `not enough funds`) are surfaced through it. The button is
  disabled client-side when state ≠ active or supply = 0 to avoid a guaranteed
  revert.
- `/api/club/*`: 400 on bad input, 401/403/409 on auth as above; on read failure
  return empty (`{ rounds: [], totals: {…, 0} }` / `{ distributions: [] }` /
  `{ holders: [] }`) rather than 500 so the page still renders.
- Chart/holders empty states rendered, never an error card, when there's simply
  no data yet.

## 8. Security

- Club-scoped routes derive the club from the session, never from client input
  (matches `/api/rounds`). The holders route additionally verifies the requested
  round belongs to the caller's club before scanning.
- **Server never holds the club key** — distribute + create-round sign
  in-browser via `getWallet(userId)` (the club's own WDK wallet). On-chain,
  `distribute()` is `onlyOwner` (the round's `club`) — the real gate is on-chain,
  the UI gate is convenience.
- Money-out (Distribute) has a review-and-confirm step; amount validated `> 0`
  (reuse the `safeParseUsdt` guard pattern from Spec A's SendDialog so
  non-numeric input can't crash the dialog).
- No secret is added to the client bundle; `lib/clubRevenue.ts` is server-only.

## 9. Testing

- **`lib/clubRevenue.test.ts`** — unit (pure helpers): `cumulativeSeries`
  produces a time-sorted running sum of `credited`; `capUtilization` returns the
  right percent and `0` when cap is `0` (no divide-by-zero); DTO serializers
  stringify every bigint. Standalone `tsx` + `node:assert`, run
  `npx tsx lib/clubRevenue.test.ts` from `web/`.
- **Build/lint gate**: `pnpm --filter web build` + `lint` green (stop dev +
  `rm -rf web/.next` first).
- **Manual (Playwright, dark)**: as a club — `/dashboard` shows hero totals, the
  revenue chart (or its empty state), rounds with Distribute/Holders; the shell
  "New round" CTA (`?action=newRound`) opens the create dialog; Distribute
  validates a bad amount and blocks it; Holders shows the cap-table (or empty
  state); `/dashboard/revenue` shows the history table + cap-utilization.
  `emulateMedia({ colorScheme: 'dark' })`.

## 10. Risks / open questions

- **`getLogs` window** — public RPCs cap `eth_getLogs` at ~40–50k blocks; a
  round's oldest `Invested`/`Distributed` events could fall outside the window on
  an established testnet. Acceptable for the demo; a production build would track
  each round's deploy block (from `RoundCreated`) and scan from there.
- **`backerCount` cost** — unioning `Invested.investor` across rounds is N
  getLogs + per-holder reads; fine at demo scale (≤ a few rounds, few holders).
  If it ever gets slow, cache it.
- **Round has no on-chain name** — the ERC-20 round token has a `name()`, but the
  DB `rounds` row doesn't store it; the UI uses `${club.name} · Round #{id}`.
  Cosmetic.
- **Chart timestamps** rely on per-block `getBlock` calls; a handful per demo is
  fine.
```
