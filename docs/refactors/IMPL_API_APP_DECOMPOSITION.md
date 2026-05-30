# Implementation — Decompose `apps/api/src/app.ts`

Source plan: [`PLAN_API_APP_DECOMPOSITION.md`](./PLAN_API_APP_DECOMPOSITION.md)
Branch suggestion: `refactor/api-app-decomposition` (stacked PRs or one long-lived branch with merge-by-phase)
Last updated: 2026-05-30

---

## Status / Scope

**Status:** All phases complete.

**In scope:** Mechanical extraction of helpers and routes from `apps/api/src/app.ts` into plugins and domain modules. Behavior and HTTP contracts must remain unchanged unless a dedup item is explicitly called out in Phase 1.

**Out of scope:** New features, contract changes, Mongo schema changes, web client refactors.

### Hard rules

1. Do not mix route moves with behavior changes in the same PR.
2. Extract shared helpers first, then move the handlers that use them in a later PR.
3. Prefer explicit `ctx` wiring over Fastify decorators for route plugins.
4. Prefer one plugin per PR once route moves begin.
5. Treat the route map and `/openapi.json` test as parity gates, not optional documentation.

### Progress log

- **2026-05-30 — Planning.** Added `PLAN_API_APP_DECOMPOSITION.md` and this implementation guide under `docs/refactors/`.
- **2026-05-30 — Phase 0 complete.** Split `apps/api/tests/api.test.ts` into route/domain files, added `tests/helpers/`, moved the `/openapi.json` regression into `routes/smoke.test.ts`, and deleted the monolithic test file.
- **2026-05-30 — Phase 1 complete.** Moved board-grant expiry and room-object touch rules onto shared pure helpers in `packages/room-engine`, delegated API wall-anchor acceptance to the shared anchor policy, consolidated builtin catalog loading under `apps/api/src/catalog/load-builtin.ts`, and added focused parity tests.
- **2026-05-30 — Phase 2 complete.** Added `app-context.ts`, extracted HTTP parsing and auth guards into `http/`, moved wall-object create/manage/write/source/limit policy into `policy/wall-objects.ts`, and extracted classroom state sanitization/hydration into `classroom/state.ts` to avoid import cycles before later classroom work.
- **2026-05-30 — Phase 10 complete.** `app.ts` finalized at 184 lines, 0 inline routes. Removed `livekitConfigured`/`storageConfigured` (used directly by route plugins), all route-helper dead code, and unused param schemas. Updated `.cursor/memory.md` refactor audit. Full vitest suite green (268 tests); typecheck clean. Refactor complete.
- **2026-05-30 — Phase 9 complete.** Extracted room-objects (12 handlers) into `routes/room-objects.ts`, ai-objects (7 handlers) into `routes/ai-objects.ts`, and free-for-all (2 handlers) into `routes/free-for-all.ts`. Restored `startAiObjectRetentionReaper` to `buildApp`. `app.ts` reduced to 209 lines with 0 inline routes — only CORS, error handling, lifecycle hooks, and `registerRoutes(app, ctx)`.
- **2026-05-30 — Phase 8 complete.** Extracted classroom (3 handlers: GET state, POST actions, GET lesson recap) into `routes/classroom.ts` and the single room-events handler into `routes/room-events.ts`. Helpers `requireTeacher`, `assertRoomTypeSupportsClassroomState`, `resolveClassroomActor`, `filterClassroomStateForActor` moved inline to classroom route file. `app.ts` reduced to 893 lines, 21 remaining inline routes.
- **2026-05-30 — Phase 7 complete.** Extracted wall-objects (14 handlers) into `routes/wall-objects.ts`, whiteboards (5) into `routes/whiteboards.ts`, shared-browsers (6) into `routes/shared-browsers.ts`. Moved `preparePollWallObjectInput`, `assertHttpsUrl`, `isAllowedEmbedHost`, `requireWhiteboardObject` inline to their route files; `requireSharedBrowserAccess`/`parseSharedBrowserSessionResponse` closures as local helpers inside `registerSharedBrowserRoutes`. `app.ts` reduced to 1,093 lines, 25 remaining inline routes.
- **2026-05-30 — Phase 6 complete.** Extracted 13 rooms-core handlers into `routes/rooms-core.ts`. Moved `roomSettings` → `rooms-core/settings.ts`, `enforceSessionJoinRateLimit` → `rooms-core/session-rate-limit.ts` (as `SessionRateLimiter` on `AppContext`). Added `listRoomWallAnchors`, `assertAnchorExists`, `assertAnchorAcceptsType`, `assertAnchorAvailableForNewObject` to `policy/wall-anchors.ts`, and `assertWallObjectsEnabled`, `assertWhiteboardsEnabled`, `assertSharedBrowsersEnabled`, `validateAttachmentPolicy` to `policy/wall-objects.ts`. `app.ts` reduced from 2,557 → 2,105 lines; 50 routes remain.

---

## Where to start

1. Read PLAN § 2 (current state) and § 5 (phases).
2. Execute **Phase 0** (test split) before moving classroom or wall routes.
3. Execute **Phase 1** (policy dedup) as the first code PR — smallest behavioral surface.
4. Keep `export async function buildApp` in `app.ts` as the stable entry for `server.ts` and all tests.

### Before first code PR

- [ ] Confirm the route inventory still totals **93** handlers.
- [ ] Confirm the existing `/openapi.json` regression test is identified and moved early in Phase 0.
- [ ] If `app.ts` gained new routes since 2026-05-30, update the route map below before moving any handler.

---

## Verification (every phase)

```bash
npm --workspace @3dspace/api run typecheck
npm --workspace @3dspace/api exec vitest run
```

Required parity checks:

- `/openapi.json` regression test stays green.
- Route inventory remains **93** handlers until a deliberate API change is separately approved.
- For route-move phases, confirm the moved paths still match this document's route map and PLAN § 2.5 plugin boundaries.

After route plugin phases, optionally run a focused file:

```bash
npm --workspace @3dspace/api exec vitest run apps/api/tests/routes/<name>.test.ts
```

OpenAPI (only if contracts `apiRoutes` changed):

```bash
npm run build -w @3dspace/contracts
node apps/api/dist/openapi.js > packages/contracts/openapi/openapi.json
```

---

## Route map (`app.ts` → plugin)

Use this table when cutting handlers out of `buildApp`. Line numbers refer to `apps/api/src/app.ts` as of 2026-05-30.

| Line | Method | Path | Plugin |
| ---: | --- | --- | --- |
| 2968 | GET | `/health` | `ops` |
| 2977 | GET | `/ready` | `ops` |
| 3008 | GET | `/openapi.json` | `ops` |
| 3019 | POST | `/v1/world-skin-uploader/verify` | `world-skins` |
| 3025 | GET | `/v1/world-skin-uploader/status` | `world-skins` |
| 3059 | POST | `/v1/world-skin-uploader/uploads` | `world-skins` |
| 3080 | PUT | `/dev-upload/*` | `dev-storage` |
| 3092 | GET | `/dev-download/*` | `dev-storage` |
| 3100 | GET | `/v1/room-object-assets/*` | `dev-storage` |
| 3107 | GET | `/v1/world-skins` | `world-skins` |
| 3114 | GET | `/v1/world-skins/:slug` | `world-skins` |
| 3123 | GET | `/v1/world-skin-assets/*` | `world-skins` |
| 3140 | GET | `/v1/users/me` | `users` |
| 3147 | PATCH | `/v1/users/me/avatar` | `users` |
| 3153 | GET | `/v1/classes` | `classes` |
| 3158 | POST | `/v1/classes` | `classes` |
| 3164 | PATCH | `/v1/classes/:classId` | `classes` |
| 3174 | GET | `/v1/classes/:classId/members` | `classes` |
| 3181 | POST | `/v1/classes/:classId/members` | `classes` |
| 3195 | POST | `/v1/classes/:classId/invites` | `classes` |
| 3227 | GET | `/v1/rooms/:roomId/invite` | `invites` |
| 3244 | POST | `/v1/invites/:inviteCode/accept` | `invites` |
| 3270 | GET | `/v1/rooms` | `rooms-core` |
| 3275 | POST | `/v1/rooms` | `rooms-core` |
| 3318 | PATCH | `/v1/rooms/:roomId` | `rooms-core` |
| 3337 | DELETE | `/v1/rooms/:roomId` | `rooms-core` |
| 3345 | GET | `/v1/rooms/:roomId/manifest` | `rooms-core` |
| 3352 | POST | `/v1/rooms/:roomId/session` | `rooms-core` |
| 3431 | POST | `/v1/rooms/:roomId/session/heartbeat` | `rooms-core` |
| 3448 | DELETE | `/v1/rooms/:roomId/session` | `rooms-core` |
| 3456 | GET | `/v1/rooms/:roomId/attachments` | `rooms-core` |
| 3463 | POST | `/v1/rooms/:roomId/attachments` | `rooms-core` |
| 3506 | POST | `.../attachments/:attachmentId/finalize` | `rooms-core` |
| 3528 | PATCH | `.../attachments/:attachmentId` | `rooms-core` |
| 3541 | GET | `.../attachments/:attachmentId/download` | `rooms-core` |
| 3551 | GET | `/v1/rooms/:roomId/wall-objects` | `wall-objects` |
| 3572 | POST | `/v1/rooms/:roomId/wall-objects` | `wall-objects` |
| 3638 | GET | `.../wall-objects/:objectId` | `wall-objects` |
| 3647 | PATCH | `.../wall-objects/:objectId` | `wall-objects` |
| 3679 | DELETE | `.../wall-objects/:objectId` | `wall-objects` |
| 3703 | GET | `.../dynamic-wall-anchors` | `wall-objects` |
| 3712 | POST | `.../dynamic-wall-anchors` | `wall-objects` |
| 3773 | PATCH | `.../dynamic-wall-anchors/:anchorId` | `wall-objects` |
| 3834 | DELETE | `.../dynamic-wall-anchors/:anchorId` | `wall-objects` |
| 3868 | GET | `/v1/rooms/free-for-all` | `free-for-all` |
| 3885 | POST | `.../free-for-all-sessions` | `free-for-all` |
| 3965 | GET | `.../meeting-notes/sessions` | `meeting-notes` |
| 3973 | POST | `.../meeting-notes/sessions` | `meeting-notes` |
| 4003 | GET | `.../meeting-notes/sessions/:sessionId` | `meeting-notes` |
| 4010 | PATCH | `.../meeting-notes/sessions/:sessionId` | `meeting-notes` |
| 4073 | POST | `.../sessions/:sessionId/summary` | `meeting-notes` |
| 4092 | DELETE | `.../sessions/:sessionId` | `meeting-notes` |
| 4101 | POST | `.../sessions/:sessionId/audio-chunks` | `meeting-notes` |
| 4134 | GET | `.../sessions/:sessionId/download` | `meeting-notes` |
| 4155 | POST | `.../wall-objects/:objectId/control` | `wall-objects` |
| 4274 | GET | `.../whiteboard/strokes` | `whiteboards` |
| 4296 | POST | `.../whiteboard/strokes` | `whiteboards` |
| 4383 | DELETE | `.../whiteboard/strokes` | `whiteboards` |
| 4432 | POST | `.../whiteboard/clear` | `whiteboards` |
| 4476 | POST | `.../whiteboard/snapshots` | `whiteboards` |
| 4529 | GET | `.../shared-browser` | `shared-browsers` |
| 4535 | POST | `.../shared-browser/navigate` | `shared-browsers` |
| 4542 | POST | `.../shared-browser/history` | `shared-browsers` |
| 4549 | POST | `.../shared-browser/control-lease` | `shared-browsers` |
| 4556 | POST | `.../shared-browser/resume` | `shared-browsers` |
| 4562 | POST | `.../shared-browser/embed` | `shared-browsers` |
| 4568 | POST | `/v1/rooms/:roomId/wall-shares` | `wall-objects` |
| 4636 | POST | `.../wall-shares/:objectId/end` | `wall-objects` |
| 4657 | POST | `.../web-resources/preview` | `wall-objects` |
| 4675 | POST | `.../web-resources` | `wall-objects` |
| 4721 | GET | `.../classroom` | `classroom` |
| 4732 | POST | `.../classroom/actions` | `classroom` |
| 4791 | GET | `.../lesson-runs/:runId/recap` | `classroom` |
| 4818 | POST | `.../events` | `room-events` |
| 4838 | GET | `/v1/room-objects/templates` | `room-objects` |
| 4849 | POST | `.../room-objects/uploads` | `room-objects` |
| 4882 | POST | `/v1/room-objects/templates` | `room-objects` |
| 4943 | GET | `/v1/room-objects/templates/:templateId` | `room-objects` |
| 4955 | DELETE | `/v1/room-objects/templates/:templateId` | `room-objects` |
| 4969 | GET | `.../objects` | `room-objects` |
| 4979 | POST | `.../objects` | `room-objects` |
| 5018 | POST | `.../room-objects/realtime` | `room-objects` |
| 5040 | PATCH | `.../objects/:objectId` | `room-objects` |
| 5079 | DELETE | `.../objects/:objectId` | `room-objects` |
| 5096 | POST | `.../objects/:objectId/touch` | `room-objects` |
| 5139 | POST | `.../ai-objects/jobs` | `ai-objects` |
| 5173 | GET | `.../ai-objects/jobs` | `ai-objects` |
| 5182 | GET | `.../ai-objects/jobs/:jobId` | `ai-objects` |
| 5192 | PATCH | `.../ai-objects/jobs/:jobId` | `ai-objects` |
| 5205 | DELETE | `.../ai-objects/jobs/:jobId` | `ai-objects` |
| 5214 | GET | `.../jobs/:jobId/object.glb` | `ai-objects` |
| 5230 | POST | `.../jobs/:jobId/place` | `ai-objects` |
| 5267 | POST | `.../objects/:objectId/reset` | `room-objects` |

**Note:** Search `app.ts` for any routes added after 2026-05-30 and append to this table before moving them.

---

## Phase 0 — Split integration tests

**Goal:** `apps/api/tests/api.test.ts` no longer blocks parallel CI or obscures which domain broke.

### Checklist

- [ ] Create `apps/api/tests/helpers/app.ts`:
  - `authHeaders`
  - `createClassAndRoom`
  - `buildTestApp(overrides?: Partial<BuildAppOptions>)` wrapping `buildApp`
- [ ] Create `apps/api/tests/helpers/classroom.ts`:
  - `addStudentMember`, `classroomAction`, `lessonConfig`, `breakoutPodsConfig`, `enableRoomPods`
- [ ] Create `apps/api/tests/helpers/room-objects.ts`:
  - `roomObjectsConfig`, `enableRoomObjects`
- [ ] Create `apps/api/tests/helpers/shared-browser.ts`:
  - `buildSharedBrowserApp` (stub-driver orchestrator) — move from inline in `api.test.ts`
- [ ] Move `describe("3dspace api")` core flows → `apps/api/tests/routes/smoke.test.ts` (or keep name, smaller file)
- [ ] Move the `/openapi.json` regression test into `routes/smoke.test.ts` before any route plugin PR lands
- [ ] Move domain suites by grep on `describe(` boundaries, e.g.:
  - `room object templates` (~3641) → `routes/room-object-templates.test.ts`
  - `shared browser boards` (~5368) → `routes/shared-browsers.test.ts`
  - lesson tests → `routes/classroom-lessons.test.ts`
- [ ] Leave `api.test.ts` as re-export shim OR delete after moves (prefer delete once imports updated)
- [ ] Confirm vitest discovers all `tests/**/*.test.ts`

### Test file → route plugin mapping (target)

| Test file | Routes covered |
| --- | --- |
| `routes/smoke.test.ts` | classes, rooms, invites, session |
| `routes/wall-objects.test.ts` | wall-objects, attachments, web-resources |
| `routes/whiteboards.test.ts` | whiteboard strokes/snapshots |
| `routes/shared-browsers.test.ts` | shared-browser |
| `routes/classroom.test.ts` | classroom GET/actions |
| `routes/classroom-lessons.test.ts` | lesson recap + lesson actions |
| `routes/room-objects.test.ts` | in-room objects + templates |
| `routes/ai-objects.test.ts` | ai-objects jobs |
| `routes/meeting-notes.test.ts` | meeting notes |
| `routes/free-for-all.test.ts` | FFA list + session |

---

## Phase 1 — Policy dedup (no route moves)

**Goal:** Shrink `app.ts` helper surface and align API with `room-engine` / web.

### Checklist

- [ ] Add `packages/contracts/src/policy/board-grants.ts` (or `room-engine`) with `isBoardGrantActive`
  - Replace `isBoardAccessGrantActive` in `app.ts`
  - Re-export from web `classroomGrants.ts` (import shared helper)
- [ ] Add `apps/api/src/policy/wall-anchors.ts`:
  - `assertAnchorAcceptsType` → delegate to `anchorAcceptsWallObjectType`
  - Remove `baseAcceptedKind` / `fileKindForWallObjectType` if redundant with `room-engine`
- [ ] Add `packages/room-engine/src/roomObjectTouch.ts` (or contracts):
  - Pure `canTouchRoomObject`
  - `assertCanTouchRoomObject` in `room-objects/helpers.ts` calls shared function after group resolution
- [ ] Add `apps/api/src/catalog/load-builtin.ts`; refactor both builtin-catalog files
- [ ] Run full vitest; add focused unit tests for wall-anchor + touch policy

---

## Phase 2 — AppContext and HTTP helpers

### Checklist

- [ ] Create `apps/api/src/app-context.ts` with `AppContext` type (see PLAN § 3.2)
- [ ] Create `apps/api/src/http/parse.ts` — move `parseBody`, `parseParams`, `parseQuery`
- [ ] Create `apps/api/src/http/auth-guards.ts` — move:
  - `requireUser`, `requireClassAccess`, `requireClassTeacher`
  - `requireRoomAccess`, `requireRoomTeacher`
  - `assertMeetingNotesAvailable`, `assertAiObjectsEnabled`, etc.
- [ ] Create `apps/api/src/policy/wall-objects.ts` — move:
  - `assertWallObjectCreatePolicy`, `assertWallObjectManagePolicy`
  - `assertWhiteboardWritePolicy`, `validateWallObjectSource`, `enforceWallObjectLimits`
- [ ] Update `app.ts` to import from new modules (no route moves yet)
- [ ] Export `BuildAppOptions` from `app-context.ts` or `app.ts` for tests

---

## Phase 3 — Classroom extraction

**Goal:** `runClassroomAction` and lesson helpers leave `app.ts`.

### Checklist

- [x] Create `apps/api/src/classroom/state.ts`:
  - `sanitizeClassroomState`, `filterClassroomStateForActor`, `hydrateClassroomDisplayNames`
  - `resolveClassroomActor`, help/board/check/group finders
- [x] Create `apps/api/src/classroom/lesson-runtime.ts`:
  - `startLessonStep`, `cleanupLessonStep`, `completeCurrentLessonStep`
  - `buildLessonRecap`, `renderRecapCsv`, lesson step helpers (lines 1214–2062)
- [x] Create `apps/api/src/classroom/run-classroom-action.ts`:
  - Export `runClassroomAction` with same signature as today
- [x] Add `apps/api/tests/classroom/run-classroom-action.test.ts` with 3–5 representative actions (raise-hand, board-grant, lesson step)
- [x] `app.ts` imports `runClassroomAction` plus recap/filter helpers from `classroom/*`
- [x] Run lesson + breakout + pods tests from Phase 0 split

### `runClassroomAction` dependencies to wire

The function needs: `Repository`, `ClassroomActor`, feature flags, `RoomSettings`, and calls into lesson-runtime + repository. Pass as a single `RunClassroomActionDeps` object to ease testing.

---

## Phase 4 — Meeting notes buffer + routes

### Checklist

- [x] Create `apps/api/src/meeting-notes/audio-buffer.ts`:
  - `MeetingNotesAudioStore` class wrapping `Map` + `meetingNotesTaskKey`
  - `append`, `clear`, `transcribeBuffered` (move from `buildApp` closures)
- [x] Add store instance to `AppContext`
- [x] Create `apps/api/src/routes/meeting-notes.ts` — move 8 handlers (lines 3965–4134)
- [x] Register plugin in `register-routes.ts`
- [x] Move `assertMeetingNotesAvailable`, `buildMeetingNotesDetail`, `finalizeMeetingNotesSession` from `app.ts` to `meeting-notes/` if still inline

---

## Phase 5 — Low-traffic route plugins

### Checklist per plugin

For each: create `routes/<name>.ts`, export `async function registerXRoutes(app, ctx)`, cut handlers from `app.ts`, register in `register-routes.ts`.

Default rule: move **one plugin per PR** unless the companion plugin has only 1–2 routes and no new helper surface.

- [x] `routes/ops.ts` (health, ready, openapi)
- [x] `routes/dev-storage.ts`
- [x] `routes/world-skins.ts` (includes uploader routes behind `worldSkinUploaderEnabled`)
- [x] `routes/users.ts`
- [x] `routes/classes.ts`
- [x] `routes/invites.ts` (room invite + accept — small, can merge into `classes` if preferred)

Shared closures to pass via `ctx`:

- [x] `storageKeyFromRequest` → `dev-storage` or `http/storage.ts`
- [x] `rewriteWorldSkinAssetUrls` → `world-skins/helpers.ts`

---

## Phase 6 — Rooms core

### Checklist

- [x] `routes/rooms-core.ts` — room CRUD, manifest, session, heartbeat, attachments
- [x] Move `enforceSessionJoinRateLimit` + `sessionJoinAttempts` map to `rooms-core/session-rate-limit.ts` on `ctx`
- [x] Move `roomSettings()` factory to `rooms-core/settings.ts` (used at room create)
- [x] Move manifest selection (`createDefaultRoomManifest`, `createFreeForAllManifest`, `createWorkforceTrainingManifest`) into create-room handler file

**Tests:** `routes/smoke.test.ts` + any attachment tests.

---

## Phase 7 — Wall surfaces

### Checklist

- [x] `routes/wall-objects.ts` — wall-objects CRUD, dynamic anchors, control, wall-shares, web-resources
- [x] `routes/whiteboards.ts` — use existing `whiteboards/validation.ts` + `snapshots.ts`; consider `whiteboards/routes.ts` thin handlers
- [x] `routes/shared-browsers.ts` — inject `ctx.sharedBrowserOrchestrator`; keep orchestrator construction in `buildApp`

**Gotcha:** Wall-object **create** handler calls `sharedBrowserOrchestrator.createSession` — import orchestrator from `ctx`, not a new singleton.

---

## Phase 8 — Classroom routes + events

### Checklist

- [x] `routes/classroom.ts`:
  - GET classroom (uses `filterClassroomStateForActor`)
  - POST actions → `runClassroomAction`
  - GET lesson recap CSV
- [x] `routes/room-events.ts` — single `POST .../events` handler

---

## Phase 9 — Room objects + AI + FFA

### Checklist

- [x] `routes/room-objects.ts` — templates, uploads, objects CRUD, realtime dispatch, touch, reset
- [x] `routes/ai-objects.ts` — jobs + place + GLB download
- [x] `routes/free-for-all.ts` — list rooms + FFA session (uses `free-for-all/password.ts`)

Keep `RoomObjectGrabLock` lifecycle in `buildApp`; pass `ctx.roomObjectGrabLock` into room-objects realtime route.

---

## Phase 10 — Final `app.ts` cleanup

### Checklist

- [x] `app.ts` under 400 lines — **184 lines**
- [x] `apps/api/src/routes/register-routes.ts` owns ordered plugin registration
- [x] No unused helpers left in `app.ts`
- [x] Grep `app.ts` for `app.get|post|patch|delete` — zero matches
- [x] Update `.cursor/memory.md` refactor audit status

---

## `buildApp` contract (must preserve)

```ts
type BuildAppOptions = {
  config?: AppConfig;
  repository?: Repository;
  roomObjectGrabLock?: RoomObjectGrabLock;
  sharedBrowserOrchestrator?: SharedBrowserOrchestrator;
};
```

| Injection | Used by |
| --- | --- |
| `repository: MemoryRepository` | Almost all `api.test.ts` suites |
| `sharedBrowserOrchestrator` (stub driver) | Shared browser tests — **must not** launch real Chromium |
| `roomObjectGrabLock` | Grab/realtime tests if needed |
| `config` overrides | Feature flags per suite (`lessonConfig`, `roomObjectsConfig`, etc.) |

Do not require new mandatory options on `buildApp` without updating every test helper.

---

## Plugin registration order

Two ordering rules must both hold:

1. `buildApp` registers parsers, CORS, error handling, and `onClose` hooks **before** calling `registerRoutes(app, ctx)`.
2. Inside `register-routes.ts`, register plugins in this order to match current side-effect expectations:

- `ops`
- `dev-storage`
- `world-skins`
- `users`
- `classes`
- `invites`
- `rooms-core`
- `wall-objects`
- `whiteboards`
- `shared-browsers`
- `meeting-notes`
- `free-for-all`
- `classroom`
- `room-events`
- `room-objects`
- `ai-objects`

If a route's auth guard depends on another plugin's decorator, merge plugins or use explicit `ctx` only (preferred).

---

## Gotchas for implementers

1. **Shared browser tests:** Always inject stub-driver `SharedBrowserOrchestrator` via `buildApp({ sharedBrowserOrchestrator })` — never rely on production driver in vitest.
2. **Realtime contract:** Handlers return `realtimeMessages` envelopes; server does not self-broadcast over LiveKit — do not “fix” this during refactor.
3. **Meeting notes audio map:** Must be per-`buildApp` instance, not a module singleton, or tests will leak chunks across cases.
4. **`onClose` hook:** Stops grab-lock reaper, shared-browser reapers, `driver.close()`, `repository.close()` — keep in `buildApp` after all plugins registered.
5. **`disableRequestLogging: true`:** Intentional for shared-browser/lobby polling — do not re-enable global request logs without product sign-off.
6. **Binary routes:** `frame.jpg` and similar may be absent from contracts `apiRoutes`; register in plugin but document in route map.
7. **Import cycles:** `routes/*` → `policy/*`, `classroom/*`, `room-objects/*` OK; reverse imports forbidden.
8. **Context plumbing:** Do not introduce decorator-based `ctx` access for convenience; pass `ctx` explicitly so tests and route ownership stay obvious.

---

## Helper relocation reference

| Current location (`app.ts` lines) | Target module |
| --- | --- |
| 259–308 | `http/parse.ts` |
| 310–360 | `http/auth-guards.ts` |
| 371–409 | `meeting-notes/lifecycle.ts` |
| 410–484 | `rooms-core/settings.ts`, `world-skins/rewrite.ts` |
| 525–552 | Delete or `policy/wall-anchors.ts` after room-engine dedup |
| 622–830 | `policy/wall-objects.ts` |
| 688–776 | `policy/board-grants.ts` |
| 895–1180 | `classroom/state.ts` |
| 1214–2062 | `classroom/lesson-runtime.ts` |
| 2064–2723 | `classroom/run-classroom-action.ts` |
| 2783–2876 | `meeting-notes/audio-buffer.ts` |
| 2889–2901 | `rooms-core/session-rate-limit.ts` |

---

## PR checklist template

Copy into each refactor PR description:

```markdown
## Refactor: API app.ts — Phase N

- [ ] Typecheck: `npm --workspace @3dspace/api run typecheck`
- [ ] Tests: `npm --workspace @3dspace/api exec vitest run`
- [ ] No HTTP path or JSON shape changes (or listed in PR if intentional)
- [ ] buildApp injection unchanged for existing tests
- [ ] Updated IMPL progress log
```

---

## Related files (quick links)

| Path | Role |
| --- | --- |
| `apps/api/src/server.ts` | Production entry — imports `buildApp` only |
| `apps/api/src/app.ts` | Refactor target |
| `apps/api/tests/api.test.ts` | Phase 0 split target |
| `packages/room-engine/src/wallAnchorPolicy.ts` | Canonical wall anchor rules |
| `apps/web/lib/classroomGrants.ts` | Client board-grant helper to dedup |
