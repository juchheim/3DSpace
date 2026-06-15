# PLAN — World Builder placement robustness

_Last updated: 2026-06-15_

## Problem statement (from the field)

Two intermittent, "conditions unknown" complaints in World Builder:

1. **Hard to move a ghost into place** — the placement preview won't follow the
   cursor smoothly, jumps to the wrong cell/level, or disappears.
2. **Hard to get the click to actually place** — the ghost shows green/valid, but
   clicking commits nothing (or the wrong cell).

This plan covers **both** placement systems used by World Builder:

- **Build pieces** (Build tab — walls, floors, ramps, ceilings, lights, image
  floor, stamps): `apps/web/components/BuildPlacementController.tsx`
  + `apps/web/lib/buildPlacement.ts`.
- **World objects** (Objects/Scenes tabs — chairs, desks, trees, podium, scenes):
  `apps/web/components/AssetPlacementController.tsx`
  + `apps/web/lib/usePlacedWorldAssets.ts`.

Both render a ghost that follows the cursor and commit on click. Both rely on an
**invisible R3F mesh "intercept plane"** plus **scene-geometry raycasts** to map
the cursor to a world location, and both derive what to commit from **hover
state**. That shared architecture is the root of the flakiness.

## How placement works today

### Shared shape
- An invisible horizontal plane (`<mesh>` with `meshBasicMaterial visible={false}`)
  is rendered at a chosen `Y` and sized to cover the room.
- `onPointerMove` on that plane (and, for build, on each existing piece mesh)
  updates the ghost.
- `onClick` commits.
- The R3F (v9) event system raycasts **only objects that have event handlers**,
  sorted by **distance**: the closest handler-bearing mesh wins and
  `stopPropagation()` ends dispatch.

### Build pieces (`BuildPlacementController`)
- `placementPlaneY` is keyed off `avatarStandingLevel(localAvatarPosition.y)` —
  the plane rides up/down to the avatar's current build level (and to
  `levelToY(level) + BUILD_LEVEL_HEIGHT` for overhead fixtures).
- The ghost is computed in `updateGhostFromHit()` from `targetFromHit()`, using a
  `surfacePiece` that comes from **whichever mesh the ray hit** (an existing
  floor/ramp piece via `BuildLayer`'s per-piece handlers, or `null` from the
  plane).
- `handleClick()` **recomputes** a target from the click event's own raycast and
  calls `commitPlacement()`.

### World objects (`AssetPlacementController`)
- An intercept plane at `interceptPlaneY = levelToY(avatarStandingLevel(y)) + 0.003`.
- `handlePointerMove` stores `ghostPos = e.point.{x,z}`; `handlePointerOut` clears
  it; the ghost is drawn at `resolveGroundY(ghostPos)`.
- `handleClick()` reads **`ghostPos`** (the last hover point), early-returns if it
  is `null`, otherwise commits there.

## Root causes

### Symptom A — "hard to move the ghost into place"

- **A1 — Ghost flickers between the plane and existing piece tops (build).**
  `surfacePiece` is derived from *which mesh the ray hit*. The intercept plane and
  an existing floor/ramp/ceiling top sit at different `Y`, so crossing a piece
  edge flips `surfacePiece` (→ different level/edge), and the ghost jumps even
  though the cursor barely moved.
- **A2 — Plane height (and thus cursor→cell mapping) jumps with avatar level.**
  `placementPlaneY` / `interceptPlaneY` snap to `avatarStandingLevel(...)`. Near a
  level boundary, on a ramp, or with physics jitter, the plane flips a whole
  `BUILD_LEVEL_HEIGHT` (3 m). A ray hitting a horizontal plane lands at a
  different world `X/Z` when the plane's `Y` changes, so the same screen position
  resolves to a different cell.
- **A3 — Other interactive meshes/overlays steal the ray.** `RoomObjectMesh`
  attaches pointer handlers; interactive board cards and room-object inspectors
  are drei `<Html>` with `pointer-events: auto`. When the cursor is over any of
  them, the plane receives `pointerout`, the ghost stops following / disappears,
  and you "can't move it there".

### Symptom B — "the click doesn't place"

- **B1 — Asset click commits stale hover state and bails when empty.**
  `AssetPlacementController.handleClick` reads `ghostPos` and `return`s when it's
  `null`. Any `pointerout` (brushing a room object/overlay) or a no-move tap
  leaves `ghostPos` null → the click silently no-ops. It also commits the *old*
  hover point, not the click point.
- **B2 — Build "green ghost" can commit a different target than it shows.** The
  ghost and the commit come from **two separate raycasts**. The click can resolve
  to the plane instead of the piece (or a slightly different point), so a green
  ghost commits nothing / a different, possibly-rejected cell. (Same class as the
  2026-06-15 ceiling-fixture "clicks on green ghost not committing" fix, but the
  cause is general — not just ceilings.)
- **B3 — Suppression/rate-limit timing eats clicks.** `DRAG_CLICK_SUPPRESS_MS`
  (250 ms) blanket-suppresses clicks after any drag; `BUILD_PLACEMENT_RATE_LIMIT_MS`
  (100 ms) rejects quick consecutive single placements ("Slow down…"). Either can
  drop an intended click right after another action.
- **B4 — Clicks over interceptors never reach placement.** Same root as A3: a
  room object / interactive board under the cursor consumes the click (or the
  `<Html>` overlay swallows it at the DOM layer) and it never reaches the plane.

## Design principle (the "better way")

> **Resolve the placement target from the cursor's world `X/Z` (a stable plane
> intersection) and derive the surface from the *cell*, not from which mesh the
> ray hit. Preview and commit the _exact same_ resolved target.**

Two consequences:

1. **WYSIWYG commit.** The thing the green ghost shows is precisely the thing that
   gets placed — the click never independently re-derives a target.
2. **Geometry-independent input.** Existing pieces, room objects, and boards no
   longer perturb where the ghost lands, because we use `event.point.x/z`
   (always the correct world location under the cursor regardless of which mesh
   was hit) and look the surface up from the cell via `findSurfacePieceAtCell`
   (already used by the 2D / place-ahead paths).

This reuses logic that already exists and is tested (`findSurfacePieceAtCell`,
`resolveBuildTargetFromWorld`), so it converges the 3D path onto the 2D path
rather than inventing a new model.

## Phased solution

### Phase 1 — Commit what the ghost shows (low-risk, ship first)
- **Asset:** commit at the click's own `e.point`; drop the `ghostPos` null gate;
  seed `ghostPos` on `pointerdown` so a no-move tap previews + places. (Fixes B1.)
- **Build:** cache the exact `BuildPlacementTarget` the ghost is previewing in a
  ref; `handleClick` commits that cached target (re-validated in
  `commitPlacement`) instead of recomputing from the click raycast. (Fixes B2.)

These are contained, behavior-preserving for the happy path, and directly remove
the most common "click did nothing" cases.

### Phase 2 — Cell-based, stable target resolution (removes flicker)
- **Build:** stop reading `surfacePiece` from the hit mesh. Resolve from
  `event.point.x/z` + `findSurfacePieceAtCell(pieces, cell, standingY)`, preserving
  the existing "ignore floors above the standing level" rule
  (`effectiveSurfacePiece`). Same resolver for ghost + commit. (Fixes A1; removes
  B2's root entirely.)
- **Both:** add hysteresis to `avatarStandingLevel` used for the plane so tiny `Y`
  noise near a boundary doesn't flip the plane a whole level. (Fixes A2.)

### Phase 3 — Interception passthrough (placement owns the pointer)
- While a placement mode (build or asset) is active, make non-placement
  interactive layers raycast-transparent using the existing `raycast: () => {}`
  pattern (extend `pointerEventsPassThrough` to `RoomObjectsLayer` and placed
  assets), and set interactive board `<Html>` overlays to `pointer-events: none`.
  (Fixes A3, B4.)
- **Optional hardening:** drive the cursor sampler from a single canvas-level
  pointer listener doing a manual `THREE.Raycaster` against a math `THREE.Plane`,
  making placement input fully independent of scene geometry and the R3F event
  graph.

### Phase 4 (optional) — Input-timing cleanup
- Replace the 250 ms blanket click-suppress with a one-shot "ignore the next
  synthetic click after a drag" flag; only rate-limit *distinct* commits.
  (Addresses B3 without risking double-placement.)

## Non-goals
- No server/contract changes. All fixes are client placement-input only.
- No change to validation rules (`evaluateBuildPlacement`, `isBuildAllowedAt`),
  caps, undo/redo, or persistence.
- No change to the 2D top-down placement path (already cell-based; Phase 2 makes
  3D match it).

## Risks
- Build is covered by Playwright E2E; behavioral changes (Phase 2/3) need a manual
  pass in a live room (FFA + verse). Phase 1 is structured to keep the happy path
  identical.
- Phase 3 passthrough must be scoped to *active placement only*, or normal
  room-object/board interaction breaks.

## Validation
- `npm run typecheck -w @3dspace/web`
- `npx vitest run apps/web/tests/buildPlacement.test.ts`
- Manual: in an FFA/verse World Builder room, place walls/floors/ramps/ceilings,
  world objects near existing pieces, near room objects, and on upper levels;
  confirm the ghost tracks and clicks commit.

## File map
- `apps/web/components/BuildPlacementController.tsx`
- `apps/web/components/AssetPlacementController.tsx`
- `apps/web/lib/buildPlacement.ts` (already exposes `findSurfacePieceAtCell`,
  `resolveBuildTargetFromWorld`)
- `apps/web/components/RoomView3D.tsx` (plane Y, layer wiring; Phase 3)
- `apps/web/components/RoomObjectsLayer.tsx` / `PlacedChairsLayer.tsx` (Phase 3
  passthrough)
- `apps/web/app/globals.css` (Phase 3 overlay `pointer-events`)
- Impl details + checklist: `IMPL_WORLD_BUILDER_PLACEMENT.md`
