# 3DSpace Session Memory

Last updated: 2026-05-31 (boards-on-build-walls Phase 1 — `boardPlacementWalls` helper)

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
- **Room types:** `docs/planning/rooms/workforce-training/`, `docs/planning/rooms/free-for-all/`
- **FFA world building:** `docs/planning/rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`, `IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`
- **FFA boards on build walls:** `docs/planning/rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`, `IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md` — wire `boardPlacementWalls(manifest, buildPieces)` into dynamic-board placement + server validation; fix baseY on placement hit targets; orphan policy A (floaters) in v1
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
