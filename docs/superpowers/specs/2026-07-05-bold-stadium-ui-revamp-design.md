# Bold Stadium UI Revamp — Design Spec

**Date:** 2026-07-05 · **Owner:** La Doce web (Next.js) · **Track:** Tether WDK hackathon

## Goal

Full visual revamp of the La Doce web app into a **dark-first "bold stadium"** skin
(stadium black-green background, neon-lime accent, condensed jersey display type), built on
**shadcn/ui** as the component base with **`@daveyplate/better-auth-ui`** for the auth screens.
Pure presentational migration — **no changes to money/contract logic**.

## Non-goals

- No changes to invest / claim / distribute / wallet / contract code paths (call sites stay intact).
- No new product features. Only a `/account` page is added (auth surface, not product logic).
- The **WDK React Native UI kit is NOT a dependency** — it targets React Native primitives and can't
  render in Next.js web. We borrow its visual language (color/spacing intent) only.

## Architecture

Three layers, dark-first, all themed by one set of CSS variables in `web/app/globals.css`:

1. **shadcn/ui** — base primitives (Button, Card, Input, Form, Progress, Badge, DropdownMenu,
   Sheet, Skeleton, Dialog, Avatar, Separator, Tabs, Tooltip, Sonner). Tailwind v4 CSS-variable theme.
2. **better-auth-ui** — prebuilt auth views (login, signup, forgot/reset password, account/settings)
   wired to our existing `authClient`, themed by the same shadcn tokens.
3. **App components/pages** — the existing 8 components + 7 pages, migrated to shadcn primitives to
   match the Stitch mockups.

## Theme tokens ("bold stadium")

Set as shadcn CSS variables in `globals.css` (`:root` = dark primary; `.light` / light media = fallback).

| Token | Dark (primary) | Light (fallback) |
|---|---|---|
| `--background` | `#0b0f0d` | `#f6f8f5` |
| `--card` / `--popover` | `#131a16` | `#ffffff` |
| `--foreground` | `#e8f0ea` | `#0b0f0d` |
| `--primary` | `#b6ff3c` (neon lime) | `#2f7d0a` (AA on white) |
| `--primary-foreground` | `#08120a` | `#ffffff` |
| `--secondary` / `--muted` / `--accent` | `#18211c` | `#eef2ec` |
| `--muted-foreground` | `#8fa397` | `#5b6b60` |
| `--border` / `--input` | `#1f2a23` | `#e2e8e0` |
| `--ring` | `#b6ff3c` (low-α glow) | `#2f7d0a` |
| `--destructive` | `#ef4444` | `#ef4444` |
| `--radius` | `0.625rem` | — |

**Glow language:** cards carry a subtle lime ring + soft shadow; the primary CTA fills lime and gains a
lime glow shadow on hover. Neon lime is **never** placed on a white background (light mode swaps primary
to the darkened green `#2f7d0a` for WCAG AA).

**Typography (via `next/font/google`):**
- **Bebas Neue** — condensed jersey caps. Display only: hero titles, section titles, big stat numbers
  (scoreboard feel). Never used for body, inputs, or paragraph text.
- **Geist Sans** — body / UI (kept).
- **Geist Mono** — wallet addresses and USD₮ amounts (kept).

## Component system (shadcn)

**Install:** `button card input label form progress badge dialog dropdown-menu avatar separator skeleton sonner tabs tooltip sheet`.
Add `react-hook-form` (zod already present) for `form`. shadcn `sonner` replaces the raw `sonner` Toaster
wiring in `layout.tsx` (same underlying lib, keeps `richColors position="top-center"`).

**Existing → shadcn mapping:**

| Component | Migration |
|---|---|
| `Navbar` | Bebas logo + `DropdownMenu` (account / salir) + `Sheet` mobile nav + Button CTAs; keep `useSession` gating + role-based links |
| `WalletCard` | `Card` + network `Badge` + big lime balance in Bebas + copy-address button + faucet `Button`s |
| `InvestForm` | `Form` + `Input` (amount) + `Button`; preserve approve→invest two-step + states |
| `DistributeForm` | `Form` + `Input` + `Button` (club-only) |
| `CreateRoundForm` | `Card` + `Form` + `Input`s + `Button` |
| `ClaimButton` | `Button` primary + loading state |
| `RoundProgress` | `Progress` + stat grid (Bebas numbers) + status `Badge` |
| `EnsureWallet` | `Skeleton` while healing (replaces plain text) |

Migration is presentational: props, data flow, and the on-chain call sites in `lib/contracts.ts` are
untouched. Loading/toast behavior (sonner) is preserved.

## Auth — `@daveyplate/better-auth-ui`

- Add a client `web/app/providers.tsx` mounting `<AuthUIProvider authClient={authClient}>`, rendered
  inside `RootLayout`.
- Replace `web/app/login/page.tsx` and `web/app/signup/page.tsx` with better-auth-ui auth views themed
  by shadcn tokens. Add **forgot/reset password** views (free with the lib) and a new
  **`web/app/account/page.tsx`** (profile, change password, salir).
- **Role selection (club/fan):** configure the provider's `additionalFields` so the signup view renders a
  role selector that persists to the existing better-auth `role` additional field (`["club","fan"]`,
  `input: true`). **Fallback:** if the lib can't express the segmented "Soy hincha / Soy un club" control,
  keep a thin custom themed signup that calls `authClient.signUp.email({...role})`.
- **Wallet linking** stays in the existing `EnsureWallet` client component (already self-heals on any
  authed page via server `hasWalletLinked`) — decoupled from the auth form. No wallet logic moves into
  better-auth-ui.
- **Post-auth redirect:** small server helper / route routes by role (club → `/dashboard`,
  fan → `/wallet`) after sign-in/up.
- **Copy:** Spanish (rioplatense) via better-auth-ui localization; preserve the
  `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` → "ese email ya tiene cuenta, iniciá sesión" nicety.

## Pages

| Page | Redesign intent |
|---|---|
| `/` home | Stadium hero (Bebas headline, lime CTA glow) + featured-club `Card` with `RoundProgress` |
| `/login`, `/signup` | Centered better-auth-ui `AuthCard` on stadium background; role selector on signup |
| `/wallet` (fan) | Balance hero `Card` (big lime Bebas number) + invest/claim/faucet actions + holdings |
| `/club/[slug]` | Club hero + round `Card` + `InvestForm` + live `RoundProgress` |
| `/club/[slug]/panel`, `/dashboard` (club) | `DistributeForm`, `CreateRoundForm`, rounds table/list |
| `/account` (new) | better-auth-ui account view: profile, change password, salir |

## Workflow (Stitch-first)

1. **Stitch MCP:** create a project with a dark + custom-lime (`#b6ff3c`) design theme. Generate DESKTOP
   mockups for **Home, Login/Signup, Wallet, Club**. Save HTML + PNG to `web/.stitch/designs/` (or repo
   `.stitch/designs/`). Persist `.stitch/metadata.json`, and write `.stitch/DESIGN.md`, `.stitch/SITE.md`,
   `.stitch/next-prompt.md` (stitch-loop baton).
2. **Review gate:** user reviews the PNG mockups before any React is written.
3. **Build:** `shadcn init` with the tokens above → install the component list → add better-auth-ui →
   migrate the 8 components + 7 pages + layout to match the mockups.
4. **Test:** `pnpm --filter web build` green + `pnpm --filter web lint`; Playwright visual pass on the
   running app (`:3000`) compared against the Stitch PNGs; manual confirm invest/claim/distribute still
   fire end-to-end (logic untouched).

## Testing strategy

- **Build/type gate:** `next build` must pass (catches shadcn/import/type breakage).
- **Lint:** `eslint` clean.
- **Visual parity:** Playwright screenshots of each migrated page vs its Stitch PNG; reviewer confirms
  the stadium skin is applied (dark bg, lime primary, Bebas display).
- **Behavior regression:** the invest → distribute → claim loop and faucet buttons still work on anvil
  (manual, since only presentation changed). No new unit tests required for a presentational migration;
  existing `walletMode.test.ts` / `wdk.smoke.test.ts` must still pass.

## Risks / open items

- **better-auth-ui API/version** — confirm exact provider API, `additionalFields` rendering, and
  localization against the docs during planning; the custom-signup fallback covers a mismatch.
- **Tailwind v4 + shadcn** — confirmed supported (CSS-var `@theme`); verify at `shadcn init`.
- **Bebas Neue** — display-only; guard against it leaking into body/input styles.
- **Dark/light** — current app uses `prefers-color-scheme`; keep that, dark is primary. A manual theme
  toggle is out of scope.
- **Contract/money safety** — no edits to `lib/contracts.ts`, `lib/wdk.ts`, or any on-chain path; PR
  diff should show only presentational/auth-UI changes.

## Sources (verify at plan time)

- shadcn/ui install: https://ui.shadcn.com/docs/installation
- better-auth-ui (shadcn): https://better-auth-ui.com/docs/shadcn
- WDK RN UI kit (inspiration only): https://docs.wdk.tether.io/ui-kits/react-native-ui-kit/get-started/
