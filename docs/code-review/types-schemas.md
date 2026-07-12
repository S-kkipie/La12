# Types & schemas (zod as the type provider)

Scope: any new `type`/`interface` or data shape, backend or frontend.

---

## 1. Zod is the single type source `MAJOR`

Define a zod schema for every data shape and derive the TypeScript type — never hand-write a mirror type.

```ts
// core/cv-analysis/domain/schemas.ts
export const cvAnalysisSchema = z.object({ /* ... */ });
// core/cv-analysis/domain/types.ts
export type CvAnalysis = z.infer<typeof cvAnalysisSchema>;
// enum-like constants:
export type Status = (typeof STATUSES)[number];
```

- Canonical: `core/*/domain/schemas.ts` → `types.ts`. ~40 files use `z.infer` across
  `core/*/domain/*` (billing, onboarding, cv-builder, courses, jobs, live-events).
- Reuse existing domain schemas rather than redefining a shape elsewhere.

**Check:** a new `type`/`interface` that duplicates a zod schema's fields is a violation — derive it
with `z.infer<typeof schema>` or `(typeof CONST)[number]`.

---

## 2. Schemas are the validation boundary `MAJOR`

- Elysia routes validate body/query/params with a zod schema in the schema-options object — the same
  schema whose `z.infer` types the handler. No unvalidated `body`.
- Wire contracts shared between apps live in `packages/extension-protocol/src/protocol.ts` (zod) — both
  extension and b2c import them; don't duplicate the shape on either side.
- Firestore: `.nullable()` on a **required** key rejects a *missing* key (Firestore omits absent
  fields → silent doc drops). Use `.optional()` / a default for fields that may be absent.
  (`firestore-zod-nullable-missing-key.md`)

**Check:** external input is zod-validated at the boundary; cross-app payloads use the shared protocol
schemas; Firestore-optional fields use `.optional()`/defaults, not `.nullable()`.

---

## 3. Shared type surfaces `MINOR`

- `frontend/types/data-table.ts` augments `@tanstack/react-table`'s `ColumnMeta` and exports `Option`,
  `ExtendedColumnSort/Filter`, `DataTableRowAction` — reuse these for table columns instead of
  redefining meta types.

Reference: `AGENTS.md` (no-`any` rule), `.claude/agent-memory/code-reviewer/zod-as-type-provider.md`.
