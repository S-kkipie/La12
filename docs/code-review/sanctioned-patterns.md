# Sanctioned patterns — do NOT flag these

Things that look like violations but are deliberate in this repo. Raising them is noise. Sourced from
`biome.json` and `.claude/agent-memory/code-reviewer/*`. When unsure whether something is sanctioned,
check for a matching note in `.claude/agent-memory/code-reviewer/` before raising it.

---

## Type casts that are NOT `as unknown as`

- **`as { response: X }`** to unwrap a mutation result — Eden's `mutationOptions().mutationFn` returns
  `TData = unknown`; this precise plain accessor is the sanctioned unwrap. (`eden-useelysia-options-proxy-migration.md`)
- **`status(result.error.status as 404 | 409 | 422 | 500, ...)`** narrowing in routes — the status is
  from the closed `STATUS_MAP`. (`elysia-result-envelope-conventions.md`)
- **`useElysia().<domain> as <Domain>Proxy`** typed-proxy alias — only when a real type error requires
  it; the proxy is already typed, so a bare alias is fine, `as unknown as` is not.
- **`value as TabValue`**, **`readRecord(...) as X`** — test-only / narrow structural casts noted as
  sanctioned in the jobs-catalog and per-job-analysis reviews.

## Biome rules disabled on purpose

- **`key={index}`** on static, non-reordering `.map()` lists — `noArrayIndexKey` is off. Only flag on
  dynamically reordered/filtered/inserted lists. (`biome-sanctioned-rules.md`)
- **Custom CSS at-rules** — `noUnknownAtRules` is off.
- Inside `frontend/components/{ui,data-table,auth}/**`: `noUselessFragments`,
  `useExhaustiveDependencies`, `noDocumentCookie`, `noDoubleEquals`, `useSemanticElements`,
  `useKeyWithClickEvents` are off.
- Inside `apps/autofill-b2c-extension/**`: `noImgElement` is off (`<img>` allowed).

## Eden / data-fetching

- **Module-level `apiClient` alias** in a `"use client"` file (non-hook context) — safe.
  (`eden-treaty-hooks-pattern.md`)
- `apiClient` in provider wiring and assistant-ui runtime adapters — the sanctioned non-hook uses.
- **`?? []` / `?? 0` / `?? ""` guards** that exist for test mocks or older Firestore docs — type-only,
  not defects. (`grounded-skill-matching-override-contract.md`, `per-job-analysis-card-slim.md`)

## Styling

- Arbitrary values that **wrap a token**: `rounded-[calc(var(--radius)-3px)]`,
  `bg-[color-mix(in_srgb,var(--secondary)_35%,var(--background))]`.
- Decimal spacing steps kept as arbitrary px (they emit no CSS).
- `--success` / `--warning` (the two blessed extra tokens).
- `text-accent` low contrast, `focus-within` primary shadow — pre-existing/intentional.
  (`scrimba-token-conventions.md`)
- shadcn **`data-active:`** variant bridging to `data-state="active"`. (`shadcn-data-active-variant.md`)

## Motion (landing)

- **`useGSAP` scope auto-reverts `ScrollTrigger.create`** — only listener-adding modules need manual
  cleanup. Motion setup fns take `typeof gsap`/`ScrollTrigger` and no-op when markup is absent — not
  defects. (`gsap-useGSAP-cleanup-pattern.md`, `landing-motion-module-signature-contract.md`)

## Components

- **`<Link><PillButton>`** (button-inside-anchor) — pre-existing project-wide convention; MINOR at
  most, never blocking. (`link-pillbutton-pattern.md`)

## Cohesive multi-export modules

- A file exporting several **related** functions that **share private state** (a schema, constants,
  a helper) is a cohesive module, NOT a utils-placement violation. Don't demand it be split. Examples:
  `ai-fill.ts` (`buildAiFills` + `streamAiFills` share `RESULT_JSON_SCHEMA`), `sanitize-ai-fills.ts`
  (`sanitizeAiFills` + `sanitizeOneAiFill` share `actionForType`/`MIN_CONFIDENCE`),
  `enforce-ai-quota.ts` (`assertAiQuota`/`recordAiUsage` public API). The rule targets a helper
  *unrelated* to the file's primary and *cleanly extractable*. (`architecture-structure.md` §1a)

## Known "dead" code that is intentional

- `to-browse` / `averageMatchOf` / `scoreOf ?? 0` fallbacks in jobs-catalog and jobs-portal — sanctioned
  dead fallbacks documented in the feature reviews. (`jobs-catalog-tabs-final.md`, `jobs-portal-reimagine-feature.md`)

## Verification scoping

- `pnpm check` / `tsc` scan the **whole working tree**, not the reviewed commit — stash unrelated
  uncommitted edits before failing a single-commit verdict. b2c `tsc` shows **false** stale
  `.next/types/validator.ts` TS2307 errors that the build regenerates.
  (`verification-gate-scope-uncommitted-changes.md`, `pnpm-check-biome-not-typecheck.md`)
