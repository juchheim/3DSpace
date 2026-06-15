# IMPL — World Builder placement robustness

_Companion to `PLAN_WORLD_BUILDER_PLACEMENT.md`. Last updated: 2026-06-15._

Status legend: ✅ done · 🚧 in progress · ⬜ not started

---

## Phase 1 — Commit what the ghost shows ✅ (shipped 2026-06-15)

### 1a. Asset placement: commit at the click point ✅
File: `apps/web/components/AssetPlacementController.tsx`

- `handleClick` now commits at the click's own ground point (`e.point.x/z`)
  instead of the last-hover `ghostPos`, and no longer early-returns when
  `ghostPos` is `null`. It also refreshes `ghostPos` to the click point.
- `handlePointerDown` seeds `ghostPos` (when not in fine mode) so a tap with no
  preceding `pointermove` still previews and places.

Why: a `pointerout` (cursor brushing a room object/board overlay) or a no-move tap
used to leave `ghostPos` null, silently dropping the click (root cause **B1**).

```ts
const handleClick = useCallback(
  (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (finePlacement) {
      setDraftPos({ x: e.point.x, z: e.point.z });
      setGhostPos(null);
      return;
    }
    // Commit at the click's own ground point — never depend on stale hover state.
    const x = e.point.x;
    const z = e.point.z;
    setGhostPos({ x, z });
    onPlace({ x, y: resolveGroundY(x, z), z }, yaw);
  },
  [finePlacement, onPlace, resolveGroundY, yaw]
);
```

### 1b. Build placement: commit the previewed target ✅
File: `apps/web/components/BuildPlacementController.tsx`

- Added `currentGhostTargetRef: useRef<BuildPlacementTarget | null>`.
- `updateGhostFromHit` writes the resolved target to the ref on the normal
  (non-destroy, non-stamp) branch, and clears it on the destroy/stamp branches.
- `handleClick`'s single-piece branch commits `currentGhostTargetRef.current`
  (re-validated by `commitPlacement`) and only falls back to recomputing from the
  click raycast if the ref is somehow empty.

Why: the ghost and the commit used to come from two separate raycasts, so a green
ghost could commit nothing / a different cell (root cause **B2**). The ref makes
placement WYSIWYG; `commitPlacement` still re-validates, so a stale ref can never
place an illegal piece.

### Phase 1 validation ✅
- `npm run typecheck -w @3dspace/web`
- `npx vitest run apps/web/tests/buildPlacement.test.ts`

---

## Phase 2 — Cell-based, stable target resolution ✅ (shipped 2026-06-15)

Goal: the ghost is a pure function of cursor world `X/Z` + avatar standing level,
so it stops flickering between the plane and existing piece tops (**A1**), and the
plane stops jumping a whole level from `Y` noise (**A2**).

### 2a. Resolve build target from cell, not hit mesh ✅
File: `apps/web/components/BuildPlacementController.tsx`

- New `resolveSurfaceForPlacement(x, z)`: `findSurfacePieceAtCell(pieces,
  worldToCell(x, z), localAvatarPosition.y)` then `effectiveSurfacePiece(...)`.
  This derives the surface from the **cell**, not from which mesh the ray hit, so
  the level/edge no longer flips as the cursor crosses a piece edge.
- `handleSurfacePointer`, `handlePointerDown`, and the `handleClick` fallback now
  call `resolveSurfaceForPlacement` and pass `placementPlaneY` as `hitY` (the level
  comes from the resolved surface or `baseLevel`, so `event.point.y` is no longer
  read). `baseLevel`/`targetFromHit` use the stable `standingLevel`.
- The **destroy** tool still picks the exact piece by ray (`surfacePiece` param).
- **Pieces are now raycast-transparent for every non-destroy tool**
  (`pointerEventsPassThrough = placementActive ? !destroyToolActive :
  boardPlacementPassthrough`). With pieces transparent, the cursor's world `X/Z`
  always comes from the build plane — removing the residual ~0.3 m parallax jump
  at floor edges where the ray alternated between a piece top and the plane.
  (Subsumes the earlier fixtures-only passthrough.)

### 2b. Stabilize the placement plane level ✅
File: `apps/web/lib/useStablePlacementLevel.ts` (new), used by
`BuildPlacementController` and `RoomView3D`.

- `useStablePlacementLevel(avatarY)` returns the build level with hysteresis: an
  adjacent-level switch requires clearing the half-level midpoint by
  `LEVEL_HYSTERESIS` (0.18 of a level); large jumps (≥2 levels: teleport/respawn)
  snap immediately. Transient `Y` noise near a boundary no longer flips the plane
  3 m and jumps the ghost.
- `BuildPlacementController.standingLevel` and `RoomView3D`'s
  `assetInterceptPlaneY` / asset ground resolver now use it (replacing raw
  `avatarStandingLevel(y)`).

### Phase 2 validation ✅
- `npm run typecheck -w @3dspace/web`
- `npx vitest run apps/web/tests/buildPlacement.test.ts apps/web/tests/useStablePlacementLevel.test.ts`
  (43 pass; new `useStablePlacementLevel.test.ts` covers band-hold, band-clear,
  downward damping, and large-jump snap).
- Manual (recommended): hover across floor/ramp edges and near level boundaries;
  ghost stays put. Build on upper levels reached via ramp.

---

## Phase 3 — Interception passthrough ✅ (shipped 2026-06-15)

Goal: while placement is active, the placement plane reliably owns the pointer, so
room objects / boards can't steal the ray (**A3**, **B4**).

### 3a. Raycast-transparent room objects during placement ✅
Files: `apps/web/components/RoomObjectMesh.tsx`,
`apps/web/components/RoomObjectsLayer.tsx`, `apps/web/components/RoomView3D.tsx`.

- New `interactionDisabled` prop threaded `RoomView3D → RoomObjectsLayer →
  RoomObjectMesh`. It's set when **build mode is enabled OR an asset placement is
  active** (`Boolean(assetPlacement) || Boolean(buildScene?.buildMode.enabled)`).
- When `interactionDisabled`, `RoomObjectMesh` drops **all** root-group pointer
  handlers (`onPointerDown`/`onWheel`/`onPointerOver`/`onPointerOut`). With no
  handlers, R3F removes the object (and its whole subtree) from the interaction
  list, so the ray passes through to the placement plane behind it — the ghost
  follows and clicks place even with the cursor directly over an object.
- It also stops rendering the object's `.room-object-html` select label so that
  DOM element can't capture the click either.
- `PlacedChairsLayer` needed no change: it only attaches a handler in the
  **destroy** tool (`onDeleteChair`), which is exactly when clicking a chair
  *should* delete it; in every non-destroy placement mode chairs have no handlers
  and are already ray-transparent.

### 3b. Interactive `<Html>` overlays passthrough during placement ✅
Files: `apps/web/components/RoomClient.tsx`, `apps/web/app/globals.css`.

- `RoomClient` toggles a `wb-placement-active` class on `document.body` while
  build mode is enabled or an asset placement is active (cleaned up on exit).
- `globals.css` adds a scoped override forcing `pointer-events: none` on
  `.wall-object-html`/`.room-object-html` **and their descendants** under
  `body.wb-placement-active`, so board cards (and any remaining object overlays)
  can't swallow placement clicks. The `*` + `!important` is justified because the
  rule only applies during placement, when board/object DOM interaction is
  intentionally suspended.

### 3c. (Optional) Canvas-level math-plane sampler ⬜ (not needed)
- Replace the per-controller invisible R3F plane with one canvas-level
  `pointermove`/`click` listener that intersects a math `THREE.Plane` via a
  `Raycaster`. Fully decouples placement input from scene geometry and the R3F
  event graph. Bigger change; skipped — 3a/3b remove the known interceptors.

### Phase 3 validation ✅
- `npm run typecheck -w @3dspace/web` (clean).
- `npx vitest run apps/web/tests/buildPlacement.test.ts apps/web/tests/useStablePlacementLevel.test.ts`
  (43 pass — no placement-logic regression).
- Manual (recommended): place pieces/objects directly over a room object and over
  a board card; both must place. Then exit placement and confirm normal
  object/board clicks (select, grab, poll buttons) work again.

---

## Phase 4 — Input-timing cleanup ✅ (shipped 2026-06-15)
File: `apps/web/components/BuildPlacementController.tsx`.

### 4a. One-shot drag→click suppression ✅
- Replaced the `DRAG_CLICK_SUPPRESS_MS` (250 ms) time window + `suppressClickUntilRef`
  with a boolean `ignoreNextClickRef`:
  - **set** on drag-end (`handlePointerUp`, when `didDragRef` or an image-floor rect
    committed) — the drag's trailing synthetic click must not place an extra piece;
  - **consumed** by the very next `handleClick` (clears the flag and returns);
  - **cleared** at the start of every `handlePointerDown` so it can never poison a
    later genuine click (the old window could expire too early *or* `didDragRef`
    could linger and silently eat the next real click if no trailing click arrived).
- `handleClick` no longer reads/resets `didDragRef` (the one-shot flag owns this).

### 4b. Per-target placement throttle ✅
- `commitPlacement` / `commitStampPlacement` now throttle only a **repeat of the
  same target key** within `BUILD_PLACEMENT_RATE_LIMIT_MS` (100 ms), tracked via
  `lastSinglePlaceKeyRef` (`placementTargetKey` for single pieces, `stamp:ix:iz`
  for stamps). A *distinct* placement immediately after another is never rejected
  (root cause **B3**); the throttle now only absorbs a double-fired event on the
  same cell, so the "Slow down…" status no longer fires on legitimate rapid clicks.

### Phase 4 validation ✅
- `npm run typecheck -w @3dspace/web` (clean).
- `npx vitest run apps/web/tests/buildPlacement.test.ts apps/web/tests/useStablePlacementLevel.test.ts`
  (43 pass; `tryAcquireBuildPlacementSlot` helper untouched).
- Manual (recommended): rapidly click several different cells (all place); drag to
  paint a row then immediately single-click a new cell (the new click places, no
  dropped first click); single-click the exact same cell twice fast (second is a
  no-op, no "Slow down…").

---

## Rollback
Every phase is self-contained component / CSS edits — revert the listed files to
undo. No data or schema migration is involved at any phase. Phase 3 specifically:
revert the `interactionDisabled` threading and the `wb-placement-active` body
class + CSS rule.
