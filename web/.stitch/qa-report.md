# Bold Stadium UI — QA report (Task 8)

Date: 2026-07-05 · Branch: `ui/bold-stadium`

## Gates
- `pnpm --filter web build` → **PASS** (30 routes, types + lint clean).
- `pnpm --filter web lint` → **PASS** (no warnings).

## Visual pass (Playwright, dev :3000)
Screenshots saved under `web/.stitch/designs/qa-*.png`.

| Screen | Dark (intended) | Light (fallback) | Notes |
|---|---|---|---|
| `/` home | ✅ `qa-home-dark.png` | ✅ `qa-home.png` | Stadium-black + atmospheric top lime-glow, neon-lime Bebas logo/CTA/badge, off-white Bebas headline, glow featured-club Card, RoundProgress Bebas number `237.00 / 40,000 USD₮` (live anvil read). |
| `/auth/sign-in` | ✅ `qa-signin-dark.png` | ✅ | better-auth-ui `AuthView`, fully themed by our tokens (dark card, lime "Ingresar"), Spanish copy ("Iniciá sesión", "¿Olvidaste tu contraseña?"). |
| `/auth/sign-up` | ✅ `qa-signup-dark.png` | ✅ | Custom shadcn signup: "Tipo de cuenta" lime segmented toggle (Soy hincha / Soy un club), lime "Crear cuenta". |

**Important:** the headless QA browser defaults to `prefers-color-scheme: light`, so an un-emulated screenshot shows the **light fallback** palette (AA-green `#2f7d0a` on off-white) — this is correct, not a bug. The dark screenshots (`*-dark.png`) were captured with `emulateMedia({colorScheme:'dark'})` and match the Stitch mockup + what users on a dark OS see.

## Palette fidelity
Stitch render hexes == our tokens exactly (`#b6ff3c #8fa397 #e8f0ea #131a16 #0b0f0d #08120a`), all driven through Tailwind CSS variables. Added the atmospheric top lime-glow from the Stitch render (tinted via `--primary`, adapts dark/light).

## Console
0 errors from our changes. Only pre-existing benign warnings: `ox`/`viem` webpack "Critical dependency" (from `lib/chain.ts` → viem), a React DevTools info line, and a browser autocomplete hint on password inputs.

## Behavior parity
Every component migration (Tasks 4–7) was reviewed and verified to change **only** imports + JSX — all `useState`/handlers/on-chain calls (`approveUsdt`/`invest`/`claim`/`distribute`/`createRoundOnChain`) and server queries/guards are byte-for-byte unchanged. Home's live RoundProgress read (`237.00` raised) confirms the chain path is intact. No behavior regression expected or observed.

## Outstanding (non-blocking, for final review)
- `web/package.json` doesn't declare `@daveyplate/better-auth-ui`'s ~18 peer deps (Radix etc.) — they ride pnpm auto-install-peers and are pinned in the committed `pnpm-lock.yaml` (reproducible). Follow-up: declare explicitly.
- `app/auth/[path]` `generateStaticParams` emits all 11 authViewPaths (unlinked, harmless).
- better-auth-ui Spanish covers all visible labels; some rare/deep strings still English.
- Stitch auth/wallet/club mockups never generated (backend timeout) — home mockup established the language; screens built from tokens.
