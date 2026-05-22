# /docs/planning/new-features

Brainstorm + implementation docs for features not yet on a committed roadmap.

## Documents

- [`LEARNING_FEATURE_IDEAS.md`](./LEARNING_FEATURE_IDEAS.md) — full brainstorm: 7 small ideas (2 deprioritized), 4 big ideas, 2 alternate seeds, Sequence A/B recommendations.

### Sweet-spot implementation plans (high importance × low effort)

These four were the recommended first sprint per `LEARNING_FEATURE_IDEAS.md` "Recommendation" + downstream conversation. Each shipped independently behind its own feature flag on `mvp-plus-one`.

| Order | Doc | Idea | Effort | Status |
| --- | --- | --- | --- | --- |
| 1 | [`IMPL_EMOTES.md`](./IMPL_EMOTES.md) | Avatar reactions (Small 1) | ~2 days | **Complete** |
| 2 | [`IMPL_HALL_PASS.md`](./IMPL_HALL_PASS.md) | Digital hall pass (Small 6) | ~2 days | **Complete** |
| 3 | [`IMPL_WHISPER.md`](./IMPL_WHISPER.md) | Whisper circles (Small 4) | ~3 days | **Complete** |
| 4 | [`IMPL_EXIT_TICKET.md`](./IMPL_EXIT_TICKET.md) | Exit ticket + lesson recap (Small 3) | ~3–4 days | **Complete** |

Total: ~10–12 dev-days for four shippable features — **all complete**.

### Big-idea implementations in flight

Planning + implementation docs for the two `LEARNING_FEATURE_IDEAS.md` "Alternate big ideas." Each is a multi-week effort and ships behind its own feature flag.

| Doc | Idea | Effort | Status |
| --- | --- | --- | --- |
| [`PLAN_BREAKOUT_PODS.md`](./PLAN_BREAKOUT_PODS.md) + [`IMPL_BREAKOUT_PODS.md`](./IMPL_BREAKOUT_PODS.md) | Breakout pods with per-pod audio islands (Alternate B) | ~3–5 weeks | **Planned** |
| [`PLAN_ROOM_OBJECTS.md`](./PLAN_ROOM_OBJECTS.md) + [`IMPL_ROOM_OBJECTS.md`](./IMPL_ROOM_OBJECTS.md) + [`ROOM_OBJECT_DEMO_SCRIPT.md`](./ROOM_OBJECT_DEMO_SCRIPT.md) | 3D manipulatives — RoomObject library (Alternate A); hero **water-molecule** | Phases 0–7 implemented locally; Phase 8+ import & rollout | **In progress** (Phases 0–7) |

`PLAN_*` docs spell out functionality, design decisions, and overlap migration; `IMPL_*` docs are the phase-by-phase build plan.

## How to use these docs

Each `IMPL_*` doc follows the same shape as `docs/planning/avatars/07-implementation-order.md` and `docs/planning/mvp+1/MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md`:

- **Status / scope** — what is in and what is not.
- **Feature flag** — env var and default.
- **Phases** — small, sequentially-verifiable slices.
  - For each phase: files to change, steps, checkpoint.
- **Acceptance criteria** — what "done" looks like for the first slice.
- **Validation evidence** — typecheck / test / e2e commands the implementer fills in after each phase.

Match the project's existing maintenance rules: keep `MVP_STATUS.md` / `MVP_PLUS_ONE_STATUS.md` in sync as each feature ships, and update `.cursor/memory.md`.
