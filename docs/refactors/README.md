# Refactors

Engineering refactors that cut across features but are not tied to a single room-type or MVP milestone.

| Document | Purpose |
| --- | --- |
| [`PLAN_API_APP_DECOMPOSITION.md`](./PLAN_API_APP_DECOMPOSITION.md) | Why and how to split `apps/api/src/app.ts` into Fastify plugins and domain modules |
| [`IMPL_API_APP_DECOMPOSITION.md`](./IMPL_API_APP_DECOMPOSITION.md) | Phased execution checklist, file map, verification, and progress log |

**Primary target:** `apps/api/src/app.ts` (~5,300 lines, ~93 HTTP routes, ~660-line `runClassroomAction`).

**Companion work (recommended before large route moves):** split `apps/api/tests/api.test.ts` (~5,760 lines) — see IMPL Phase 0.
