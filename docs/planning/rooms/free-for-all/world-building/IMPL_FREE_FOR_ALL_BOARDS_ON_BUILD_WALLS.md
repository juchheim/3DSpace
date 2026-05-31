# Implementation — Boards on Build Walls (Free-for-All Room Type)

Plan: [`./PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`](./PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md)
Joins: [`./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`](./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md) (build pieces) + the existing dynamic-wall-anchor (boards) stack.
Closest patterns to clone: nothing new — this **reuses** the dynamic-board placement path and the build-piece collider derivation already in the tree.
Branch target: `feature/ffa-boards-on-build-walls`
Last updated: 2026-05-31

---

## Status / Scope

- **Room type:** Free-for-All only (both building and dynamic boards are already FFA-gated; no new flag).
- **Goal:** make `wall` build pieces valid surfaces for `DynamicWallAnchor` (board) placement, reusing the entire board entity/storage/realtime/content pipeline unchanged.
- **Surface scope:** vertical faces of `kind === "wall"` build pieces only. Floors and ramps are not board-able in v1.
- **Net change:** (1) a shared engine helper that unions manifest walls with build-wall colliders; (2) thread that union into the 3D placement targets; (3) thread it into the server placement validator; (4) fix one baseY assumption so elevated built walls place correctly; (5) pick an orphan policy.
- **Explicit non-goals:** multi-cell board surfaces, boards on floors/ramps, 2D placement, content-type changes, non-FFA support. (See plan §1.3.)

This is small enough to land in one or two PRs. Phases below are ordered so each is independently verifiable.

---

## Codebase context (pre-implementation state)

Confirmed by reading the tree on 2026-05-31:

- **Build wall collider** — [`packages/room-engine/src/build.ts`](../../../../../packages/room-engine/src/build.ts): `buildPieceColliders(piece)` returns `{ walls: WallCollider[]; floorTop?; ramp? }`. For `kind === "wall"` it returns one `WallCollider` = `RoomManifest["walls"][number] & { baseY }` with `id` = `buildPieceStableId(piece)` (`build:wall:ix,iz:level:edge`), `label: "build-wall"`, `start`/`end` at `y = baseY = levelToY(level)`, `height: BUILD_WALL_HEIGHT (2)`, `thickness: BUILD_WALL_THICKNESS (0.2)`, `anchorIds: []`, `passable: false`. Floors return `floorTop` only; ramps return `ramp` only (no walls). `collectCollisionWalls(manifest, pieces)` already unions `manifest.walls` (via `manifestWallToCollider`) with build-piece walls for movement.
- **Board placement targets (3D)** — [`apps/web/components/RoomView3D.tsx`](../../../../../apps/web/components/RoomView3D.tsx):
  - `DynamicBoardPlacementTargets({ walls, placement })` (~line 1938) renders a `DynamicBoardPlacementTarget` per wall, filtered by `wall.passable !== true && wall.height >= DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M`.
  - `DynamicBoardPlacementTarget` (~line 1956) positions its click box at `position = [(start.x+end.x)/2, wall.height/2, (start.z+end.z)/2]` — **the `wall.height/2` is the baseY bug** (assumes base at y=0).
  - `dynamicBoardRequestFromWallClick(wall, point, normal, boardSize)` (~line 1902) projects the click onto the wall, computes `width = min(boardSize.width, span.length)`, `height = min(boardSize.height, wall.height)`, and `centerY = clamp(point.y, height/2, wall.height − height/2)` — **also baseY-naive**. Returns a `CreateDynamicWallAnchorRequest` with absolute `center`/`normal`.
  - Rendered inside `RoomGeometry` (~line 1509) with `walls={manifest.walls}`. `RoomGeometry` receives `dynamicBoardPlacement` but not `buildScene`.
- **Scene wiring** — `RoomGeometry` (~line 1425) and `BuildPlacementController` (~line 458) are **siblings** under the same `RoomScene` render in `RoomView3D`. That parent has both `dynamicBoardPlacement` and `buildScene` (`{ pieces, piecesById, ... }`) in scope. `mergedManifest` (= `manifest` + dynamic anchors) is built at ~line 407.
- **Server validator** — [`packages/room-engine/src/index.ts`](../../../../../packages/room-engine/src/index.ts): `validateDynamicBoardPlacement(manifest: { walls }, existingAnchors, proposed: { wallId, center, width }, options?)` does `manifest.walls.find(w => w.id === proposed.wallId)` → `wall-not-found` if missing, else projects spans via `projectPointAlongWall` (geometry-agnostic) and returns `overlaps-anchor` on conflict.
- **Board routes** — [`apps/api/src/routes/wall-objects.ts`](../../../../../apps/api/src/routes/wall-objects.ts): `POST /v1/rooms/:roomId/dynamic-wall-anchors` (~line 262) and `PATCH …/:anchorId` (~line 320) call `validateDynamicBoardPlacement(manifest, existingAnchors, …)`. Both `requireRoomAccess` (returns `{ room, manifest }`), FFA-gate via `room.type !== "free-for-all"`, and cap at `MAX_DYNAMIC_ANCHORS_PER_ROOM = 32`. Entity persisted via `repository.createDynamicWallAnchor`.
- **Build piece loading (server)** — [`apps/api/src/routes/build-pieces.ts`](../../../../../apps/api/src/routes/build-pieces.ts): `repository.listBuildPiecesForRoom(roomId)` returns `BuildPiece[]`; `assertBuildingEnabled(config, room)` already exists.
- **Client board hook** — [`apps/web/lib/useDynamicWallAnchors.ts`](../../../../../apps/web/lib/useDynamicWallAnchors.ts): `dynamicBoards.create(body)`, `.remove(id)`, `.anchors`, `.handleRealtimeMessage`. Anchors store absolute `position`/`normal`; rendering merges `[...manifest.wallAnchors, ...dynamicBoards.anchors]`.
- **Build pieces in client scene** — [`apps/web/components/RoomClient.tsx`](../../../../../apps/web/components/RoomClient.tsx): `buildScene` (~line 448) carries `pieces`/`piecesById`/`actions`; passed to `RoomView3D` (~line 2212). `dynamicBoardPlacement` (~line 317) passed at ~line 2197.

---

## Design decisions locked for this implementation

1. **No new entity, schema, route, or realtime message.** Boards on built walls *are* `DynamicWallAnchor`s. The only thing that changes is the set of walls considered valid placement surfaces.
2. **One shared wall-set helper.** `boardPlacementWalls(manifest, buildPieces)` (engine) is the single source of truth for "which walls can host a board," imported by the client placement layer and the server validator so they never disagree.
3. **Absolute placement, derived `wallId`.** The board still stores absolute `center`/`normal`; `wallId` is recorded at placement time from the chosen surface (a `build:wall:…` id for built walls). Rendering never re-resolves the wall.
4. **baseY-correct placement.** Vertical hit-target and clamp are computed from `min(start.y, end.y)`, making room walls (base 0) a no-op and built walls (base `levelToY(level)`) correct.
5. **Orphan policy A (accept floaters) ships first.** Boards are not auto-removed when a wall is destroyed; deterministic build ids make re-building re-attach the floating board. Policy B (block destroy while occupied) is a documented fast-follow built on the same `anchor.wallId` lookup. (Plan §4.)
6. **Floors/ramps are never board-able.** Only `kind === "wall"` pieces contribute to `boardPlacementWalls`; floor/ramp colliders have no `walls` entry, so this is structural, not a runtime filter.

---

## Phased implementation

### Phase 1 — Engine: the shared wall-set helper

**`packages/room-engine/src/build.ts`** (or `index.ts`, re-exported) — add:

```ts
/**
 * The walls a dynamic board may be placed on: the room's manifest walls plus the
 * vertical faces of build `wall` pieces. Shared by the client placement targets and
 * the server placement validator so both ends agree on valid surfaces.
 *
 * Returns plain `Wall` (RoomManifest["walls"][number]) — build wall colliders carry an
 * extra `baseY` but are otherwise assignable, and consumers that need the base read it
 * off `start.y`/`end.y`.
 */
export function boardPlacementWalls(
  manifest: { walls: RoomManifest["walls"] },
  buildPieces: BuildPiece[]
): RoomManifest["walls"] {
  const buildWalls = buildPieces
    .filter((piece) => piece.kind === "wall")
    .flatMap((piece) => buildPieceColliders(piece).walls); // floors/ramps yield []
  return [...manifest.walls, ...buildWalls];
}
```

Notes:
- `WallCollider` extends `RoomManifest["walls"][number]` with `baseY`, so the return type is structurally fine. Built walls already have `passable: false` and `height: 2`, so they pass the placement filter (`passable !== true && height >= 0.75`).
- Keep it pure; no manifest mutation.

**Tests** (`packages/room-engine/tests`): `boardPlacementWalls` includes one entry per `wall` piece and **zero** for `floor`/`ramp` pieces; the build wall entry's `start.y === levelToY(level)`.

*Exit criteria:* helper exported + unit-tested; nothing wired yet.

---

### Phase 2 — Server: validate against built walls

**`apps/api/src/routes/wall-objects.ts`** — in both the `POST` and `PATCH` dynamic-wall-anchor handlers:

1. Load build pieces alongside the manifest:
   ```ts
   const buildPieces = await repository.listBuildPiecesForRoom(params.roomId);
   const placementWalls = boardPlacementWalls(manifest, buildPieces);
   ```
2. Pass the merged set to the validator (the only change to the call):
   ```ts
   const validation = validateDynamicBoardPlacement(
     { walls: placementWalls },
     existingAnchors,
     { wallId: body.wallId, center: body.center, width: body.width }
   );
   ```
   `validateDynamicBoardPlacement` itself is unchanged — it already accepts `{ walls }` and its `projectPointAlongWall` math is wall-shape-agnostic.
3. Import `boardPlacementWalls` from `@3dspace/room-engine` (next to the existing `validateDynamicBoardPlacement` import).

Leave everything else (FFA gate, cap, entity build, realtime message) as-is. The board's `wallId` will simply be a `build:wall:…` id for built-wall placements, which is fine — it's stored and used only for future overlap scoping.

> **Why load pieces unconditionally:** building and boards are both FFA-only, and `listBuildPiecesForRoom` is a single indexed query (`{ roomId }`). If building is disabled for the room the list is empty and `boardPlacementWalls` collapses to `manifest.walls` — identical to today.

**Tests** (`apps/api`): place a board on a build-wall id → 200/201; place off any wall → still rejected; place two overlapping boards on the same build wall → second rejected (`overlaps-anchor`); placing on a non-existent `build:wall:…` id (piece since destroyed) → `wall-not-found`. Confirm boards on `manifest.walls` are unaffected.

*Exit criteria:* server accepts a valid built-wall board and rejects overlaps/off-wall, with no regression to room-wall boards.

---

### Phase 3 — Client: offer built walls as placement targets + baseY fix

**`apps/web/components/RoomView3D.tsx`:**

1. **Thread build walls into `RoomGeometry`.** Add a `boardPlacementWalls?: Wall[]` prop (or pass `buildScene.pieces` and derive inside). In the parent `RoomScene` render, compute once:
   ```ts
   const boardWalls = useMemo(
     () => (dynamicBoardPlacement?.active
       ? boardPlacementWalls(manifest, buildScene?.pieces ?? [])
       : manifest.walls),
     [dynamicBoardPlacement?.active, manifest, buildScene?.pieces]
   );
   ```
   Pass `boardWalls` down so `DynamicBoardPlacementTargets` receives `walls={boardWalls}` instead of `walls={manifest.walls}` (~line 1510).

2. **baseY fix in `DynamicBoardPlacementTarget`** (~line 1968): position the click box at the wall's true vertical center.
   ```ts
   const baseY = Math.min(wall.start.y, wall.end.y);
   const position = useMemo(() => [
     (wall.start.x + wall.end.x) / 2,
     baseY + wall.height / 2,
     (wall.start.z + wall.end.z) / 2
   ], [wall]);
   ```

3. **baseY fix in `dynamicBoardRequestFromWallClick`** (~line 1920): clamp the board center within the wall's real span.
   ```ts
   const baseY = Math.min(wall.start.y, wall.end.y);
   const centerY = clamp(point.y, baseY + height / 2, baseY + wall.height - height / 2);
   ```

Room walls have `baseY = 0`, so both fixes are no-ops for them.

> `DynamicBoardPlacementTarget` already pads the click-target thickness via `Math.max(wall.thickness ?? 0.08, 0.45)`, so the thin 0.2 m build walls stay easy to click. No change needed there.

**`apps/web/components/RoomClient.tsx`:** no logic change required — `buildScene.pieces` is already passed to `RoomView3D`. (Building and board placement already mutually disable each other via the existing effects at ~line 476/496, so a user is never in both modes at once.)

*Exit criteria (the feature, visibly):* in an FFA room, build a wall, enter board placement, the built wall highlights and accepts a board ghost; click commits; the board appears in a second tab and survives refresh. Place on a level-1 (elevated) built wall and confirm the board lands at the correct height.

---

### Phase 4 — Orphan policy + polish

- **Orphan policy A (ship):** no code. Document that destroying a built wall leaves any board floating at its world position, and that re-building the same cell/edge/level (same deterministic `wallId`) visually re-attaches it.
- **Orphan policy B (optional fast-follow):** in `DELETE /v1/rooms/:roomId/build-pieces/:pieceId`, before removing a `wall` piece, check for dynamic anchors whose `wallId === pieceId`; if any exist, reject with a 409 (`buildWallHasBoards`, mirroring the existing "anchor is busy" pattern). Add `listDynamicWallAnchorsForRoom` filtering by `wallId` (or filter in the route). Surface a clear client message ("Remove the board first").
- **Overlay line-of-sight (optional):** include build wall colliders in the `walls` array passed to `AnchorMesh` so boards on built walls occlude correctly behind other built walls. Source from the same `boardPlacementWalls`/`collectCollisionWalls` derivation.
- **Size hint (optional):** in the board placement panel, note that boards on built walls are capped to the wall's ~2 m × 2 m face.

*Exit criteria:* chosen orphan policy is implemented and tested; polish items either done or explicitly deferred in the PR description.

---

### Phase 5 — Tests & E2E

- **Engine unit:** `boardPlacementWalls` content (walls only, baseY correct); `validateDynamicBoardPlacement` accepts built-wall placement and rejects overlap on the same built wall.
- **API:** the Phase 2 cases (accept/reject/overlap/missing-wall) + no regression to room-wall boards + (if policy B) destroy-while-occupied 409.
- **Web E2E (Playwright, extend [`apps/web/test/world-building.spec.ts`](../../../../../apps/web/test/world-building.spec.ts) or the boards spec):** two contexts — A builds a wall, places a board on it; B sees the board; refresh persists; placing a second overlapping board on the same built wall is rejected; (if policy B) A cannot destroy the wall until the board is removed.

*Exit criteria:* all suites green; preview screenshots of a board on a ground-level and an elevated built wall.

---

## Files-to-touch summary

**New**
- *(none required)* — optionally a small test fixture file.

**Modified**
- `packages/room-engine/src/build.ts` (or `index.ts`) — add + export `boardPlacementWalls(manifest, buildPieces)`; add unit tests in `packages/room-engine/tests`.
- `apps/api/src/routes/wall-objects.ts` — load build pieces and validate against `boardPlacementWalls(manifest, pieces)` in `POST` and `PATCH` dynamic-wall-anchor handlers; import the helper. *(Phase 4B only:* guard build-piece `DELETE` against attached boards.)*
- `apps/web/components/RoomView3D.tsx` — derive `boardWalls` in the scene scope, pass to `DynamicBoardPlacementTargets`; baseY fix in `DynamicBoardPlacementTarget` position and in `dynamicBoardRequestFromWallClick` vertical clamp.
- `apps/api/tests/*` and `apps/web/test/*` — coverage per Phase 5.
- *(Phase 4B only)* `apps/api/src/repository.ts` (+ in-memory) and/or `apps/api/src/errors.ts` — anchor-by-`wallId` lookup + `buildWallHasBoards` error.

**Untouched (by design)**
- `DynamicWallAnchorSchema`, the dynamic-wall-anchor Mongoose model, `useDynamicWallAnchors.ts`, the `room.board.*` realtime messages, and the entire wall-object content pipeline.

---

## Risks during implementation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Client offers a built wall the server won't validate (or vice-versa) → confusing 422 | Med | Single shared `boardPlacementWalls` helper imported by both ends; server is authoritative and rejects cleanly with `wall-not-found` |
| baseY fix accidentally shifts room-wall boards | Low | Room walls have `baseY = 0`; fix is a literal no-op there; assert with a regression test placing on a known room wall |
| Floor/ramp colliders leak into placement targets | Low | `boardPlacementWalls` filters to `kind === "wall"`; floor/ramp colliders have empty `walls`; unit-tested |
| Orphaned boards confuse users | Med | Ship policy A with deterministic re-attach; policy B (block destroy) is a small fast-follow on `anchor.wallId` |
| Loading build pieces in the board route adds latency | Low | Single `{ roomId }`-indexed query; empty when building disabled → collapses to today's behavior |
| Boards on built walls are unexpectedly small | Low | Documented ~2×2 m cap; optional UI hint (Phase 4) |

---

## Validation evidence (fill in after implementation)

- [x] Build a wall, place a board on it; board appears in a second tab and survives refresh. (`boards-on-build-walls.spec.ts`)
- [x] Board on a level-1 (elevated) built wall lands at the correct height (baseY fix). *(engine + E2E)*
- [x] Server rejects off-wall and overlapping boards on built walls; room-wall boards unchanged.
- [x] Floors/ramps are not offered as placement targets.
- [x] Orphan policy B: destroying a wall with an attached board returns 409; destroy succeeds after board removal (`dynamic-wall-anchors.test.ts`).
- [x] Engine + API + E2E suites green; no regression to existing dynamic-board tests.
- [ ] Preview screenshots: board on a ground-level built wall and on an elevated built wall. *(manual QA)*

### Phase 4 polish (2026-05-31)

- **Orphan policy:** B (block destroy while board attached) — `assertBuildWallHasNoBoards` on wall-piece DELETE; error `build-wall-has-boards` (409).
- **Overlay line-of-sight:** build walls included in `overlayOcclusionWalls` for `AnchorMesh` + `WallObjectSurface`.
- **Size hint:** placement toast notes ~2×2 m cap when building is enabled.
- **Deferred:** policy A (accept floaters); explicit UI tooltip beyond toast copy.

---

## Dependency additions

**None.** This is pure integration over existing systems: build-piece colliders (`@3dspace/room-engine`), the dynamic-wall-anchor stack, and the dynamic-board placement UX. No new packages, schemas, collections, routes, or realtime messages.
