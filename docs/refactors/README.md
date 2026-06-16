# Refactors

Engineering refactors that cut across features but are not tied to a single room-type or MVP milestone.

| Document | Purpose |
| --- | --- |
| [`REFACTOR_PRIORITY_AUDIT.md`](./REFACTOR_PRIORITY_AUDIT.md) | Codebase-wide audit of files needing refactor (size + separation of concerns), with tiered priorities |
| [`PLAN_API_APP_DECOMPOSITION.md`](./PLAN_API_APP_DECOMPOSITION.md) | Why and how to split `apps/api/src/app.ts` into Fastify plugins and domain modules |
| [`IMPL_API_APP_DECOMPOSITION.md`](./IMPL_API_APP_DECOMPOSITION.md) | Phased execution checklist, file map, verification, and progress log |

**API decomposition:** complete — `apps/api/src/app.ts` is ~189 lines; routes live under `apps/api/src/routes/`.

**Current top targets (see audit):** `RoomClient.tsx`, `packages/contracts/src/index.ts`, `repository.ts` + `mongoose.ts`, `smoke.test.ts`.
