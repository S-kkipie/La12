# Bold Stadium UI Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the La Doce web app to a dark-first "bold stadium" skin built on shadcn/ui, with `better-auth-ui` for the auth screens — purely presentational, zero changes to money/contract logic.

**Architecture:** One set of CSS variables in `web/app/globals.css` (shadcn tokens, dark = `:root`, light = `prefers-color-scheme` fallback) drives shadcn primitives. Existing components/pages are restyled to shadcn (`Card`/`Button`/`Input`/`Badge`/`DropdownMenu`), keeping their client logic and on-chain call sites byte-for-byte. Auth forms are replaced by better-auth-ui's shadcn-registry components.

**Tech Stack:** Next.js 15.5 App Router (TS), React 19, Tailwind v4, shadcn/ui, `better-auth-ui` (shadcn registry), Bebas Neue + Geist fonts, viem (untouched), better-auth (untouched).

## Global Constraints

- **No changes to money/contract/wallet logic.** Do not edit `lib/contracts.ts`, `lib/wdk.ts`, `lib/walletMode.ts`, `lib/sponsor.ts`, `lib/ensureWallet.ts` logic, or any `app/api/*` route. Component migrations must preserve every `useState`, effect, handler, toast, and call site verbatim — only JSX/className and imports change.
- **Dark-first "bold stadium" tokens** (exact hex, set in `globals.css`): `--background:#0b0f0d`, `--card:#131a16`, `--foreground:#e8f0ea`, `--primary:#b6ff3c`, `--primary-foreground:#08120a`, `--secondary/--muted:#18211c`, `--muted-foreground:#8fa397`, `--border/--input:#1f2a23`, `--ring:#b6ff3c`, `--destructive:#ef4444`, `--radius:0.625rem`. Light fallback: `--background:#f6f8f5`, `--card:#ffffff`, `--foreground:#0b0f0d`, `--primary:#2f7d0a`, `--primary-foreground:#ffffff`, `--border/--input:#e2e8e0`, `--muted-foreground:#5b6b60`.
- **Bebas Neue is display-only** (`font-display` utility): hero titles, section titles, big stat numbers. Never on body text, inputs, or paragraphs. Body = Geist Sans, addresses/amounts = Geist Mono.
- **Neon lime never on a white background** — light mode uses `#2f7d0a` for primary.
- **Copy stays Spanish (rioplatense).** Preserve existing strings when restyling.
- **Commands run from `web/`**: `cd web && pnpm dlx shadcn@latest …`; build = `pnpm --filter web build` (from repo root) or `pnpm build` (from `web/`); lint = `pnpm --filter web lint`.
- **Keep `web/next.config.ts` `serverExternalPackages`** untouched (WDK/sodium native chain).
- **Verification model (this is a presentational migration — no new unit tests, that would be test theater):** each task's gate is (a) `pnpm --filter web build` passes (Next type-checks all TS, so this catches import/type/JSX breakage), (b) `pnpm --filter web lint` clean, (c) the specific visual/behavior check named in the task. Final behavior parity is the Task 8 Playwright + on-chain pass.
- **`/club/[slug]/panel` is a pure redirect to `/dashboard`** — do not restyle it (no UI).

---

### Task 1: Stitch mockups + design reference

> **Executor:** the controller runs this inline (Stitch MCP tools `mcp__stitch__*` + a user review gate). It is not dispatched to a code-implementer, because it produces design assets and requires a human PNG review before any React is written.

**Files:**
- Create: `web/.stitch/metadata.json`, `web/.stitch/DESIGN.md`, `web/.stitch/SITE.md`, `web/.stitch/next-prompt.md`
- Create: `web/.stitch/designs/{home,auth,wallet,club}.html` and `.../{home,auth,wallet,club}.png`

**Interfaces:**
- Produces: PNG mockups of the "bold stadium" language for Home, Auth (login/signup), Wallet, Club — the visual target Tasks 2–7 match. `DESIGN.md` records the token values (already fixed in Global Constraints) so later tasks and Stitch share one vocabulary.

- [ ] **Step 1: Create the Stitch project**

Call `mcp__stitch__create_project` with title `La Doce — Bold Stadium`, `deviceType: DESKTOP`, and a dark design theme with custom color `#b6ff3c` (neon lime). Then call `mcp__stitch__get_project` and write the returned project/theme/ids into `web/.stitch/metadata.json` (schema: `name`, `projectId`, `title`, `deviceType`, `designTheme`, `screens: {}`).

- [ ] **Step 2: Write the shared design prompt block**

Create `web/.stitch/DESIGN.md` with a "Design System" section restating the Global Constraints tokens (stadium black `#0b0f0d`, neon lime `#b6ff3c` primary, `#08120a` on-lime text, condensed Bebas-Neue display caps for titles/big numbers, Geist body, `0.625rem` radius, subtle lime glow on cards, dark-first). This block is copied into every Stitch prompt for consistency.

- [ ] **Step 3: Generate the four mockups**

For each of `home`, `auth`, `wallet`, `club`, call `mcp__stitch__generate_screen_from_text` with `projectId`, `deviceType: DESKTOP`, and a prompt = the DESIGN.md block + the page's content brief:
- **home**: stadium hero with big Bebas headline "Sé socio de tu club, en USD₮", lime CTA with glow, a featured-club card showing a funding progress bar + "reparto 8% / tope 1.5x" stats.
- **auth**: centered auth card on stadium background, email + password, a segmented "Soy hincha / Soy un club" role toggle, lime primary button.
- **wallet**: balance hero card with a large lime Bebas number "1,250.00 USD₮", address in mono, invest/claim/faucet buttons, a movements list.
- **club**: club header, a funding round card (progress bar + stats), an invest form with the "sin reembolso" warning, lime invest button.

After each, call `mcp__stitch__get_project` and update `screens` in `metadata.json` (id, sourceScreen, x, y, width, height).

- [ ] **Step 4: Download assets**

For each screen download `htmlCode.downloadUrl` → `web/.stitch/designs/{page}.html` and `screenshot.downloadUrl` (append `=w{width}` using the screen's width) → `web/.stitch/designs/{page}.png`.

- [ ] **Step 5: Write SITE.md + baton**

Create `web/.stitch/SITE.md` (vision = La Doce bold-stadium web; sitemap marking home/auth/wallet/club as `[x]` mocked; Stitch projectId). Create `web/.stitch/next-prompt.md` with frontmatter `page: dashboard` and a body reusing the DESIGN.md block for the club dashboard (distribute + create-round), to keep the loop alive.

- [ ] **Step 6: User review gate**

Show the user the four PNGs. **Do not proceed to Task 2 until the user approves the visual direction.** If they request changes, re-generate (`generate_variants` or a new `generate_screen_from_text`) and re-download before continuing.

- [ ] **Step 7: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/.stitch
git commit -m "design: Stitch bold-stadium mockups (home/auth/wallet/club)"
```

---

### Task 2: shadcn foundation + bold-stadium theme + fonts

**Files:**
- Create: `web/components.json`, `web/lib/utils.ts`, `web/components/ui/*.tsx` (generated)
- Modify: `web/app/globals.css` (full overwrite), `web/app/layout.tsx`
- Modify: `web/package.json` (deps added by shadcn — do not hand-edit)

**Interfaces:**
- Produces: shadcn primitives importable at `@/components/ui/{button,card,input,label,badge,skeleton,separator,dropdown-menu,avatar,sonner}`; `cn` from `@/lib/utils`; CSS token set + `font-display` (Bebas), `font-sans` (Geist), `font-mono` (Geist Mono) utilities; `.glow` utility class. All shadcn components read the tokens below.

- [ ] **Step 1: Init shadcn (non-interactive)**

```bash
cd /home/skkippie/work/AI-DO/La12/web
pnpm dlx shadcn@latest init -d -b neutral
```
Expected: creates `components.json`, `lib/utils.ts` (with `cn`), installs `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, and rewrites `app/globals.css`. If it asks to overwrite `globals.css`, allow it (Step 3 replaces it anyway).

- [ ] **Step 2: Add the primitives we use**

```bash
cd /home/skkippie/work/AI-DO/La12/web
pnpm dlx shadcn@latest add button card input label badge skeleton separator dropdown-menu avatar sonner -y
```
Expected: creates `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `badge.tsx`, `skeleton.tsx`, `separator.tsx`, `dropdown-menu.tsx`, `avatar.tsx`, `sonner.tsx`.

- [ ] **Step 3: Overwrite `web/app/globals.css` with the bold-stadium theme**

Replace the entire file with:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:where(.dark, .dark *));

/* Dark is the primary skin. */
:root {
  --radius: 0.625rem;
  --background: #0b0f0d;
  --foreground: #e8f0ea;
  --card: #131a16;
  --card-foreground: #e8f0ea;
  --popover: #131a16;
  --popover-foreground: #e8f0ea;
  --primary: #b6ff3c;
  --primary-foreground: #08120a;
  --secondary: #18211c;
  --secondary-foreground: #d7ffb0;
  --muted: #18211c;
  --muted-foreground: #8fa397;
  --accent: #1c2a20;
  --accent-foreground: #d7ffb0;
  --destructive: #ef4444;
  --destructive-foreground: #fef2f2;
  --border: #1f2a23;
  --input: #1f2a23;
  --ring: #b6ff3c;
}

/* Light fallback — neon lime is swapped for an AA-safe green on white. */
@media (prefers-color-scheme: light) {
  :root {
    --background: #f6f8f5;
    --foreground: #0b0f0d;
    --card: #ffffff;
    --card-foreground: #0b0f0d;
    --popover: #ffffff;
    --popover-foreground: #0b0f0d;
    --primary: #2f7d0a;
    --primary-foreground: #ffffff;
    --secondary: #eef2ec;
    --secondary-foreground: #12261a;
    --muted: #eef2ec;
    --muted-foreground: #5b6b60;
    --accent: #e6f0df;
    --accent-foreground: #12261a;
    --destructive: #ef4444;
    --destructive-foreground: #ffffff;
    --border: #e2e8e0;
    --input: #e2e8e0;
    --ring: #2f7d0a;
  }
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-bebas);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

@layer base {
  * {
    border-color: var(--border);
  }
  body {
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-sans), Arial, Helvetica, sans-serif;
  }
}

/* Subtle lime glow for hero cards / featured surfaces. */
.glow {
  box-shadow:
    0 0 0 1px color-mix(in oklab, var(--primary) 14%, transparent),
    0 12px 44px -22px color-mix(in oklab, var(--primary) 45%, transparent);
}
```

- [ ] **Step 4: Wire Bebas Neue + keep Geist in `web/app/layout.tsx`**

Replace the file with (adds the `Bebas_Neue` font exposing `--font-bebas`, keeps Geist, uses the shadcn `Toaster`):

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono, Bebas_Neue } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const bebasNeue = Bebas_Neue({
  weight: "400",
  variable: "--font-bebas",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "La Doce — tokenización de clubes de fútbol",
  description:
    "Financiá a tu club en USD₮ y cobrá tu parte de la recaudación. Wallets self-custody con WDK.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${bebasNeue.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Navbar />
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Verify build + smoke the theme**

```bash
pnpm --filter web build
```
Expected: PASS. Temporarily confirm the theme by grepping the compiled token: `grep -R "b6ff3c" web/.next/ | head -1` should match (lime primary shipped). Remove no files.

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/components.json web/lib/utils.ts web/components/ui web/app/globals.css web/app/layout.tsx web/package.json pnpm-lock.yaml
git commit -m "feat(ui): shadcn foundation + bold-stadium theme tokens + Bebas display font"
```

---

### Task 3: better-auth-ui integration (auth + account + role + role-based redirect)

**Files:**
- Create: `web/components/providers.tsx`, `web/app/auth/[path]/page.tsx`, `web/app/settings/[path]/page.tsx`, `web/app/post-auth/page.tsx`
- Create (registry-generated): `web/components/auth/*`, `web/lib/query-client.ts` (whatever `all.json` scaffolds)
- Modify: `web/app/layout.tsx` (wrap children in `<Providers>`)
- Delete: `web/app/login/page.tsx`, `web/app/signup/page.tsx` → replaced by redirect stubs
- Create: `web/app/login/page.tsx`, `web/app/signup/page.tsx` (legacy redirect stubs)

**Interfaces:**
- Consumes: `authClient` from `@/lib/auth-client`; better-auth `role` additional field (`["club","fan"]`, `input:true`) from `lib/auth.ts` (unchanged).
- Produces: auth routes `/auth/sign-in`, `/auth/sign-up`, `/auth/forgot-password`, `/auth/reset-password`; account at `/settings/account`; a `/post-auth` server redirector that sends `club → /dashboard`, `fan → /wallet`. `EnsureWallet` (unchanged) still creates+links the wallet on first authed page.

> **Why this (shadcn-registry) variant, verified 2026-07-05:** there are two better-auth-ui distributions. The classic npm `@daveyplate/better-auth-ui` (`<AuthUIProvider navigate={router.push}>` + `<AuthView>`) is lighter but its `additionalFields` only render text/number/boolean inputs — it **cannot** render our `role` enum as a select. The shadcn-registry variant at `better-auth-ui.com/docs/shadcn` (`<AuthProvider>` + `@tanstack/react-query`) supports `inputType:"select"` with `options`, which is exactly the club/fan picker we need. That is why we take the heavier variant. Imports below are verified against the official docs; the generated component/helper paths (`@/components/auth/*`, `@/lib/query-client`) must be confirmed against what Step 1 actually writes.
>
> **Escalation / fallback:** if the registry install conflicts with our stack (it demands a `better-auth` newer than `^1.6.23`, `@tanstack/react-query` breaks the build, or the generated provider can't express the role select), STOP and report BLOCKED with the exact error. Fallback = keep hand-rolled `login`/`signup` pages, restyled only with shadcn `Card`/`Input`/`Button`/`Label` (segmented role toggle exactly as the current signup), preserving the `authClient.signUp.email({...role})` + `ensureWalletLinked` + role-redirect logic (all of which already exist and work). Do not spend more than one debugging pass before escalating.

- [ ] **Step 1: Install the better-auth-ui shadcn registry bundle**

```bash
cd /home/skkippie/work/AI-DO/La12/web
pnpm dlx shadcn@latest add https://better-auth-ui.com/r/all.json -y
```
Expected: scaffolds `components/auth/*` (the `AuthProvider`, `Auth`, `Settings` components), adds deps `@better-auth-ui/core`, `@better-auth-ui/react`, `@tanstack/react-query`, and helper files (e.g. `lib/query-client.ts`). Read the generated `components/auth/*` to learn the exact export names before wiring (they must match the imports below; adjust import paths to the generated locations).

- [ ] **Step 2: Verify the install builds as-is**

```bash
pnpm --filter web build
```
Expected: PASS (generated code compiles before we wire it). If it fails on a peer/version conflict → escalate per the fallback note.

- [ ] **Step 3: Create `web/components/providers.tsx`**

Mount the better-auth-ui provider with our `authClient`, Next navigation, role field, and a role-based redirect target. (Import paths for `AuthProvider`/query client must match what Step 1 generated — the shape below matches the documented Next.js integration.)

```tsx
"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { authClient } from "@/lib/auth-client";
import { getQueryClient } from "@/lib/query-client";
import { AuthProvider } from "@/components/auth/auth-provider";

const es = {
  SIGN_IN: "Iniciá sesión",
  SIGN_UP: "Creá tu cuenta",
  EMAIL: "Email",
  PASSWORD: "Contraseña",
  SIGN_IN_ACTION: "Ingresar",
  SIGN_UP_ACTION: "Crear cuenta",
};

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider
        authClient={authClient}
        Link={Link}
        navigate={({ to, replace }: { to: string; replace?: boolean }) =>
          replace ? router.replace(to) : router.push(to)
        }
        redirectTo="/post-auth"
        localization={es}
        additionalFields={[
          {
            name: "role",
            type: "string",
            label: "Tipo de cuenta",
            inputType: "select",
            options: [
              { label: "Soy hincha", value: "fan" },
              { label: "Soy un club", value: "club" },
            ],
            signUp: true,
            required: true,
          },
        ]}
      >
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Wrap children in `<Providers>` in `web/app/layout.tsx`**

Change the body to wrap `{children}` (Navbar + Toaster stay):

```tsx
import { Providers } from "@/components/providers";
// …unchanged imports…

      <body className="min-h-full flex flex-col">
        <Providers>
          <Navbar />
          {children}
          <Toaster richColors position="top-center" />
        </Providers>
      </body>
```

- [ ] **Step 5: Create the auth catch-all route `web/app/auth/[path]/page.tsx`**

```tsx
import { viewPaths } from "@better-auth-ui/core";
import { notFound } from "next/navigation";
import { Auth } from "@/components/auth/auth";

export default async function AuthPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!Object.values(viewPaths.auth).includes(path)) notFound();

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 items-center justify-center px-6 py-16">
      <Auth path={path} />
    </div>
  );
}
```
`viewPaths.auth` covers `sign-in`, `sign-up`, `sign-out`, `forgot-password`, `reset-password`. (If Step 1 generated the component as `AuthView`/`AuthCard` rather than `Auth`, use that export + its `path`/`pathname` prop as generated.)

- [ ] **Step 6: Create the account/settings route `web/app/settings/[path]/page.tsx`**

Server-guard with the better-auth-ui `ensureSession` helper (verified pattern — prefetches the session into the query client so the client `Settings` hooks skip their loading state), then render the generated `Settings`:

```tsx
import { viewPaths } from "@better-auth-ui/core";
import { ensureSession } from "@better-auth-ui/react/server";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getQueryClient } from "@/lib/query-client";
import { Settings } from "@/components/auth/settings/settings";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ path: string }>;
}) {
  const { path } = await params;
  if (!Object.values(viewPaths.settings).includes(path)) notFound();

  const queryClient = getQueryClient();
  const session = await ensureSession(queryClient, auth, { headers: await headers() });
  if (!session) {
    redirect(`/auth/sign-in?redirectTo=${encodeURIComponent(`/settings/${path}`)}`);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <Settings path={path} />
      </div>
    </HydrationBoundary>
  );
}
```
`viewPaths.settings` covers `account` and `security`. Match the generated `Settings`/`getQueryClient`/`ensureSession` import paths to what Step 1 wrote (adjust if the bundle names them differently).

- [ ] **Step 7: Create the role-based redirector `web/app/post-auth/page.tsx`**

```tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

// better-auth-ui's redirectTo is a single static path; this server page reads
// the freshly-created session and routes by role. Wallet creation/linking
// still happens on the destination page via <EnsureWallet>.
export default async function PostAuthPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/auth/sign-in");
  redirect(session.user.role === "club" ? "/dashboard" : "/wallet");
}
```

- [ ] **Step 8: Replace old auth pages with legacy redirect stubs**

Overwrite `web/app/login/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function LoginRedirect() {
  redirect("/auth/sign-in");
}
```
Overwrite `web/app/signup/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function SignupRedirect() {
  redirect("/auth/sign-up");
}
```

- [ ] **Step 9: Verify build + manual auth smoke**

```bash
pnpm --filter web build
```
Expected: PASS. Then (dev server on :3000) confirm: `/auth/sign-up` shows email/password + the "Tipo de cuenta" select; signing up as **fan** lands on `/wallet` (with "Configurando tu billetera…" from EnsureWallet, then a wallet), as **club** lands on `/dashboard`; `/auth/sign-in` works; `/settings/account` renders when logged in and redirects to sign-in when not; `/login` + `/signup` redirect to the new routes.

- [ ] **Step 10: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/components web/app web/lib web/package.json pnpm-lock.yaml
git commit -m "feat(auth): better-auth-ui screens + account + role select + role-based redirect"
```

---

### Task 4: Navbar → shadcn

**Files:**
- Modify: `web/components/Navbar.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useSession`, `authClient` from `@/lib/auth-client`; auth routes from Task 3 (`/auth/sign-in`, `/auth/sign-up`, `/settings/account`).
- Produces: themed top nav; unchanged session gating and role-based links (`club → /dashboard`, `fan → /wallet`).

- [ ] **Step 1: Rewrite `web/components/Navbar.tsx`**

Bebas logo, shadcn `Button` CTAs, and a `DropdownMenu` for the authed account menu. Session logic and `handleLogout` are preserved; only links point to the new auth routes.

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export function Navbar() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/auth/sign-in");
    router.refresh();
  }

  const home = session ? (session.user.role === "club" ? "/dashboard" : "/wallet") : "/";

  return (
    <nav className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link
        href="/"
        className="font-display text-2xl uppercase tracking-wide text-primary"
      >
        La Doce
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {isPending ? null : session ? (
          <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
              <Avatar className="size-9 border border-border">
                <AvatarFallback className="bg-secondary text-secondary-foreground">
                  {(session.user.name ?? session.user.email ?? "?").charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={home}>{session.user.role === "club" ? "Mi panel" : "Mi billetera"}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings/account">Mi cuenta</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>Salir</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/sign-in">Iniciar sesión</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/sign-up">Crear cuenta</Link>
            </Button>
          </>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/components/Navbar.tsx
git commit -m "feat(ui): Navbar → shadcn (Bebas logo, account dropdown, themed CTAs)"
```

---

### Task 5: Display/read components → shadcn (RoundProgress, WalletCard, EnsureWallet)

**Files:**
- Modify: `web/components/RoundProgress.tsx`, `web/components/WalletCard.tsx`, `web/components/EnsureWallet.tsx` (full rewrites)

**Interfaces:**
- Consumes: shadcn `Card`, `Badge`, `Button`, `Skeleton`; `formatUsdt`/`formatFiat`/`formatBps`/`formatCapMultiple` from `@/lib/format` (unchanged); all data-fetching/wallet logic unchanged.
- Produces: restyled components with identical props/behavior. `RoundProgress` stays a server component (no Radix client parts — the bar is a token-styled div).

- [ ] **Step 1: Rewrite `web/components/RoundProgress.tsx`** (server-safe; logic identical)

```tsx
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatUsdt, formatCapMultiple, formatBps } from "@/lib/format";

type Props = {
  raised: bigint;
  goal: bigint;
  capMultiple: number; // bps-scaled, e.g. 15000 = 1.5x
  revenueBps: number;
  deadline: Date;
  status: "funding" | "active" | "closed";
};

const STATUS_LABEL: Record<Props["status"], string> = {
  funding: "En financiamiento",
  active: "Activa",
  closed: "Cerrada",
};

/** Pure display component — safe to render from a Server Component. */
export function RoundProgress({ raised, goal, capMultiple, revenueBps, deadline, status }: Props) {
  const pct = goal > 0n ? Math.min(100, Number((raised * 100n) / goal)) : 0;

  return (
    <Card className="glow w-full p-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <Badge className="border-transparent bg-primary/15 text-primary">{STATUS_LABEL[status]}</Badge>
        <span className="text-muted-foreground">
          Cierra {deadline.toLocaleDateString("es-PE")}
        </span>
      </div>

      <div className="h-3 w-full overflow-hidden rounded-full bg-secondary">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <span className="font-display text-3xl tracking-wide">
          {formatUsdt(raised)}{" "}
          <span className="font-sans text-sm font-normal text-muted-foreground">/ {formatUsdt(goal)} USD₮</span>
        </span>
        <span className="text-sm text-muted-foreground">{pct}%</span>
      </div>

      <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
        <span>Reparto a hinchas: {formatBps(revenueBps)} de la recaudación</span>
        <span>Tope: {formatCapMultiple(capMultiple)}</span>
      </div>
    </Card>
  );
}
```

- [ ] **Step 2: Rewrite `web/components/WalletCard.tsx`** — keep ALL hooks/handlers verbatim; only the JSX after the hooks changes. Preserve `refresh`, `fundWithMoonpay`, `fundWithTestFaucet`, `fundWithGasFaucet`, `walletMode()` branch, and every state variable exactly as in the current file. Replace the three render branches:

Loading branch:
```tsx
  if (loading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-3 h-10 w-56" />
        <Skeleton className="mt-4 h-9 w-full" />
      </Card>
    );
  }
```
Error branch:
```tsx
  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/10 p-5 text-destructive-foreground">
        No se pudo cargar tu billetera: {error}
      </Card>
    );
  }
```
Main branch:
```tsx
  return (
    <Card className="glow flex flex-col gap-4 p-5">
      <div>
        <div className="text-xs text-muted-foreground">Tu dirección</div>
        <div className="truncate font-mono text-sm">{address}</div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground">Balance USD₮</div>
        <div className="font-display text-5xl tracking-wide text-primary">
          {formatUsdt(balance ?? 0n)} <span className="font-sans text-2xl text-foreground">USD₮</span>
        </div>
        {fiat !== null && (
          <div className="text-sm text-muted-foreground">≈ {formatFiat(fiat)}</div>
        )}
      </div>

      <Button onClick={fundWithMoonpay} disabled={fundingMoonpay}>
        {fundingMoonpay ? "Abriendo MoonPay…" : "Fondear con MoonPay"}
      </Button>

      {walletMode() === "standard" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-3">
          <span className="text-xs text-muted-foreground">Fondos de prueba — solo demo local</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={fundWithTestFaucet} disabled={fundingFaucet}>
              {fundingFaucet ? "Consiguiendo…" : "Conseguir 5,000 USD₮ de prueba"}
            </Button>
            <Button variant="outline" size="sm" onClick={fundWithGasFaucet} disabled={fundingGas}>
              {fundingGas ? "Consiguiendo…" : "Conseguir ETH de gas"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          Gas pagado en USD₮ (sin ETH)
        </div>
      )}

      <div>
        <div className="mb-1 text-xs text-muted-foreground">Movimientos</div>
        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground">Aún no hay movimientos.</div>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {history.map((entry) => (
              <li key={entry.hash} className="flex justify-between">
                <span>{entry.kind === "in" ? "Recibido" : "Enviado"}</span>
                <span className="font-mono">{formatUsdt(entry.amount)} USD₮</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
```
Update the imports at the top of the file: add `import { Card } from "@/components/ui/card";`, `import { Button } from "@/components/ui/button";`, `import { Skeleton } from "@/components/ui/skeleton";` (keep all existing imports).

- [ ] **Step 3: Rewrite `web/components/EnsureWallet.tsx`** — logic identical; only the healing render uses a Skeleton:

```tsx
  if (!hasWalletLinked && healing) {
    return (
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <Skeleton className="size-4 rounded-full" />
        Configurando tu billetera…
      </div>
    );
  }
  return null;
```
Add `import { Skeleton } from "@/components/ui/skeleton";` (keep the `"use client"`, hooks, and effect verbatim).

- [ ] **Step 4: Verify build**

```bash
pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/components/RoundProgress.tsx web/components/WalletCard.tsx web/components/EnsureWallet.tsx
git commit -m "feat(ui): RoundProgress/WalletCard/EnsureWallet → shadcn (glow cards, Bebas numbers)"
```

---

### Task 6: Action forms → shadcn (InvestForm, ClaimButton, DistributeForm, CreateRoundForm)

**Files:**
- Modify: `web/components/InvestForm.tsx`, `web/components/ClaimButton.tsx`, `web/components/DistributeForm.tsx`, `web/components/CreateRoundForm.tsx` (JSX-only rewrites)

**Interfaces:**
- Consumes: shadcn `Card`, `Button`, `Input`, `Label`; all on-chain handlers (`approveUsdt`/`invest`/`claim`/`distribute`/`createRoundOnChain`/`usdtAllowance`) and `useState` unchanged.
- Produces: restyled forms, identical behavior. Note: no `react-hook-form` — the existing `useState` forms are kept as-is (converting would be churn with regression risk; YAGNI).

- [ ] **Step 1: Rewrite `web/components/InvestForm.tsx` JSX** — keep the `"use client"`, `useCurrentUserId`, `amount`/`status` state, and the entire `handleInvest` body verbatim. Add imports `Card`, `Button`, `Input`, `Label`. Replace the returned JSX:

```tsx
  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="invest-amount">Monto a invertir (USD₮)</Label>
      <Input
        id="invest-amount"
        type="number"
        min="1"
        step="1"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm font-medium text-amber-200">
        ⚠️ Sin reembolso. Comprás un derecho a % de ingresos del club, no una
        garantía. Si la ronda no llega a la meta, tu USD₮ igual va al club y
        cobrás según los ingresos reales. Tus llaves son tuyas.
      </p>
      <Button onClick={handleInvest} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Invirtiendo…" : "Invertir"}
      </Button>
    </Card>
  );
```

- [ ] **Step 2: Rewrite `web/components/ClaimButton.tsx` JSX** — keep hooks + `refresh` + `handleClaim` + `hasReward` verbatim. Add imports `Card`, `Button`. Replace the return:

```tsx
  return (
    <Card className="flex flex-col gap-2 p-5">
      <div className="text-xs text-muted-foreground">Tu recompensa pendiente</div>
      <div className="font-display text-3xl tracking-wide text-primary">{formatUsdt(pending ?? 0n)} USD₮</div>
      <Button
        className="mt-2 self-start"
        onClick={handleClaim}
        disabled={!userId || !hasReward || status === "claiming"}
      >
        {status === "claiming" ? "Reclamando…" : "Reclamar"}
      </Button>
    </Card>
  );
```

- [ ] **Step 3: Rewrite `web/components/DistributeForm.tsx` JSX** — keep the doc comment, hooks, and `handleDistribute` verbatim. Add imports `Card`, `Button`, `Input`, `Label`. Replace the return:

```tsx
  return (
    <Card className="flex flex-col gap-3 p-5">
      <Label htmlFor="revenue-amount">Recaudación a distribuir (USD₮)</Label>
      <Input
        id="revenue-amount"
        type="number"
        min="1"
        step="1"
        value={revenue}
        onChange={(e) => setRevenue(e.target.value)}
      />
      <Button onClick={handleDistribute} disabled={!userId || status === "pending"}>
        {status === "pending" ? "Distribuyendo…" : "Distribuir recaudación"}
      </Button>
    </Card>
  );
```

- [ ] **Step 4: Rewrite `web/components/CreateRoundForm.tsx` JSX** — keep hooks + `handleCreate` verbatim. Add imports `Card`, `Button`, `Input`, `Label`. Replace the return; each field becomes a `Label` + `Input` pair:

```tsx
  return (
    <Card className="flex flex-col gap-3 p-5">
      <h3 className="font-display text-2xl tracking-wide">Crear nueva ronda</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-goal">Meta (USD₮)</Label>
          <Input id="cr-goal" type="number" min="1" value={goal} onChange={(e) => setGoal(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-price">Precio por share (USD₮)</Label>
          <Input id="cr-price" type="number" min="0.01" step="0.01" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-bps">Reparto (bps, 800 = 8%)</Label>
          <Input id="cr-bps" type="number" min="1" max="10000" value={revenueBps} onChange={(e) => setRevenueBps(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-cap">Tope (bps, 15000 = 1.5x)</Label>
          <Input id="cr-cap" type="number" min="1" value={capMultiple} onChange={(e) => setCapMultiple(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground" htmlFor="cr-days">Plazo (días)</Label>
          <Input id="cr-days" type="number" min="1" value={deadlineDays} onChange={(e) => setDeadlineDays(e.target.value)} />
        </div>
      </div>
      <Button className="self-start" onClick={handleCreate} disabled={!userId || submitting}>
        {submitting ? "Desplegando…" : "Crear ronda"}
      </Button>
    </Card>
  );
```

- [ ] **Step 5: Verify build**

```bash
pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/components/InvestForm.tsx web/components/ClaimButton.tsx web/components/DistributeForm.tsx web/components/CreateRoundForm.tsx
git commit -m "feat(ui): action forms → shadcn (Card/Input/Button), logic unchanged"
```

---

### Task 7: Pages restyle (home, wallet, club/[slug], dashboard)

**Files:**
- Modify: `web/app/page.tsx`, `web/app/wallet/page.tsx`, `web/app/club/[slug]/page.tsx`, `web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: all server data-fetching (`auth.api.getSession`, `db.select…`, `totalRaised`/`readSafely`) unchanged; restyled components from Tasks 5–6.
- Produces: themed page shells (Bebas headings, semantic tokens, `Card` where inline card-divs existed). Every query, redirect, and guard is preserved verbatim — only JSX/className changes.

- [ ] **Step 1: Restyle `web/app/page.tsx`** — keep the server logic (session/club/round/raised queries) verbatim. Replace the hero + featured-club JSX to use Bebas headline, `bg-primary` CTA, semantic tokens, and a `Card` for the featured club:
  - `<span>` eyebrow: `className="font-display text-lg uppercase tracking-widest text-primary"`.
  - `<h1>`: `className="font-display text-6xl uppercase leading-[0.95] tracking-wide"`.
  - `<p>`: `text-muted-foreground`.
  - CTA `<Link>`: `className="w-fit rounded-full bg-primary px-8 py-3 text-base font-semibold text-primary-foreground transition-opacity hover:opacity-90"`.
  - Featured club `<Link>` wrapper: replace the `rounded-xl border …` div with `className="block rounded-lg border border-border bg-card p-6 transition-colors hover:border-primary"`; club name `<h3>` → `font-display text-3xl uppercase tracking-wide`; description → `text-muted-foreground`.
  - `<RoundProgress …/>` unchanged.

- [ ] **Step 2: Restyle `web/app/wallet/page.tsx`** — keep session guard, `hasWalletLinked` query, and round query verbatim. Change only:
  - container unchanged.
  - `<h1>`: `className="font-display text-5xl uppercase tracking-wide"`.
  - `<EnsureWallet/>`, `<WalletCard/>`, `<ClaimButton/>` unchanged.

- [ ] **Step 3: Restyle `web/app/club/[slug]/page.tsx`** — keep session/club/round/raised logic and `notFound()` verbatim. Change only:
  - `<h1>`: `font-display text-5xl uppercase tracking-wide`.
  - description `<p>`: `text-muted-foreground`.
  - the "iniciá sesión para invertir" fallback div: replace `rounded-xl border … bg-white … dark:bg-black` with `className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground"`; the inner `<Link>` → `className="font-medium text-primary hover:underline"`.
  - `<RoundProgress/>` + `<InvestForm/>` unchanged.

- [ ] **Step 4: Restyle `web/app/dashboard/page.tsx`** — keep both session guards, `club` self-heal branch, `clubRounds`/`roundsWithRaised` queries, and `usdtAddress` gate verbatim. Change only:
  - eyebrow `<span>`: `font-display text-lg uppercase tracking-widest text-primary`.
  - `<h1>`: `font-display text-5xl uppercase tracking-wide`.
  - club address `<p>`: `font-mono text-xs text-muted-foreground`.
  - section `<h2>`s: `text-sm font-semibold uppercase tracking-wide text-muted-foreground`.
  - the missing-USDT `<p>` and "todavía no creaste" `<p>`: `text-muted-foreground` (drop amber unless it's a warning — keep amber for the config warning: `text-amber-400`).
  - `<CreateRoundForm/>`, `<RoundProgress/>`, `<DistributeForm/>`, `<EnsureWallet/>` unchanged.

- [ ] **Step 5: Verify build**

```bash
pnpm --filter web build
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/app/page.tsx web/app/wallet/page.tsx "web/app/club/[slug]/page.tsx" web/app/dashboard/page.tsx
git commit -m "feat(ui): pages restyled to bold-stadium (Bebas headings, semantic tokens)"
```

---

### Task 8: Visual QA + build/lint/behavior parity

> **Executor:** the controller (or a QA subagent with Playwright MCP + Bash). Produces a QA report; any regression is fixed by re-dispatching the owning task, not patched ad-hoc here.

**Files:**
- Create: `web/.stitch/qa-report.md` (findings + before/after screenshots list)

**Interfaces:**
- Consumes: the running app on `:3000` (per the running-services caveat: start anvil, deploy `contracts/script/Deploy.s.sol` to anvil, set `web/.env.local`, `pnpm --filter web db:push && db:seed`, then `pnpm --filter web dev`), the Stitch PNGs from Task 1.
- Produces: sign-off that the skin matches the mockups and the invest→distribute→claim loop still works.

- [ ] **Step 1: Full build + lint**

```bash
pnpm --filter web build && pnpm --filter web lint
```
Expected: both PASS. Fix any lint that the migration introduced (unused imports from removed markup are the likely ones).

- [ ] **Step 2: Bring up the local stack** (only if not already running)

Follow `memory/ladoce-state.md`: `anvil` on :8545, redeploy, seed, `pnpm --filter web dev`. Confirm `http://localhost:3000` serves.

- [ ] **Step 3: Visual pass with Playwright MCP**

For each of `/`, `/auth/sign-in`, `/auth/sign-up`, `/wallet`, `/club/deportivo-san-martin`, `/dashboard`, `/settings/account`: `mcp__playwright__browser_navigate` then `mcp__playwright__browser_take_screenshot`. Compare each against the matching Stitch PNG in `web/.stitch/designs/`. Verify: stadium-black background, neon-lime primary buttons/numbers, Bebas display headings, glow on hero cards, no leftover `emerald`/`bg-white`/`dark:bg-black` styling. Record mismatches in `qa-report.md`.

- [ ] **Step 4: Behavior parity (logic untouched, but confirm)**

As a fan on anvil: sign up (role select works) → wallet heals → test faucet USD₮ → invest in the seeded round (approve→invest toasts fire). As the club: distribute revenue. Back as fan: claim shows a nonzero pending reward and pays out. Confirm no console errors from the migration (`mcp__playwright__browser_console_messages`). Any broken flow = regression → re-dispatch the owning task.

- [ ] **Step 5: Write the report + commit**

```bash
cd /home/skkippie/work/AI-DO/La12
git add web/.stitch/qa-report.md
git commit -m "docs: bold-stadium UI QA report (visual + behavior parity)"
```

---

## Self-Review

**1. Spec coverage:**
- Theme tokens → Task 2 (globals.css). ✅
- shadcn base + component list → Task 2. ✅
- Bebas/Geist fonts → Task 2. ✅
- better-auth-ui provider/login/signup/forgot/reset/account + role + redirect → Task 3. ✅
- Existing 8 components migrated → Navbar (T4), RoundProgress/WalletCard/EnsureWallet (T5), InvestForm/ClaimButton/DistributeForm/CreateRoundForm (T6). ✅ (8/8)
- Pages home/wallet/club/dashboard restyled; panel intentionally skipped (redirect) → Task 7. ✅
- Stitch-first workflow + review gate → Task 1. ✅
- Testing (build/lint/visual/behavior) → per-task gates + Task 8. ✅
- Constraints: no money/contract changes; lime-never-on-white; Spanish; `serverExternalPackages` kept → Global Constraints + task notes. ✅

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to". Registry-generated files (Task 3) are the one place exact contents can't be pre-written; that step gives the concrete install command, the documented provider/route code, and an escalation fallback — not a placeholder.

**3. Type consistency:** `RoundProgress` prop shape (`raised/goal/capMultiple/revenueBps/deadline/status`) unchanged across T5/T7 call sites. `WalletHandle`-based handlers untouched. Auth routes named consistently (`/auth/sign-in`, `/auth/sign-up`, `/settings/account`, `/post-auth`) across T3/T4. Font var `--font-bebas` (next/font) → `--font-display` (theme) mapping consistent in T2.

**Deviation from strict TDD (intentional):** this is a presentational migration; per-task gates are build + lint + the named visual/behavior check, with one consolidated Playwright + on-chain parity pass in Task 8. Writing failing unit tests for restyled JSX would be test theater (Global Constraints).
