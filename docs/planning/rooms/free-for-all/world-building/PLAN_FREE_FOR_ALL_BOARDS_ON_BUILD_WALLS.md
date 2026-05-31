# Plan — Boards on Build Walls (Free-for-All Room Type)

Source room type: [`../PLAN_FREE_FOR_ALL_ROOM.md`](../PLAN_FREE_FOR_ALL_ROOM.md)
Parent features this joins: [`./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md) (build pieces) + the existing **dynamic wall boards** stack (`DynamicWallAnchor`).
Companion implementation doc: [`./IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`](./IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md)
Branch target: `feature/ffa-boards-on-build-walls` (additive; lands after world-building + dynamic boards are both in)
Last updated: 2026-05-31

---

## 0. TL;DR — how hard is this?

**Not hard. This is integration work, not a new system.** Both halves already exist and were deliberately built to mirror each other:

- **Building** ships `wall` / `floor` / `ramp` pieces with deterministic ids, persisted + realtime-synced, and a pure `buildPieceColliders(piece)` that already emits wall colliders in the **exact same shape** as `manifest.walls` (`start`/`end`/`height`/`thickness`/`id`/`label`/`passable`, plus a `baseY`). See [`packages/room-engine/src/build.ts`](../../../../../packages/room-engine/src/build.ts).
- **Boards** (dynamic wall anchors) ship a click-a-wall → ghost → commit placement flow (`DynamicBoardPlacementTargets` in [`RoomView3D.tsx`](../../../../../apps/web/components/RoomView3D.tsx)), a server-side overlap validator (`validateDynamicBoardPlacement` in [`room-engine/src/index.ts`](../../../../../packages/room-engine/src/index.ts)), and a `DynamicWallAnchor` entity that stores **absolute** `position` + `normal` (not a wall-relative offset). See [`apps/api/src/routes/wall-objects.ts`](../../../../../apps/api/src/routes/wall-objects.ts) and [`apps/web/lib/useDynamicWallAnchors.ts`](../../../../../apps/web/lib/useDynamicWallAnchors.ts).

The world-building plan explicitly deferred the connection: *"Dynamic boards are placed on `manifest.walls` only; building doesn't add board-able surfaces in v1 (boards-on-build-walls is an expansion)"* ([`PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md) §7.11). This doc is that expansion.

The whole feature reduces to: **treat build-piece walls as first-class board surfaces** by feeding their colliders into the same three places the board pipeline already uses `manifest.walls` — the 3D placement targets (client), the placement validator (server), and (for polish) the overlay line-of-sight check. There is **one real bug** to fix (the placement hit-target is hard-coded to ground-level wall height) and **one product decision** to make (what happens to a board when its wall is destroyed).

**Estimated effort: ~0.5–1 day for the core path; ~1–2 days with tests + orphan-on-destroy handling.**

---

## 1. Overview

Today a participant can build walls anywhere in the FFA arena, and can place media boards — but only on the **room's** walls (`manifest.walls`). You cannot place a board on a wall you just built. This feature closes that gap: **any wall a participant builds becomes a surface that can receive a placed board**, using the exact same board placement UX, persistence, and realtime sync that already works for room walls.

Concretely, after this lands:

1. Enter board-placement mode → built walls highlight as clickable targets alongside the room walls.
2. Click a built wall → a board ghost previews on it (snapped to the wall, sized to fit) → click commits.
3. The board persists as a `DynamicWallAnchor` (same as today), syncs in realtime, and renders for everyone via the existing `AnchorMesh` + `WallObjectSurface` pipeline.
4. Boards on built walls accept the same content types (image/video/live/web/whiteboard/etc.) as boards on room walls — no change to the wall-object type matrix.

### 1.1 Why this is mostly plumbing

The board entity stores an **absolute** world `position` and `normal`, not "wall id + offset." That means once a board is placed, **rendering never needs to re-resolve which wall it sits on** — it just draws at its stored transform. The `wallId` is used only at *placement time* (to pick the surface and to scope overlap validation). So extending "which walls can be targeted" is a placement-layer change, not a rendering or storage-model change. The `DynamicWallAnchor` schema, Mongoose model, REST routes, realtime messages, and the entire wall-object content pipeline are **untouched**.

### 1.2 Product goals

1. A participant can place a board on **any built wall**, with the same ghost-and-click flow used for room walls.
2. Boards on built walls **persist and sync** exactly like boards on room walls (they already do — same entity).
3. Placement is **validated server-side** against built walls too (no off-wall or overlapping boards), so the feature can't be used to grief.
4. Built walls at **any height level** are targetable (a board on a level-1 wall lands at the right elevation).
5. **Zero regression** to boards on room walls and to building itself.

### 1.3 Non-goals (Phase 1)

- **Boards that move/delete with their wall automatically beyond a single chosen policy.** We pick one orphan policy (§4) and ship it; richer "reflow boards when the structure changes" is out.
- **Boards spanning multiple build cells.** A build wall is one 2 m cell, so a board on it is capped at ~2 m × 2 m (§5.1). Multi-cell board surfaces (stitching adjacent build walls into one big surface) are an expansion.
- **Boards on floors or ramp faces.** Only the vertical faces of `wall` pieces are board-able in v1 (floors/ramps are walkable surfaces, not display surfaces).
- **2D-view board placement on built walls.** Board placement is 3D-only today; this feature keeps that. (2D *rendering* of the resulting boards already works because anchors carry absolute positions.)
- **New content types or anchor-type changes.** Reuses the existing `accepts` matrix verbatim.
- **Building/boards outside Free-for-All.** Both are FFA-gated; this stays FFA-gated.

---

## 2. What already lines up (and why this is easy)

| Capability | Where it lives | Reused as-is? |
|---|---|---|
| Build wall → collider in `Wall` shape (`start`/`end`/`height`/`thickness`/`id`/`label`/`passable`) | `buildPieceColliders(piece).walls[0]` ([`build.ts`](../../../../../packages/room-engine/src/build.ts)) | **Yes** — it's already assignable to the `Wall` type the board code consumes |
| Click-a-wall placement UX (raycast → ghost → commit) | `DynamicBoardPlacementTargets` / `DynamicBoardPlacementTarget` ([`RoomView3D.tsx`](../../../../../apps/web/components/RoomView3D.tsx)) | **Mostly** — just feed it more walls + fix the baseY hit-target |
| Wall-click → placement request (projects click onto wall, sizes board, computes normal) | `dynamicBoardRequestFromWallClick` (`RoomView3D.tsx`) | **Mostly** — baseY-aware vertical clamp |
| Server overlap/off-wall validation | `validateDynamicBoardPlacement(manifest, anchors, proposed)` ([`index.ts`](../../../../../packages/room-engine/src/index.ts)) | **Yes** — it's geometry-agnostic; just give it the merged wall set |
| Board entity / storage / REST / realtime / content pipeline | `DynamicWallAnchor`, `wall-objects.ts`, `useDynamicWallAnchors` | **Yes — untouched** |
| Build pieces already in scene scope | `buildScene.pieces` passed to `RoomView3D` ([`RoomClient.tsx`](../../../../../apps/web/components/RoomClient.tsx)) | **Yes** — the data is already there to derive board-able walls |
| Build pieces loadable server-side | `repository.listBuildPiecesForRoom(roomId)` ([`build-pieces.ts`](../../../../../apps/api/src/routes/build-pieces.ts)) | **Yes** — same call the build routes make |

The single most important alignment: **a build wall collider and a manifest wall are the same shape.** The board pipeline doesn't care where a wall came from.

---

## 3. The three disconnects to bridge

These are the only places the two features are wired to `manifest.walls` specifically and need to also see build walls.

### 3.1 Client — placement targets (3D)

`DynamicBoardPlacementTargets` is rendered inside `RoomGeometry` with `walls={manifest.walls}` and only those become clickable. `RoomGeometry` is a sibling of `BuildPlacementController` under the same parent scene component, which has `buildScene.pieces` in scope — so the build walls are *available*, just not threaded in.

**Bridge:** derive board-able walls from build pieces (`kind === "wall"` → `buildPieceColliders(piece).walls[0]`), concatenate with `manifest.walls`, and pass the union to `DynamicBoardPlacementTargets`. A shared engine helper `boardPlacementWalls(manifest, buildPieces)` returns this union so client and server agree exactly.

### 3.2 Server — placement validation

`validateDynamicBoardPlacement` resolves the target wall via `manifest.walls.find(w => w.id === proposed.wallId)`. A built wall's id (`build:wall:…`) isn't in `manifest.walls`, so placement on it would 422 (`wall-not-found`).

**Bridge:** in the `POST`/`PATCH` dynamic-wall-anchor handlers, load the room's build pieces (`repository.listBuildPiecesForRoom`) and validate against `boardPlacementWalls(manifest, pieces)` instead of `manifest.walls`. The validator body itself doesn't change — it already takes a `{ walls }` object and its projection math is wall-shape-agnostic.

### 3.3 The baseY bug (the one real fix)

`DynamicBoardPlacementTarget` positions its invisible click mesh at `y = wall.height / 2`, and `dynamicBoardRequestFromWallClick` clamps the board's vertical center to `[height/2, wall.height − height/2]`. Both assume the wall's base is at `y = 0`, which is true for room walls but **wrong for build walls at level ≥ 1** (a level-1 wall spans `y ∈ [2, 4]`, not `[0, 2]`). Without this fix, the click target for an elevated built wall floats at the wrong height and the placed board lands too low.

**Bridge:** make both use the wall's actual base — `baseY = min(start.y, end.y)` — so the hit-target sits at `baseY + height/2` and the vertical clamp becomes `[baseY + h/2, baseY + wall.height − h/2]`. Room walls have `baseY = 0`, so this is a no-op for them (regression-safe).

---

## 4. The one product decision: orphaned boards

When a participant destroys a built wall that has a board on it, what happens to the board? The board stores an absolute position, so by default it would **float in mid-air** where the wall used to be.

Three options, in increasing effort:

| Option | Behavior | Cost | Notes |
|---|---|---|---|
| **A. Accept floaters (v1 minimal)** | Board stays at its world position; wall vanishes from under it | Trivial (do nothing) | A built wall has a deterministic id, so re-building the same cell/edge/level re-creates the *same* `wallId` and the floating board visually "re-attaches." Floaters are recoverable, not corrupt. |
| **B. Block destroy while occupied** | Destroying a wall with a board on it is rejected (409), matching the existing "anchor is busy" pattern for wall objects | Small | Forces "remove the board first." Predictable, anti-grief, but a minor friction. The board↔wall link is discoverable: anchors carry `wallId`. |
| **C. Cascade delete** | Destroying a wall removes any boards attached to it (and their wall objects) | Medium | Most "magical," most destructive; one click can nuke someone's board. Needs the FFA destroy-policy lens. |

**Recommendation: ship A for the first slice (it's free and non-corrupting), and add B as fast-follow** if playtests show floaters are confusing. Both rely on the same fact — anchors store `wallId`, so attached boards are queryable — so moving A→B later is cheap. C is deferred unless a clear product need appears.

This is the main thing to confirm before implementation; everything else is mechanical.

---

## 5. Gotchas & consequences

### 5.1 Built-wall boards are small
A build wall is a single 2 m cell, 2 m tall. The placement code clamps board width to the wall span and height to the wall height (`Math.min(boardSize.width, span.length)`, `Math.min(boardSize.height, wall.height)`), so a board on a built wall is **capped at ~2 m × 2 m**. That's fine for a poster/screen but won't host a big cinema board. Spanning adjacent build walls into one surface is an expansion (§1.3). Worth a one-line hint in the UI so users aren't surprised their 6 m board shrank.

### 5.2 Placement target visual sits at the wall, not the cell
`DynamicBoardPlacementTarget` builds its highlight box from the wall's `span`, `yaw`, and `thickness`. Build wall colliders carry a real `thickness` (0.2 m) and proper `start`/`end`, so the highlight renders correctly once baseY is fixed — but note the build wall is thinner (0.2 m) than room walls; the existing `Math.max(wall.thickness ?? 0.08, 0.45)` floor already pads the *click target* thickness so thin walls stay easy to hit. No change needed.

### 5.3 Overlay line-of-sight ignores build walls (minor polish)
`wallSurfaceVisibleFromCamera(..., walls)` decides when to show a board's HTML overlay/label, using the walls in `mergedManifest.walls` — which won't include build walls. So a board on a built wall might show its overlay even when another *built* wall is between it and the camera. Cosmetic; fix by including build wall colliders in the `walls` array passed to `AnchorMesh` if it bothers anyone. Not a blocker.

### 5.4 Filter parity with room walls
`DynamicBoardPlacementTargets` filters targets to `wall.passable !== true && wall.height >= DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M (0.75)`. Build wall colliders are `passable: false` and `height: 2`, so they pass the filter automatically. Floors/ramps must be **excluded** by only deriving walls from `kind === "wall"` pieces (their colliders are `floorTop`/`ramp`, not walls, so this is automatic — but assert it).

### 5.5 Validation must use the same wall set on both ends
If the client offers a build wall as a target but the server validates against `manifest.walls` only (or vice-versa), placement 422s confusingly. The shared `boardPlacementWalls(manifest, pieces)` helper is the mitigation — both ends import it. The server is authoritative (it re-derives from persisted pieces), so a stale client can still be rejected cleanly with the existing `wall-not-found` reason.

### 5.6 Realtime ordering: board placed on a not-yet-synced wall
A late joiner could receive a `room.board.created.v1` for a board whose build wall hasn't arrived yet (or was destroyed). Because the board renders from its absolute position (not the wall), it renders fine regardless — this is a non-issue for rendering and only matters for the orphan policy (§4).

### 5.7 Caps interaction
Boards are capped at `MAX_DYNAMIC_ANCHORS_PER_ROOM = 32` regardless of surface; building adds more board-able surface but not more board budget. Fine as-is; note it so nobody expects built walls to raise the board cap.

---

## 6. Recommended v1 cut

Ship the smallest slice that proves boards stick to built walls end-to-end:

**Slice 1 — "Place a board on a built wall" (the whole point):**
- `boardPlacementWalls(manifest, pieces)` engine helper.
- Thread build walls into `DynamicBoardPlacementTargets` (client).
- baseY fix in `DynamicBoardPlacementTarget` + `dynamicBoardRequestFromWallClick`.
- Server: load build pieces and validate against the merged wall set in `POST`/`PATCH`.
- Orphan policy **A** (accept floaters — no code).

This is demoable on its own: build a wall, place a board on it, see it in a second tab, refresh.

**Slice 2 — polish & safety:**
- Engine + API tests (validator accepts build-wall placement, rejects overlap/off-wall; baseY math).
- Orphan policy **B** (block destroy while occupied) if playtests want it.
- Include build walls in overlay line-of-sight.

See [`IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`](./IMPL_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md) for the phased build and files-to-touch.

---

## 7. Open questions (carried into IMPL)

1. **Orphan policy** — ship A (floaters) first vs B (block destroy) immediately? (Proposed: A now, B fast-follow.)
2. **Board size hint** — surface a "boards on built walls are ~2×2 m" note, or silently clamp? (Proposed: silent clamp + tooltip.)
3. **Overlay line-of-sight** — include build walls now or defer the cosmetic occlusion fix? (Proposed: defer.)
4. **Gating** — reuse the existing `roomTypeFeatures.dynamicBoards` + building flags as-is (both already FFA-only), with no new flag? (Proposed: yes, no new flag.)
