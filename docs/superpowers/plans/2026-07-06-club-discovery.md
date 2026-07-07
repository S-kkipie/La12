# Club Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage's hardcoded `FEATURED_SLUG`/`EXAMPLE_CLUBS` with real data from the `clubs`/`rounds` tables, and add a real `/clubs` listing page — so every club with a verified round is actually discoverable.

**Architecture:** A single server-only helper, `listClubsWithRounds()` in `web/lib/clubDirectory.ts`, joins `clubs` to their `verified` round and reads each round's on-chain `totalRaised`, returning a list sorted by percent-funded descending. A new `/clubs` page renders every entry as a `ClubCard`. The homepage is rewritten to source its featured hero (`clubs[0]`, most-funded) and its secondary grid (`clubs.slice(1, 4)`, reusing `ClubCard`) from the same helper, falling back to today's exact static hero copy only when no club has a verified round yet.

**Tech Stack:** Next.js 15 App Router (server components), Drizzle ORM (SQLite), viem (via existing `lib/contracts.ts` reads). No new dependencies.

## Global Constraints

- Only clubs with a `verified` round are shown anywhere (same allowlist rule as `club/[slug]/page.tsx` today — `RoundFactory.createRound()` is permissionless on-chain, so an unverified row isn't trustworthy).
- No pagination/search/filter — a plain list, sorted most-funded-first.
- English UI copy; code comments only where the WHY is non-obvious.
- Read-only feature: no new write paths, no new auth surface.
- Club **creation** is out of scope — already works via signup + wallet-link.

---

## File Structure

- **Create** `web/lib/clubDirectory.ts` — pure `computeFundedPct` helper + `listClubsWithRounds()` orchestration (DB join + on-chain reads).
- **Create** `web/lib/clubDirectory.test.ts` — `node:assert` unit tests for `computeFundedPct` (matches the existing `lib/*.test.ts` convention — run with `npx tsx lib/clubDirectory.test.ts` from `web/`).
- **Create** `web/components/ClubCard.tsx` — one club's card (name/logo, revenue share, progress bar), linking to `/club/{slug}`.
- **Create** `web/app/(marketing)/clubs/page.tsx` — lists every entry from `listClubsWithRounds()`, with an empty state.
- **Modify** `web/app/(marketing)/page.tsx` — full rewrite of the hero/grid data source; unrelated sections (Why La Doce, CTA band, footer) untouched.

---

## Task 1: `computeFundedPct` pure helper

**Files:**
- Create: `web/lib/clubDirectory.ts`
- Test: `web/lib/clubDirectory.test.ts`

**Interfaces:**
- Produces: `computeFundedPct(raised: bigint, goal: bigint): number` — used by Task 2's `listClubsWithRounds`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/clubDirectory.test.ts`:

```ts
import assert from "node:assert";
import { computeFundedPct } from "./clubDirectory";

// Mirrors RoundProgress.tsx's own pct calc: floor(raised*100/goal), capped at 100.
assert.equal(computeFundedPct(20_000000n, 40_000000n), 50);
assert.equal(computeFundedPct(40_000000n, 40_000000n), 100);
assert.equal(computeFundedPct(50_000000n, 40_000000n), 100); // over-funded, still capped at 100
assert.equal(computeFundedPct(0n, 0n), 0); // no goal -> 0, never divide by zero

console.log("clubDirectory helpers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/clubDirectory.test.ts`
Expected: FAIL — `Cannot find module './clubDirectory'`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/clubDirectory.ts`:

```ts
/**
 * Same integer math RoundProgress.tsx already uses for its progress bar
 * (`Math.min(100, Number((raised * 100n) / goal))`) — duplicated here
 * rather than importing a client component's internals into this
 * server-only data helper.
 */
export function computeFundedPct(raised: bigint, goal: bigint): number {
  return goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/clubDirectory.test.ts`
Expected: PASS — prints `clubDirectory helpers OK`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/clubDirectory.ts web/lib/clubDirectory.test.ts
git commit -m "feat(clubs): add computeFundedPct pure helper"
```

---

## Task 2: `listClubsWithRounds()` orchestration

**Files:**
- Modify: `web/lib/clubDirectory.ts`

**Interfaces:**
- Consumes: `computeFundedPct` (Task 1, same file); `db` (`@/lib/db`), `clubs`, `rounds`, `type Club`, `type Round` (`@/db/schema`); `eq`, `and` (`drizzle-orm`); `totalRaised`, `readSafely` (`./contracts`, both already exist — see `web/lib/contracts.ts:52-58` and `:82-88`).
- Produces: `type ClubWithRound = { club: Club; round: Round; raised: bigint; pct: number }` and `listClubsWithRounds(): Promise<ClubWithRound[]>` — used by Task 3's `/clubs` page and Task 4's homepage.

- [ ] **Step 1: Implement**

Add to `web/lib/clubDirectory.ts` (append, keep Task 1's helper above unchanged):

```ts
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clubs, rounds, type Club, type Round } from "@/db/schema";
import { totalRaised, readSafely } from "./contracts";

export type ClubWithRound = {
  club: Club;
  round: Round;
  raised: bigint;
  pct: number;
};

/**
 * Every club with a verified round, most-funded first. A round whose
 * contract can't be read (RPC down, bad address) degrades to `raised = 0n`
 * via `readSafely` rather than taking the whole list down — same tolerance
 * the single-club homepage already had.
 */
export async function listClubsWithRounds(): Promise<ClubWithRound[]> {
  const rows = await db
    .select({ club: clubs, round: rounds })
    .from(clubs)
    .innerJoin(rounds, and(eq(rounds.clubId, clubs.id), eq(rounds.verified, true)));

  const withRaised = await Promise.all(
    rows.map(async ({ club, round }) => {
      const raised = await readSafely(
        () => totalRaised(round.contractAddress as `0x${string}`),
        0n,
      );
      return { club, round, raised, pct: computeFundedPct(raised, BigInt(round.goal)) };
    }),
  );

  return withRaised.sort((a, b) => b.pct - a.pct);
}
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Re-run Task 1's unit test to confirm no regression**

Run (from `web/`): `npx tsx lib/clubDirectory.test.ts`
Expected: PASS — `clubDirectory helpers OK` (only exercises the pure helper, unaffected by this addition).

- [ ] **Step 4: Commit**

```bash
git add web/lib/clubDirectory.ts
git commit -m "feat(clubs): add listClubsWithRounds directory query"
```

---

## Task 3: `ClubCard` component + `/clubs` page

**Files:**
- Create: `web/components/ClubCard.tsx`
- Create: `web/app/(marketing)/clubs/page.tsx`

**Interfaces:**
- Consumes: `ClubWithRound`, `listClubsWithRounds` (Task 2, `@/lib/clubDirectory`); `formatBps` (`@/lib/format`, already exists); `buttonVariants` (`@/components/ui/button`); `cn` (`@/lib/utils`).
- Produces: `ClubCard(props: ClubWithRound): JSX.Element` — used by Task 4's homepage grid too.

- [ ] **Step 1: Create the card component**

Create `web/components/ClubCard.tsx`:

```tsx
import Link from "next/link";
import { formatBps } from "@/lib/format";
import type { ClubWithRound } from "@/lib/clubDirectory";

export function ClubCard({ club, round, pct }: ClubWithRound) {
  return (
    <Link
      href={`/club/${club.slug}`}
      className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
    >
      <div className="flex items-center gap-3">
        {club.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={club.logoUrl} alt="" className="size-11 rounded-lg object-cover" />
        ) : (
          <div className="flex size-11 items-center justify-center rounded-lg border border-primary/40 bg-background font-display text-lg text-primary">
            {club.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div>
          <div className="font-display text-lg uppercase tracking-wide">{club.name}</div>
          <div className="text-xs text-primary">{formatBps(round.revenueBps)} revenue share</div>
        </div>
      </div>
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{pct}% funded</div>
    </Link>
  );
}
```

- [ ] **Step 2: Create the `/clubs` page**

Create `web/app/(marketing)/clubs/page.tsx`:

```tsx
import Link from "next/link";
import { listClubsWithRounds } from "@/lib/clubDirectory";
import { ClubCard } from "@/components/ClubCard";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function ClubsPage() {
  const clubs = await listClubsWithRounds();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-5xl uppercase tracking-wide">All clubs</h1>
        <p className="max-w-xl text-muted-foreground">
          Every club currently raising on La Doce, most-funded first.
        </p>
      </header>

      {clubs.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.map((c) => (
            <ClubCard key={c.club.id} {...c} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No clubs yet — be the first.</p>
          <Link href="/auth/sign-up" className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
            List your club
          </Link>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add web/components/ClubCard.tsx "web/app/(marketing)/clubs/page.tsx"
git commit -m "feat(clubs): add ClubCard + /clubs listing page"
```

---

## Task 4: Homepage rewrite

**Files:**
- Modify: `web/app/(marketing)/page.tsx`

**Interfaces:**
- Consumes: `listClubsWithRounds` (Task 2, `@/lib/clubDirectory`); `ClubCard` (Task 3, `@/components/ClubCard`).

- [ ] **Step 1: Replace the entire file content**

`web/app/(marketing)/page.tsx` currently reads `club`/`round`/`raised` from a single hardcoded `FEATURED_SLUG` and renders a fake `EXAMPLE_CLUBS` grid. Replace the ENTIRE file content with:

```tsx
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight, ShieldCheck, Repeat, TrendingUp, Trophy } from "lucide-react";
import { auth } from "@/lib/auth";
import { listClubsWithRounds } from "@/lib/clubDirectory";
import { ClubCard } from "@/components/ClubCard";
import { formatUsdt, formatBps, formatCapMultiple } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";

// Illustrative market ticker for the landing — clearly example content, not
// an on-chain read (the featured card below IS real data).
const LIVE_MARKET = [
  { name: "Sacachispas FC", change: "+12.4%", up: true },
  { name: "Almirante Brown", change: "-2.1%", up: false },
  { name: "Nueva Chicago", change: "+5.8%", up: true },
  { name: "Chacarita Jr.", change: "+22.1%", up: true },
];

function compactUsd(baseUnits: bigint): string {
  const whole = Number(baseUnits / 1_000000n);
  if (whole >= 1000) {
    const k = whole / 1000;
    return `$${Number.isInteger(k) ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `$${whole}`;
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const clubs = await listClubsWithRounds();
  const featured = clubs[0] ?? null;

  // No club has a verified round yet — keep today's exact placeholder copy
  // rather than showing an empty hero.
  const heroName = featured?.club.name ?? "Deportivo San Martín";
  const heroInitials = (featured?.club.name ?? "SM").slice(0, 2).toUpperCase();
  const heroSlug = featured?.club.slug ?? null;
  const heroRevenueBps = featured ? formatBps(featured.round.revenueBps) : "8.0%";
  const heroCapMultiple = featured ? formatCapMultiple(featured.round.capMultiple) : "1.50×";
  const heroGoal = featured ? BigInt(featured.round.goal) : 40_000_000000n;
  const heroRaised = featured?.raised ?? 0n;
  const heroPct = featured?.pct ?? 0;

  const investHref = session
    ? session.user.role === "club"
      ? "/dashboard"
      : "/wallet"
    : "/auth/sign-up";

  return (
    <div className="flex flex-1 flex-col">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-24 md:py-32">
          <span className="w-fit rounded-full border border-primary/40 bg-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary">
            Decentralized finance · Football
          </span>
          <h1 className="max-w-4xl font-display text-6xl uppercase leading-[0.92] tracking-wide md:text-8xl">
            Own a piece of your club, in <span className="text-primary">USD₮</span>.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            The passion isn&apos;t for sale — but now it pays off. Back your club&apos;s season and
            take your cut of the revenue, straight to your self-custody wallet. No bank, no
            middleman, no custody.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={investHref} className={buttonVariants({ size: "lg" })}>
              Start investing <ArrowRight className="ml-1 size-4" />
            </Link>
            <Link href="/clubs" className={buttonVariants({ variant: "outline", size: "lg" })}>
              Browse clubs
            </Link>
          </div>
        </div>
      </section>

      {/* ── Featured clubs ──────────────────────────────────── */}
      <section id="clubs" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-6 flex items-end justify-between">
          <h2 className="font-display text-3xl uppercase tracking-wide md:text-4xl">
            Featured clubs
          </h2>
          <Link href="/clubs" className="text-sm font-medium text-primary hover:underline">
            View all teams →
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Real verified round (or placeholder copy if none exist yet), dressed as the hero club card */}
          <div className="glow relative overflow-hidden rounded-lg border border-border lg:col-span-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/stadium.jpg"
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full scale-[1.8] object-cover object-[center_78%] opacity-40"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/45" />
            <div className="relative flex flex-col gap-5 p-6 md:p-8">
              <div className="flex items-center gap-4">
                <div className="flex size-14 items-center justify-center rounded-lg border border-primary/40 bg-background/60 font-display text-2xl text-primary">
                  {heroInitials}
                </div>
                <div>
                  <h3 className="font-display text-3xl uppercase tracking-wide">
                    {heroName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Next big transfer · 75% probability
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "Revenue share", v: heroRevenueBps },
                  { k: "Cap", v: heroCapMultiple },
                  { k: "Token price", v: "$1.00" },
                  { k: "Goal", v: compactUsd(heroGoal) },
                ].map((s) => (
                  <div key={s.k} className="rounded-lg border border-border bg-background/50 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {s.k}
                    </div>
                    <div className="font-display text-2xl tracking-wide text-primary">{s.v}</div>
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span>Funding progress</span>
                  <span>{heroPct}% funded</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${heroPct}%` }}
                  />
                </div>
                <div className="mt-1 text-sm">
                  <span className="font-display text-xl tracking-wide">{formatUsdt(heroRaised)}</span>{" "}
                  <span className="text-muted-foreground">/ {formatUsdt(heroGoal)} USD₮ raised</span>
                </div>
              </div>

              <p className="max-w-lg text-sm text-muted-foreground">
                Neighborhood club with die-hard support. La Doce funds next season in exchange for a
                slice of gate revenue — paid pro-rata to token holders, on-chain.
              </p>

              <Link
                href={heroSlug ? `/club/${heroSlug}` : investHref}
                className={cn(buttonVariants({ size: "lg" }), "w-fit")}
              >
                Invest now
              </Link>
            </div>
          </div>

          {/* Side column: live market + directors CTA */}
          <div className="flex flex-col gap-6">
            <div className="rounded-lg border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide">
                <TrendingUp className="size-4 text-primary" /> Live market
              </div>
              <ul className="flex flex-col gap-3 text-sm">
                {LIVE_MARKET.map((m) => (
                  <li key={m.name} className="flex items-center justify-between">
                    <span>{m.name}</span>
                    <span className={m.up ? "text-primary" : "text-destructive"}>{m.change}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/clubs"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-4 w-full")}
              >
                Open the market
              </Link>
            </div>

            <div className="glow rounded-lg bg-primary p-5 text-primary-foreground">
              <div className="flex items-center gap-2 font-display text-2xl uppercase tracking-wide">
                <Trophy className="size-5" /> Club director?
              </div>
              <p className="mt-2 text-sm text-primary-foreground/80">
                Take your club to the next financial level with blockchain — no bank, no gatekeepers.
              </p>
              <Link
                href="/auth/sign-up"
                className={cn(
                  buttonVariants({ size: "sm" }),
                  "mt-4 bg-background text-foreground hover:bg-background/90",
                )}
              >
                List your club
              </Link>
            </div>
          </div>
        </div>

        {/* Real clubs raising now (excludes the featured one above) */}
        {clubs.slice(1, 4).length > 0 && (
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {clubs.slice(1, 4).map((c) => (
              <ClubCard key={c.club.id} {...c} />
            ))}
          </div>
        )}
      </section>

      {/* ── Why La Doce ─────────────────────────────────────── */}
      <section id="why" className="mx-auto w-full max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-center font-display text-4xl uppercase tracking-wide md:text-5xl">
          Why La Doce?
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Transparency",
              body: "Every USD₮ is tracked on-chain. You see exactly where the money goes — no fine print, no black box.",
            },
            {
              icon: Repeat,
              title: "Withdraw anytime",
              body: "Your tokens are liquid. Trade your stake on the secondary market whenever you want. Your capital, your call.",
            },
            {
              icon: TrendingUp,
              title: "Owners of the future",
              body: "Invest in the academy. Earn when a homegrown kid gets sold to Europe. Sporting and financial upside.",
            },
          ].map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-card p-6">
              <div className="flex size-11 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <c.icon className="size-5 text-primary" />
              </div>
              <h3 className="mt-4 font-display text-2xl uppercase tracking-wide">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA band ────────────────────────────────────────── */}
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="glow flex flex-col items-center gap-5 rounded-lg bg-primary px-6 py-14 text-center text-primary-foreground">
          <h2 className="font-display text-5xl uppercase tracking-wide md:text-6xl">
            The match already started.
          </h2>
          <p className="max-w-xl text-primary-foreground/80">
            Don&apos;t watch from the stands. Create your wallet in under 2 minutes and start
            building your club&apos;s future.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href={investHref}
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-background text-foreground hover:bg-background/90",
              )}
            >
              Create my wallet
            </Link>
            <Link
              href="#why"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10",
              )}
            >
              How it works
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <div className="font-display text-2xl uppercase tracking-wide text-primary">La Doce</div>
            <p className="mt-2 text-sm text-muted-foreground">The number 12 is you.</p>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Protocol
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="#clubs" className="hover:text-primary">Featured clubs</Link></li>
              <li><Link href="#why" className="hover:text-primary">How it works</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Account
            </div>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/auth/sign-in" className="hover:text-primary">Sign in</Link></li>
              <li><Link href="/auth/sign-up" className="hover:text-primary">Sign up</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Newsletter
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="you@email.com"
                className="min-w-0 flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-primary"
              />
              <Button size="sm">→</Button>
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          <div className="mx-auto w-full max-w-6xl px-6 py-4 text-xs text-muted-foreground">
            © 2026 La Doce Protocol · Built on Tether WDK + Ethereum
          </div>
        </div>
      </footer>
    </div>
  );
}
```

Note: the footer's "Featured clubs" link (`href="#clubs"`) is deliberately left as an in-page anchor — the `id="clubs"` section still exists on this same page, so it still works. Only "View all teams →" and "Browse clubs" now point to the real `/clubs` page.

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(marketing)/page.tsx"
git commit -m "feat(clubs): drive homepage hero + grid from real club data"
```

---

## Task 5: End-to-end verification on anvil

**Files:** none (verification only).

- [ ] **Step 1: Start anvil, deploy, seed the demo club**

```bash
export PATH="$HOME/.foundry/bin:$PATH"
anvil --accounts 25 --balance 1000 &
cd contracts
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Note the printed `MockUSDT`, `RoundFactory`, `Demo round` addresses. Update `web/.env.local` with them (local anvil mode — see `docs/judge-verification.md` §4), then:

```bash
cd web
rm -f ladoce.db
pnpm db:push
pnpm db:seed
pnpm dev &
```

- [ ] **Step 2: Verify the single-club baseline (homepage + /clubs)**

```bash
curl -s http://localhost:3000/ | grep -o "Deportivo San Mart[^<]*" | head -1
curl -s http://localhost:3000/clubs | grep -o "Deportivo San Mart[^<]*" | head -1
```

Expected: both print the seeded club's real name (not the hardcoded fallback — the fallback string is also "Deportivo San Martín", so also confirm via the DB that `listClubsWithRounds()` actually returned a row: temporarily add `console.log` is unnecessary — instead confirm indirectly by checking the rendered "Goal" figure on the homepage matches the seeded round's real goal, not the `40_000_000000n` fallback constant, using the same `compactUsd` formatting):

```bash
curl -s http://localhost:3000/ -o home.html
grep -o '\$[0-9.]*K' home.html | head -1
node -e "const d=require('better-sqlite3')('ladoce.db');console.log(d.prepare('SELECT goal FROM rounds WHERE id=1').get())"
```

Expected: the printed `$NNK` matches the seeded round's `goal` (both derive from the same 40,000 USD₮ demo round here, so this mainly confirms no crash — see Step 3 for an unambiguous real-vs-fallback check).

- [ ] **Step 3: Verify a second, higher-funded club becomes featured**

Deploy a second round for a *different* club (goal small enough to reach 100% funded easily) directly on-chain, register it in the DB (`verified=1`), and invest enough to cross its goal:

```bash
RPC=http://127.0.0.1:8545
MN="test test test test test test test test test test test junk"
CLUB2_PK=$(cast wallet private-key "$MN" 2)
CLUB2=$(cast wallet address --private-key $CLUB2_PK)
DEADLINE=$(($(date +%s) + 7776000))

cast send $FACTORY \
  "createRound(string,string,address,address,uint256,uint256,uint256,uint256,uint256)" \
  "Racing del Norte" "RDN" $USDT $CLUB2 1000000000 1000000 800 15000 $DEADLINE \
  --private-key $CLUB2_PK --rpc-url $RPC
ROUND2=$(cast call $FACTORY "rounds()(address[])" --rpc-url $RPC | tr -d '[]' | tr ',' '\n' | tail -1 | xargs)

FAN_PK=$(cast wallet private-key "$MN" 3)
FAN=$(cast wallet address --private-key $FAN_PK)
cast send $USDT "mint(address,uint256)" $FAN 1000000000 --private-key $CLUB2_PK --rpc-url $RPC
cast send $USDT "approve(address,uint256)" $ROUND2 1000000000 --private-key $FAN_PK --rpc-url $RPC
cast send $ROUND2 "invest(uint256)" 1000000000 --private-key $FAN_PK --rpc-url $RPC
```

Register "Racing del Norte" + its round in the DB directly (matching `db/seed.ts`'s column shapes, `verified=1`):

```bash
node -e "
const d = require('better-sqlite3')('ladoce.db');
d.prepare(\`INSERT INTO clubs (user_id, name, slug, wallet_address, created_at) VALUES (NULL, 'Racing del Norte', 'racing-del-norte', '$CLUB2', unixepoch())\`).run();
const clubId = d.prepare('SELECT id FROM clubs WHERE slug = ?').get('racing-del-norte').id;
d.prepare(\`INSERT INTO rounds (club_id, contract_address, goal, share_price, revenue_bps, cap_multiple, deadline, status, verified, created_at) VALUES (?, '$ROUND2', '1000000000', '1000000', 800, 15000, $DEADLINE, 'funding', 1, unixepoch())\`).run(clubId);
console.log('registered');
"
```

Then:

```bash
curl -s http://localhost:3000/ -o home2.html
grep -o "Racing del Norte" home2.html
curl -s http://localhost:3000/clubs -o clubs2.html
grep -o "Racing del Norte\|Deportivo San Mart[^<]*" clubs2.html
```

Expected: `home2.html` shows "Racing del Norte" as the featured hero name (it's now fully-funded, 100% > the seeded demo round's lower percentage). `clubs2.html` lists both clubs, with "Racing del Norte" appearing before "Deportivo San Martín" (most-funded first).

- [ ] **Step 4: Verify the empty-state fallback**

```bash
node -e "const d=require('better-sqlite3')('ladoce.db');d.prepare('UPDATE rounds SET verified = 0').run();console.log('unverified all rounds');"
curl -s http://localhost:3000/ -o home3.html
grep -o "Deportivo San Mart[^<]*" home3.html | head -1
curl -s http://localhost:3000/clubs -o clubs3.html
grep -o "No clubs yet" clubs3.html
```

Expected: `home3.html` still shows the static "Deportivo San Martín" fallback hero (no crash, no blank hero). `clubs3.html` shows "No clubs yet — be the first."

- [ ] **Step 5: Teardown**

```bash
netstat -ano | grep -E ":3000|:8545" | grep LISTENING
# kill the PIDs listed for pnpm dev (node.exe on :3000) and anvil (anvil.exe on :8545)
```

Confirm both ports are free afterward.
