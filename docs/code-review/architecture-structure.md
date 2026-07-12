# Architecture & structure review

Scope: "where does this code belong", monorepo shape, route groups, env sync, and the extension. Use
this to catch misplaced code and workspace-level drift.

---

## 1. Domain module shape — where does code go `MAJOR`

Standard tri-layer per `core/<domain>/`:

| Layer | Holds | Example |
|-------|-------|---------|
| `domain/` | pure logic, zod `schemas.ts` + `types.ts`, `__tests__` | `core/billing/domain/` |
| `server/` | `api/router.ts` (+ `routes/`), `repository/`, `services/` | `core/billing/server/` |
| `client/` | React hooks at root, components under `client/ui/` | `core/billing/client/` |

Rule: pure/testable logic + schemas → `domain/`; DB access → `server/repository/`; orchestration →
`server/services/`; HTTP surface → `server/api/router.ts`; React → `client/`.

Large domains split into **sub-domains** that each repeat the triad:
`core/jobs/{catalog,matching,preferences}`, `core/courses/{catalog,enrollments,lessons,modules,notes,progress}`,
`core/live-events/{catalog,chat,offers,registrations,room}`, `core/cv-builder/{copilot,cv-preview,export,import,…}`.

**A new domain isn't wired until its router is imported in `server/router.ts`.**

**Checks:** business logic in a `.tsx`, DB access in a service instead of a repository, or a schema
defined outside `domain/` are placement violations. New domain router `.use()`d in `server/router.ts`.

### 1a. Shared helpers/mappers live in `utils.ts`, not exported from a primary-function file `MAJOR`

A pure helper (mapper, formatter, small transform) may live **unexported** inside a file whose main
job is another export **only if it is used solely in that file**. The moment it is imported by another
file (including a sibling test), it must move to a `utils.ts` at the **root of the smallest scope that
covers all its call sites** — not stay exported next to an unrelated primary function.

- Used in `services/foo.ts` + `services/__tests__/foo.test.ts` → `services/utils.ts`.
- Used in both `server/services/*` and `server/repository/*` → `server/utils.ts` (the shared parent).
- Used only inside its own file → keep it local and **drop the `export`**.

Canonical fix: `toExtensionProfile` was exported from `server/services/get-extension-profile.ts` and
imported by its test → moved to `server/services/utils.ts`. (`corrections-log.md` #5)

**File vs folder (respect the 500-line cap):**
- **Few helpers** (≈≤3, and a single file stays well under 500 lines) → one `utils.ts`.
- **Many helpers** (more than ~3–4, or a single `utils.ts` would approach 500 lines) → a `utils/`
  **folder** with **one function per file** (kebab-case filename = the function, e.g.
  `to-extension-profile.ts`), and **NO `index.ts` barrel** — import directly from `utils/<name>`.
  Don't keep both a `utils.ts` and a `utils/` folder in the same scope; pick one.

**Cross-domain helper — smallest common scope of its call sites, but watch for import cycles:** a
helper shared across domains homes in the domain that contains all its call sites. Only move it off
that scope if placing it there would force an A→B→A module cycle (the chosen home already imports the
other domain, and that domain would now have to import back). Example: `toExtensionLinkedin` maps a
LinkedIn record to an extension-facing shape; **both call sites are in extension**, so it correctly
lives in `extension/server/services/utils/to-extension-linkedin.ts` (the consumer). That is cycle-free
because the `linkedin` domain does **not** import `extension` — it only exposes the types extension
consumes — so the consumer is the right home here. Flip a helper toward the producer domain only when
the producer already depends on the consumer, where consumer-placement would cycle.

**NOT a violation — cohesive module:** a file may legitimately export several *related* functions when
they are the module's public surface and **share private state** (constants, helpers, a schema). The
rule targets a helper *unrelated* to the file's primary and *cleanly extractable*. Do not split a
cohesive module just to satisfy the letter of the rule — it causes duplication. Examples kept intact:
`ai-fill.ts` exports `buildAiFills` + `streamAiFills` (share `RESULT_JSON_SCHEMA`); `sanitize-ai-fills.ts`
exports `sanitizeAiFills` + `sanitizeOneAiFill` (share `actionForType`/`MIN_CONFIDENCE`). Contrast a pure,
self-contained helper like `mergeIntoFillPlan` (no shared privates) → that one *does* move to `utils/`.

When the secondary export is used **only in its own file** (no other importer, not even a test), don't
move it — just **drop the `export`** (e.g. `extractNewFills` in `ai-fill.ts`).

**Check:** an `export`ed helper sharing a file with an unrelated primary export, and imported
elsewhere, is a violation → relocate to a `utils.ts` (or `utils/` folder if many) at the common-scope
root; cross-domain helpers go in the producer domain. A helper used only in its own file should not be
exported at all. A related, private-state-sharing multi-export is a cohesive module — leave it.

---

## 2. App route groups (`apps/myworkin-b2c/src/app`) `MINOR`

Each group has its own `layout.tsx`:

| Group | Purpose | Note |
|-------|---------|------|
| `(app)/` | authed product shell (coach, courses, cv, cv-builder, enrollments, jobs, profile, settings, tools, webinars) | every screen opens with `PageHeader` |
| `(builder)/` | full-bleed CV builder workspace | own chrome — PageHeader-exempt |
| `(catalog)/` | public/SEO catalog (courses), unauthed-viewable | server-resolved access |
| `api/` | `v1/[...slugs]` mounts `server/router.ts`; standalone `route.ts` for `stripe/webhook`, `coach`, `cv-analyses`, streaming | business API is Elysia under `v1` |
| `auth/[path]/` | Better Auth UI catch-all | |

- **No `middleware.ts` exists** — gating is done in layouts/server (`server/auth/*`,
  `assert-course-access.ts`, `auth-context`). Question a change that "adds a middleware guard".

---

## 3. Monorepo shape `MINOR`

- pnpm/Turbo workspace: `apps/*` + `packages/*`. Apps: `myworkin-b2c` (Next 16),
  `autofill-b2c-extension` (WXT MV3), `live-chat-worker` (Cloudflare Worker).
- **Only shared package:** `packages/extension-protocol/src/protocol.ts` — the zod wire protocol
  imported by both extension and b2c (`@myworkin/extension-protocol`, `workspace:*`). Any extension↔b2c
  contract (snapshots, autofill plans, keyword scores) goes here, not duplicated.
- Root `package.json` scripts are Turbo passthroughs; new scripts go through Turbo, not per-app.
- `pnpm-workspace.yaml` pins patched deps (`eden-tanstack-react-query`); patches live in `patches/`.

---

## 4. Env must stay in sync across three files `MAJOR`

For any new env var:

1. `apps/myworkin-b2c/src/config/env.ts` — validation (t3-env + zod, `server`/`client` split)
2. `turbo.json` → `tasks.build.env` — build-cache allowlist. **Turbo strict-env strips undeclared
   vars** → Vercel build fails with "Invalid environment variables" (local passes because Next reads
   `.env`). (`turbo-env-passthrough-vercel.md`)
3. `apps/myworkin-b2c/vitest.config.ts` → `test.env` — or node tests throw at `createEnv` import.

Nuances:
- Build-only Sentry vars (`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN`) live in `turbo.json`
  **only** (consumed as raw `process.env` in `next.config.ts`), intentionally not in `env.ts`.
- `NEXT_PUBLIC_SENTRY_DSN` is the one Sentry var in both `env.ts` (client) and `turbo.json`.
- Some live-events / cloudflare-stream vars are in `env.ts` + `test.env` but not all in
  `turbo.json build.env` — real drift to flag if they're read at build time.
- `.env.example` at `apps/myworkin-b2c/.env.example` is the human-facing mirror.

**Check:** a PR adding an env var touches all three surfaces (or justifies build-only/runtime-only).

---

## 5. Biome overrides `MINOR`

`biome.json` — single linter (no ESLint), 4-space indent. Relaxed-rule dirs:

- `apps/autofill-b2c-extension/**` — allows `<img>` (`noImgElement` off).
- `**/frontend/components/{ui,data-table,auth}/**` — off: `noUselessFragments`,
  `useExhaustiveDependencies`, `noDocumentCookie`, `noDoubleEquals`, `useSemanticElements`,
  `useKeyWithClickEvents`.
- Globally off: `noArrayIndexKey`, `noUnknownAtRules`.

**Check:** don't flag those specific rules in those dirs; don't rely on them being relaxed elsewhere.

---

## 6. Extension app (`apps/autofill-b2c-extension`) `MAJOR`

- WXT MV3. Minimal install perms (`activeTab`, `scripting`, `storage`, `identity`); page access is
  on-demand via `optional_host_permissions: ["*://*/*"]`. **Don't widen `permissions`/`host_permissions`.**
- Structure: `entrypoints/{background.ts, content.ts, job-detect.content.ts, sidepanel/}` — background =
  privileged fetches, content scripts = page DOM, sidepanel = React UI. Domain under `core/*`,
  cross-cutting under `shared/*`.
- Own toolchain: own `package.json` `check`/`test`, own `vitest.config.ts`, own `tsconfig`. Run them;
  don't assume b2c config applies.
- The extension bundle only takes effect after Chrome **reloads** the unpacked extension — a green
  build alone doesn't ship the change. (`extension-build-reload-stale-bundle.md`)
- **MV3 SW is evicted** — autofill "Completar" must not depend on a background SW/port; the panel
  captures the plan and commits via `tabs.sendMessage` direct to content.
  (`extension-mv3-commit-dead-port.md`)

---

## 7. Docs to cite for intent `MINOR`

- `AGENTS.md` — the primary ruleset.
- `docs/features/*` — PRDs/specs (`courses/*`, `cv-jobs-matching.md`).
- `docs/superpowers/specs/*-design.md` — one dated design doc per feature/PR; the authoritative "why".
  A feature PR should reference its design doc.
- `server/drizzle/README.md` — DB/migration notes.
- `DEPLOYS_REVERT_LOG.md` — deploy/revert history (which features were hidden for jobs-only deploys).
