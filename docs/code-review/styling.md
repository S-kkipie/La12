# Styling review (design tokens & Tailwind v4)

Scope: any `className` / CSS change in the B2C app. `apps/myworkin-b2c/src/app/globals.css` is the
single source of truth for design tokens — read it before styling. Theme is **Scrimba**: azure
primary (`#0088f7` dark / `#0070d6` light), dark-first (`forcedTheme="dark"`), FLAT elevation,
`--radius` 6px.

---

## Rules

| # | Rule | Severity |
|---|------|----------|
| 1 | **No new CSS custom properties** (`--var`). Only sanctioned extra tokens are `--success` (green) and `--warning` (amber); any other new `--var` needs owner approval | MAJOR |
| 2 | **No hardcoded palette colors** (`text-rose-600`, `bg-emerald-50`, `bg-zinc-900`, `text-white`, `bg-[#...]`). Map to semantic tokens | MAJOR |
| 3 | **No manual `dark:` color overrides** (`dark:bg-zinc-900`) — the theme inverts through token roles. Only existing approved exceptions remain | MAJOR |
| 4 | **FLAT elevation** — hairline borders + `shadow-sm`/`shadow-md`. The brutalist sticker-offset (`shadow-[Npx_Npx_0_0_var(--shadow-hard)]`) is removed; do not reintroduce | MAJOR |
| 5 | Prefer Tailwind v4 dynamic **integer** steps over arbitrary px | MINOR |
| 6 | Class merging via `cn()` (`frontend/lib/utils.ts`) | MINOR |
| 7 | Don't restyle `frontend/components/ui/*` or `cv-preview/templates/*` | MAJOR |

---

## Token mapping (rule 2 detail)

| Intent | Wrong | Right |
|--------|-------|-------|
| red / rose / error | `text-rose-600` | `destructive` (`bg-destructive/10`, `text-destructive`) |
| green / success | `bg-emerald-50` | `success` |
| amber / warning | `text-yellow-600` | `warning` |
| brand blue | `bg-[#0088f7]` | `primary` (`text-primary-foreground` on `bg-primary`) |
| neutrals | `bg-zinc-900`, `text-white` | `muted` / `secondary` / `border` / `card` |
| sector accents | `bg-blue-500` | `cat-*` (`cat-tech`, `cat-banca`, `cat-mineria`, …) |

Soft tinted surfaces use the `/10` opacity form: `bg-destructive/10`, `bg-primary/10`.

---

## Spacing (rule 5 detail)

- Tailwind v4 spacing is dynamic (`--spacing: .25rem`): any integer step works — `gap-2`, `h-15`
  (60px), `w-99` (396px), `max-w-288` (1152px).
- Convert an arbitrary `[Npx]` whose value is a multiple of 4 to the integer step `N/4` (lossless):
  `p-[16px]` → `p-4`.
- **Arbitrary px is allowed** only when necessary: value not divisible by 4 with no scale step, font
  sizes with no named step (`text-[13px]`), off-scale radius (`rounded-[10px]`), real units
  (`rem`/`ch`/`vh`/`%`), `leading-[..]`, `tracking-[..]`, compound padding (`p-[6px_10px]`).
- **Decimal steps** beyond `0.5/1.5/2.5/3.5` (e.g. `gap-4.5`) emit **no CSS** — keep those as arbitrary
  px. Unknown Tailwind utilities fail **silently** — after adding a dynamic step, confirm it emits a rule.

---

## Not violations — do NOT "fix" these

- An arbitrary value that **wraps a token**: `rounded-[calc(var(--radius)-3px)]`,
  `bg-[color-mix(in_srgb,var(--secondary)_35%,var(--background))]`.
- `--success` / `--warning` usage (the two blessed extra tokens).
- Decimal spacing steps kept as arbitrary px because they'd emit no CSS.
- `text-accent` low contrast and `focus-within` primary shadow — pre-existing/intentional.
  (`scrimba-token-conventions.md`)
- Existing sanctioned `dark:` exceptions inside vendored `ui/*`.

---

## Excluded zones

Do **not** apply these rules to (they're vendored or export-bound and intentionally inline/hardcoded):
`frontend/components/ui/*`, `core/cv-builder/client/cv-preview/templates/*`.

Reference: `AGENTS.md` §Styling, `.claude/agent-memory/code-reviewer/scrimba-token-conventions.md`,
`styling-globals-source-of-truth.md`, `dark-mode-token-conventions.md`.
