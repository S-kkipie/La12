# Spec — Auto-close funding (design)

> Fills the gap explicitly left out of Spec B (`2026-07-06-club-revenue-dashboard-design.md`
> §2: "Closing a round on-chain (`closeRound`/`closeFunding`) — roadmap; state is read-only
> here."). Part 1 of 2 planned follow-ups; part 2 is real multi-club discovery/creation
> (homepage hardcode + `/clubs` listing), a separate spec.

**Date:** 2026-07-06 · **Track:** WDK hackathon · **Deadline:** 2026-07-14

## 1. Goal

Today, once a round's `totalRaised` reaches `goal` (or its `deadline` passes), nothing calls
`closeFunding()` on-chain — the club's USD₮ sits locked in the round contract forever, and
`rounds.status` in SQLite stays `"funding"` forever regardless of real on-chain state. Fix
both: close the round automatically as soon as the goal is hit, and keep `rounds.status`
truthful.

## 2. Scope

**In:**
- A shared server-only helper, `tryCloseFundingIfDue(round)`, that reads on-chain state and,
  if due, calls `closeFunding()` (sponsor-paid, permissionless call — no fan/club key
  involved) and re-syncs `rounds.status` from the contract's real `state()` afterward.
- Trigger point 1 (goal reached): fired right after a fan's `invest()` confirms.
- Trigger point 2 (deadline passed, lazy): fired when the club's public round page is
  server-rendered.
- `rounds.status` becomes trustworthy for any round after either trigger has fired at least
  once past its close condition.

**Out:**
- A cron/scheduled job (no infra for this in the repo; the two trigger points above cover
  the demo's real access patterns without one).
- `closeRound()` (club's voluntary withdrawal, separate lifecycle step) — untouched.
- Re-syncing `rounds.status` from the orphaned `/api/sync` event cache — that endpoint stays
  unused; this spec's status write is direct and independent of it.
- Multi-club discovery/creation — separate spec (see banner above).

## 3. Architecture

### 3.1 `tryCloseFundingIfDue(round)` — new, `web/lib/closeFunding.ts`

```ts
async function tryCloseFundingIfDue(round: RoundRow): Promise<"funding" | "active" | "closed">
```

- Skips immediately if `round.status !== "funding"` (already resolved, no RPC call needed).
- Reads `totalRaised(address)` and compares against `BigInt(round.goal)`, and compares
  `round.deadline` against `Date.now()` — mirrors the same due-condition the contract itself
  enforces (`totalRaised >= goal || block.timestamp >= deadline`), so we only attempt the
  call when it should actually succeed.
- If due: sends `closeFunding()` signed by `SPONSOR_PK`, same wallet-client pattern as
  `fundGas()` in `lib/sponsor.ts` — the sponsor is just "anyone" here, since
  `closeFunding()` has no access control, and pays its own gas.
- Whether or not this call ran (another concurrent trigger may have already closed it,
  which reverts), always finish by reading the contract's real `state()`
  (`roundState()` in `lib/contracts.ts` already exists) and writing that value into
  `rounds.status` if it differs from the DB row — DB is corrected from ground truth, never
  assumed from the tx result. Returns the resulting status string.

### 3.2 Trigger 1 — post-invest, new route `POST /api/rounds/[id]/close-check`

- Public (no auth check needed — it only ever *reads* on-chain state and, if due, performs
  the same permissionless call anyone could send directly; there's no privileged action to
  gate).
- Loads the round by `id`, calls `tryCloseFundingIfDue`, returns `{ status }`.
- `InvestForm.tsx` gains a `roundId: number` prop (its page already has the DB row —
  `club/[slug]/page.tsx` passes `round.id` alongside `round.contractAddress`). After
  `invest()` confirms in `handleInvest`, fire `fetch("/api/rounds/" + roundId + "/close-check", { method: "POST" })`
  — awaited, but its failure only toasts a soft warning, never blocks the "Investment
  confirmed!" success path already shown to the fan.

### 3.3 Trigger 2 — lazy deadline check, `club/[slug]/page.tsx`

- After loading `round` from DB and before reading `totalRaised` for display: if
  `round.status === "funding"` and `round.deadline < new Date()`, call
  `tryCloseFundingIfDue(round)` and use its return value as the `status` passed to
  `RoundProgress`, instead of the (possibly stale) `round.status` — so a page load right
  after the deadline shows the corrected badge on that same request, no second visit needed.

## 4. Data flow

```
Fan invests ──▶ invest() confirms (client, self-custody)
                        │
                        ▼
          POST /api/rounds/:id/close-check
                        │
                        ▼
        tryCloseFundingIfDue: totalRaised ≥ goal?
                 │yes                │no
                 ▼                   ▼
      sponsor calls closeFunding()   (skip call)
                 │                   │
                 └──────┬────────────┘
                        ▼
           read real state() on-chain
                        ▼
           write rounds.status if changed
```

Deadline path is the same diagram minus the invest trigger — entered instead from a club
page render.

## 5. Error handling

- `closeFunding()` revert (already closed by a race between the two triggers, or by another
  concurrent request): caught, ignored — not surfaced to the fan/page, since the subsequent
  `state()` read still produces the correct status regardless of who actually closed it.
- RPC read failure (`totalRaised`, `state()`): caught, function returns the existing
  `round.status` unchanged rather than throwing — a flaky RPC shouldn't break investing or
  break the club page render. Existing `readSafely` helper covers this pattern already.
- Missing `SPONSOR_PK` (judge's env without gas sponsor configured, same as `fundGas`):
  `tryCloseFundingIfDue` short-circuits to the `state()`-read-only path (no call attempted),
  same soft-degrade as the rest of the sponsor system.

## 6. Testing plan

- Extend today's manual bash/`cast` verification style (already used to validate the base
  contract cycle): warp anvil time or invest to the goal, then hit
  `POST /api/rounds/:id/close-check` directly with `curl`, and assert `rounds.status` flips
  and the club's on-chain USD₮ balance reflects the sweep.
- Manual UI pass: invest an amount that crosses `goal` → toast still reads "Investment
  confirmed!" → reload the club page → badge reads `active` and the club wallet balance
  (checked via `cast call balanceOf`) has the raised funds.
- Manual UI pass for the deadline path: seed/deploy a round with a near-future deadline,
  let it pass, load the club page once → badge flips to `active` on that load with no invest
  having happened.
