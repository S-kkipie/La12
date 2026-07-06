# Club Revenue Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a club an operable revenue dashboard — totals hero, a recharts revenue-over-time chart, rounds list with Distribute + Holders (cap-table), cap-utilization breakdown, and a create-round dialog — inside the shell Spec A already shipped.

**Architecture:** Two client orchestrators (`ClubOverview`, `RevenueDetail`) under the existing `(app)` shell fetch from three session-scoped `GET /api/club/*` routes backed by `lib/clubRevenue.ts`, which reads money truth on-chain (viem reads + `getLogs` for `Invested`/`Distributed` events with block timestamps — the SQLite `events` cache lacks investor addresses and real block times, so it is NOT used here). Distribute/create sign in-browser via the club's WDK wallet (`getWallet`). Money truth on-chain; SQLite = metadata/allowlist only.

**Tech Stack:** Next.js 15 App Router (TS), Tailwind v4 (tokens in `globals.css`), shadcn **base-nova** (`@base-ui/react`, NOT Radix), viem, `@tetherto/wdk*`, sonner, lucide-react, **recharts** (new), SQLite (better-sqlite3 + Drizzle). Tests = standalone `tsx` + `node:assert` (run `npx tsx web/lib/<x>.test.ts` from `web/`).

## Global Constraints

- **Design tokens already shipped** in `web/app/globals.css` (bold-stadium). No new colors/fonts. Lime hero = `bg-primary text-primary-foreground`; big numbers = `font-display` (Bebas); addresses/amounts = `font-mono`; focal cards `.glow`. Chart colors via `var(--primary)`.
- **shadcn = base-nova** (`@base-ui/react`). `Button` has NO `asChild` → `buttonVariants()`+`cn()` on a `<Link>`. Dialogs use `web/components/ui/dialog.tsx` (`Dialog`/`DialogContent`/`DialogHeader`/`DialogTitle`/`DialogDescription`/`DialogFooter`, controlled `open`/`onOpenChange`, `showClose` prop). Never import `@radix-ui/*`.
- **Amounts are `bigint` base units. USD₮ + share token = 6 decimals** (`1 USDT = 1_000000n`). BPS denominator = `10_000` (`capMultiple = 15000` means 1.5×). JSON can't carry bigint → API routes serialize bigints as strings; clients re-parse with `BigInt(...)` before math/`formatUsdt`. Percent/utilization scalars are computed **server-side** and returned as plain `number` in the DTO (keeps the client from importing the server lib — same bundle-boundary goal as Spec A's `percentOfRoundView`, achieved without a client twin).
- **Money truth on-chain.** Chart + cap-table + totals read on-chain (viem reads / `getLogs`), never the `events` cache.
- **Club is derived from the session** in every `/api/club/*` route (like `/api/rounds` POST) — never trust a `clubId`/round from the client for authorization. Routes: 401 no session, 403 `role !== "club"`, 409 no linked club. The holders route additionally verifies the requested round belongs to the caller's club's **verified** rounds before scanning.
- **Server never holds the club key.** Distribute + create-round sign in-browser via `getWallet(userId)`. `distribute()` is `onlyOwner` on-chain — the real gate.
- **Money-out (Distribute) requires a review-and-confirm step**; amount parsed through a non-throwing guard (`> 0`), so non-numeric input can't crash the dialog.
- **Verified-only.** Club rounds come from `rounds.verified = true`.
- **English copy only.**
- **Build hygiene:** dev shares `web/.next` with `next build` → stop dev + `rm -rf web/.next` before a build. Test dark mode in Playwright with `emulateMedia({ colorScheme: 'dark' })`.
- Route groups don't change URLs. `/dashboard`, `/dashboard/revenue` stay as-is.

---

## File Structure

**New — libs & API**
- `web/lib/clubRevenue.ts` — `getClubOverview`, `getClubDistributions`, `getRoundHolders`, `getRoundInvestors`, pure helpers `cumulativeSeries`/`capUtilization`, DTO serializers. Server-only.
- `web/lib/clubAuth.ts` — `requireClub()`: resolve the caller's club from the session (shared by all three routes).
- `web/app/api/club/overview/route.ts`, `.../distributions/route.ts`, `.../holders/route.ts`.
- Test: `web/lib/clubRevenue.test.ts`.

**New — client feature (`web/components/club/`)**
- `types.ts` — client-safe DTO shapes + parsers.
- `ClubOverview.tsx` (orchestrator), `ClubHero.tsx`, `RevenueChart.tsx` (recharts), `ClubRoundsList.tsx` (incl. `ClubRoundRow`), `RevenueDetail.tsx`.
- `DistributeDialog.tsx`, `HoldersDialog.tsx`, `CreateRoundDialog.tsx`.
- `web/app/(app)/dashboard/revenue/page.tsx`.

**Modified**
- `web/lib/contracts.ts` — add `totalDistributedToHolders`.
- `web/app/(app)/dashboard/page.tsx` — rewrite to render `ClubOverview`.
- `web/package.json` — add `recharts`.

**Deleted (superseded)**
- `web/components/DistributeForm.tsx` (replaced by `DistributeDialog`).

**Reused unchanged**
- `web/components/RoundProgress.tsx` (pure display), `web/components/CreateRoundForm.tsx` (wrapped by `CreateRoundDialog`), `web/components/EnsureWallet.tsx`.

---

### Task 1: `totalDistributedToHolders` contract read

**Files:**
- Modify: `web/lib/contracts.ts` (add after `totalRaised`, ~line 58)

**Interfaces:**
- Consumes: `publicClient`, `revenueShareRoundAbi`.
- Produces: `totalDistributedToHolders(roundAddress: \`0x${string}\`): Promise<bigint>` — reads the round's public `totalDistributedToHolders` var (cumulative USD₮ credited to holders).

- [ ] **Step 1: Add the function** to `web/lib/contracts.ts` (after `totalRaised`)

```ts
export async function totalDistributedToHolders(roundAddress: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "totalDistributedToHolders",
  }) as Promise<bigint>;
}
```

- [ ] **Step 2: Verify it compiles**

Run (from `web/`): `npx tsc --noEmit`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add web/lib/contracts.ts
git commit -m "feat(club): add totalDistributedToHolders() read"
```

---

### Task 2: `lib/clubRevenue.ts` + pure helpers

**Files:**
- Create: `web/lib/clubRevenue.ts`
- Test: `web/lib/clubRevenue.test.ts`

**Interfaces:**
- Consumes: `db`, `rounds`, `clubs` (`@/db/schema`); `publicClient`, `revenueShareRoundAbi`, `totalRaised`, `totalShares`, `roundState`, `shareBalance`, `pendingReward`, `totalDistributedToHolders`, `readSafely` (`@/lib/contracts`); viem `parseAbiItem`.
- Produces (types): `ClubRound`, `ClubTotals`, `Distribution`, `SeriesPoint`, `Holder`, and their `*DTO` string-serialized variants.
- Produces (pure, unit-tested): `cumulativeSeries(dists: Distribution[]): SeriesPoint[]` (time-sorted running sum of `credited`); `capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number` (0..100, `0` when cap is 0); the DTO serializers.
- Produces (server orchestration): `getRoundInvestors(round): Promise<\`0x${string}\`[]>`, `getRoundHolders(round): Promise<Holder[]>`, `getClubOverview(clubId): Promise<{ totals: ClubTotals; rounds: ClubRound[] }>`, `getClubDistributions(clubId): Promise<{ distributions: Distribution[]; series: SeriesPoint[] }>`.

> **Cap math (verified against `RevenueShareRound.sol`):** `cap = totalRaised * capMultiple / 10_000`; the contract credits holders only while `totalDistributedToHolders < cap`. So `capUtilization = totalDistributedToHolders * 100 / cap`, clamped to 100.

- [ ] **Step 1: Write the failing test** — `web/lib/clubRevenue.test.ts` (pure helpers only; the DB/RPC orchestration is covered by build + manual)

```ts
// web/lib/clubRevenue.test.ts
import assert from "node:assert";
import { cumulativeSeries, capUtilization, toClubRoundDTO, type Distribution, type ClubRound } from "./clubRevenue";

// cumulativeSeries: sort by ts ascending, running sum of `credited`
const dists: Distribution[] = [
  { roundId: 1, roundName: "R", received: 0n, credited: 100n, refunded: 0n, txHash: "0xb", timestamp: 2 },
  { roundId: 1, roundName: "R", received: 0n, credited: 50n, refunded: 0n, txHash: "0xa", timestamp: 1 },
  { roundId: 1, roundName: "R", received: 0n, credited: 25n, refunded: 0n, txHash: "0xc", timestamp: 3 },
];
const series = cumulativeSeries(dists);
assert.deepEqual(series.map((p) => [p.ts, p.cumulative]), [[1, 50n], [2, 150n], [3, 175n]]);
assert.deepEqual(cumulativeSeries([]), []);

// capUtilization: cap = raised*capMultiple/1e4; pct = distributed*100/cap, clamp 100, 0 when cap 0
assert.equal(capUtilization(75_000000n, 100_000000n, 15000), 50); // cap 150 USDT, 75 used -> 50%
assert.equal(capUtilization(150_000000n, 100_000000n, 15000), 100);
assert.equal(capUtilization(200_000000n, 100_000000n, 15000), 100); // clamp
assert.equal(capUtilization(5n, 0n, 15000), 0);   // no raise -> cap 0
assert.equal(capUtilization(5n, 100n, 0), 0);     // capMultiple 0 -> cap 0

// toClubRoundDTO stringifies bigints, ISO-izes the date, keeps scalars
const cr: ClubRound = {
  roundId: 7, contractAddress: "0xabc", name: "FC · Round #7", goal: 40_000000n,
  raised: 30_000000n, totalShares: 30_000000n, distributed: 1_000000n,
  capMultiple: 15000, revenueBps: 800, deadline: new Date("2026-08-01T00:00:00.000Z"),
  status: "active", capUtilizationPct: 2.22,
};
const dto = toClubRoundDTO(cr);
assert.equal(dto.raised, "30000000");
assert.equal(dto.distributed, "1000000");
assert.equal(dto.deadline, "2026-08-01T00:00:00.000Z");
assert.equal(dto.capUtilizationPct, 2.22);
assert.equal(dto.status, "active");

console.log("clubRevenue helpers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/clubRevenue.test.ts`
Expected: FAIL — cannot find module `./clubRevenue`.

- [ ] **Step 3: Create `web/lib/clubRevenue.ts`**

```ts
// Club revenue reads — money truth on-chain (CLAUDE.md). The DB supplies the
// verified round allowlist + round params; balances, distributions, holders,
// and cap utilization come from the contract / event logs. The `events` cache
// is deliberately NOT used here: it has no investor address and its `ts` is
// sync-time not block-time. Server-only (imports the DB).
import { eq } from "drizzle-orm";
import { parseAbiItem } from "viem";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";
import {
  publicClient,
  totalRaised,
  totalShares,
  roundState,
  shareBalance,
  pendingReward,
  totalDistributedToHolders,
  readSafely,
} from "@/lib/contracts";

const BPS_DENOM = 10_000n;
const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs (~40-50k blocks)

const INVESTED_EVENT = parseAbiItem(
  "event Invested(address indexed investor, uint256 usdtAmount, uint256 sharesMinted)",
);
const DISTRIBUTED_EVENT = parseAbiItem(
  "event Distributed(uint256 revenueReceived, uint256 creditedToHolders, uint256 refundedToClub)",
);

export type RoundStatus = "funding" | "active" | "closed";

export type ClubRound = {
  roundId: number;
  contractAddress: `0x${string}`;
  name: string;
  goal: bigint;
  raised: bigint;
  totalShares: bigint;
  distributed: bigint;
  capMultiple: number;
  revenueBps: number;
  deadline: Date;
  status: RoundStatus;
  capUtilizationPct: number;
};
export type ClubTotals = { raised: bigint; distributed: bigint; roundCount: number; backerCount: number };
export type Distribution = {
  roundId: number;
  roundName: string;
  received: bigint;
  credited: bigint;
  refunded: bigint;
  txHash: `0x${string}`;
  timestamp: number;
};
export type SeriesPoint = { ts: number; cumulative: bigint };
export type Holder = { address: `0x${string}`; shares: bigint; claimable: bigint; pct: number };

// --- DTOs (bigints as strings; scalars kept) --------------------------------
export type ClubRoundDTO = Omit<ClubRound, "goal" | "raised" | "totalShares" | "distributed" | "deadline"> & {
  goal: string; raised: string; totalShares: string; distributed: string; deadline: string;
};
export type ClubTotalsDTO = Omit<ClubTotals, "raised" | "distributed"> & { raised: string; distributed: string };
export type DistributionDTO = Omit<Distribution, "received" | "credited" | "refunded"> & {
  received: string; credited: string; refunded: string;
};
export type SeriesPointDTO = { ts: number; cumulative: string };
export type HolderDTO = Omit<Holder, "shares" | "claimable"> & { shares: string; claimable: string };

export function toClubRoundDTO(r: ClubRound): ClubRoundDTO {
  return { ...r, goal: r.goal.toString(), raised: r.raised.toString(), totalShares: r.totalShares.toString(), distributed: r.distributed.toString(), deadline: r.deadline.toISOString() };
}
export function toClubTotalsDTO(t: ClubTotals): ClubTotalsDTO {
  return { ...t, raised: t.raised.toString(), distributed: t.distributed.toString() };
}
export function toDistributionDTO(d: Distribution): DistributionDTO {
  return { ...d, received: d.received.toString(), credited: d.credited.toString(), refunded: d.refunded.toString() };
}
export function toSeriesPointDTO(p: SeriesPoint): SeriesPointDTO {
  return { ts: p.ts, cumulative: p.cumulative.toString() };
}
export function toHolderDTO(h: Holder): HolderDTO {
  return { ...h, shares: h.shares.toString(), claimable: h.claimable.toString() };
}

// --- pure helpers -----------------------------------------------------------
export function cumulativeSeries(dists: Distribution[]): SeriesPoint[] {
  const sorted = [...dists].sort((a, b) => a.timestamp - b.timestamp);
  let acc = 0n;
  return sorted.map((d) => {
    acc += d.credited;
    return { ts: d.timestamp, cumulative: acc };
  });
}

export function capUtilization(distributed: bigint, raised: bigint, capMultipleBps: number): number {
  const cap = (raised * BigInt(capMultipleBps)) / BPS_DENOM;
  if (cap === 0n) return 0;
  const pct = Number((distributed * 10_000n) / cap) / 100;
  return Math.min(100, pct);
}

const STATUS: RoundStatus[] = ["funding", "active", "closed"];

// --- on-chain orchestration -------------------------------------------------
async function windowFromBlock(): Promise<bigint> {
  const latest = await publicClient.getBlockNumber();
  return latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;
}

/** Unique investor addresses for a round (from Invested logs). */
export async function getRoundInvestors(roundAddress: `0x${string}`): Promise<`0x${string}`[]> {
  const fromBlock = await windowFromBlock();
  const logs = await publicClient.getLogs({ address: roundAddress, event: INVESTED_EVENT, fromBlock, toBlock: "latest" });
  const set = new Set<string>();
  for (const log of logs) {
    const investor = (log as unknown as { args: { investor?: string } }).args.investor;
    if (investor) set.add(investor.toLowerCase());
  }
  return [...set] as `0x${string}`[];
}

/** Cap-table for a round: current holders (shares > 0) with claimable + %. */
export async function getRoundHolders(roundAddress: `0x${string}`): Promise<Holder[]> {
  const investors = await getRoundInvestors(roundAddress);
  const supply = await readSafely(() => totalShares(roundAddress), 0n);
  const holders = await Promise.all(
    investors.map(async (address): Promise<Holder | null> => {
      const shares = await readSafely(() => shareBalance(roundAddress, address), 0n);
      if (shares === 0n) return null;
      const claimable = await readSafely(() => pendingReward(roundAddress, address), 0n);
      const pct = supply === 0n ? 0 : Number((shares * 10_000n) / supply) / 100;
      return { address, shares, claimable, pct };
    }),
  );
  return holders.filter((h): h is Holder => h !== null);
}

async function clubRoundsRows(clubId: number) {
  return db.select().from(rounds).where(eq(rounds.clubId, clubId));
}

export async function getClubOverview(clubId: number): Promise<{ totals: ClubTotals; rounds: ClubRound[] }> {
  const rows = (await clubRoundsRows(clubId)).filter((r) => r.verified);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const clubName = club?.name ?? "Club";

  const backerSet = new Set<string>();
  const enriched = await Promise.all(
    rows.map(async (row): Promise<ClubRound> => {
      const address = row.contractAddress as `0x${string}`;
      const [raised, supply, stateIdx, distributed, investors] = await Promise.all([
        readSafely(() => totalRaised(address), 0n),
        readSafely(() => totalShares(address), 0n),
        readSafely(async () => STATUS.indexOf((await roundState(address)).toLowerCase() as RoundStatus), 0),
        readSafely(() => totalDistributedToHolders(address), 0n),
        readSafely(() => getRoundInvestors(address), [] as `0x${string}`[]),
      ]);
      investors.forEach((i) => backerSet.add(i));
      return {
        roundId: row.id,
        contractAddress: address,
        name: `${clubName} · Round #${row.id}`,
        goal: BigInt(row.goal),
        raised,
        totalShares: supply,
        distributed,
        capMultiple: row.capMultiple,
        revenueBps: row.revenueBps,
        deadline: row.deadline,
        status: STATUS[stateIdx] ?? "funding",
        capUtilizationPct: capUtilization(distributed, raised, row.capMultiple),
      };
    }),
  );

  const totals: ClubTotals = {
    raised: enriched.reduce((s, r) => s + r.raised, 0n),
    distributed: enriched.reduce((s, r) => s + r.distributed, 0n),
    roundCount: enriched.length,
    backerCount: backerSet.size,
  };
  return { totals, rounds: enriched };
}

export async function getClubDistributions(clubId: number): Promise<{ distributions: Distribution[]; series: SeriesPoint[] }> {
  const rows = (await clubRoundsRows(clubId)).filter((r) => r.verified);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  const clubName = club?.name ?? "Club";
  const fromBlock = await windowFromBlock();

  const perRound = await Promise.all(
    rows.map(async (row): Promise<Distribution[]> => {
      const address = row.contractAddress as `0x${string}`;
      const logs = await readSafely(
        () => publicClient.getLogs({ address, event: DISTRIBUTED_EVENT, fromBlock, toBlock: "latest" }),
        [] as Awaited<ReturnType<typeof publicClient.getLogs>>,
      );
      const blocks = [...new Set(logs.map((l) => l.blockNumber).filter((b): b is bigint => b !== null))];
      const times = new Map<bigint, number>();
      await Promise.all(
        blocks.map(async (bn) => {
          const block = await readSafely(() => publicClient.getBlock({ blockNumber: bn }), null);
          if (block) times.set(bn, Number(block.timestamp));
        }),
      );
      return logs.map((l) => {
        const a = (l as unknown as { args: { revenueReceived?: bigint; creditedToHolders?: bigint; refundedToClub?: bigint } }).args;
        return {
          roundId: row.id,
          roundName: `${clubName} · Round #${row.id}`,
          received: a.revenueReceived ?? 0n,
          credited: a.creditedToHolders ?? 0n,
          refunded: a.refundedToClub ?? 0n,
          txHash: (l.transactionHash ?? "0x") as `0x${string}`,
          timestamp: l.blockNumber ? (times.get(l.blockNumber) ?? 0) : 0,
        };
      });
    }),
  );

  const distributions = perRound.flat().sort((a, b) => a.timestamp - b.timestamp);
  return { distributions, series: cumulativeSeries(distributions) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/clubRevenue.test.ts`
Expected: PASS — prints `clubRevenue helpers OK`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/clubRevenue.ts web/lib/clubRevenue.test.ts
git commit -m "feat(club): clubRevenue lib (overview, distributions, holders, cap util)"
```

---

### Task 3: `requireClub` helper + `/api/club/*` routes

**Files:**
- Create: `web/lib/clubAuth.ts`, `web/app/api/club/overview/route.ts`, `web/app/api/club/distributions/route.ts`, `web/app/api/club/holders/route.ts`

**Interfaces:**
- Consumes: `auth` (`@/lib/auth`), `db`/`clubs`/`rounds`/`Club` (`@/db/schema`), `getClubOverview`/`getClubDistributions`/`getRoundHolders` + DTO serializers (`@/lib/clubRevenue`).
- Produces: `requireClub(): Promise<{ club: Club } | { error: NextResponse }>` (`@/lib/clubAuth`); route JSON — overview → `{ totals: ClubTotalsDTO, rounds: ClubRoundDTO[] }`; distributions → `{ distributions: DistributionDTO[], series: SeriesPointDTO[] }`; holders → `{ holders: HolderDTO[] }`.

> Every route resolves the caller's club from the session (never client input), matching `web/app/api/rounds/route.ts` POST. `requireClub` centralizes the gate (401 no session, 403 non-club, 409 no linked club) so the three routes don't duplicate it. `Club` is already exported from `web/db/schema.ts` (`export type Club = typeof clubs.$inferSelect`).

- [ ] **Step 1: Create `web/lib/clubAuth.ts`**

```ts
// Shared session→club gate for the /api/club/* routes. Resolves the caller's
// club from the session (like /api/rounds POST) — never trusts client input.
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, type Club } from "@/db/schema";

export type RequireClubResult = { club: Club } | { error: NextResponse };

export async function requireClub(): Promise<RequireClubResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: NextResponse.json({ error: "not authenticated" }, { status: 401 }) };
  if (session.user.role !== "club") return { error: NextResponse.json({ error: "clubs only" }, { status: 403 }) };
  const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
  if (!club) return { error: NextResponse.json({ error: "no club linked" }, { status: 409 }) };
  return { club };
}
```

- [ ] **Step 2: Create `web/app/api/club/overview/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireClub } from "@/lib/clubAuth";
import { getClubOverview, toClubTotalsDTO, toClubRoundDTO } from "@/lib/clubRevenue";

export async function GET() {
  const c = await requireClub();
  if ("error" in c) return c.error;
  try {
    const { totals, rounds } = await getClubOverview(c.club.id);
    return NextResponse.json({ totals: toClubTotalsDTO(totals), rounds: rounds.map(toClubRoundDTO) });
  } catch {
    return NextResponse.json({ totals: { raised: "0", distributed: "0", roundCount: 0, backerCount: 0 }, rounds: [] });
  }
}
```

- [ ] **Step 3: Create `web/app/api/club/distributions/route.ts`**

```ts
import { NextResponse } from "next/server";
import { requireClub } from "@/lib/clubAuth";
import { getClubDistributions, toDistributionDTO, toSeriesPointDTO } from "@/lib/clubRevenue";

export async function GET() {
  const c = await requireClub();
  if ("error" in c) return c.error;
  try {
    const { distributions, series } = await getClubDistributions(c.club.id);
    return NextResponse.json({ distributions: distributions.map(toDistributionDTO), series: series.map(toSeriesPointDTO) });
  } catch {
    return NextResponse.json({ distributions: [], series: [] });
  }
}
```

- [ ] **Step 4: Create `web/app/api/club/holders/route.ts`** (verifies the round belongs to the caller's club's verified rounds before scanning)

```ts
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import { requireClub } from "@/lib/clubAuth";
import { getRoundHolders, toHolderDTO } from "@/lib/clubRevenue";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const c = await requireClub();
  if ("error" in c) return c.error;

  const round = new URL(request.url).searchParams.get("round");
  if (!round || !ADDRESS_RE.test(round)) {
    return NextResponse.json({ error: "invalid round address" }, { status: 400 });
  }
  // Only scan a round that belongs to THIS club and is verified.
  const [owned] = await db
    .select()
    .from(rounds)
    .where(and(eq(rounds.clubId, c.club.id), eq(rounds.contractAddress, round), eq(rounds.verified, true)));
  if (!owned) {
    return NextResponse.json({ error: "round not found for this club" }, { status: 403 });
  }

  try {
    const holders = await getRoundHolders(round as `0x${string}`);
    return NextResponse.json({ holders: holders.map(toHolderDTO) });
  } catch {
    return NextResponse.json({ holders: [] });
  }
}
```

- [ ] **Step 5: Verify compile + lint**

Run (from `web/`): `npx tsc --noEmit`; then (from root) `pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/lib/clubAuth.ts web/app/api/club
git commit -m "feat(club): requireClub gate + session-scoped /api/club/{overview,distributions,holders}"
```

---

### Task 4: recharts dep, client DTO types, RevenueChart

**Files:**
- Modify: `web/package.json` (add `recharts`)
- Create: `web/components/club/types.ts`, `web/components/club/RevenueChart.tsx`

**Interfaces:**
- Produces (`types.ts`): DTO types re-declared client-side (`ClubRoundDTO`, `ClubTotalsDTO`, `DistributionDTO`, `SeriesPointDTO`, `HolderDTO`) + views (`ClubRoundView`, `ClubTotalsView`, `DistributionView`, `HolderView`) + parsers (`parseClubRound`, `parseClubTotals`, `parseDistribution`, `parseHolder`, `seriesToPoints`). No server/DB import.
- Produces (`RevenueChart`): `RevenueChart({ points }: { points: { ts: number; usdt: number }[] })` — recharts area chart.

- [ ] **Step 1: Add recharts**

Run (from `web/`): `pnpm add recharts`
Expected: `"recharts"` added to `web/package.json`, lockfile updated.

- [ ] **Step 2: Create `web/components/club/types.ts`** (client-safe — no `@/lib/clubRevenue` / DB import)

```ts
export type ClubTotalsDTO = { raised: string; distributed: string; roundCount: number; backerCount: number };
export type ClubRoundDTO = {
  roundId: number; contractAddress: `0x${string}`; name: string;
  goal: string; raised: string; totalShares: string; distributed: string;
  capMultiple: number; revenueBps: number; deadline: string;
  status: "funding" | "active" | "closed"; capUtilizationPct: number;
};
export type DistributionDTO = {
  roundId: number; roundName: string; received: string; credited: string; refunded: string;
  txHash: `0x${string}`; timestamp: number;
};
export type SeriesPointDTO = { ts: number; cumulative: string };
export type HolderDTO = { address: `0x${string}`; shares: string; claimable: string; pct: number };

export type ClubTotalsView = { raised: bigint; distributed: bigint; roundCount: number; backerCount: number };
export type ClubRoundView = Omit<ClubRoundDTO, "goal" | "raised" | "totalShares" | "distributed" | "deadline"> & {
  goal: bigint; raised: bigint; totalShares: bigint; distributed: bigint; deadline: Date;
};
export type DistributionView = Omit<DistributionDTO, "received" | "credited" | "refunded"> & {
  received: bigint; credited: bigint; refunded: bigint;
};
export type HolderView = Omit<HolderDTO, "shares" | "claimable"> & { shares: bigint; claimable: bigint };

export function parseClubTotals(d: ClubTotalsDTO): ClubTotalsView {
  return { ...d, raised: BigInt(d.raised), distributed: BigInt(d.distributed) };
}
export function parseClubRound(d: ClubRoundDTO): ClubRoundView {
  return { ...d, goal: BigInt(d.goal), raised: BigInt(d.raised), totalShares: BigInt(d.totalShares), distributed: BigInt(d.distributed), deadline: new Date(d.deadline) };
}
export function parseDistribution(d: DistributionDTO): DistributionView {
  return { ...d, received: BigInt(d.received), credited: BigInt(d.credited), refunded: BigInt(d.refunded) };
}
export function parseHolder(d: HolderDTO): HolderView {
  return { ...d, shares: BigInt(d.shares), claimable: BigInt(d.claimable) };
}
/** Series → chart points in whole USD₮ (display only; number is fine for an axis). */
export function seriesToPoints(series: SeriesPointDTO[]): { ts: number; usdt: number }[] {
  return series.map((p) => ({ ts: p.ts, usdt: Number(BigInt(p.cumulative)) / 1_000_000 }));
}
```

- [ ] **Step 3: Create `web/components/club/RevenueChart.tsx`**

```tsx
"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/card";

function fmtDate(ts: number): string {
  return ts ? new Date(ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export function RevenueChart({ points }: { points: { ts: number; usdt: number }[] }) {
  return (
    <Card className="glow gap-3 p-5">
      <h2 className="font-display text-xl uppercase tracking-wide">Revenue distributed</h2>
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          No distributions yet.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <defs>
              <linearGradient id="revfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="ts" tickFormatter={fmtDate} stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={48} />
            <Tooltip
              formatter={(v: number) => [`${v.toLocaleString("en-US")} USD₮`, "Cumulative"]}
              labelFormatter={(ts: number) => fmtDate(ts)}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
            />
            <Area type="monotone" dataKey="usdt" stroke="var(--primary)" strokeWidth={2} fill="url(#revfill)" />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Verify compile + lint** (recharts is a client component; no page renders it yet)

Run (from `web/`): `npx tsc --noEmit`; then (from root) `pnpm --filter web lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/components/club/types.ts web/components/club/RevenueChart.tsx web/package.json ../pnpm-lock.yaml
git commit -m "feat(club): recharts dep + client DTO types + RevenueChart"
```

---

### Task 5: Dialogs (Distribute, Holders, Create round)

**Files:**
- Create: `web/components/club/DistributeDialog.tsx`, `web/components/club/HoldersDialog.tsx`, `web/components/club/CreateRoundDialog.tsx`

**Interfaces:**
- Consumes: `getWallet` (`@/lib/wdk`); `approveUsdt`, `usdtAllowance`, `distribute` (`@/lib/contracts`); `parseUsdt`, `formatUsdt`, `shortenAddress`, `explorerTxUrl` (`@/lib/format`); `friendlyError`; `useCurrentUserId`; `Dialog*`, `Button`, `Input`, `Label`, `Skeleton`; `parseHolder`, `HolderView` (`./types`); the existing `CreateRoundForm` (`@/components/CreateRoundForm`); `ClubRoundView` (`./types`).
- Produces: `DistributeDialog({ open, onOpenChange, round, onDistributed })` where `round: ClubRoundView`; `HoldersDialog({ open, onOpenChange, round })`; `CreateRoundDialog({ open, onOpenChange, clubName, clubWalletAddress, usdtAddress, onCreated })`.

- [ ] **Step 1: Create `web/components/club/DistributeDialog.tsx`** (money-out; two-step review + non-throwing parse guard)

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { getWallet } from "@/lib/wdk";
import { approveUsdt, distribute, usdtAllowance } from "@/lib/contracts";
import { parseUsdt, formatUsdt, explorerTxUrl } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import type { ClubRoundView } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeParseUsdt(input: string): bigint | null {
  if (input.trim() === "") return null;
  try {
    return parseUsdt(input);
  } catch {
    return null;
  }
}

export function DistributeDialog({
  open,
  onOpenChange,
  round,
  onDistributed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: ClubRoundView;
  onDistributed?: () => void;
}) {
  const { userId } = useCurrentUserId();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [busy, setBusy] = useState(false);

  const parsed = safeParseUsdt(amount);
  const value = parsed ?? 0n;
  const validAmount = parsed !== null && parsed > 0n;

  function reset() {
    setStep("form");
    setBusy(false);
  }

  async function handleDistribute() {
    if (!userId || !validAmount) return;
    setBusy(true);
    const toastId = toast.loading("Preparing…");
    try {
      const wallet = await getWallet(userId);
      const allowance = await usdtAllowance(wallet.address, round.contractAddress);
      if (allowance < value) {
        toast.loading("Approving USD₮…", { id: toastId });
        await approveUsdt(wallet, round.contractAddress, value);
      }
      toast.loading("Distributing…", { id: toastId });
      const hash = await distribute(wallet, round.contractAddress, value);
      toast.success("Distribution sent", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank", "noopener,noreferrer") },
      });
      onDistributed?.();
      onOpenChange(false);
      setAmount("");
      reset();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Distribute revenue</DialogTitle>
          <DialogDescription>
            {step === "form" ? "Pay revenue to this round's holders." : "Confirm the distribution."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dist-amount">Revenue to distribute (USD₮)</Label>
              <Input id="dist-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              {amount !== "" && !validAmount && <span className="text-xs text-destructive">Enter a valid amount.</span>}
              <span className="text-xs text-muted-foreground">
                Holders receive {round.revenueBps / 100}% of revenue, up to the round&apos;s cap.
              </span>
            </div>
            <DialogFooter>
              <Button disabled={!validAmount} onClick={() => setStep("review")}>Review</Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="text-xs text-muted-foreground">You&apos;re distributing</div>
              <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(value)} USD₮</div>
              <div className="mt-2 text-xs text-muted-foreground">to {round.name} holders</div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")} disabled={busy}>Back</Button>
              <Button onClick={handleDistribute} disabled={busy}>{busy ? "Distributing…" : "Confirm"}</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Create `web/components/club/HoldersDialog.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { parseHolder, type HolderView } from "./types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export function HoldersDialog({
  open,
  onOpenChange,
  round,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  round: { contractAddress: `0x${string}`; name: string };
}) {
  const [holders, setHolders] = useState<HolderView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/club/holders?round=${round.contractAddress}`).then((r) => r.json());
      setHolders((res.holders ?? []).map(parseHolder));
    } finally {
      setLoading(false);
    }
  }, [round.contractAddress]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Backers</DialogTitle>
          <DialogDescription>{round.name}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : holders.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No backers yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {holders.map((h) => (
              <li key={h.address} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <a href={explorerTxUrl(h.address).replace("/tx/", "/address/")} target="_blank" rel="noopener noreferrer" className="font-mono text-sm hover:text-primary">
                    {shortenAddress(h.address)}
                  </a>
                  <div className="text-xs text-muted-foreground">{h.pct}% of round</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">{formatUsdt(h.shares)} shares</div>
                  <div className="text-xs text-muted-foreground">claimable {formatUsdt(h.claimable)} USD₮</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Create `web/components/club/CreateRoundDialog.tsx`** (wraps the existing `CreateRoundForm`)

```tsx
"use client";

import { useEffect, useRef } from "react";
import { CreateRoundForm } from "@/components/CreateRoundForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function CreateRoundDialog({
  open,
  onOpenChange,
  clubName,
  clubWalletAddress,
  usdtAddress,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}`;
  onCreated?: () => void;
}) {
  // CreateRoundForm calls router.refresh() on success; close the dialog + let
  // the parent refetch when the dialog transitions to a fresh open.
  const wasOpen = useRef(open);
  useEffect(() => {
    wasOpen.current = open;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a round</DialogTitle>
          <DialogDescription>Deploy a new revenue-share round for {clubName}.</DialogDescription>
        </DialogHeader>
        <CreateRoundForm
          clubName={clubName}
          clubWalletAddress={clubWalletAddress}
          usdtAddress={usdtAddress}
          onCreated={() => {
            onCreated?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
```

> **`CreateRoundForm` needs an optional `onCreated` callback.** It currently calls `router.refresh()` on success (`web/components/CreateRoundForm.tsx`). Add an optional prop and call it alongside the refresh so the dialog can close + the parent can refetch. See Step 4.

- [ ] **Step 4: Add the optional `onCreated` prop to `web/components/CreateRoundForm.tsx`**

Change the `Props` type and the success branch. Current success branch:
```tsx
      toast.success("Round created!", { id: toastId });
      router.refresh();
```
Update the `Props` type (top of file) to add `onCreated?: () => void;`, destructure it in the component signature, and change the success branch to:
```tsx
      toast.success("Round created!", { id: toastId });
      onCreated?.();
      router.refresh();
```
(Leave everything else — the on-chain deploy + `/api/rounds` register — byte-for-byte unchanged. `router.refresh()` stays so the standalone usage still works if any remains.)

- [ ] **Step 5: Verify compile + lint**

Run (from `web/`): `npx tsc --noEmit`; then (from root) `pnpm --filter web lint`
Expected: PASS. (Dialogs aren't rendered by a page yet — Task 6 wires them.)

- [ ] **Step 6: Commit**

```bash
git add web/components/club/DistributeDialog.tsx web/components/club/HoldersDialog.tsx web/components/club/CreateRoundDialog.tsx web/components/CreateRoundForm.tsx
git commit -m "feat(club): distribute/holders/create-round dialogs"
```

---

### Task 6: Club Overview page (hero, chart, rounds) + delete DistributeForm

**Files:**
- Create: `web/components/club/ClubHero.tsx`, `web/components/club/ClubRoundsList.tsx`, `web/components/club/ClubOverview.tsx`
- Modify: `web/app/(app)/dashboard/page.tsx`
- Delete: `web/components/DistributeForm.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–5 + `RoundProgress` (`@/components/RoundProgress`), `formatUsdt`, `useCurrentUserId`, `useSearchParams`, `Card`/`Button`/`Skeleton`/`Badge`.
- Produces: `ClubOverview({ clubName, clubWalletAddress, usdtAddress })` (default entry rendered by the page), `ClubHero`, `ClubRoundsList`.

- [ ] **Step 1: Create `web/components/club/ClubHero.tsx`**

```tsx
"use client";

import { formatUsdt } from "@/lib/format";
import { WalletModeChip } from "@/components/shell/WalletModeChip";
import { Button } from "@/components/ui/button";
import type { ClubTotalsView } from "./types";

export function ClubHero({ clubName, totals, onNewRound }: { clubName: string; totals: ClubTotalsView; onNewRound: () => void }) {
  return (
    <div className="glow flex flex-col gap-6 rounded-xl bg-primary p-6 text-primary-foreground">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-70">Club revenue — {clubName}</div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <div className="text-xs opacity-70">Raised</div>
              <div className="font-display text-4xl tracking-wide">{formatUsdt(totals.raised)} <span className="text-xl">USD₮</span></div>
            </div>
            <div>
              <div className="text-xs opacity-70">Distributed</div>
              <div className="font-display text-4xl tracking-wide">{formatUsdt(totals.distributed)} <span className="text-xl">USD₮</span></div>
            </div>
          </div>
        </div>
        <WalletModeChip />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs opacity-80">{totals.roundCount} rounds · {totals.backerCount} backers</div>
        <Button variant="secondary" onClick={onNewRound}>New round</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `web/components/club/ClubRoundsList.tsx`**

```tsx
"use client";

import { RoundProgress } from "@/components/RoundProgress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ClubRoundView } from "./types";

export function ClubRoundsList({
  rounds,
  onDistribute,
  onHolders,
  onNewRound,
}: {
  rounds: ClubRoundView[];
  onDistribute: (r: ClubRoundView) => void;
  onHolders: (r: ClubRoundView) => void;
  onNewRound: () => void;
}) {
  if (rounds.length === 0) {
    return (
      <Card className="items-start gap-2 p-6">
        <div className="text-sm text-muted-foreground">You haven&apos;t created a round yet.</div>
        <Button size="sm" onClick={onNewRound}>New round</Button>
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {rounds.map((r) => {
        const canDistribute = r.status === "active" && r.totalShares > 0n;
        return (
          <div key={r.roundId} className="flex flex-col gap-2">
            <RoundProgress raised={r.raised} goal={r.goal} capMultiple={r.capMultiple} revenueBps={r.revenueBps} deadline={r.deadline} status={r.status} />
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onDistribute(r)} disabled={!canDistribute}>Distribute</Button>
              <Button size="sm" variant="outline" onClick={() => onHolders(r)}>Holders</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Create `web/components/club/ClubOverview.tsx`** (orchestrator; reads `?action=newRound`)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { friendlyError } from "@/lib/txError";
import {
  parseClubTotals, parseClubRound, seriesToPoints,
  type ClubTotalsView, type ClubRoundView, type SeriesPointDTO,
} from "./types";
import { ClubHero } from "./ClubHero";
import { RevenueChart } from "./RevenueChart";
import { ClubRoundsList } from "./ClubRoundsList";
import { DistributeDialog } from "./DistributeDialog";
import { HoldersDialog } from "./HoldersDialog";
import { CreateRoundDialog } from "./CreateRoundDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ClubOverview({
  clubName,
  clubWalletAddress,
  usdtAddress,
}: {
  clubName: string;
  clubWalletAddress: `0x${string}`;
  usdtAddress: `0x${string}` | undefined;
}) {
  const searchParams = useSearchParams();
  const [totals, setTotals] = useState<ClubTotalsView | null>(null);
  const [rounds, setRounds] = useState<ClubRoundView[]>([]);
  const [points, setPoints] = useState<{ ts: number; usdt: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [distributeRound, setDistributeRound] = useState<ClubRoundView | null>(null);
  const [holdersRound, setHoldersRound] = useState<ClubRoundView | null>(null);
  const [createOpen, setCreateOpen] = useState(searchParams.get("action") === "newRound");

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [overview, dist] = await Promise.all([
        fetch("/api/club/overview").then((r) => r.json()),
        fetch("/api/club/distributions").then((r) => r.json()),
      ]);
      setTotals(parseClubTotals(overview.totals));
      setRounds((overview.rounds ?? []).map(parseClubRound));
      setPoints(seriesToPoints((dist.series ?? []) as SeriesPointDTO[]));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (error || !totals) {
    return (
      <Card className="mx-auto max-w-4xl border-destructive/40 bg-destructive/10 p-5 text-destructive">
        Could not load your dashboard: {error ?? "unknown error"}
      </Card>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <ClubHero clubName={clubName} totals={totals} onNewRound={() => setCreateOpen(true)} />
      <RevenueChart points={points} />
      <div className="flex flex-col gap-3">
        <h2 className="font-display text-xl uppercase tracking-wide">Your rounds</h2>
        <ClubRoundsList
          rounds={rounds}
          onDistribute={setDistributeRound}
          onHolders={setHoldersRound}
          onNewRound={() => setCreateOpen(true)}
        />
      </div>

      {distributeRound && (
        <DistributeDialog
          open={distributeRound !== null}
          onOpenChange={(v) => setDistributeRound(v ? distributeRound : null)}
          round={distributeRound}
          onDistributed={refresh}
        />
      )}
      {holdersRound && (
        <HoldersDialog
          open={holdersRound !== null}
          onOpenChange={(v) => setHoldersRound(v ? holdersRound : null)}
          round={holdersRound}
        />
      )}
      {usdtAddress && (
        <CreateRoundDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          clubName={clubName}
          clubWalletAddress={clubWalletAddress}
          usdtAddress={usdtAddress}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `web/app/(app)/dashboard/page.tsx`** (keep the server gate + club resolve + `EnsureWallet`; render `ClubOverview`)

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs } from "@/db/schema";
import { EnsureWallet } from "@/components/EnsureWallet";
import { ClubOverview } from "@/components/club/ClubOverview";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "club") redirect("/wallet");

  const [club] = await db.select().from(clubs).where(eq(clubs.userId, session.user.id));
  if (!club) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4">
        <EnsureWallet userId={session.user.id} hasWalletLinked={false} />
      </div>
    );
  }

  const usdtAddress = process.env.NEXT_PUBLIC_USDT_ADDRESS as `0x${string}` | undefined;

  return (
    <Suspense>
      <ClubOverview
        clubName={club.name}
        clubWalletAddress={club.walletAddress as `0x${string}`}
        usdtAddress={usdtAddress}
      />
    </Suspense>
  );
}
```

- [ ] **Step 5: Delete the superseded form**

```bash
git rm web/components/DistributeForm.tsx
```

- [ ] **Step 6: Build + lint** (stop dev + clear `.next` first)

Run (from root): `rm -rf web/.next && pnpm --filter web build && pnpm --filter web lint`
Expected: build + lint succeed. `git grep -n "DistributeForm" web/` returns nothing.

- [ ] **Step 7: Manual check (Playwright, dark)** — sign in as a club; `/dashboard` shows the lime totals hero, the revenue chart (or "No distributions yet"), and the rounds list; the shell "New round" CTA (`/dashboard?action=newRound`) and the hero button both open the create dialog; Distribute opens (and a bad amount is blocked); Holders opens (cap-table or empty). Use `emulateMedia({ colorScheme: 'dark' })`.

- [ ] **Step 8: Commit**

```bash
git add web/components/club web/app/\(app\)/dashboard/page.tsx
git commit -m "feat(club): club overview (hero, revenue chart, rounds, dialogs)"
```

---

### Task 7: Revenue detail page (history + cap utilization)

**Files:**
- Create: `web/components/club/RevenueDetail.tsx`, `web/app/(app)/dashboard/revenue/page.tsx`

**Interfaces:**
- Consumes: `parseDistribution`/`parseClubRound`/`DistributionView`/`ClubRoundView` (`./types`), `formatUsdt`, `formatRelativeTime`, `explorerTxUrl`, `Card`/`Skeleton`.
- Produces: `RevenueDetail()` (client) + the server page.

- [ ] **Step 1: Create `web/components/club/RevenueDetail.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsdt, formatRelativeTime, explorerTxUrl } from "@/lib/format";
import { parseDistribution, parseClubRound, type DistributionView, type ClubRoundView } from "./types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function RevenueDetail() {
  const [dists, setDists] = useState<DistributionView[]>([]);
  const [rounds, setRounds] = useState<ClubRoundView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [overview, dist] = await Promise.all([
        fetch("/api/club/overview").then((r) => r.json()),
        fetch("/api/club/distributions").then((r) => r.json()),
      ]);
      setRounds((overview.rounds ?? []).map(parseClubRound));
      setDists((dist.distributions ?? []).map(parseDistribution));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Skeleton className="mx-auto h-64 w-full max-w-3xl" />;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Revenue</h1>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Cap utilization</h2>
        {rounds.length === 0 ? (
          <div className="text-sm text-muted-foreground">No rounds yet.</div>
        ) : (
          rounds.map((r) => (
            <div key={r.roundId} className="flex flex-col gap-1">
              <div className="flex justify-between text-sm">
                <span>{r.name}</span>
                <span className="text-muted-foreground">
                  {formatUsdt(r.distributed)} distributed · {r.capUtilizationPct}% of cap
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-primary" style={{ width: `${r.capUtilizationPct}%` }} />
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="gap-3 p-5">
        <h2 className="font-display text-xl uppercase tracking-wide">Distribution history</h2>
        {dists.length === 0 ? (
          <div className="text-sm text-muted-foreground">No distributions yet.</div>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {dists.map((d) => (
              <li key={d.txHash} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <div className="text-sm">{d.roundName}</div>
                  <a href={explorerTxUrl(d.txHash)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-muted-foreground hover:text-foreground">
                    {d.timestamp ? formatRelativeTime(d.timestamp) : ""}
                  </a>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm text-primary">+{formatUsdt(d.credited)} to holders</div>
                  {d.refunded > 0n && <div className="text-xs text-muted-foreground">{formatUsdt(d.refunded)} refunded (over cap)</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create `web/app/(app)/dashboard/revenue/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { RevenueDetail } from "@/components/club/RevenueDetail";

export default async function RevenuePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  if (session.user.role !== "club") redirect("/wallet");
  return <RevenueDetail />;
}
```

- [ ] **Step 3: Build + lint** (stop dev + clear `.next` first)

Run (from root): `rm -rf web/.next && pnpm --filter web build && pnpm --filter web lint`
Expected: build + lint succeed; `/dashboard/revenue` present in the route list.

- [ ] **Step 4: Manual check (Playwright, dark)** — as a club, `/dashboard/revenue` shows the cap-utilization bars per round and the distribution-history list (or their empty states). The sidebar "Revenue" nav item is active. `emulateMedia({ colorScheme: 'dark' })`.

- [ ] **Step 5: Commit**

```bash
git add web/components/club/RevenueDetail.tsx web/app/\(app\)/dashboard/revenue/page.tsx
git commit -m "feat(club): revenue detail page (history + cap utilization)"
```

---

## Self-Review

**1. Spec coverage:**
- Overview: hero totals, revenue chart, rounds w/ Distribute + Holders, create dialog → Tasks 4–6. ✅
- Revenue page: distribution history + cap utilization → Task 7. ✅
- Distribute / Holders / Create dialogs → Task 5. ✅
- `lib/clubRevenue.ts` (overview, distributions, holders, pure helpers) → Task 2. ✅
- `contracts.ts` `totalDistributedToHolders` → Task 1. ✅
- `/api/club/{overview,distributions,holders}` session-scoped → Task 3. ✅
- recharts dep → Task 4. ✅
- On-chain logs (not events cache) for chart + holders → Task 2 (`getLogs`). ✅
- Money-out confirm + non-throwing parse → Task 5 (`DistributeDialog`, `safeParseUsdt`). ✅
- Holders route verifies round ownership → Task 3. ✅
- `?action=newRound` CTA → Task 6 (`ClubOverview` reads it). ✅
- Delete `DistributeForm` → Task 6. ✅

**2. Placeholder scan:** No TBD/TODO-in-steps; every code step carries full code; the test step has real assertions.

**3. Type consistency:** `ClubRound`/`ClubTotals`/`Distribution`/`SeriesPoint`/`Holder` (server, Task 2) mirror `*DTO`/`*View` (client, Task 4) field-for-field. `capUtilization`/`cumulativeSeries` signatures match between the helper (Task 2) and its use in `getClubOverview`/`getClubDistributions` (Task 2) and the returned DTO scalars consumed by the client (Tasks 6–7). `DistributeDialog` consumes `ClubRoundView` (Task 4) and `distribute`/`approveUsdt`/`usdtAllowance` (existing `contracts.ts`). `CreateRoundForm` gains an optional `onCreated` (Task 5 Step 4) consumed by `CreateRoundDialog`. Percent/utilization scalars are computed server-side and passed as `number` — no client twin needed, and no client component imports `@/lib/clubRevenue` (bundle-boundary constraint honored; deviates from spec §5.5's "twin" only in that the scalar is precomputed server-side, which is strictly cleaner).

**Session gate is DRY:** the three `/api/club/*` routes share `requireClub()` from `web/lib/clubAuth.ts` (Task 3 Step 1) — no duplicated auth logic. Routes narrow the result with `if ("error" in c) return c.error;`.
