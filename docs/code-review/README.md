# MyWorkIn — Code Review Docs

Per-area review guides for this repo. Compiled from `AGENTS.md`, `README.md`, `biome.json`, the
distilled `.claude/agent-memory/code-reviewer/*` notes, and a direct audit of the codebase on
`feat/stripe-subscriptions`.

Each doc is self-contained so a future review **skill** can load exactly the one(s) it needs. Every
rule states **what** to enforce, **where** the canonical example lives, and a one-line **check**.

## The docs

| Doc | Covers | Maps to skill |
|-----|--------|---------------|
| [backend-api.md](./backend-api.md) | Elysia routing, response envelope, Result/error pattern, auth macros | backend review |
| [backend-data-services.md](./backend-data-services.md) | Config access, logging, Drizzle, Firestore, AI quota, Stripe | backend / database review |
| [security.md](./security.md) | Auth gating, secrets, no-leak errors, ownership, injection, PII | security review |
| [frontend-data-fetching.md](./frontend-data-fetching.md) | Eden `useElysia` proxy, RSC services, Next 16 caching | frontend review |
| [frontend-ui-components.md](./frontend-ui-components.md) | PageHeader, shadcn `ui/*`, data-table, hooks, providers | frontend review |
| [styling.md](./styling.md) | Design tokens, Tailwind v4, elevation | styling / design review |
| [types-schemas.md](./types-schemas.md) | zod-as-type-provider | any review |
| [testing.md](./testing.md) | Test placement, env sync, biome≠typecheck | any review |
| [architecture-structure.md](./architecture-structure.md) | Monorepo, module shape, route groups, env sync, extension | architecture review |
| [reusable-inventory.md](./reusable-inventory.md) | Catalog of reusable helpers/components/files | all reviews |
| [sanctioned-patterns.md](./sanctioned-patterns.md) | Patterns you must NOT flag | all reviews |

## Severity legend

- **BLOCKER** — must fix before merge (correctness, security, contract break).
- **MAJOR** — fix or explicitly justify (convention violation with real impact).
- **MINOR** — nit / follow-up (style, small reuse opportunity).

## How to scope a review

- Review the **diff**, not the whole tree. `pnpm check` / `tsc` scan the working tree — stash
  unrelated uncommitted edits before failing a single-commit verdict.
- On a stacked, unmerged feature branch, scope-check with `git diff <plan-base>..HEAD`, **not**
  `main...HEAD` (which shows the whole feature).
- `pnpm check` is **Biome-only** (no type-check) — run `tsc --noEmit` separately (see
  [testing.md](./testing.md)).
- Husky pre-commit runs **only Biome**, not tests — a green commit ≠ passing suite.
- Root `CLAUDE.md` is an 11-byte stub that `@`-includes `AGENTS.md`. `AGENTS.md` is the real guide.
- Before raising anything, check [sanctioned-patterns.md](./sanctioned-patterns.md) and
  `.claude/agent-memory/code-reviewer/` for a note that already blesses it.

## Universal code style (applies everywhere)

| Rule | Severity |
|------|----------|
| No `any`, `as any`, `as unknown as`, `@ts-ignore`, `@ts-expect-error` to silence types | BLOCKER |
| Files under **500 lines**; split into modules/components/hooks/helpers | MAJOR |
| Small, focused changes — no unrelated refactors while fixing/adding a feature | MAJOR |
| Business logic out of UI components → typed utilities/hooks/server modules | MAJOR |
| 4-space indent, existing naming/import order (Biome enforces) | MINOR |
| TSDoc opt-in — only when it adds info not inferable from name/params/types; never on components/pages/CRUD | MINOR |
| TSDoc stays **concise** (≈1–3 lines) — capture only the non-obvious *why* (invariants, "shown once", side effects). Don't restate names or repo-wide conventions (Eden proxy, `{response,code,status}` envelope, "returns the envelope") — those are inferable and read as noise | MINOR |
| Linter is **Biome, not ESLint** — never suggest ESLint config/scripts | — |
