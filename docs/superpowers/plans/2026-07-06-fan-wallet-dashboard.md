# Fan Wallet Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fan's `/wallet` into a fully-operable wallet dashboard (bold-stadium sidebar shell, hero balance, on-chain positions with claim, real activity, and Send / Receive / Add-funds dialogs).

**Architecture:** A shared `app/(app)/` route-group shell (sidebar + topbar, role-aware) wraps the dashboard pages. The fan overview reads balance + positions + activity via two GET API routes (`/api/wallet/positions`, `/api/wallet/history`) backed by on-chain viem reads and a wired WDK Indexer with a `getLogs` fallback. All writes (send, claim) sign in-browser through the existing `getWallet(userId)` WDK handle. Money truth stays on-chain; SQLite is metadata/cache only.

**Tech Stack:** Next.js 15 App Router (TS), Tailwind v4 (CSS tokens in `globals.css`), shadcn **base-nova** (`@base-ui/react`, NOT Radix), viem, `@tetherto/wdk*`, sonner, lucide-react, `qrcode.react` (new), SQLite (better-sqlite3 + Drizzle). Tests = standalone `tsx` scripts + `node:assert` (run `npx tsx web/lib/<x>.test.ts` from `web/`).

## Global Constraints

- **Design tokens are already shipped** in `web/app/globals.css` (bold-stadium). Do NOT add new colors/fonts. Lime hero = `bg-primary text-primary-foreground`; big numbers = `font-display` (Bebas); addresses/amounts = `font-mono`; cards get `.glow` where they're the focal point.
- **shadcn = base-nova** (`@base-ui/react`). `Button` has NO `asChild` — for a link that looks like a button use `buttonVariants({...})` + `cn()` on a `<Link>`. Menu/dialog items compose a link via `render={<Link/>}`. Never import from `@radix-ui/*`.
- **Amounts are `bigint` base units. USD₮ + share token = 6 decimals** (`1 USDT = 1_000000n`). JSON cannot carry bigint → API routes serialize bigints as strings; clients re-parse with `BigInt(...)` before any math or `formatUsdt`.
- **Server never holds the fan key.** Send/claim sign in-browser via `getWallet(userId)`. API routes only read public data.
- **Secrets stay server-side.** Indexer `x-api-key` (`WDK_INDEXER_API_KEY`) and MoonPay secret (`MOONPAY_SECRET_KEY`) are read ONLY in server modules / API routes — never `NEXT_PUBLIC_*`, never shipped to the browser. `lib/indexer.ts` and `lib/moonpay.ts` are server-only.
- **Verified-only.** Positions/claims only ever touch rounds with `rounds.verified = true` (the schema allowlist) — never point a claim at an unvetted contract.
- **Money-out (Send) requires an explicit review-and-confirm step**; recipient validated with viem `isAddress`; amount clamped `> 0` and `≤ balance`.
- **English copy** throughout (the app was translated to English; keep it that way).
- **Build hygiene:** the dev server shares `web/.next` with `next build` → stop dev and `rm -rf web/.next` before a build, or you'll hit `PageNotFoundError`. Test dark mode in Playwright with `emulateMedia({ colorScheme: 'dark' })` (headless defaults to light).
- **Route groups don't change URLs.** `(app)`/`(marketing)` only pick which layout wraps a page; `/wallet` stays `/wallet`.

---

## File Structure

**New — libs & API**
- `web/lib/positions.ts` — `getFanPositions(fan)` + pure helpers `investedFromShares`, `percentOfRound`, `toPositionDTO`.
- `web/app/api/wallet/positions/route.ts` — GET, returns `{ positions: FanPositionDTO[] }`.
- `web/app/api/wallet/history/route.ts` — GET, returns `{ entries: HistoryEntryDTO[] }`.
- Tests: `web/lib/format.test.ts`, `web/lib/positions.test.ts`, `web/lib/indexer.test.ts`, `web/lib/moonpay.test.ts`.

**New — UI primitives & shell**
- `web/components/ui/dialog.tsx` — base-nova Dialog wrapper.
- `web/components/shell/nav-items.ts` — role-aware nav config.
- `web/components/shell/AccountMenu.tsx` — the avatar dropdown (extracted from `Navbar`).
- `web/components/shell/WalletModeChip.tsx`
- `web/components/shell/Sidebar.tsx`
- `web/components/shell/Topbar.tsx`
- `web/components/shell/MobileNav.tsx`
- `web/components/shell/DashboardShell.tsx`

**New — wallet feature**
- `web/components/wallet/WalletOverview.tsx` — client orchestrator (owns refresh + dialog open state).
- `web/components/wallet/BalanceHero.tsx`
- `web/components/wallet/StatCards.tsx`
- `web/components/wallet/PositionsList.tsx` (incl. `PositionRow`)
- `web/components/wallet/ActivityPanel.tsx`
- `web/components/wallet/ActivityList.tsx` — shared row list (used by panel + full page).
- `web/components/wallet/SendDialog.tsx`
- `web/components/wallet/ReceiveDialog.tsx`
- `web/components/wallet/AddFundsDialog.tsx`
- `web/components/wallet/ClaimPositionButton.tsx`
- `web/components/wallet/types.ts` — client-safe DTO types + parsers (`FanPositionDTO`, `HistoryEntryDTO`, `parsePositionDTO`).
- `web/app/(app)/wallet/activity/page.tsx` + `web/components/wallet/ActivityFull.tsx`

**New — layouts (Task 10 route move)**
- `web/app/(app)/layout.tsx` — shell layout.
- `web/app/(marketing)/layout.tsx` — Navbar layout.

**Modified**
- `web/lib/format.ts` — add `shortenAddress`, `formatRelativeTime`, `explorerTxUrl`.
- `web/lib/contracts.ts` — add `totalShares(roundAddress)`.
- `web/lib/indexer.ts` — wire real Indexer + `getLogs` fallback (server-only); add pure mappers.
- `web/lib/moonpay.ts` — sign the widget URL when `MOONPAY_SECRET_KEY` present.
- `web/components/Navbar.tsx` — use extracted `AccountMenu`.
- `web/app/layout.tsx` — remove `<Navbar/>` (Task 10).
- `web/package.json` — add `qrcode.react`.

**Moved (Task 10, `git mv`, URLs unchanged)**
- `web/app/page.tsx` → `web/app/(marketing)/page.tsx`
- `web/app/account/` → `web/app/(marketing)/account/`
- `web/app/wallet/` → `web/app/(app)/wallet/`
- `web/app/dashboard/` → `web/app/(app)/dashboard/`

**Deleted (Task 9, superseded)**
- `web/components/WalletCard.tsx`, `web/components/ClaimButton.tsx`

---

### Task 1: Format helpers

**Files:**
- Modify: `web/lib/format.ts`
- Test: `web/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `shortenAddress(addr: string, chars?: number): string` — `"0x1234…abcd"` (default 4 each end).
  - `formatRelativeTime(unixSeconds: number, nowMs?: number): string` — `"just now" | "5m ago" | "3h ago" | "2d ago"`.
  - `explorerTxUrl(hash: string): string` — `"{explorerBase}/tx/{hash}"`, or `"#"` when the active chain has no explorer.

- [ ] **Step 1: Write the failing test** — `web/lib/format.test.ts`

```ts
// web/lib/format.test.ts
import assert from "node:assert";
import { shortenAddress, formatRelativeTime, explorerTxUrl } from "./format";

// shortenAddress
assert.equal(shortenAddress("0x1234567890abcdef1234567890abcdefdeadbeef"), "0x1234…beef");
assert.equal(shortenAddress("0x1234567890abcdef1234567890abcdefdeadbeef", 6), "0x123456…adbeef");
assert.equal(shortenAddress(""), ""); // tolerate empty

// formatRelativeTime — pin "now" so the test is deterministic
const now = 1_000_000_000_000; // ms
assert.equal(formatRelativeTime(1_000_000_000, now), "just now"); // 0s ago
assert.equal(formatRelativeTime(1_000_000_000 - 300, now), "5m ago");
assert.equal(formatRelativeTime(1_000_000_000 - 3 * 3600, now), "3h ago");
assert.equal(formatRelativeTime(1_000_000_000 - 2 * 86_400, now), "2d ago");

// explorerTxUrl — contains the hash and a /tx/ segment (or "#")
const url = explorerTxUrl("0xabc");
assert.ok(url === "#" || url.includes("/tx/0xabc"));

console.log("format helpers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/format.test.ts`
Expected: FAIL — `shortenAddress is not a function` (or import error).

- [ ] **Step 3: Add the implementations** to `web/lib/format.ts` (append below the existing exports; keep everything already there)

```ts
import { activeChain } from "./chain";

export function shortenAddress(addr: string, chars = 4): string {
  if (!addr || addr.length <= 2 + chars * 2) return addr;
  return `${addr.slice(0, 2 + chars)}…${addr.slice(-chars)}`;
}

export function formatRelativeTime(unixSeconds: number, nowMs: number = Date.now()): string {
  const diffSec = Math.max(0, Math.floor(nowMs / 1000) - unixSeconds);
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function explorerTxUrl(hash: string): string {
  const base = activeChain.blockExplorers?.default?.url;
  return base ? `${base}/tx/${hash}` : "#";
}
```

> `chain.ts` already exports `activeChain` (a viem chain). `formatRelativeTime` takes `nowMs` so the test is deterministic; call sites omit it.

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/format.test.ts`
Expected: PASS — prints `format helpers OK`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/format.ts web/lib/format.test.ts
git commit -m "feat(wallet): add address/time/explorer format helpers"
```

---

### Task 2: `totalShares` contract read

**Files:**
- Modify: `web/lib/contracts.ts` (add one exported function near `totalRaised`, line ~52)

**Interfaces:**
- Consumes: `publicClient`, `revenueShareRoundAbi` (already in `contracts.ts`).
- Produces: `totalShares(roundAddress: \`0x${string}\`): Promise<bigint>` — the round share token's ERC-20 `totalSupply`.

- [ ] **Step 1: Add the function** to `web/lib/contracts.ts` (after `totalRaised`)

```ts
export async function totalShares(roundAddress: `0x${string}`) {
  return publicClient.readContract({
    address: roundAddress,
    abi: revenueShareRoundAbi,
    functionName: "totalSupply",
  }) as Promise<bigint>;
}
```

- [ ] **Step 2: Type-check it compiles** (no dedicated unit test — it's a thin RPC read, covered by the positions integration + build)

Run (from `web/`): `npx tsc --noEmit`
Expected: PASS (no new errors from this file).

- [ ] **Step 3: Commit**

```bash
git add web/lib/contracts.ts
git commit -m "feat(wallet): add totalShares() read for round supply"
```

---

### Task 3: Positions library + API route

**Files:**
- Create: `web/lib/positions.ts`
- Create: `web/app/api/wallet/positions/route.ts`
- Test: `web/lib/positions.test.ts`

**Interfaces:**
- Consumes: `db`, `rounds`, `clubs` (`@/db/schema`); `shareBalance`, `pendingReward`, `totalRaised`, `totalShares`, `readSafely` (`@/lib/contracts`).
- Produces:
  - `type FanPosition` (bigints) and `type FanPositionDTO` (same shape, bigint fields as strings).
  - `investedFromShares(shares: bigint, sharePrice: bigint): bigint` — `shares * sharePrice / 1_000000n`.
  - `percentOfRound(shares: bigint, totalShares: bigint): number` — 2-decimal percent, `0` when supply is 0.
  - `toPositionDTO(p: FanPosition): FanPositionDTO`.
  - `getFanPositions(fan: \`0x${string}\`): Promise<FanPosition[]>` — verified rounds where `shares > 0`.

> **Share↔USD₮ math (verified against `RevenueShareRound.sol`):** shares are minted `received * 1e6 / sharePriceUsdt`, share token has 6 decimals, `SHARE_UNIT = 1e6`. Inverting: `investedUsdt = shares * sharePriceUsdt / 1_000000n`. `rounds.sharePrice` (DB) is that `sharePriceUsdt` in base units, stored as a string.

- [ ] **Step 1: Write the failing test** — `web/lib/positions.test.ts` (tests the PURE helpers; the DB/RPC orchestration in `getFanPositions` is covered by build + manual verification, not unit-mocked)

```ts
// web/lib/positions.test.ts
import assert from "node:assert";
import { investedFromShares, percentOfRound, toPositionDTO, type FanPosition } from "./positions";

// invested = shares * sharePrice / 1e6. sharePrice 1 USDT = 1_000000n.
// 10 shares (6dp) => 10_000000n shares, at price 1_000000n => 10 USDT = 10_000000n
assert.equal(investedFromShares(10_000000n, 1_000000n), 10_000000n);
// price 2 USDT/share => 10 shares invested 20 USDT
assert.equal(investedFromShares(10_000000n, 2_000000n), 20_000000n);

// percentOfRound
assert.equal(percentOfRound(25_000000n, 100_000000n), 25);
assert.equal(percentOfRound(1_000000n, 3_000000n), 33.33);
assert.equal(percentOfRound(5n, 0n), 0); // no supply -> 0, never divide by zero

// toPositionDTO stringifies every bigint field, leaves others intact
const p: FanPosition = {
  roundId: 7, contractAddress: "0xabc", clubName: "Racing", clubSlug: "racing",
  shares: 10_000000n, totalShares: 100_000000n, investedUsdt: 10_000000n,
  claimable: 3_140000n, raised: 40_000000n, goal: 40_000000n, status: "active",
};
const dto = toPositionDTO(p);
assert.equal(dto.shares, "10000000");
assert.equal(dto.claimable, "3140000");
assert.equal(dto.roundId, 7);
assert.equal(dto.status, "active");

console.log("positions helpers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/positions.test.ts`
Expected: FAIL — cannot find module `./positions` (not created yet).

- [ ] **Step 3: Create `web/lib/positions.ts`**

```ts
// Fan positions — which verified rounds a fan holds shares in, read straight
// from chain (money truth on-chain per CLAUDE.md). The DB only tells us which
// rounds are verified (schema allowlist) and their display metadata; balances,
// rewards and raised come from the contract. Server-only (imports the DB).
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, clubs } from "@/db/schema";
import {
  shareBalance,
  pendingReward,
  totalRaised,
  totalShares,
  readSafely,
} from "@/lib/contracts";

const SHARE_UNIT = 1_000000n; // 1e6, matches RevenueShareRound.SHARE_UNIT & USD₮ 6dp

export type FanPosition = {
  roundId: number;
  contractAddress: `0x${string}`;
  clubName: string;
  clubSlug: string;
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
  status: "funding" | "active" | "closed";
};

export type FanPositionDTO = Omit<
  FanPosition,
  "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  shares: string;
  totalShares: string;
  investedUsdt: string;
  claimable: string;
  raised: string;
  goal: string;
};

/** invested USD₮ = shares * sharePrice / SHARE_UNIT (see contract invest()). */
export function investedFromShares(shares: bigint, sharePrice: bigint): bigint {
  return (shares * sharePrice) / SHARE_UNIT;
}

/** Fan's % of the round's total shares, 2 decimals; 0 when supply is 0. */
export function percentOfRound(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}

export function toPositionDTO(p: FanPosition): FanPositionDTO {
  return {
    ...p,
    shares: p.shares.toString(),
    totalShares: p.totalShares.toString(),
    investedUsdt: p.investedUsdt.toString(),
    claimable: p.claimable.toString(),
    raised: p.raised.toString(),
    goal: p.goal.toString(),
  };
}

/** Verified rounds where `fan` holds > 0 shares, enriched with on-chain reads. */
export async function getFanPositions(fan: `0x${string}`): Promise<FanPosition[]> {
  const verifiedRounds = await db.select().from(rounds).where(eq(rounds.verified, true));

  const positions = await Promise.all(
    verifiedRounds.map(async (round): Promise<FanPosition | null> => {
      const address = round.contractAddress as `0x${string}`;
      const shares = await readSafely(() => shareBalance(address, fan), 0n);
      if (shares === 0n) return null;

      const [supply, claimable, raised, [club]] = await Promise.all([
        readSafely(() => totalShares(address), 0n),
        readSafely(() => pendingReward(address, fan), 0n),
        readSafely(() => totalRaised(address), 0n),
        db.select().from(clubs).where(eq(clubs.id, round.clubId)),
      ]);

      return {
        roundId: round.id,
        contractAddress: address,
        clubName: club?.name ?? "Unknown club",
        clubSlug: club?.slug ?? "",
        shares,
        totalShares: supply,
        investedUsdt: investedFromShares(shares, BigInt(round.sharePrice)),
        claimable,
        raised,
        goal: BigInt(round.goal),
        status: round.status,
      };
    }),
  );

  return positions.filter((p): p is FanPosition => p !== null);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/positions.test.ts`
Expected: PASS — prints `positions helpers OK`.

- [ ] **Step 5: Create the API route** — `web/app/api/wallet/positions/route.ts`

```ts
import { NextResponse } from "next/server";
import { getFanPositions, toPositionDTO } from "@/lib/positions";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const positions = await getFanPositions(address as `0x${string}`);
    return NextResponse.json({ positions: positions.map(toPositionDTO) });
  } catch {
    // No verified rounds / DB hiccup: empty, not a 500 — the page still renders.
    return NextResponse.json({ positions: [] });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/positions.ts web/lib/positions.test.ts web/app/api/wallet/positions/route.ts
git commit -m "feat(wallet): fan positions lib + /api/wallet/positions"
```

---

### Task 4: Wire the Indexer + getLogs fallback + history API

**Files:**
- Modify: `web/lib/indexer.ts` (replace the two stub functions; keep the `HistoryEntry`/`TokenBalance` types)
- Create: `web/app/api/wallet/history/route.ts`
- Test: `web/lib/indexer.test.ts`

**Interfaces:**
- Consumes: `publicClient` (`@/lib/contracts`), viem `parseAbiItem`, `getAddress`.
- Produces:
  - `HistoryEntry` (unchanged shape).
  - `mapIndexerTransfers(payload: unknown, self: string): HistoryEntry[]` — pure; tolerant parse of the Indexer JSON.
  - `mapTransferLogs(logs, self): HistoryEntry[]` — pure; maps viem Transfer logs.
  - `getHistory(address: \`0x${string}\`): Promise<HistoryEntry[]>` — Indexer when `WDK_INDEXER_API_KEY` set, else/on-error `getLogs` fallback. Server-only.

- [ ] **Step 1: Write the failing test** — `web/lib/indexer.test.ts` (tests the two PURE mappers with fixtures; the network/RPC orchestration in `getHistory` is not unit-tested)

```ts
// web/lib/indexer.test.ts
import assert from "node:assert";
import { mapIndexerTransfers, mapTransferLogs, type HistoryEntry } from "./indexer";

const SELF = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

// --- Indexer payload mapping (tolerant of field-name variants) ---
const payload = {
  data: [
    { transactionHash: "0xaaa", from: OTHER, to: SELF, value: "1000000", blockNumber: 10, timestamp: 1700000000 },
    { hash: "0xbbb", from: SELF, to: OTHER, amount: "500000", blockNumber: 11, blockTimestamp: 1700000100 },
  ],
};
const mapped = mapIndexerTransfers(payload, SELF);
assert.equal(mapped.length, 2);
assert.equal(mapped[0].kind, "in");
assert.equal(mapped[0].amount, 1000000n);
assert.equal(mapped[0].counterparty.toLowerCase(), OTHER);
assert.equal(mapped[1].kind, "out");
assert.equal(mapped[1].amount, 500000n);
// bad payloads never throw
assert.deepEqual(mapIndexerTransfers(null, SELF), []);
assert.deepEqual(mapIndexerTransfers({ data: "nope" }, SELF), []);

// --- viem Transfer log mapping ---
const logs = [
  { args: { from: OTHER, to: SELF, value: 2000000n }, transactionHash: "0xccc", blockNumber: 20n },
  { args: { from: SELF, to: OTHER, value: 750000n }, transactionHash: "0xddd", blockNumber: 21n },
];
const fromLogs = mapTransferLogs(logs as never, SELF);
assert.equal(fromLogs.length, 2);
assert.equal(fromLogs[0].kind, "in");
assert.equal(fromLogs[0].amount, 2000000n);
assert.equal(fromLogs[1].kind, "out");
assert.equal(fromLogs[1].counterparty.toLowerCase(), OTHER);

console.log("indexer mappers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/indexer.test.ts`
Expected: FAIL — `mapIndexerTransfers is not exported` (still the stub).

- [ ] **Step 3: Replace `web/lib/indexer.ts`** (keep the file header intent; this module is now server-only — it holds the API key and is only called from `/api/wallet/history`)

```ts
// WDK Indexer API wrapper (spec §5 tier 2) — real USD₮ transfer history for the
// fan wallet. Uses the hosted Indexer (https://wdk-api.tether.io) when
// WDK_INDEXER_API_KEY is set; otherwise (and on any error/empty) falls back to
// reading ERC-20 Transfer logs straight from the RPC, so Activity is never
// empty on Sepolia. SERVER-ONLY: holds the API key — import from API routes,
// never from a client component.
import { parseAbiItem, getAddress } from "viem";
import { publicClient } from "@/lib/contracts";

export type TokenBalance = {
  token: `0x${string}`;
  symbol: string;
  decimals: number;
  amount: bigint;
};

export type HistoryEntry = {
  hash: `0x${string}`;
  kind: "in" | "out";
  token: `0x${string}`;
  amount: bigint;
  counterparty: `0x${string}`;
  blockNumber: bigint;
  timestamp: number; // unix seconds
};

const INDEXER_BASE = "https://wdk-api.tether.io";
const USDT_ADDRESS = (process.env.NEXT_PUBLIC_USDT_ADDRESS ?? "") as `0x${string}`;
const INDEXER_CHAIN = process.env.WDK_INDEXER_CHAIN ?? "ethereum";
const INDEXER_TOKEN = process.env.WDK_INDEXER_TOKEN ?? "usdt";
const LOG_WINDOW = 40_000n; // public RPCs cap eth_getLogs ranges (~40-50k blocks)

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function asBigInt(v: unknown): bigint {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "string" && v.trim() !== "") return BigInt(v);
  } catch {
    /* fall through */
  }
  return 0n;
}

/** Tolerant map of an Indexer transfers payload — field names vary, so probe. */
export function mapIndexerTransfers(payload: unknown, self: string): HistoryEntry[] {
  const rows =
    Array.isArray(payload) ? payload
    : Array.isArray((payload as { data?: unknown })?.data) ? (payload as { data: unknown[] }).data
    : Array.isArray((payload as { transfers?: unknown })?.transfers) ? (payload as { transfers: unknown[] }).transfers
    : [];
  const me = self.toLowerCase();

  return rows.flatMap((raw): HistoryEntry[] => {
    const r = raw as Record<string, unknown>;
    const from = String(r.from ?? r.fromAddress ?? "").toLowerCase();
    const to = String(r.to ?? r.toAddress ?? "").toLowerCase();
    if (!from && !to) return [];
    const kind: "in" | "out" = to === me ? "in" : "out";
    const counterparty = (kind === "in" ? from : to) || me;
    return [{
      hash: String(r.transactionHash ?? r.hash ?? r.txHash ?? "0x") as `0x${string}`,
      kind,
      token: USDT_ADDRESS,
      amount: asBigInt(r.value ?? r.amount),
      counterparty: counterparty as `0x${string}`,
      blockNumber: asBigInt(r.blockNumber ?? r.block),
      timestamp: Number(asBigInt(r.timestamp ?? r.blockTimestamp ?? r.time)),
    }];
  });
}

/** Map viem `getLogs` Transfer results into HistoryEntry (timestamp filled by caller). */
export function mapTransferLogs(
  logs: Array<{ args: { from?: string; to?: string; value?: bigint }; transactionHash: string | null; blockNumber: bigint | null }>,
  self: string,
): HistoryEntry[] {
  const me = self.toLowerCase();
  return logs.map((log) => {
    const from = (log.args.from ?? "").toLowerCase();
    const to = (log.args.to ?? "").toLowerCase();
    const kind: "in" | "out" = to === me ? "in" : "out";
    return {
      hash: (log.transactionHash ?? "0x") as `0x${string}`,
      kind,
      token: USDT_ADDRESS,
      amount: log.args.value ?? 0n,
      counterparty: ((kind === "in" ? from : to) || me) as `0x${string}`,
      blockNumber: log.blockNumber ?? 0n,
      timestamp: 0, // filled from block timestamps below
    };
  });
}

async function fromIndexer(address: `0x${string}`): Promise<HistoryEntry[]> {
  const apiKey = process.env.WDK_INDEXER_API_KEY;
  if (!apiKey) return [];
  const url = `${INDEXER_BASE}/api/v1/${INDEXER_CHAIN}/${INDEXER_TOKEN}/${address}/token-transfers`;
  const res = await fetch(url, { headers: { "x-api-key": apiKey } });
  if (!res.ok) return [];
  return mapIndexerTransfers(await res.json(), address);
}

async function fromLogs(address: `0x${string}`): Promise<HistoryEntry[]> {
  if (!USDT_ADDRESS) return [];
  const latest = await publicClient.getBlockNumber();
  const fromBlock = latest > LOG_WINDOW ? latest - LOG_WINDOW : 0n;

  const [outgoing, incoming] = await Promise.all([
    publicClient.getLogs({ address: USDT_ADDRESS, event: TRANSFER_EVENT, args: { from: address }, fromBlock, toBlock: "latest" }),
    publicClient.getLogs({ address: USDT_ADDRESS, event: TRANSFER_EVENT, args: { to: address }, fromBlock, toBlock: "latest" }),
  ]);

  const entries = mapTransferLogs([...outgoing, ...incoming] as never, address);

  // Fill timestamps: one getBlock per distinct block (demo volume is tiny).
  const blocks = [...new Set(entries.map((e) => e.blockNumber))];
  const times = new Map<bigint, number>();
  await Promise.all(
    blocks.map(async (bn) => {
      const block = await publicClient.getBlock({ blockNumber: bn });
      times.set(bn, Number(block.timestamp));
    }),
  );
  for (const e of entries) e.timestamp = times.get(e.blockNumber) ?? 0;

  return entries;
}

export async function getHistory(address: `0x${string}`): Promise<HistoryEntry[]> {
  let entries: HistoryEntry[] = [];
  try {
    entries = await fromIndexer(address);
  } catch {
    entries = [];
  }
  if (entries.length === 0) {
    try {
      entries = await fromLogs(getAddress(address));
    } catch {
      entries = [];
    }
  }
  // newest first
  return entries.sort((a, b) => Number(b.blockNumber - a.blockNumber));
}

// Balances stay a typed stub for now — the wallet reads USD₮ balance directly
// on-chain via the WDK handle, so this isn't on the critical path.
export async function getBalances(address: `0x${string}`): Promise<TokenBalance[]> {
  void address;
  return [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/indexer.test.ts`
Expected: PASS — prints `indexer mappers OK`.

- [ ] **Step 5: Create the history API route** — `web/app/api/wallet/history/route.ts`

```ts
import { NextResponse } from "next/server";
import { getHistory, type HistoryEntry } from "@/lib/indexer";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

// bigints can't go through JSON — stringify amount/blockNumber for the client.
function toDTO(e: HistoryEntry) {
  return { ...e, amount: e.amount.toString(), blockNumber: e.blockNumber.toString() };
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !ADDRESS_RE.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  try {
    const entries = await getHistory(address as `0x${string}`);
    return NextResponse.json({ entries: entries.map(toDTO) });
  } catch {
    return NextResponse.json({ entries: [] });
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add web/lib/indexer.ts web/lib/indexer.test.ts web/app/api/wallet/history/route.ts
git commit -m "feat(wallet): wire Indexer + getLogs fallback + /api/wallet/history"
```

---

### Task 5: Sign the MoonPay widget URL

**Files:**
- Modify: `web/lib/moonpay.ts`
- Test: `web/lib/moonpay.test.ts`

**Interfaces:**
- Consumes: node `crypto` (`createHmac`).
- Produces: `buildOnRampSession(address, amountUsd)` (unchanged signature) — signed URL (`&signature=`) when `MOONPAY_SECRET_KEY` present, unsigned `buy.moonpay.com` fallback otherwise. Prefers `MOONPAY_PUBLISHABLE_KEY`, falls back to `MOONPAY_API_KEY`, for the `apiKey` query param.

> MoonPay signs the widget by HMAC-SHA256 of the URL query string (the part after `?`, leading `?` included) with the secret key, base64, appended as `signature=`. Signing is server-side only — the secret never reaches the browser.

- [ ] **Step 1: Write the failing test** — `web/lib/moonpay.test.ts`

```ts
// web/lib/moonpay.test.ts
import assert from "node:assert";
import { buildOnRampSession } from "./moonpay";

const ADDR = "0x1234567890abcdef1234567890abcdefdeadbeef" as const;

// Without a secret: unsigned fallback, no signature param.
delete process.env.MOONPAY_SECRET_KEY;
delete process.env.MOONPAY_API_KEY;
delete process.env.MOONPAY_PUBLISHABLE_KEY;
const unsigned = await buildOnRampSession(ADDR, 50);
assert.ok(unsigned.widgetUrl.includes("walletAddress=" + ADDR));
assert.ok(!unsigned.widgetUrl.includes("signature="));

// With a secret: apiKey present and a signature appended.
process.env.MOONPAY_PUBLISHABLE_KEY = "pk_test_123";
process.env.MOONPAY_SECRET_KEY = "sk_test_456";
const signed = await buildOnRampSession(ADDR, 50);
assert.ok(signed.widgetUrl.includes("apiKey=pk_test_123"));
assert.ok(signed.widgetUrl.includes("signature="));
delete process.env.MOONPAY_SECRET_KEY;
delete process.env.MOONPAY_PUBLISHABLE_KEY;

console.log("moonpay signing OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/moonpay.test.ts`
Expected: FAIL — signed URL has no `signature=` (current stub never signs).

- [ ] **Step 3: Replace the body of `web/lib/moonpay.ts`** (keep the header comment + `OnRampSession` type)

```ts
// WDK fiat on-ramp (spec §5 tier 3) — "Add funds → MoonPay" on the fan wallet:
// card in, USD₮ out, straight to the fan's self-custody address. Builds a
// MoonPay widget URL, signed server-side with MOONPAY_SECRET_KEY when present
// (the signature is required for a production widget). SERVER-ONLY: never
// expose the secret key to the client — this module is imported from
// /api/moonpay, never a client component.
import { createHmac } from "node:crypto";

export type OnRampSession = {
  sessionId: string;
  widgetUrl: string;
};

export async function buildOnRampSession(
  address: `0x${string}`,
  amountUsd: number,
): Promise<OnRampSession> {
  const apiKey = process.env.MOONPAY_PUBLISHABLE_KEY ?? process.env.MOONPAY_API_KEY;
  const secret = process.env.MOONPAY_SECRET_KEY;

  const params = new URLSearchParams({
    currencyCode: "usdt",
    walletAddress: address,
    baseCurrencyAmount: String(amountUsd),
  });
  if (apiKey) params.set("apiKey", apiKey);

  const query = `?${params.toString()}`;
  let widgetUrl = `https://buy.moonpay.com/${query}`;

  if (secret && apiKey) {
    const signature = createHmac("sha256", secret).update(query).digest("base64");
    widgetUrl += `&signature=${encodeURIComponent(signature)}`;
  }

  return { sessionId: "wdk-onramp", widgetUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/moonpay.test.ts`
Expected: PASS — prints `moonpay signing OK`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/moonpay.ts web/lib/moonpay.test.ts
git commit -m "feat(wallet): sign MoonPay widget URL when secret is configured"
```

---

### Task 6: Dialog primitive + `qrcode.react`

**Files:**
- Create: `web/components/ui/dialog.tsx`
- Modify: `web/package.json` (add `qrcode.react`)

**Interfaces:**
- Produces (base-nova Dialog wrapper): `Dialog`, `DialogTrigger`, `DialogClose`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`. `Dialog` accepts base-ui `open`/`onOpenChange` for controlled use.

- [ ] **Step 1: Add `qrcode.react`**

Run (from `web/`): `pnpm add qrcode.react`
Expected: adds `"qrcode.react"` to `web/package.json` dependencies, updates the workspace lockfile.

- [ ] **Step 2: Create `web/components/ui/dialog.tsx`** (base-nova, mirrors the conventions in `components/ui/dropdown-menu.tsx` — `@base-ui/react`, `cn`, `data-slot`)

```tsx
"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogContent({
  className,
  children,
  showClose = true,
  ...props
}: DialogPrimitive.Popup.Props & { showClose?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="dialog-backdrop"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
      />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl bg-card p-6 text-card-foreground shadow-lg ring-1 ring-foreground/10 duration-150 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md p-1 text-muted-foreground opacity-70 outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring">
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-header" className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="dialog-footer" className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn("font-display text-2xl tracking-wide", className)} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export {
  Dialog,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: PASS. If a `DialogPrimitive.*.Props` name mismatches this `@base-ui/react` version, fix by inspecting the exported members of `@base-ui/react/dialog` (mirror how `dropdown-menu.tsx` names `MenuPrimitive.*.Props`).

- [ ] **Step 4: Commit**

```bash
git add web/components/ui/dialog.tsx web/package.json ../pnpm-lock.yaml
git commit -m "feat(ui): add base-nova Dialog + qrcode.react dep"
```

---

### Task 7: Dashboard shell (sidebar + topbar), Navbar refactor

**Files:**
- Create: `web/components/shell/nav-items.ts`, `AccountMenu.tsx`, `WalletModeChip.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `MobileNav.tsx`, `DashboardShell.tsx`
- Modify: `web/components/Navbar.tsx` (use `AccountMenu`)

**Interfaces:**
- Consumes: `useSession`, `authClient` (`@/lib/auth-client`); `buttonVariants`, `Badge`, `Dialog*`; `walletMode` (`@/lib/walletMode`); lucide icons.
- Produces:
  - `nav-items.ts`: `type Role = "club" | "fan"`; `type NavItem = { href: string; label: string; icon: LucideIcon }`; `navItemsFor(role: Role): NavItem[]`; `ctaFor(role: Role): { label: string; href: string }`.
  - `AccountMenu()` — the avatar dropdown (sign-out, links). Reused by `Navbar` + `Topbar`.
  - `WalletModeChip()` — Badge: `Gas in USD₮` (erc4337) / `Sepolia testnet` (standard).
  - `Sidebar({ role })`, `Topbar({ title })`, `MobileNav({ role })`, `DashboardShell({ role, title, children })`.

> The Fan CTA ("Add funds") links `/wallet?action=addFunds`; the overview reads that query param (Task 9) and opens the dialog — decoupled, no cross-subtree context. Club CTA ("New round") links `/dashboard?action=newRound` (Spec B wires it; harmless until then).

- [ ] **Step 1: Create `web/components/shell/nav-items.ts`**

```ts
import { LayoutGrid, Compass, ReceiptText, Settings, Wallet, TrendingUp, type LucideIcon } from "lucide-react";

export type Role = "club" | "fan";
export type NavItem = { href: string; label: string; icon: LucideIcon };

const FAN_ITEMS: NavItem[] = [
  { href: "/wallet", label: "Overview", icon: LayoutGrid },
  { href: "/", label: "Explore clubs", icon: Compass },
  { href: "/wallet/activity", label: "Activity", icon: ReceiptText },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

const CLUB_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/wallet", label: "Wallet", icon: Wallet },
  { href: "/account/settings", label: "Settings", icon: Settings },
];

export function navItemsFor(role: Role): NavItem[] {
  return role === "club" ? CLUB_ITEMS : FAN_ITEMS;
}

export function ctaFor(role: Role): { label: string; href: string } {
  return role === "club"
    ? { label: "New round", href: "/dashboard?action=newRound" }
    : { label: "Add funds", href: "/wallet?action=addFunds" };
}
```

- [ ] **Step 2: Create `web/components/shell/AccountMenu.tsx`** (extract the dropdown currently inline in `Navbar.tsx` lines 37-56, verbatim behavior)

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function AccountMenu() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  if (isPending || !session) return null;

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  const home = session.user.role === "club" ? "/dashboard" : "/wallet";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="outline-none">
        <Avatar className="size-9 border border-border">
          <AvatarFallback className="bg-secondary text-secondary-foreground">
            {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem render={<Link href={home} />}>
          {session.user.role === "club" ? "Dashboard" : "My wallet"}
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/account/settings" />}>Account</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 3: Point `Navbar.tsx` at `AccountMenu`** — replace the inline `session ? (<DropdownMenu>…</DropdownMenu>) : (…)` block so the signed-in branch renders `<AccountMenu />`. Final `Navbar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useSession } from "@/lib/auth-client";
import { buttonVariants } from "@/components/ui/button";
import { AccountMenu } from "@/components/shell/AccountMenu";

export function Navbar() {
  const { data: session, isPending } = useSession();

  return (
    <nav className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href="/" className="font-display text-2xl uppercase tracking-wide text-primary">
        La Doce
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {isPending ? null : session ? (
          <AccountMenu />
        ) : (
          <>
            <Link href="/auth/sign-in" className={buttonVariants({ variant: "ghost", size: "sm" })}>
              Sign in
            </Link>
            <Link href="/auth/sign-up" className={buttonVariants({ size: "sm" })}>
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Create `web/components/shell/WalletModeChip.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { walletMode } from "@/lib/walletMode";

export function WalletModeChip() {
  const mode = walletMode();
  return (
    <Badge className="border-transparent bg-secondary text-secondary-foreground">
      {mode === "erc4337" ? "Gas in USD₮" : "Sepolia testnet"}
    </Badge>
  );
}
```

- [ ] **Step 5: Create `web/components/shell/Sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { navItemsFor, ctaFor, type Role } from "./nav-items";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsFor(role);
  const cta = ctaFor(role);

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href="/" className="px-2 font-display text-2xl uppercase tracking-wide text-primary">
        La Doce
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map((item) => {
          const active = item.href === "/wallet" || item.href === "/dashboard"
            ? pathname === item.href
            : pathname.startsWith(item.href) && item.href !== "/";
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-primary"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2">
        <Link href={cta.href} className={cn(buttonVariants(), "w-full")}>
          {cta.label}
        </Link>
        <Link
          href="/account/settings"
          className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <LifeBuoy className="size-4" />
          Support
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create `web/components/shell/MobileNav.tsx`**

```tsx
"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Sidebar } from "./Sidebar";
import type { Role } from "./nav-items";

export function MobileNav({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="rounded-md p-2 text-muted-foreground hover:text-foreground md:hidden">
        <Menu className="size-5" />
        <span className="sr-only">Open menu</span>
      </DialogTrigger>
      <DialogContent
        showClose={false}
        className="fixed inset-y-0 left-0 top-0 h-full max-w-64 translate-x-0 translate-y-0 rounded-none rounded-r-xl p-0"
      >
        <div onClick={() => setOpen(false)}>
          <Sidebar role={role} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Create `web/components/shell/Topbar.tsx`**

```tsx
import { AccountMenu } from "./AccountMenu";
import { WalletModeChip } from "./WalletModeChip";
import { MobileNav } from "./MobileNav";
import type { Role } from "./nav-items";

export function Topbar({ title, role }: { title: string; role: Role }) {
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <div className="flex items-center gap-3">
        <MobileNav role={role} />
        <h1 className="font-display text-xl uppercase tracking-wide">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <WalletModeChip />
        <AccountMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Create `web/components/shell/DashboardShell.tsx`**

```tsx
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import type { Role } from "./nav-items";

export function DashboardShell({
  role,
  title,
  children,
}: {
  role: Role;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-screen">
          <Sidebar role={role} />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar title={title} role={role} />
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Build to verify the shell compiles** (stop dev + clear `.next` first)

Run (from repo root): `rm -rf web/.next && pnpm --filter web build`
Expected: build succeeds (shell components aren't imported by a page yet — this is a compile check). Then `pnpm --filter web lint` → no errors.

- [ ] **Step 10: Commit**

```bash
git add web/components/shell web/components/Navbar.tsx
git commit -m "feat(shell): role-aware dashboard shell (sidebar, topbar, mobile nav)"
```

---

### Task 8: Wallet operation components (Claim, Send, Receive, Add funds) + DTO types

**Files:**
- Create: `web/components/wallet/types.ts`, `ClaimPositionButton.tsx`, `SendDialog.tsx`, `ReceiveDialog.tsx`, `AddFundsDialog.tsx`

**Interfaces:**
- Consumes: `getWallet`, `createWallet` (`@/lib/wdk`); `claim` (`@/lib/contracts`); `parseUsdt`, `formatUsdt`, `shortenAddress`, `explorerTxUrl` (`@/lib/format`); `friendlyError` (`@/lib/txError`); `walletMode`; viem `isAddress`; `WalletHandle` type; `Dialog*`, `Button`, `Input`, `Label`; `QRCodeSVG` from `qrcode.react`.
- Produces:
  - `types.ts`: `FanPositionDTO`, `HistoryEntryDTO`, `parsePositionDTO(dto): FanPositionView`, `parseHistoryDTO(dto): HistoryEntryView` (bigint fields parsed back).
  - `ClaimPositionButton({ roundAddress, claimable, onClaimed })`
  - `SendDialog({ open, onOpenChange, wallet, balance, onSent })`
  - `ReceiveDialog({ open, onOpenChange, address })`
  - `AddFundsDialog({ open, onOpenChange, address, onFunded })`

- [ ] **Step 1: Create `web/components/wallet/types.ts`** (client-safe DTO shapes + parsers — no server imports, so client components never pull the DB in)

```ts
export type FanPositionDTO = {
  roundId: number;
  contractAddress: `0x${string}`;
  clubName: string;
  clubSlug: string;
  shares: string;
  totalShares: string;
  investedUsdt: string;
  claimable: string;
  raised: string;
  goal: string;
  status: "funding" | "active" | "closed";
};

export type FanPositionView = Omit<
  FanPositionDTO,
  "shares" | "totalShares" | "investedUsdt" | "claimable" | "raised" | "goal"
> & {
  shares: bigint;
  totalShares: bigint;
  investedUsdt: bigint;
  claimable: bigint;
  raised: bigint;
  goal: bigint;
};

export function parsePositionDTO(d: FanPositionDTO): FanPositionView {
  return {
    ...d,
    shares: BigInt(d.shares),
    totalShares: BigInt(d.totalShares),
    investedUsdt: BigInt(d.investedUsdt),
    claimable: BigInt(d.claimable),
    raised: BigInt(d.raised),
    goal: BigInt(d.goal),
  };
}

export type HistoryEntryDTO = {
  hash: `0x${string}`;
  kind: "in" | "out";
  token: `0x${string}`;
  amount: string;
  counterparty: `0x${string}`;
  blockNumber: string;
  timestamp: number;
};

export type HistoryEntryView = Omit<HistoryEntryDTO, "amount" | "blockNumber"> & {
  amount: bigint;
  blockNumber: bigint;
};

export function parseHistoryDTO(d: HistoryEntryDTO): HistoryEntryView {
  return { ...d, amount: BigInt(d.amount), blockNumber: BigInt(d.blockNumber) };
}
```

- [ ] **Step 2: Create `web/components/wallet/ClaimPositionButton.tsx`** (the claim logic lifted from `ClaimButton.tsx`, now driven by a `claimable` prop)

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useCurrentUserId } from "@/lib/auth-client";
import { getWallet } from "@/lib/wdk";
import { claim } from "@/lib/contracts";
import { friendlyError } from "@/lib/txError";
import { Button } from "@/components/ui/button";

export function ClaimPositionButton({
  roundAddress,
  claimable,
  onClaimed,
}: {
  roundAddress: `0x${string}`;
  claimable: bigint;
  onClaimed?: () => void;
}) {
  const { userId } = useCurrentUserId();
  const [status, setStatus] = useState<"idle" | "claiming">("idle");
  const hasReward = claimable > 0n;

  async function handleClaim() {
    if (!userId) return;
    setStatus("claiming");
    const toastId = toast.loading("Claiming…");
    try {
      const wallet = await getWallet(userId);
      await claim(wallet, roundAddress);
      toast.success("Claimed!", { id: toastId });
      onClaimed?.();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setStatus("idle");
    }
  }

  return (
    <Button size="sm" onClick={handleClaim} disabled={!userId || !hasReward || status === "claiming"}>
      {status === "claiming" ? "Claiming…" : "Claim"}
    </Button>
  );
}
```

- [ ] **Step 3: Create `web/components/wallet/SendDialog.tsx`** (two-step: form → review → confirm; money-out per Global Constraints)

```tsx
"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { toast } from "sonner";
import type { WalletHandle } from "@/lib/wdk";
import { parseUsdt, formatUsdt, shortenAddress, explorerTxUrl } from "@/lib/format";
import { friendlyError } from "@/lib/txError";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SendDialog({
  open,
  onOpenChange,
  wallet,
  balance,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  wallet: WalletHandle | null;
  balance: bigint;
  onSent?: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"form" | "review">("form");
  const [sending, setSending] = useState(false);

  const validAddress = isAddress(recipient);
  const value = amount.trim() === "" ? 0n : parseUsdt(amount);
  const overBalance = value > balance;
  const canReview = validAddress && value > 0n && !overBalance;

  function reset() {
    setStep("form");
    setSending(false);
  }

  async function handleSend() {
    if (!wallet || !canReview) return;
    setSending(true);
    const toastId = toast.loading("Sending…");
    try {
      const hash = await wallet.transferUsdt(recipient as `0x${string}`, value);
      toast.success("Sent!", {
        id: toastId,
        action: { label: "View", onClick: () => window.open(explorerTxUrl(hash), "_blank", "noopener,noreferrer") },
      });
      onSent?.();
      onOpenChange(false);
      setRecipient("");
      setAmount("");
      reset();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) reset();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send USD₮</DialogTitle>
          <DialogDescription>
            {step === "form" ? "To any address on Sepolia." : "Confirm — this is irreversible."}
          </DialogDescription>
        </DialogHeader>

        {step === "form" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-to">Recipient address</Label>
              <Input id="send-to" placeholder="0x…" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              {recipient !== "" && !validAddress && (
                <span className="text-xs text-destructive">Not a valid address.</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="send-amount">Amount (USD₮)</Label>
              <Input id="send-amount" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <span className="text-xs text-muted-foreground">Balance: {formatUsdt(balance)} USD₮</span>
              {overBalance && <span className="text-xs text-destructive">More than your balance.</span>}
            </div>
            <DialogFooter>
              <Button disabled={!canReview} onClick={() => setStep("review")}>
                Review
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-secondary/40 p-4">
              <div className="text-xs text-muted-foreground">You&apos;re sending</div>
              <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(value)} USD₮</div>
              <div className="mt-2 text-xs text-muted-foreground">
                to <span className="font-mono text-foreground">{shortenAddress(recipient)}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">This transfer cannot be undone. Double-check the address.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep("form")} disabled={sending}>
                Back
              </Button>
              <Button onClick={handleSend} disabled={sending}>
                {sending ? "Sending…" : "Confirm send"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create `web/components/wallet/ReceiveDialog.tsx`**

```tsx
"use client";

import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ReceiveDialog({
  open,
  onOpenChange,
  address,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
}) {
  async function copy() {
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receive USD₮</DialogTitle>
          <DialogDescription>Only send USD₮ on Sepolia to this address.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div className="rounded-xl bg-white p-4">
            <QRCodeSVG value={address} size={180} />
          </div>
          <code className="w-full break-all rounded-lg bg-secondary/40 p-3 text-center font-mono text-xs">{address}</code>
          <Button variant="outline" className="w-full" onClick={copy}>
            Copy address
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Create `web/components/wallet/AddFundsDialog.tsx`** (MoonPay + standard-mode testnet faucets — the handlers currently in `WalletCard.tsx` lines 54-121)

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { walletMode } from "@/lib/walletMode";
import { friendlyError } from "@/lib/txError";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AddFundsDialog({
  open,
  onOpenChange,
  address,
  onFunded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  address: string;
  onFunded?: () => void;
}) {
  const [busy, setBusy] = useState<"moonpay" | "usdt" | "gas" | null>(null);

  async function moonpay() {
    setBusy("moonpay");
    try {
      const res = await fetch("/api/moonpay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amountUsd: 50 }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not open MoonPay.");
      window.open(data.widgetUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  }

  async function faucet(kind: "usdt" | "gas") {
    setBusy(kind);
    const path = kind === "usdt" ? "/api/faucet-usdt" : "/api/faucet";
    const toastId = toast.loading(kind === "usdt" ? "Getting test USD₮…" : "Getting gas ETH…");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (!res.ok) return toast.error(data.error ?? "Could not get funds.", { id: toastId });
      toast.success(kind === "usdt" ? "Test USD₮ received" : "Gas ETH received", { id: toastId });
      onFunded?.();
    } catch (err) {
      toast.error(friendlyError(err), { id: toastId });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add funds</DialogTitle>
          <DialogDescription>Buy USD₮ with a card, straight to your self-custody wallet.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Button onClick={moonpay} disabled={busy !== null}>
            {busy === "moonpay" ? "Opening MoonPay…" : "Buy with MoonPay"}
          </Button>
          {walletMode() === "standard" && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
              <span className="text-xs text-muted-foreground">Test funds — local/testnet demo</span>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => faucet("usdt")} disabled={busy !== null}>
                  {busy === "usdt" ? "Getting…" : "Get 5,000 test USD₮"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => faucet("gas")} disabled={busy !== null}>
                  {busy === "gas" ? "Getting…" : "Get gas ETH"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Type-check + lint**

Run (from `web/`): `npx tsc --noEmit` then (from root) `pnpm --filter web lint`
Expected: PASS. (These components aren't rendered by a page yet — Task 9 wires them.)

- [ ] **Step 7: Commit**

```bash
git add web/components/wallet/types.ts web/components/wallet/ClaimPositionButton.tsx web/components/wallet/SendDialog.tsx web/components/wallet/ReceiveDialog.tsx web/components/wallet/AddFundsDialog.tsx
git commit -m "feat(wallet): claim/send/receive/add-funds operation components"
```

---

### Task 9: Wallet Overview page (hero, stats, positions, activity)

**Files:**
- Create: `web/components/wallet/BalanceHero.tsx`, `StatCards.tsx`, `PositionsList.tsx`, `ActivityList.tsx`, `ActivityPanel.tsx`, `WalletOverview.tsx`
- Modify: `web/app/wallet/page.tsx` (render `WalletOverview` instead of `WalletCard`/`ClaimButton`)
- Delete: `web/components/WalletCard.tsx`, `web/components/ClaimButton.tsx`

**Interfaces:**
- Consumes: `createWallet`, `getWallet`, `WalletHandle` (`@/lib/wdk`); the DTO parsers + operation dialogs from Task 8; `formatUsdt`, `shortenAddress`, `formatRelativeTime`, `explorerTxUrl`; `useCurrentUserId`; `friendlyError`; `useSearchParams` (for `?action=addFunds`); `Card`, `Button`, `Badge`, `Skeleton`; lucide `ArrowUp`/`ArrowDown`/`Copy`.
- Produces: `WalletOverview()` (default entry rendered by the page), plus the presentational pieces.

- [ ] **Step 1: Create `web/components/wallet/BalanceHero.tsx`**

```tsx
"use client";

import { toast } from "sonner";
import { Copy } from "lucide-react";
import { formatUsdt, shortenAddress } from "@/lib/format";
import { WalletModeChip } from "@/components/shell/WalletModeChip";
import { Button } from "@/components/ui/button";

export function BalanceHero({
  address,
  balance,
  onSend,
  onReceive,
  onAddFunds,
}: {
  address: string;
  balance: bigint;
  onSend: () => void;
  onReceive: () => void;
  onAddFunds: () => void;
}) {
  async function copy() {
    await navigator.clipboard.writeText(address);
    toast.success("Address copied");
  }

  return (
    <div className="glow flex flex-col gap-6 rounded-xl bg-primary p-6 text-primary-foreground md:col-span-2">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest opacity-70">USD₮ balance</div>
          <div className="font-display text-5xl tracking-wide md:text-6xl">
            {formatUsdt(balance)} <span className="text-2xl">USD₮</span>
          </div>
        </div>
        <WalletModeChip />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={copy} className="flex items-center gap-1.5 font-mono text-xs opacity-80 hover:opacity-100">
          {shortenAddress(address)} <Copy className="size-3" />
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onSend}>Send</Button>
          <Button variant="secondary" onClick={onReceive}>Receive</Button>
          <Button variant="secondary" onClick={onAddFunds}>Add funds</Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `web/components/wallet/StatCards.tsx`**

```tsx
import { formatUsdt } from "@/lib/format";
import { Card } from "@/components/ui/card";

export function StatCards({
  invested,
  claimable,
  positions,
}: {
  invested: bigint;
  claimable: bigint;
  positions: number;
}) {
  const stats = [
    { label: "Invested", value: `${formatUsdt(invested)} USD₮` },
    { label: "Claimable", value: `${formatUsdt(claimable)} USD₮` },
    { label: "Positions", value: String(positions) },
  ];
  return (
    <>
      {stats.map((s) => (
        <Card key={s.label} className="gap-1 p-5">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</div>
          <div className="font-display text-3xl tracking-wide">{s.value}</div>
        </Card>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Create `web/components/wallet/PositionsList.tsx`**

```tsx
"use client";

import Link from "next/link";
import { formatUsdt } from "@/lib/format";
import { percentOfRoundView } from "./positions-view";
import { ClaimPositionButton } from "./ClaimPositionButton";
import type { FanPositionView } from "./types";
import { Card } from "@/components/ui/card";

export function PositionsList({
  positions,
  onClaimed,
}: {
  positions: FanPositionView[];
  onClaimed: () => void;
}) {
  if (positions.length === 0) {
    return (
      <Card className="items-start gap-2 p-6">
        <div className="text-sm text-muted-foreground">You don&apos;t hold any club yet.</div>
        <Link href="/" className="text-sm font-medium text-primary hover:underline">
          Explore clubs →
        </Link>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {positions.map((p) => {
        const pct = p.goal > 0n ? Math.min(100, Number((p.raised * 100n) / p.goal)) : 0;
        return (
          <Card key={p.roundId} className="gap-3 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-display text-2xl tracking-wide">{p.clubName}</div>
                <div className="text-xs text-muted-foreground">
                  {formatUsdt(p.shares)} shares · {percentOfRoundView(p.shares, p.totalShares)}% of round
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Claimable</div>
                <div className="font-display text-xl tracking-wide text-primary">{formatUsdt(p.claimable)} USD₮</div>
              </div>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Invested {formatUsdt(p.investedUsdt)} USD₮ · {p.status}
              </span>
              <ClaimPositionButton roundAddress={p.contractAddress} claimable={p.claimable} onClaimed={onClaimed} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Create `web/components/wallet/positions-view.ts`** (client-safe percent helper — mirrors `percentOfRound` from `lib/positions.ts` without importing the server module)

```ts
export function percentOfRoundView(shares: bigint, supply: bigint): number {
  if (supply === 0n) return 0;
  return Number((shares * 10_000n) / supply) / 100;
}
```

- [ ] **Step 5: Create `web/components/wallet/ActivityList.tsx`** (shared row list for the panel + full page)

```tsx
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { formatUsdt, shortenAddress, formatRelativeTime, explorerTxUrl } from "@/lib/format";
import type { HistoryEntryView } from "./types";

export function ActivityList({ entries }: { entries: HistoryEntryView[] }) {
  if (entries.length === 0) {
    return <div className="text-sm text-muted-foreground">No activity yet.</div>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border">
      {entries.map((e) => (
        <li key={e.hash} className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary">
              {e.kind === "in" ? <ArrowDownLeft className="size-4 text-primary" /> : <ArrowUpRight className="size-4" />}
            </span>
            <div>
              <div className="text-sm">{e.kind === "in" ? "Received" : "Sent"}</div>
              <a
                href={explorerTxUrl(e.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-xs text-muted-foreground hover:text-foreground"
              >
                {shortenAddress(e.counterparty)} · {e.timestamp ? formatRelativeTime(e.timestamp) : ""}
              </a>
            </div>
          </div>
          <span className={`font-mono text-sm ${e.kind === "in" ? "text-primary" : ""}`}>
            {e.kind === "in" ? "+" : "−"}{formatUsdt(e.amount)}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: Create `web/components/wallet/ActivityPanel.tsx`**

```tsx
import Link from "next/link";
import { ActivityList } from "./ActivityList";
import type { HistoryEntryView } from "./types";
import { Card } from "@/components/ui/card";

export function ActivityPanel({ entries }: { entries: HistoryEntryView[] }) {
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl uppercase tracking-wide">Activity</h2>
      </div>
      <ActivityList entries={entries.slice(0, 5)} />
      {entries.length > 0 && (
        <Link href="/wallet/activity" className="text-sm font-medium text-primary hover:underline">
          View full ledger →
        </Link>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: Create `web/components/wallet/WalletOverview.tsx`** (the orchestrator — owns refresh + dialog open state; reads `?action=addFunds` from the sidebar CTA)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet, type WalletHandle } from "@/lib/wdk";
import { friendlyError } from "@/lib/txError";
import { parsePositionDTO, parseHistoryDTO, type FanPositionView, type HistoryEntryView } from "./types";
import { BalanceHero } from "./BalanceHero";
import { StatCards } from "./StatCards";
import { PositionsList } from "./PositionsList";
import { ActivityPanel } from "./ActivityPanel";
import { SendDialog } from "./SendDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { AddFundsDialog } from "./AddFundsDialog";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WalletOverview() {
  const { userId } = useCurrentUserId();
  const searchParams = useSearchParams();

  const [wallet, setWallet] = useState<WalletHandle | null>(null);
  const [balance, setBalance] = useState<bigint>(0n);
  const [positions, setPositions] = useState<FanPositionView[]>([]);
  const [activity, setActivity] = useState<HistoryEntryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialog, setDialog] = useState<null | "send" | "receive" | "addFunds">(
    searchParams.get("action") === "addFunds" ? "addFunds" : null,
  );

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      await createWallet(userId); // no-op if it already exists
      const w = await getWallet(userId);
      setWallet(w);
      const [bal, posRes, histRes] = await Promise.all([
        w.getUsdtBalance(),
        fetch(`/api/wallet/positions?address=${w.address}`).then((r) => r.json()),
        fetch(`/api/wallet/history?address=${w.address}`).then((r) => r.json()),
      ]);
      setBalance(bal);
      setPositions((posRes.positions ?? []).map(parsePositionDTO));
      setActivity((histRes.entries ?? []).map(parseHistoryDTO));
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="mx-auto max-w-5xl border-destructive/40 bg-destructive/10 p-5 text-destructive">
        Could not load your wallet: {error}
      </Card>
    );
  }

  const totalInvested = positions.reduce((sum, p) => sum + p.investedUsdt, 0n);
  const totalClaimable = positions.reduce((sum, p) => sum + p.claimable, 0n);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        {wallet && (
          <BalanceHero
            address={wallet.address}
            balance={balance}
            onSend={() => setDialog("send")}
            onReceive={() => setDialog("receive")}
            onAddFunds={() => setDialog("addFunds")}
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCards invested={totalInvested} claimable={totalClaimable} positions={positions.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="font-display text-xl uppercase tracking-wide">Your positions</h2>
          <PositionsList positions={positions} onClaimed={refresh} />
        </div>
        <ActivityPanel entries={activity} />
      </div>

      <SendDialog
        open={dialog === "send"}
        onOpenChange={(v) => setDialog(v ? "send" : null)}
        wallet={wallet}
        balance={balance}
        onSent={refresh}
      />
      <ReceiveDialog
        open={dialog === "receive"}
        onOpenChange={(v) => setDialog(v ? "receive" : null)}
        address={wallet?.address ?? ""}
      />
      <AddFundsDialog
        open={dialog === "addFunds"}
        onOpenChange={(v) => setDialog(v ? "addFunds" : null)}
        address={wallet?.address ?? ""}
        onFunded={refresh}
      />
    </div>
  );
}
```

- [ ] **Step 8: Rewrite `web/app/wallet/page.tsx`** to render `WalletOverview` (keep the server-side auth gate + `EnsureWallet` self-heal; drop `WalletCard`/`ClaimButton`)

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { clubs, profiles } from "@/db/schema";
import { EnsureWallet } from "@/components/EnsureWallet";
import { WalletOverview } from "@/components/wallet/WalletOverview";

export default async function WalletPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");

  const hasWalletLinked =
    session.user.role === "club"
      ? (await db.select().from(clubs).where(eq(clubs.userId, session.user.id))).length > 0
      : (await db.select().from(profiles).where(eq(profiles.userId, session.user.id))).length > 0;

  return (
    <div className="flex flex-col gap-4">
      <EnsureWallet userId={session.user.id} hasWalletLinked={hasWalletLinked} />
      <WalletOverview />
    </div>
  );
}
```

- [ ] **Step 9: Delete the superseded components**

```bash
git rm web/components/WalletCard.tsx web/components/ClaimButton.tsx
```

- [ ] **Step 10: Build + lint** (stop dev + clear `.next` first)

Run (from root): `rm -rf web/.next && pnpm --filter web build && pnpm --filter web lint`
Expected: build + lint succeed, no remaining imports of `WalletCard`/`ClaimButton`. (`useSearchParams` in `WalletOverview` needs a Suspense boundary — Next may warn; if the build errors on it, wrap `<WalletOverview/>` in `<Suspense>` in the page. Prefer wrapping preemptively.)

- [ ] **Step 11: Manual check (Playwright, dark)** — sign in as a fan; confirm `/wallet` shows the lime hero with balance, stat cards, positions (or the empty state), an activity panel; clicking Send opens the dialog, a bad address is rejected, an over-balance amount is blocked; Receive shows a QR; Add funds opens.

Run: `mcp__playwright__browser_navigate` to `http://localhost:3000/wallet` after `emulateMedia({ colorScheme: 'dark' })`.

- [ ] **Step 12: Commit**

```bash
git add web/components/wallet web/app/wallet/page.tsx
git commit -m "feat(wallet): operable wallet overview (hero, stats, positions, activity)"
```

---

### Task 10: Route-group shell integration + full activity page

**Files:**
- Create: `web/app/(app)/layout.tsx`, `web/app/(marketing)/layout.tsx`, `web/app/(app)/wallet/activity/page.tsx`, `web/components/wallet/ActivityFull.tsx`
- Move (`git mv`): `web/app/page.tsx` → `web/app/(marketing)/page.tsx`; `web/app/account/` → `web/app/(marketing)/account/`; `web/app/wallet/` → `web/app/(app)/wallet/`; `web/app/dashboard/` → `web/app/(app)/dashboard/`
- Modify: `web/app/layout.tsx` (remove `<Navbar/>`)

**Interfaces:**
- Consumes: `DashboardShell`, `Navbar`, `auth.api.getSession`, `getHistory`.
- Produces: shell-wrapped `/wallet`, `/wallet/activity`, `/dashboard`; Navbar-wrapped `/`, `/account/*`. `ActivityFull()` full ledger.

> Route groups don't change URLs. `/auth`, `/login`, `/signup`, `/post-auth` stay at the root with NO navbar (transitional/auth screens — fine). `app/api` is NOT a page and does NOT move.

- [ ] **Step 1: Create the marketing layout** — `web/app/(marketing)/layout.tsx`

```tsx
import { Navbar } from "@/components/Navbar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Move landing + account under `(marketing)`**

```bash
mkdir -p web/app/\(marketing\)
git mv web/app/page.tsx web/app/\(marketing\)/page.tsx
git mv web/app/account web/app/\(marketing\)/account
```

- [ ] **Step 3: Create the app shell layout** — `web/app/(app)/layout.tsx` (reads the session for the nav role; pages keep their own gates)

```tsx
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { DashboardShell } from "@/components/shell/DashboardShell";
import type { Role } from "@/components/shell/nav-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  const role: Role = session?.user.role === "club" ? "club" : "fan";
  const title = role === "club" ? "Dashboard" : "Wallet";
  return (
    <DashboardShell role={role} title={title}>
      {children}
    </DashboardShell>
  );
}
```

- [ ] **Step 4: Move `wallet` + `dashboard` under `(app)`**

```bash
mkdir -p web/app/\(app\)
git mv web/app/wallet web/app/\(app\)/wallet
git mv web/app/dashboard web/app/\(app\)/dashboard
```

- [ ] **Step 5: Remove `<Navbar/>` from the root layout** — `web/app/layout.tsx`. Delete the `import { Navbar }` line and the `<Navbar />` element; keep `<Providers>`, `{children}`, `<Toaster>`. Result of the body:

```tsx
      <body className="min-h-full flex flex-col">
        <Providers>
          {children}
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
```

- [ ] **Step 6: Create the full activity page** — `web/app/(app)/wallet/activity/page.tsx`

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ActivityFull } from "@/components/wallet/ActivityFull";

export default async function ActivityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  return <ActivityFull />;
}
```

- [ ] **Step 7: Create `web/components/wallet/ActivityFull.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useCurrentUserId } from "@/lib/auth-client";
import { createWallet, getWallet } from "@/lib/wdk";
import { parseHistoryDTO, type HistoryEntryView } from "./types";
import { ActivityList } from "./ActivityList";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ActivityFull() {
  const { userId } = useCurrentUserId();
  const [entries, setEntries] = useState<HistoryEntryView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      await createWallet(userId);
      const w = await getWallet(userId);
      const res = await fetch(`/api/wallet/history?address=${w.address}`).then((r) => r.json());
      setEntries((res.entries ?? []).map(parseHistoryDTO));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-3xl">
      <h1 className="mb-4 font-display text-3xl uppercase tracking-wide">Full ledger</h1>
      <Card className="p-5">
        {loading ? <Skeleton className="h-40 w-full" /> : <ActivityList entries={entries} />}
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Build + lint** (stop dev + clear `.next` first)

Run (from root): `rm -rf web/.next && pnpm --filter web build && pnpm --filter web lint`
Expected: build + lint succeed. All URLs unchanged: `/`, `/wallet`, `/wallet/activity`, `/dashboard`, `/account/settings`.

- [ ] **Step 9: Manual check (Playwright, dark)** — landing `/` shows the marketing Navbar (unchanged). `/wallet` shows the sidebar shell (Overview active, Add-funds CTA, wallet-mode chip, account menu) wrapping the overview. Sidebar "Add funds" → `/wallet?action=addFunds` opens the dialog. `/wallet/activity` shows the full ledger inside the shell. `/dashboard` (as club) renders inside the shell with club nav. Resize narrow → sidebar collapses to the hamburger drawer.

- [ ] **Step 10: Commit**

```bash
git add web/app web/components/wallet/ActivityFull.tsx
git commit -m "feat(wallet): (app)/(marketing) route groups + shell + full activity page"
```

---

## Self-Review

**1. Spec coverage:**
- Shell (`(app)` group, sidebar, topbar, role-aware, mobile) → Tasks 7, 10. ✅
- Overview: hero, stat row, positions, activity → Task 9. ✅
- Full activity page → Task 10. ✅
- Send / Receive (QR) / Add funds dialogs → Task 8, wired Task 9. ✅
- Per-position Claim → Task 8 (`ClaimPositionButton`), rendered Task 9. ✅
- `lib/positions.ts` + `/api/wallet/positions` → Task 3. ✅
- `lib/indexer.ts` wired (real + `getLogs` fallback) + `/api/wallet/history` → Task 4. ✅
- `lib/moonpay.ts` signed URL → Task 5. ✅
- Deps (dialog, `qrcode.react`) → Task 6. ✅
- Chart deliberately cut (spec §2/§ chart decision) — no task, correct. ✅
- Marketing Navbar preserved for `/`, `/account` → Task 10. ✅

**2. Placeholder scan:** No TBD/TODO-in-steps; every code step carries full code; test steps carry real assertions. The `indexer.ts` `getBalances` stub stays a stub by design (spec: balances read on-chain, not on the critical path) — documented, not a placeholder gap.

**3. Type consistency:** `FanPosition`/`FanPositionDTO` fields match across `lib/positions.ts` (Task 3) and `components/wallet/types.ts` (Task 8). `HistoryEntry` shape matches between `lib/indexer.ts` (Task 4), the history route DTO (Task 4), and `HistoryEntryDTO` (Task 8). `investedFromShares`/`percentOfRound` (server, Task 3) mirrored by `percentOfRoundView` (client, Task 9 Step 4) — same formula, intentionally duplicated to keep the server-only DB import out of client bundles (noted in each). `WalletHandle` consumed as typed in `lib/wdk.ts`. Nav `Role` type shared from `nav-items.ts`.

**Note for the executor:** `percentOfRound` (server) and `percentOfRoundView` (client) are intentional twins — a client component importing `lib/positions.ts` would pull the DB/`better-sqlite3` into the browser bundle. If you prefer one source, extract the pure math into a third client-safe module and import from both; do NOT import `lib/positions.ts` client-side.
