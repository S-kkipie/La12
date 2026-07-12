# Testing review

Scope: test files, verification, and the env-sync that keeps the suite runnable.

---

## 1. Test placement `MINOR`

Tests live in a local `__tests__/` folder **inside the same directory** as the code — not alongside
production code at the module/route root.

```text
stripe/webhook/
├── __tests__/
│   └── route.test.ts
└── route.ts
```
Import with relative paths (`import { POST } from "../route"`). (`AGENTS.md` §Testing)

- `apps/myworkin-b2c/vitest.config.ts` — `environment: "node"`, `include: src/**/*.test.ts`,
  `@` → `./src`, stubs `server-only` → `src/test/server-only-stub.ts`.

**Check:** new test files are in `__tests__/`, not at the module root.

### Gate — detect misplaced test files

Any `*.test.ts(x)` / `*.spec.ts(x)` that sits beside production code instead of inside a `__tests__/`
folder violates the rule. Exhaustive detection (deterministic, no sampling):

```bash
find apps packages -type f \( -name '*.test.ts' -o -name '*.test.tsx' -o -name '*.spec.ts' -o -name '*.spec.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/__tests__/*'
```

**Legacy debt cleared (2026-07-09):** the 44 previously-misplaced files (extension, live-events,
linkedin, cloudflare, common, extension-protocol) were relocated into sibling `__tests__/` folders
with relative-import depth bumped one level; `tsc` clean and all suites green (b2c 234 files / 1110
tests, extension-protocol 23). The gate is now **fully enforceable** — any hit from the command above
is a fresh violation to block.

---

## 2. Env sync — a new required var breaks tests `MAJOR`

A new required env var validated in `env.ts` must also be added to `vitest.config.ts` `test.env`, or
node tests throw at the `createEnv` import. (`vitest-env-mirror-required-vars.md`)

This is one of the **three env surfaces** that must stay in sync — see
[architecture-structure.md](./architecture-structure.md) §Env sync.

**Check:** PR that adds an `env.ts` var also touches `vitest.config.ts` test.env (and `turbo.json`
build.env).

---

## 3. `pnpm check` is Biome-only — it does NOT type-check `MAJOR`

- `pnpm check` runs Biome (format + lint), no `tsc`. Test-file type errors slip past it **and** the
  build — run `tsc --noEmit` explicitly. (`pnpm-check-biome-not-typecheck.md`)
- b2c `tsc` shows **false** stale `.next/types/validator.ts` TS2307 errors — the build regenerates
  them; don't chase those.
- Husky pre-commit runs **only Biome**, not tests — a green commit ≠ passing suite. Re-run the suite.

**Check:** verification for a change ran `tsc --noEmit` and the relevant `vitest`, not just `pnpm check`.

---

## 4. Extension has its own runner `MINOR`

- `apps/autofill-b2c-extension/vitest.config.ts` — separate config; the b2c `test.env` does **not**
  apply. Run the extension's own `check` + `test`.
- happy-dom has no layout: `getClientRects`/`offsetParent` are unreliable — check inline
  `el.style.display` then `getComputedStyle`. (`happy-dom-getclientrects-unreliable.md`)
- The extension's own Biome is not fully covered by root husky formatting of unstaged files — run
  `pnpm --filter autofill-b2c-extension exec biome check --write` before committing extension files.
  (`extension-biome-not-husky-covered.md`)

---

## 5. What "verified" means for a review

- Run diagnostics/`tsc --noEmit` for touched files, then `pnpm check`.
- Run `pnpm build` for changes to runtime/routing/config/server/build output.
- For UI changes, verify in a browser at `http://localhost:3000`.
- A limit/dead subagent often already committed — check `git log`/`status`/report before re-running;
  husky ran only Biome so re-run the suite yourself. (`sdd-interrupted-subagent-verify-git.md`)

Reference: `AGENTS.md` §Verification.
