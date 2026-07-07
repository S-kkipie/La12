# Spec — Club discovery (design)

> Part 2 of the "single hardcoded club" gap identified alongside
> `2026-07-06-auto-close-funding-design.md` (Part 1, shipped). Club **creation**
> already works today — signup + wallet-link (`web/lib/ensureWallet.ts` →
> `POST /api/account/wallet`, `web/app/api/account/wallet/route.ts:43-64`)
> already inserts a real `clubs` row for any `role: "club"` account on first
> login. What's missing is **discovery**: the homepage hardcodes one featured
> club (`FEATURED_SLUG`) and a fake 3-card grid (`EXAMPLE_CLUBS`), and there is
> no page listing every real club.

**Date:** 2026-07-06 · **Track:** WDK hackathon · **Deadline:** 2026-07-14

## 1. Goal

Any club that signs up and gets a verified round should be discoverable —
today only the one club matching the hardcoded `FEATURED_SLUG` constant is
reachable from the homepage, and the 3-card grid below it is static example
content that was never real. Replace both with real data from the `clubs`/
`rounds` tables, and add a real `/clubs` listing page.

## 2. Scope

**In:**
- `web/lib/clubDirectory.ts` (new, server-only): `listClubsWithRounds()` —
  reads every club with a `verified` round, and its on-chain `totalRaised`.
- `web/app/(marketing)/clubs/page.tsx` (new): lists every club from the
  directory helper as a card, plus an empty state.
- Homepage rewrite (`web/app/(marketing)/page.tsx`): featured hero and the
  3-card grid both driven by `listClubsWithRounds()` instead of
  `FEATURED_SLUG`/`EXAMPLE_CLUBS`; "View all teams" links to the real
  `/clubs` page instead of the `#clubs` anchor.

**Out:**
- Club **creation** UI/flow — already works (see banner above); untouched.
- Pagination, search, filtering, sorting controls on `/clubs` — the hackathon
  demo has a handful of clubs; a plain list is enough. `ORDER BY` most-funded
  first (reusing the same `pct` used to pick the homepage's featured club) is
  the only ordering, not a user-facing feature.
- Clubs without a verified round appearing anywhere (unchanged rule — same
  allowlist reasoning as `club/[slug]/page.tsx` today, see `schema.ts:123-130`
  on why `verified` exists).
- Multiple rounds per club — still the single-verified-round assumption noted
  as a pre-existing gap in Task 7 of the auto-close-funding work; unrelated to
  discovery and not fixed here.
- The `LIVE_MARKET` ticker widget on the homepage (`page.tsx:17-22`) — clearly
  fake/illustrative market flavor, not a club listing; left as-is.

## 3. Architecture

### 3.1 `listClubsWithRounds()` — new, `web/lib/clubDirectory.ts`

```ts
export type ClubWithRound = {
  club: Club;   // from db/schema.ts
  round: Round; // from db/schema.ts
  raised: bigint;
  pct: number;  // 0-100, floor(raised * 100 / goal), matches RoundProgress's own calc
};

export async function listClubsWithRounds(): Promise<ClubWithRound[]>
```

- Query: `clubs` inner-joined to `rounds` where `rounds.verified = true` —
  the same join shape already used ad hoc in `page.tsx`/`club/[slug]/page.tsx`,
  just generalized to return every match instead of one row.
- For each row, reads `totalRaised(round.contractAddress)` via the existing
  `readSafely(..., 0n)` helper (`lib/contracts.ts:82-88`) — a dead/unreachable
  round contract degrades to `raised = 0n` rather than taking the page down,
  same as today's single-club homepage.
- Computes `pct` with the same integer math `RoundProgress` already uses
  (`goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0`,
  `RoundProgress.tsx:22`) — duplicated here deliberately (see §6) rather than
  importing a client component's internals into a server-only data helper.
- Returns the list **sorted by `pct` descending** — callers needing "most
  funded first" (the homepage's featured pick, `/clubs`' default order) get
  it for free; nothing consumes any other order.
- On zero rows: returns `[]`. Callers render their own empty states (see §3.2, §3.3).

### 3.2 `/clubs` page — new, `web/app/(marketing)/clubs/page.tsx`

Server component. Calls `listClubsWithRounds()` once, renders:
- A card per entry: club name, logo (`club.logoUrl` if set, else a two-letter
  initials tile — same pattern as the homepage's hero card,
  `page.tsx:113-115`), revenue share (`formatBps`), cap (`formatCapMultiple`),
  `pct`% funded with the same progress-bar treatment `RoundProgress` uses.
  Whole card links to `/club/{club.slug}`.
- Empty state (`listClubsWithRounds()` returned `[]`): a message ("No clubs
  yet — be the first") linking to `/auth/sign-up`, mirroring the tone of the
  homepage's existing "Club director?" CTA (`page.tsx:195-211`).

### 3.3 Homepage rewrite — `web/app/(marketing)/page.tsx`

- Delete `FEATURED_SLUG` (line 13) and `EXAMPLE_CLUBS` (lines 24-28).
- Call `listClubsWithRounds()` once at the top of `Home()`.
- Featured hero card (currently lines 101-171, driven by the single `club`/
  `round`/`raised` fetched from `FEATURED_SLUG`): driven by
  `clubs[0]` (the list is already sorted by `pct` descending, so this is
  "most funded"). If the list is empty, the hero keeps today's exact
  hardcoded fallback copy ("Deportivo San Martín", 8.0%, 1.50×, $40K goal,
  `investHref` for its link) — this is the only case where static copy
  survives, purely as a not-yet-any-real-club placeholder, not a fake catalog
  entry.
- 3-card grid (currently `EXAMPLE_CLUBS.map`, lines 216-239): driven by
  `clubs.slice(1, 4)` (up to 3 more, excluding the featured one). If fewer
  than 1 remain, the grid section renders nothing (no empty placeholder
  cards) — the "View all teams" link below still points to `/clubs`
  regardless of count.
- "View all teams →" (line 96-98) and "Browse clubs" (line 83-85): both change
  `href="#clubs"` to `href="/clubs"`.

## 4. Data flow

```
Home() / ClubsPage()
        │
        ▼
listClubsWithRounds()
        │
        ├─ db.select() clubs ⋈ rounds (verified=true)
        │
        └─ per row: readSafely(totalRaised(contractAddress), 0n)
        │
        ▼
[{ club, round, raised, pct }, ...]  sorted by pct desc
        │
   ┌────┴────┐
   ▼         ▼
Home: [0]=hero, [1..3]=grid     ClubsPage: all, as cards
```

## 5. Error handling

- A club whose round contract is unreachable (RPC down, bad address): degrades
  to `raised = 0n` / `pct = 0` via the existing `readSafely` pattern — never
  throws, never excludes the club from the list.
- Zero clubs with a verified round: both the homepage (static fallback hero,
  no grid) and `/clubs` (empty-state message) render something coherent, not
  a crash or a blank page.
- No new write paths, no new auth surface — this is entirely read-only,
  public-page content; same trust model as the pages it replaces.

## 6. Testing plan

- Manual: seed the demo club (existing `pnpm db:seed`) → confirm the homepage
  hero renders it (same output as today, just via the new code path) and
  `/clubs` lists exactly that one club.
- Manual: register a second verified round for a different club directly on
  anvil (same `cast`/DB-insert pattern used in the auto-close-funding work's
  Task 7 verification) with a higher `pct` than the seeded one → confirm it
  becomes the homepage's featured hero and both appear on `/clubs`, ordered
  most-funded first.
- Manual: temporarily set every round's `verified` to `0` → confirm the
  homepage falls back to its static placeholder hero (no grid section) and
  `/clubs` shows the empty state, neither one crashing.
