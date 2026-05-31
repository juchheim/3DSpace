# 3DSpace Session Memory

Last updated: 2026-05-31 (escape-room logic Phase 9)

**Historical detail:** `.cursor/memory-archive.md` (planning log + bug-fix chronicle through 2026-05-30). Update that file only when archiving new dated entries; keep this file lean.

---

## Refactor audit (2026-05-30)

**API app.ts decomposition — COMPLETE** (`refactor/api-app-decomposition`). `apps/api/src/app.ts` is ~184 lines; 93 routes in `apps/api/src/routes/`. Docs: `docs/refactors/PLAN_API_APP_DECOMPOSITION.md`, `IMPL_API_APP_DECOMPOSITION.md`.

Remaining refactor candidates: `packages/contracts/src/index.ts`, `RoomClient.tsx`, `RoomView3D.tsx`.

---

## Project Summary

3DSpace: browser-based multi-user 3D educational space with required 2D analog. Workspace: `/Users/ejuchheim/Projects/3DSpace/3DSpace`.

**State:** MVP complete in production (Vercel + Koyeb + Atlas + Clerk + LiveKit + R2). MVP+1 wall media + classroom tools implemented locally.

---

## Doc index (canonical — prefer these over memory prose)

- **MVP:** `docs/planning/mvp/MVP_IMPLEMENTATION_PLAN.md`, `MVP_STATUS.md`
- **Refactors:** `docs/refactors/PLAN_API_APP_DECOMPOSITION.md`, `IMPL_API_APP_DECOMPOSITION.md`
- **Room types:** `docs/planning/rooms/workforce-training/`, `docs/planning/rooms/free-for-all/`, `docs/planning/rooms/escape-room/` (PLAN + 3 IMPL docs: ROOM_TYPE, AUTHORING_AND_PLAY_MODE, TRIGGER_BLOCKS)
- **FFA world building:** `docs/planning/rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`, `IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`
- **FFA boards on build walls:** `docs/planning/rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`, `IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md` — wire `boardPlacementWalls(manifest, buildPieces)` into dynamic-board placement + server validation; fix baseY on placement hit targets; orphan policy A (floaters) in v1
- **FFA world-building IDEAS:** `docs/planning/rooms/free-for-all/world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md` — brainstorm/roadmap to improve (instancing, undo+soft-delete, camera collision, eased-fall/jump, 2D authoring) + expand (piece kit, prefabs/stamps, multi-select, interactive/logic pieces, AI prompt→structure, versioned/forkable worlds). Sequenced Wave 0–3; maps to Frame parity gaps
- **FFA escape rooms → 6.1:** `docs/planning/rooms/free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md` — **escape-room room type** (empty 80×80 canvas, not FFA); element catalog + puzzle recipes (how X combines with Y); Phases −1–10 to trigger blocks 6.1
- **FFA features:** live captions, AI meeting notes, AI 3D objects, shared browser (Hyperbeam) — see `docs/planning/rooms/free-for-all/`
- **New features:** `docs/planning/new-features/README.md`

---

## Active implementation notes

- **Working branch:** `feature/world-building` (from `feature/live-captions`)
- **FFA world building:** Phases 1–10 complete (contracts, API, `useBuildPieces`, render/ghost, height-aware walls, `groundHeightAt`, ramps, 2D footprints, caps/E2E). Engine: `packages/room-engine/src/build.ts`, `free-for-all-build-mask.ts`. Flags: `ENABLE_FREE_FOR_ALL_BUILDING` / `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING` (default off).
- **FFA boards on build walls:** Complete (Phases 1–5) — `boardPlacementWalls`, server/client wiring, orphan policy B, E2E in `boards-on-build-walls.spec.ts`.
- **FFA room:** `createFreeForAllManifest()`, perimeter `ffa-perim-*` + radial clamp, `PerimeterCylinder` render, central cube walls, open join + password, `useDynamicWallAnchors`.
- **Room-type flags:** `getRoomTypeFeatureFlags()` gates classroom tools, building, dynamic boards, etc. Non-classroom rooms skip classroom HUD/API by default.
- **Movement:** `useAvatarMovement` + `resolveWallCollisionsV2` + `collectCollisionWalls` + `groundHeightAt` when build pieces present.

---

## Stack (current)

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 16, React 19, Vercel |
| 3D | Three.js, R3F, Drei |
| Backend | Fastify 5, Koyeb |
| DB | MongoDB Atlas + Mongoose |
| Realtime | LiveKit data channels |
| Auth | Clerk |
| Storage | Cloudflare R2 |

---

## Key env flags (see `.env.example` for full matrix)

- `ENABLE_FREE_FOR_ALL` / `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL`
- `ENABLE_FREE_FOR_ALL_BUILDING` / `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING`
- `ENABLE_ROOM_OBJECTS` / `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS`
- `ENABLE_CLASSROOM_LESSONS`, `ENABLE_BREAKOUT_PODS`, `ENABLE_AI_MEETING_NOTES`, `ENABLE_AI_OBJECT_GENERATION`, `ENABLE_SHARED_BROWSERS`, `ENABLE_LIVE_CAPTIONS`

---

## Production URLs

- API: https://content-jeanine-juchheim-71a4f131.koyeb.app
- Frontend: https://3d-space-seven.vercel.app

---

## Relationships (invariants)

- Room manifest is static per room type; **build pieces** and **dynamic wall anchors** are separate persisted layers merged at runtime.
- `buildPieceColliders(wall)` emits the same wall shape as `manifest.walls` (+ `baseY` on collider); `collectCollisionWalls` unions them for movement.
- Board placement validates via `validateDynamicBoardPlacement({ walls }, …)` — includes build walls. Destroying a build wall with a board returns 409 (`build-wall-has-boards`).
- `DynamicWallAnchor` stores absolute `position`/`normal`; `wallId` is for placement validation only.
- Build piece `id` (`build:wall:ix,iz:level:edge`) is **unique per room only** (no roomId in the id) — DB/in-memory stores must key by `{roomId,id}`, never `id` alone.
- Build wall render (`wallMeshTransform`) must stay coplanar with its collider (`wallSegmentForEdge`): e/w run along Z, n/s along X, `rotationY: 0`.
- Wall objects / anchors: classroom uses manifest anchors; FFA merges dynamic anchors for create + render.

---

## Recent work

- **2026-05-31:** **Build hardening:** API `tsc` + full `npm run build` green — Mongoose `Models` includes `LogicPiece`/`LogicState`/`EscapeSession`; `playModeEnabled: false` in `roomSettings()`; `defaultLogicConfig()` via `LogicConfigSchema.parse({})` in memory + Mongo repos (replaces invalid `config ?? {}`).
- **2026-05-31:** Escape-room **logic Phase 10 (authoring product 6.1) DONE**: channel picker, `LogicInspector`, mode options, debug overlay, starter kit stamp, win-zone, author guide + E2E. Contracts: `LogicChannelState` + `LogicConfigInput`.
- **2026-05-31:** Escape-room **logic Phase 6**: `channel-bus.ts` (pulse/toggle/whileHeld + latch/momentary/toggle consumers), signal route drives channel→door, client applies `room.logic.state.v1` + button emissive pulse. Next: Phase 7 teleporter.
- **2026-05-31:** Escape-room **logic Phase 9**: pressure plate (`whileHeld`), proximity zone, timer scheduler (`triggerChannelId` / session start), `requireAll` AND; fixed channel release + emitter stepOff/proximityExit no-op on pulse.
- **2026-05-31:** Escape-room **logic Phase 8**: light consumer — `isLogicLightOn`, nearest-N logic lights, button→light latch.
- **2026-05-31:** Escape-room **logic Phase 7**: teleporter pads — `applyTeleporterSignal`, `teleportTo` on signal response, `teleportToPosition` on client, dim mesh when disarmed; engine `teleportTarget` / `teleportLandingPosition` via `buildGroundHeightContext`.
- **2026-05-31:** Escape-room **logic Phase 6**: channel bus + button→door.
- **2026-05-31:** Escape-room **logic Phase 5**: door colliders + `PATCH .../logic-pieces/:id/state`.
- **2026-05-31:** Escape-room **logic Phase 4**: `EscapeSession` + timer HUD + reset.
- **2026-05-31:** Escape-room **logic Phase 3**: detection helpers, `useLogicDetection`, play-mode `LogicLayer`, dev HUD, signal API.
- **2026-05-31:** Escape-room **logic Phase 2**: `BuildLogicPiece` + `LogicState` contracts, `logic-pieces` API + `room.logic.*` realtime, `useLogicPieces` + `LogicControls` / `LogicPlacementController` (author-only, placeholder meshes).
- **2026-05-31:** Escape-room **authoring Phases 0–1 complete**: undo/redo (`useBuildHistory` + ref fix for conflict no-op); stamps (`buildStamps.ts`); `doorway`/`window`/`light` kinds + colliders; nearest-N lights in `BuildLayer`; coachmark + rejection tooltips + empty-canvas hint; play mode (`playModeEnabled`, `room.play-mode.v1`). Next: `IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md`.
- **2026-05-31:** Escape-room **authoring Phase 0.1 + 1** (initial): play mode + undo baseline.
- **2026-05-31:** Escape-room **Phase 5** (validation): Playwright `apps/web/test/escape-room.spec.ts`, `ENABLE_ESCAPE_ROOM` in `playwright.config.ts`; IMPL validation checklist complete. Phase −1 room type shipped end-to-end.
- **2026-05-31:** Escape-room **Phase 4** (web): `CLIENT_TUNING.enableEscapeRoom`, `buildingEnvEnabled()`, Lobby registry + classroom-style create/join, `RoomClient` Author/Player labels + build gate; tests `building-gate.test.ts`, `escape-room-client.test.ts`.
- **2026-05-31:** Escape-room **Phase 3** (API): `enableEscapeRoom`, `escapeRoomSettings()`, room create dispatch, Mongoose enum, `buildingEnvEnabled()` + `assertDynamicBoardsSupported()`; tests `apps/api/tests/routes/escape-room.test.ts`.
- **2026-05-31:** Escape-room **Phase 2** (room-engine): `createEscapeRoomManifest()` 80×80 empty canvas, `ESCAPE_ROOM_*` constants, `isEscapeRoomManifest()` in `escape-room.ts`; tests prove FFA hall mask does not apply; `floorYFromZ` → 0.
- **2026-05-31:** Escape-room **Phase 1** (contracts): `RoomTypeSchema` + `"escape-room"`, `RoomTypeFeatureFlags.logic`, `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS`, `getRoomTypeFeatureFlags("escape-room")`; tests `packages/contracts/tests/escape-room.test.ts`; OpenAPI regen; `ENABLE_ESCAPE_ROOM` / `NEXT_PUBLIC_ENABLE_ESCAPE_ROOM` in `.env.example` files (default off).
- **2026-05-31:** Drafted 3 escape-room IMPL docs in `docs/planning/rooms/escape-room/`: `IMPL_ESCAPE_ROOM_ROOM_TYPE.md` (Phase −1: type/manifest/flags + generalize FFA-only build & dynamic-board gates to feature flags), `IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md` (Phases 0–1: undo, stamps, doorway/window/glass, lights, play mode), `IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md` (Phases 2–10: `BuildLogicPiece` + `LogicState` + `room.logic.*` channel bus, detection, `EscapeSession`, door/button/teleporter/light, emitters, 6.1 UX). Key arch: logic is a stateful sibling of static `BuildPiece`; server-authoritative channel resolution; door = conditional collider in `collectCollisionWalls`.
- **2026-05-31:** Drafted `docs/planning/rooms/escape-room/PLAN_ESCAPE_ROOM_ROOM_TYPE.md` — `"escape-room"` type, `createEscapeRoomManifest()` 80×80 empty canvas (no outer walls v1), Author/Player roles, invite join, feature flags + escape build mask, reuses BuildPiece + dynamic boards. — 11-phase ordered path to IDEAS §6.1 (escape rooms): authoring → play mode → `BuildLogicPiece` + `room.logic.*` → detection → session/timer → door/button/channel → teleporter/light → plate/zone/timer emitters → 6.1 wiring UX + starter kit.
- **2026-05-31:** Drafted `IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md` — grounded improve+expand ideas for world building (Wave 0 polish: instancing/undo/eased-fall; Wave 1 prefabs+kit; Wave 2 play layer; Wave 3 logic/AI/sharing). Tagged effort/impact, mapped to Frame parity gaps.
- **2026-05-31:** Fixed two build bugs. (1) **Walls not placing (500s):** `buildPieceStableId` is room-agnostic but the `buildpieces.id` index was globally `unique` → the first room to claim a grid slot blocked every other room (room-scoped upsert misses the foreign doc, insert collides on `id_1` E11000 forever; retry loop couldn't help). Fix: `id` no longer globally unique; uniqueness is `{roomId,id}` + existing `{roomId,kind,cell,level,edge}`; `MongoRepository.migrateBuildPieceIndexes()` drops legacy `id_1` on startup (called in `buildApp`→`buildRepository`); also fixed the room-agnostic key in `MemoryRepository.buildPieces` (now `buildPieceKey(roomId,id)`), and cleared the dup `roomId` index warning. (2) **Boards perpendicular to build walls:** `wallMeshTransform` (extracted to `apps/web/lib/buildWallMesh.ts`) rotated e/w walls by `π/2` *on top of* an already world-oriented size, drawing the visible wall along X while the collider + board target ran along Z. Fix: `rotationY: 0` always; regression test `apps/web/tests/buildWallMesh.test.ts`.
- **2026-05-31:** `hitStrikesFacingFace` in `DynamicBoardPlacementTarget` — reject padded build-wall hits on end-caps/top/bottom so corner rays don't place boards on perpendicular walls.
- **2026-05-31:** Fixed board placement regression on merged build walls — edge-based normals, build mesh raycast passthrough during placement, occlusion skip for dynamic anchor wallId.
- **2026-05-31:** Boards-on-build-walls Phase 3 — client threads `boardPlacementWalls` into `DynamicBoardPlacementTargets`; baseY fix for hit target + vertical clamp.
- **2026-05-31:** Boards-on-build-walls Phase 2 — server validates dynamic board placement against `boardPlacementWalls` (build + manifest walls); 6 API route tests.
- **2026-05-31:** Boards-on-build-walls Phase 1 — `boardPlacementWalls` engine helper + unit tests (manifest walls + wall pieces only; floors/ramps excluded).
- **2026-05-31:** Drafted `PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md` + `IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md` — integration-only: shared `boardPlacementWalls`, client targets, server validator, baseY fix; no new entity/schema.
- **2026-05-30:** FFA world-building Phases 1–10 shipped (see world-building IMPL validation checklist).
- **2026-05-30:** API `app.ts` decomposition complete (268 tests green).

---

## Maintenance Rules

1. Keep **this file** under ~20 KB: project summary, doc index, active branch/flags, short invariants, **last ~5–10** dated bullets in Recent work.
2. Append long dated entries (bug fixes, “drafted PLAN X”, implementation blow-by-blow) to **`.cursor/memory-archive.md`**, not here.
3. Update `MVP_STATUS.md` when required by deliverables.
4. Keep `.env.example` files in sync when adding tunable config.
