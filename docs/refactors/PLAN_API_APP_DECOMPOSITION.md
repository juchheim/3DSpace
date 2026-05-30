# Plan — Decompose `apps/api/src/app.ts`

Source audit: codebase refactor review (2026-05-30)
Implementation guide: [`IMPL_API_APP_DECOMPOSITION.md`](./IMPL_API_APP_DECOMPOSITION.md)
Last updated: 2026-05-30

---

## 1. Overview

`apps/api/src/app.ts` is the Fastify application factory for 3DSpace. Today it combines:

- **~1,900 lines** of module-level helpers (auth, wall policy, classroom state machine, lesson runtime)
- **`runClassroomAction`** (~660 lines, lines 2064–2723) — classroom + lesson + breakout side effects
- **`buildApp`** (~1,570 lines, lines 2725–5296) — CORS, error handling, lifecycle hooks, and **93** route handlers

Several domains already have extracted modules (`shared-browser/`, `room-objects/`, `ai-objects/`, `whiteboards/validation.ts`, `meeting-notes/service.ts`), but routes and most policy glue still live in `app.ts`.

This plan decomposes `app.ts` into **Fastify plugins** and **domain services** without changing HTTP contracts, response shapes, or auth semantics.

### 1.1 Goals

1. **Navigability** — engineers can find room, wall, classroom, and FFA logic in predictable folders.
2. **Testability** — classroom action dispatch and wall policy are unit-testable without `app.inject` for every branch.
3. **Safe incremental migration** — each phase is a small PR; full Vitest suite stays green.
4. **Preserve injection surface** — `buildApp(options)` keeps `config`, `repository`, `roomObjectGrabLock`, `sharedBrowserOrchestrator` for tests.
5. **Align with existing extractions** — extend patterns already used under `apps/api/src/shared-browser/` and `apps/api/src/room-objects/`.

### 1.2 Non-goals

- Replacing Fastify or changing URL paths / OpenAPI operation IDs.
- Splitting `MemoryRepository` / `MongoRepository` (separate initiative).
- Moving `@3dspace/contracts` schemas out of `packages/contracts/src/index.ts`.
- Rewriting `runClassroomAction` behavior or adding new classroom actions.
- Client (`apps/web`) changes except where noted for shared-policy dedup (optional follow-up).

### 1.3 Success criteria

| Criterion | Target |
| --- | --- |
| `app.ts` line count | &lt; 400 lines (composition + `buildApp` only) |
| Route registration | Domain plugins under `apps/api/src/routes/` |
| Classroom dispatch | `apps/api/src/classroom/run-classroom-action.ts` (or `actions/`) |
| Tests | `npm --workspace @3dspace/api run typecheck` + full `vitest` green after each phase |
| Public API | `export { buildApp }` from `app.ts`; `server.ts` unchanged |
| OpenAPI | `GET /openapi.json` byte-identical or documented intentional diff |

---

## 2. Current state

### 2.1 File metrics (2026-05-30)

| Artifact | Lines | Notes |
| --- | ---: | --- |
| `apps/api/src/app.ts` | 5,296 | Monolith |
| `apps/api/tests/api.test.ts` | 5,759 | Mirrors monolith; 80+ `buildApp()` calls |
| Extracted API modules | 46 files under `apps/api/src/` | Partial domain split |

### 2.2 What already lives outside `app.ts`

| Module | Responsibility |
| --- | --- |
| `auth.ts` | Clerk / dev header authentication |
| `config.ts`, `errors.ts` | Env + HTTP errors |
| `repository.ts`, `models/mongoose.ts` | Persistence |
| `shared-browser/*` | Orchestrator, drivers, reapers, SSRF |
| `room-objects/*` | Grab lock, helpers, realtime dispatch/outbox |
| `ai-objects/*` | Job orchestration, backends, retention |
| `whiteboards/validation.ts`, `snapshots.ts` | Stroke validation + snapshot helpers (routes still in `app.ts`) |
| `meeting-notes/service.ts` | Summary/export formatting (transcription buffer still in `buildApp`) |
| `world-skins/*`, `free-for-all/password.ts` | Upload helpers, FFA password verify |

### 2.3 `buildApp` responsibilities (inline today)

1. Repository seeding (builtin room-object templates, world skins)
2. Grab-lock + shared-browser driver/orchestrator + reapers
3. In-memory **meeting notes audio buffer** + `transcribeBufferedMeetingNotesAudio`
4. Session join rate limit map
5. Custom content-type parsers (binary uploads)
6. CORS, global error handler, `onClose` cleanup
7. All HTTP routes

### 2.4 Helper clusters inside `app.ts` (lines 259–2723)

| Cluster | Approx. lines | Examples |
| --- | --- | --- |
| HTTP parsing + auth gates | 259–360 | `parseBody`, `requireUser`, `requireRoomTeacher` |
| Wall / anchor policy | 525–830 | `assertAnchorAcceptsType`, `assertWallObjectCreatePolicy`, `validateWallObjectSource` |
| Board grants | 688–776 | `isBoardAccessGrantActive`, `assertWhiteboardWritePolicy` |
| Classroom state + filtering | 938–1180 | `sanitizeClassroomState`, `filterClassroomStateForActor` |
| Lesson runtime | 1214–2062 | `startLessonStep`, `buildLessonRecap`, `runClassroomAction` |
| Room / manifest helpers | 410–624 | `roomSettings`, `listRoomWallAnchors` |

### 2.5 Route inventory (93 handlers)

Grouped by URL prefix for plugin boundaries:

| Plugin (proposed) | Routes | Representative paths |
| --- | ---: | --- |
| `ops` | 3 | `/health`, `/ready`, `/openapi.json` |
| `dev-storage` | 3 | `/dev-upload/*`, `/dev-download/*`, `/v1/room-object-assets/*` |
| `world-skins` | 6 | `/v1/world-skins`, uploader verify/status/uploads, assets |
| `users` | 2 | `/v1/users/me`, avatar patch |
| `classes` | 6 | `/v1/classes`, members, invites |
| `invites` | 2 | room invite, accept invite |
| `rooms-core` | 13 | CRUD rooms, manifest, session, heartbeat, attachments |
| `wall-objects` | 14 | wall-objects CRUD, control, dynamic anchors, wall-shares, web-resources |
| `whiteboards` | 5 | strokes, clear, snapshots |
| `shared-browsers` | 6 | shared-browser session + navigate/history/lease/resume/embed |
| `free-for-all` | 2 | list FFA rooms, FFA session join |
| `meeting-notes` | 8 | sessions CRUD, summary, audio chunks, download |
| `classroom` | 3 | GET classroom, POST actions, lesson recap CSV |
| `room-events` | 1 | `POST .../events` |
| `room-objects` | 12 | templates, uploads, in-room objects, realtime, touch, reset |
| `ai-objects` | 7 | jobs CRUD, GLB download, place |

Exact line numbers are in `IMPL_API_APP_DECOMPOSITION.md` § Route map.

---

## 3. Target architecture

### 3.1 Directory layout

```text
apps/api/src/
  app.ts                          # buildApp(): register plugins, export BuildAppOptions
  app-context.ts                  # AppContext type + route-plugin option types (NEW)
  http/
    parse.ts                      # parseBody, parseParams, parseQuery (NEW)
    auth-guards.ts                # requireUser, requireRoomAccess, ... (NEW)
  policy/
    wall-anchors.ts               # uses @3dspace/room-engine anchorAcceptsWallObjectType (NEW)
    wall-objects.ts               # create/manage/write policies (NEW)
    board-grants.ts                 # isBoardGrantActive from shared module (NEW)
  classroom/
    state.ts                      # sanitize, filter, hydrate (NEW)
    lesson-runtime.ts             # start/cleanup/complete step, recap (NEW)
    run-classroom-action.ts       # runClassroomAction (MOVED)
  meeting-notes/
    service.ts                    # existing
    audio-buffer.ts               # buffer + transcribe (MOVED from buildApp)
  routes/
    register-routes.ts            # await app.register(...) (NEW)
    ops.ts
    dev-storage.ts
    world-skins.ts
    users.ts
    classes.ts
    rooms-core.ts
    wall-objects.ts
    whiteboards.ts
    shared-browsers.ts
    free-for-all.ts
    meeting-notes.ts
    classroom.ts
    room-events.ts
    room-objects.ts
    ai-objects.ts
```

### 3.2 Fastify plugin pattern

Each route plugin receives a typed **`AppContext`** via an explicit argument or typed register option. Do not make `ctx` a hidden Fastify decorator unless a plugin truly needs shared server state across encapsulation boundaries.

```ts
export type AppContext = {
  config: AppConfig;
  repository: Repository;
  roomObjectGrabLock: RoomObjectGrabLock;
  sharedBrowserOrchestrator: SharedBrowserOrchestrator;
  meetingNotesAudio: MeetingNotesAudioStore; // Phase 4
};
```

Registration in `buildApp`:

```ts
const ctx: AppContext = { ... };
await registerRoutes(app, ctx);
```

Registration in `routes/register-routes.ts`:

```ts
export async function registerRoutes(app: FastifyInstance, ctx: AppContext) {
  await registerOpsRoutes(app, ctx);
  await registerRoomsCoreRoutes(app, ctx);
}
```

Plugins use `fastify-plugin` only where encapsulation must be broken for a non-route concern. Prefer **explicit `ctx` argument** over hidden globals to keep tests deterministic and avoid import-cycle pressure.

### 3.3 `app.ts` after decomposition

`app.ts` should only:

1. Load config / repository / seeds
2. Construct orchestrators, reapers, audio store
3. Register global hooks (CORS, errors, parsers, `onClose`)
4. Call `registerRoutes(app, ctx)`
5. Export `buildApp` and `BuildAppOptions`

### 3.4 Migration guardrails

1. **No mixed behavior changes with route moves.** A route-move PR may relocate code and extract helpers, but should not change auth semantics, status codes, JSON shapes, or feature-flag behavior.
2. **Extract helpers before moving handlers.** If a handler depends on inline policy/runtime logic, first extract that logic back into `app.ts`, prove parity, then move the handler in a later PR.
3. **Use temporary compatibility shims when they reduce churn.** Re-export newly extracted helpers from the old module for one phase if that keeps the PR mechanical and easy to review.
4. **Prefer one plugin per PR for Phases 5–9.** The only exception is a tiny companion plugin whose helper surface is already extracted.
5. **Treat the route map as a contract artifact.** Update the route inventory in IMPL before moving a route if `app.ts` changed since the last audit.

---

## 4. Cross-cutting dedup (do during early phases)

These are small, low-risk moves that reduce drift before large route extractions:

| Item | Today | Target |
| --- | --- | --- |
| Board grant expiry | `isBoardAccessGrantActive` in `app.ts` vs `isBoardGrantActive` in web `classroomGrants.ts` | `@3dspace/contracts` or `packages/room-engine` |
| Wall anchor acceptance | `assertAnchorAcceptsType` manual `metadata.accepts` | `anchorAcceptsWallObjectType` from `room-engine` |
| Room object touch | `assertCanTouchRoomObject` vs web `canTouchRoomObject` | Shared pure function + API group lookup wrapper |
| Builtin catalogs | Twin loaders in `room-objects/` and `world-skins/` | `catalog/load-builtin.ts` helper |

Details and file touch list: IMPL Phase 1.

---

## 5. Phased approach

| Phase | Focus | Risk | PR size |
| --- | --- | --- | --- |
| **0** | Split `api.test.ts` + `tests/helpers/` | Low | Medium |
| **1** | Shared policy/helpers extraction (no route moves) | Low | Small |
| **2** | `AppContext`, `http/`, `policy/`, `classroom/state.ts` | Low | Medium |
| **3** | Extract `runClassroomAction` + lesson runtime | Medium | Large |
| **4** | `meeting-notes/audio-buffer.ts` + meeting-notes routes plugin | Medium | Medium |
| **5** | Ops + dev-storage + world-skins + users + classes plugins | Low | Medium |
| **6** | `rooms-core` plugin (session, attachments) | Medium | Medium |
| **7** | `wall-objects` + `whiteboards` + `shared-browsers` plugins | Medium | Large |
| **8** | `classroom` + `room-events` plugins | Medium | Medium |
| **9** | `room-objects` + `ai-objects` + `free-for-all` plugins | Medium | Large |
| **10** | Delete dead code from `app.ts`; final line-count check | Low | Small |

Phases 5–9 should normally be executed as **one plugin per PR**. Batch only the smallest companions when reviewer overhead is higher than the risk reduction.

**Dependency rule:** Phase 0 strongly recommended before Phase 3+ so test files map 1:1 with route modules.

---

## 6. Testing strategy

### 6.1 Regression gate (every PR)

```bash
npm --workspace @3dspace/api run typecheck
npm --workspace @3dspace/api exec vitest run
```

Additional parity gates:

1. Keep the `/openapi.json` regression test green in the split test suite starting in Phase 0.
2. Keep total route definitions at **93** during Phases 1–9 by comparing the IMPL route map against `app.ts` + `routes/`.
3. If a phase moves routes, verify the moved URL set still matches the same plugin boundary table in IMPL before merging.

Optional spot-check after route moves:

```bash
npm --workspace @3dspace/api exec vitest run apps/api/tests/routes/rooms-core.test.ts
```

### 6.2 Phase 0 test layout (target)

```text
apps/api/tests/
  helpers/
    app.ts              # buildTestApp(), authHeaders, createClassAndRoom
    classroom.ts        # classroomAction, lessonConfig, enableRoomPods
    room-objects.ts     # roomObjectsConfig, enableRoomObjects
    shared-browser.ts   # buildSharedBrowserApp (stub driver)
  routes/
    smoke.test.ts       # includes /health, /ready, /openapi.json
    classes.test.ts
    wall-objects.test.ts
    ...
  integration/
    cross-domain.test.ts # thin cross-domain smoke (optional)
```

Keep **`buildApp` injection** as the primary integration harness; do not introduce a second HTTP framework.

Move the existing `/openapi.json` regression test during Phase 0 and treat it as blocking for all later route-move phases.

### 6.3 New unit tests (high value)

| Module | What to test |
| --- | --- |
| `policy/wall-anchors.ts` | Accept/reject matrix vs `room-engine` |
| `classroom/run-classroom-action.ts` | Representative actions without Fastify |
| `classroom/lesson-runtime.ts` | Step transitions, timer cleanup |

---

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Classroom action regression | Phase 3 dedicated PR; run lesson + breakout + pods tests first |
| Fastify plugin scope / double registration | One plugin per file; integration test per plugin |
| Circular imports (`routes` → `classroom` → `policy`) | `policy/` and `classroom/` must not import from `routes/` |
| Test flake from shared state | Keep per-test `MemoryRepository`; do not share audio buffer across tests |
| OpenAPI drift | Regenerate only if `apiRoutes` in contracts change; compare `/openapi.json` in CI optional job |
| Meeting notes transcription | Move buffer + transcribe together (Phase 4); preserve `meetingNotesTaskKey` behavior |

### 7.1 Rollback

Each phase is independently revertible via git revert. No database migrations are involved.

---

## 8. Out of scope follow-ups

Document separately if needed:

- `WhiteboardSessionService` mirroring `SharedBrowserOrchestrator` (whiteboard routes today are thin wrappers around repository + validation)
- Repository interface split per aggregate
- OpenAPI generation from Fastify route schemas (today: contracts-owned `createOpenApiDocument()`)

---

## 9. References

- Existing extractions: `apps/api/src/shared-browser/orchestrator.ts`, `apps/api/src/room-objects/realtime-dispatch.ts`
- Web client parallel: `apps/web/components/RoomClient.tsx` decomposition (separate refactor track)
- Deployment: no change to `apps/api/Dockerfile` entry (`server.ts` → `buildApp`)
