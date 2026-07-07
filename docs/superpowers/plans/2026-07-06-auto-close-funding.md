# Auto-close Funding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically call `closeFunding()` on-chain the moment a round's goal is reached (or its deadline passes), and keep `rounds.status` in SQLite truthful to the contract's real `state()` from then on.

**Architecture:** A single server-only helper, `tryCloseFundingIfDue(round)` in `web/lib/closeFunding.ts`, is called from two places — right after a fan's `invest()` confirms (new `POST /api/rounds/[id]/close-check`), and lazily when a club's public round page renders (`club/[slug]/page.tsx`). It reads on-chain `totalRaised`/`deadline`, sends a sponsor-paid `closeFunding()` call if due, then always re-reads the contract's real `state()` and writes that into `rounds.status` — DB is corrected from ground truth, never assumed from the tx result.

**Tech Stack:** Next.js 15 App Router, viem, Drizzle ORM (SQLite/better-sqlite3), Foundry/anvil for verification. No new dependencies.

## Global Constraints

- Money truth = on-chain. SQLite = UX/metadata + event cache only (CLAUDE.md).
- Amounts are base units (`bigint`). USD₮ = 6 decimals.
- Server sponsors gas via `SPONSOR_PK` — never touches a fan's or club's own key.
- No cron/scheduled infra — only the two trigger points described above.
- English UI copy; code comments only where the WHY is non-obvious.

---

## File Structure

- **Modify** `web/lib/sponsor.ts` — add `closeFundingSponsored(roundAddress)`, same relayer pattern as the existing `fundGas`.
- **Create** `web/lib/closeFunding.ts` — pure helpers (`isFundingDue`, `mapOnChainStateToDb`) + orchestration (`tryCloseFundingIfDue`).
- **Create** `web/lib/closeFunding.test.ts` — `node:assert` unit tests for the two pure helpers (matches the existing `lib/*.test.ts` convention — run with `npx tsx lib/closeFunding.test.ts` from `web/`, no test runner is wired into `package.json`).
- **Create** `web/app/api/rounds/[id]/close-check/route.ts` — thin POST handler.
- **Modify** `web/components/InvestForm.tsx` — add `roundId` prop, call the close-check endpoint after a confirmed invest.
- **Modify** `web/app/(marketing)/club/[slug]/page.tsx` — pass `roundId` to `InvestForm`; lazy-check before rendering when the deadline has passed.

---

## Task 1: Pure helpers (`isFundingDue`, `mapOnChainStateToDb`)

**Files:**
- Create: `web/lib/closeFunding.ts`
- Test: `web/lib/closeFunding.test.ts`

**Interfaces:**
- Produces: `isFundingDue(totalRaised: bigint, goal: bigint, deadline: Date, now: Date): boolean` and `mapOnChainStateToDb(state: "Funding" | "Active" | "Closed"): "funding" | "active" | "closed"` — both used by Task 3's `tryCloseFundingIfDue`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/closeFunding.test.ts`:

```ts
import assert from "node:assert";
import { isFundingDue, mapOnChainStateToDb } from "./closeFunding";

// isFundingDue — goal reached
assert.equal(isFundingDue(40_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
assert.equal(isFundingDue(41_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), true);
assert.equal(isFundingDue(39_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);

// isFundingDue — deadline passed, goal not reached
assert.equal(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-07-01"), new Date("2026-07-06")), true);

// isFundingDue — neither condition met
assert.equal(isFundingDue(5_000_000_000n, 40_000_000_000n, new Date("2026-10-01"), new Date("2026-07-06")), false);

// mapOnChainStateToDb
assert.equal(mapOnChainStateToDb("Funding"), "funding");
assert.equal(mapOnChainStateToDb("Active"), "active");
assert.equal(mapOnChainStateToDb("Closed"), "closed");

console.log("closeFunding helpers OK");
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/closeFunding.test.ts`
Expected: FAIL — `closeFunding.ts` doesn't exist yet (`Cannot find module './closeFunding'`).

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/closeFunding.ts`:

```ts
/**
 * Mirrors the contract's own due-condition (`totalRaised >= goal ||
 * block.timestamp >= deadline`) so a close is only attempted when it should
 * actually succeed on-chain.
 */
export function isFundingDue(totalRaised: bigint, goal: bigint, deadline: Date, now: Date): boolean {
  return totalRaised >= goal || now.getTime() >= deadline.getTime();
}

/** RevenueShareRound.State enum labels (see lib/contracts.ts ROUND_STATE) to the DB's lowercase enum. */
export function mapOnChainStateToDb(state: "Funding" | "Active" | "Closed"): "funding" | "active" | "closed" {
  return state.toLowerCase() as "funding" | "active" | "closed";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/closeFunding.test.ts`
Expected: PASS — prints `closeFunding helpers OK`.

- [ ] **Step 5: Commit**

```bash
git add web/lib/closeFunding.ts web/lib/closeFunding.test.ts
git commit -m "feat(rounds): add pure close-funding due/state helpers"
```

---

## Task 2: Sponsor-signed `closeFunding()` call

**Files:**
- Modify: `web/lib/sponsor.ts`

**Interfaces:**
- Consumes: `activeChain` (`./chain`), `revenueShareRoundAbi` and `publicClient` (`./contracts`) — all already exported.
- Produces: `closeFundingSponsored(roundAddress: `0x${string}`): Promise<void>` — used by Task 3's `tryCloseFundingIfDue`. Never throws (swallows on-chain reverts and missing `SPONSOR_PK` the same way `fundGas` does).

- [ ] **Step 1: Add the function**

Modify `web/lib/sponsor.ts` — the file currently starts with:

```ts
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "./chain";
```

Change the first line and add one new import, so the top of the file reads:

```ts
import { createWalletClient, encodeFunctionData, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain } from "./chain";
import { publicClient, revenueShareRoundAbi } from "./contracts";
```

Then append this function at the end of the file:

```ts
/**
 * Calls `closeFunding()` on `roundAddress`, paid by the sponsor relayer.
 * `closeFunding()` has no access control on-chain — the sponsor is acting as
 * "anyone", the same way a fan or the club themselves could call it directly.
 * Swallows failures (already closed by a concurrent trigger, or SPONSOR_PK
 * not configured) — the caller always re-reads the contract's real `state()`
 * afterward regardless of whether this call succeeded.
 */
export async function closeFundingSponsored(roundAddress: `0x${string}`): Promise<void> {
  const pk = process.env.SPONSOR_PK;
  if (!pk) return;

  const account = privateKeyToAccount(pk as `0x${string}`);
  const walletClient = createWalletClient({ account, chain: activeChain, transport: http(RPC_URL) });
  const data = encodeFunctionData({ abi: revenueShareRoundAbi, functionName: "closeFunding" });

  try {
    const hash = await walletClient.sendTransaction({ to: roundAddress, data });
    await publicClient.waitForTransactionReceipt({ hash });
  } catch {
    // Not due yet, or another concurrent trigger already closed it — ignore.
  }
}
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors introduced by `sponsor.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/lib/sponsor.ts
git commit -m "feat(rounds): add sponsor-signed closeFunding call"
```

---

## Task 3: `tryCloseFundingIfDue` orchestration

**Files:**
- Modify: `web/lib/closeFunding.ts`

**Interfaces:**
- Consumes: `isFundingDue`, `mapOnChainStateToDb` (Task 1, same file); `closeFundingSponsored` (Task 2, `./sponsor`); `totalRaised`, `roundState` (`./contracts`, already exist); `db`, `eq`, `rounds`, `Round` type (`@/lib/db`, `drizzle-orm`, `@/db/schema`).
- Produces: `tryCloseFundingIfDue(round: Round): Promise<"funding" | "active" | "closed">` — used by Task 4's API route and Task 6's page.

- [ ] **Step 1: Implement**

Add to `web/lib/closeFunding.ts` (append, keep the Step-3 helpers from Task 1 above unchanged):

```ts
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds, type Round } from "@/db/schema";
import { totalRaised, roundState } from "./contracts";
import { closeFundingSponsored } from "./sponsor";

/**
 * If `round` is still `funding` and due to close (goal reached or deadline
 * passed), sends the sponsor-paid `closeFunding()` call. Either way, finishes
 * by reading the contract's real `state()` and correcting `rounds.status` in
 * the DB if it's stale — the DB is never trusted, only ever corrected from
 * on-chain reads.
 */
export async function tryCloseFundingIfDue(round: Round): Promise<"funding" | "active" | "closed"> {
  if (round.status !== "funding") return round.status;

  const address = round.contractAddress as `0x${string}`;

  try {
    const raised = await totalRaised(address);
    if (isFundingDue(raised, BigInt(round.goal), round.deadline, new Date())) {
      await closeFundingSponsored(address);
    }
  } catch {
    // RPC read failed — fall through to the state() read below, which will
    // also fail and return the existing status unchanged.
  }

  let onChainStatus: "funding" | "active" | "closed";
  try {
    onChainStatus = mapOnChainStateToDb(await roundState(address));
  } catch {
    return round.status;
  }

  if (onChainStatus !== round.status) {
    await db.update(rounds).set({ status: onChainStatus }).where(eq(rounds.id, round.id));
  }
  return onChainStatus;
}
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Re-run Task 1's unit test to confirm no regression**

Run (from `web/`): `npx tsx lib/closeFunding.test.ts`
Expected: PASS — `closeFunding helpers OK` (this file only exercises the pure helpers, unaffected by the new orchestration function).

- [ ] **Step 4: Commit**

```bash
git add web/lib/closeFunding.ts
git commit -m "feat(rounds): add tryCloseFundingIfDue orchestration"
```

---

## Task 4: `POST /api/rounds/[id]/close-check` route

**Files:**
- Create: `web/app/api/rounds/[id]/close-check/route.ts`

**Interfaces:**
- Consumes: `tryCloseFundingIfDue` (Task 3, `@/lib/closeFunding`), `db`, `rounds`, `eq`.
- Produces: `POST /api/rounds/:id/close-check` → `200 { status: "funding" | "active" | "closed" }` on success, `404 { error }` if the round doesn't exist.

- [ ] **Step 1: Implement**

Create `web/app/api/rounds/[id]/close-check/route.ts`:

```ts
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { rounds } from "@/db/schema";
import { tryCloseFundingIfDue } from "@/lib/closeFunding";

/**
 * Public and unauthenticated on purpose: it only ever reads on-chain state
 * and, if due, performs the same permissionless `closeFunding()` call anyone
 * could already send directly — there's no privileged action to gate here.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [round] = await db.select().from(rounds).where(eq(rounds.id, Number(id)));
  if (!round) {
    return NextResponse.json({ error: "round not found" }, { status: 404 });
  }

  const status = await tryCloseFundingIfDue(round);
  return NextResponse.json({ status });
}
```

- [ ] **Step 2: Manual verification against a live round**

This needs a real deployed round to hit — run this after Task 6 is also done, as part of the end-to-end pass in Task 7. For now, just type-check:

Run (from `web/`): `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/rounds/[id]/close-check/route.ts
git commit -m "feat(rounds): add close-check API route"
```

---

## Task 5: Wire trigger 1 — post-invest close-check

**Files:**
- Modify: `web/components/InvestForm.tsx`

**Interfaces:**
- Consumes: `POST /api/rounds/:id/close-check` (Task 4).
- Produces: `InvestForm` now requires a `roundId: number` prop — Task 6 must pass it.

- [ ] **Step 1: Add the `roundId` prop and fire the check after invest**

Modify `web/components/InvestForm.tsx`. Replace the `Props` type and function signature (currently lines 15-20):

```ts
type Props = {
  roundId: number;
  roundAddress: `0x${string}`;
  onInvested?: (hash: `0x${string}`) => void;
};

export function InvestForm({ roundId, roundAddress, onInvested }: Props) {
```

In `handleInvest`, right after `const hash = await invest(wallet, roundAddress, value);` and before the success toast:

```ts
      const hash = await invest(wallet, roundAddress, value);

      // Best-effort: if this investment crossed the goal, close funding now
      // so the club receives the raised USD₮ immediately. A failure here
      // never blocks the fan's own successful investment.
      fetch(`/api/rounds/${roundId}/close-check`, { method: "POST" }).catch(() => {});

      toast.success("Investment confirmed!", { id: toastId });
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: a new error at every call site of `<InvestForm>` missing `roundId` — expected until Task 6 fixes the one real call site.

- [ ] **Step 3: Commit**

```bash
git add web/components/InvestForm.tsx
git commit -m "feat(rounds): fire close-check after a confirmed invest"
```

---

## Task 6: Wire trigger 2 — lazy deadline check on the club page

**Files:**
- Modify: `web/app/(marketing)/club/[slug]/page.tsx`

**Interfaces:**
- Consumes: `tryCloseFundingIfDue` (Task 3, `@/lib/closeFunding`); `InvestForm` now requires `roundId` (Task 5).

- [ ] **Step 1: Lazy-check when the deadline has passed, and pass `roundId`**

Modify `web/app/(marketing)/club/[slug]/page.tsx`. Change the import line:

```ts
import { totalRaised, readSafely } from "@/lib/contracts";
```

to:

```ts
import { totalRaised, readSafely } from "@/lib/contracts";
import { tryCloseFundingIfDue } from "@/lib/closeFunding";
```

Replace this block (currently lines 31-33):

```ts
  const raised = round
    ? await readSafely(() => totalRaised(round.contractAddress as `0x${string}`), 0n)
    : 0n;
```

with:

```ts
  let status = round?.status;
  if (round && round.status === "funding" && round.deadline.getTime() < Date.now()) {
    status = await tryCloseFundingIfDue(round);
  }

  const raised = round
    ? await readSafely(() => totalRaised(round.contractAddress as `0x${string}`), 0n)
    : 0n;
```

Then replace this line (currently line 52):

```tsx
            status={round.status}
```

with:

```tsx
            status={status ?? round.status}
```

And replace this line (currently line 55):

```tsx
            <InvestForm roundAddress={round.contractAddress as `0x${string}`} />
```

with:

```tsx
            <InvestForm roundId={round.id} roundAddress={round.contractAddress as `0x${string}`} />
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors — this was the last call site missing `roundId`.

- [ ] **Step 3: Commit**

```bash
git add "web/app/(marketing)/club/[slug]/page.tsx"
git commit -m "feat(rounds): lazy-close funding on club page load past deadline"
```

---

## Task 7: End-to-end verification on anvil

**Files:** none (verification only).

- [ ] **Step 1: Start a fresh anvil and deploy, per `docs/judge-verification.md` steps 3-5**

```bash
export PATH="$HOME/.foundry/bin:$PATH"
anvil --accounts 25 --balance 1000 &
cd contracts
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Note the printed `MockUSDT`, `RoundFactory`, `Demo round` addresses.

- [ ] **Step 2: Seed the web DB against that deploy, start dev server**

Update `web/.env.local` with the 3 addresses from Step 1 (local anvil mode — see `docs/judge-verification.md` §4), then:

```bash
cd web
rm -f ladoce.db
pnpm db:push
pnpm db:seed
pnpm dev &
```

- [ ] **Step 3: Verify trigger 1 — goal reached via close-check**

Using `cast` (as in `docs/flujo-inversion.md` §3), invest enough as any anvil test account to reach the seeded round's goal (40,000 USD₮ — do this directly on-chain with `cast send ... invest(...)` since a full browser signup is out of scope for this check), then call the endpoint directly:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
ROUND_ID=1   # the seeded demo round's DB id
curl -s -X POST http://localhost:3000/api/rounds/$ROUND_ID/close-check
```

Expected: `{"status":"active"}`. Then confirm the DB and the club's on-chain balance:

```bash
node -e "const d=require('better-sqlite3')('web/ladoce.db');console.log(d.prepare('SELECT status FROM rounds WHERE id=1').get())"
cast call <MockUSDT> "balanceOf(address)(uint256)" <club address> --rpc-url http://127.0.0.1:8545
```

Expected: DB `status` = `active`; club's USD₮ balance = the round's `goal`.

- [ ] **Step 4: Verify trigger 2 — lazy deadline close on page load**

Deploy a second round with a short deadline (e.g. `ROUND_DEADLINE_DAYS=0` via the `Deploy.s.sol` env override, or `cast send` a `createRound` call with a `deadline` a few seconds in the future), register it in the DB the same way the seed does, wait for the deadline to pass, then:

```bash
curl -s http://localhost:3000/club/deportivo-san-martin | grep -o "Active\|Funding\|Closed"
```

Expected: `Active` appears (not `Funding`) — the lazy check fired during that page's server render, with no invest or explicit close-check call involved.

- [ ] **Step 5: Stop anvil and dev server, restore `.env.local`**

```bash
# Ctrl-C both background jobs, or:
pkill -f "anvil --accounts 25" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
```

Restore `web/.env.local` to whatever mode (gasless Sepolia or local) was active before this verification pass.
