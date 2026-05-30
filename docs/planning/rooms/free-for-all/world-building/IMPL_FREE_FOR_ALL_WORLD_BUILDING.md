# Implementation — World Building (Free-for-All Room Type)

Plan: [`./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md)
Implementation parent: [`../IMPL_FREE_FOR_ALL_ROOM.md`](../IMPL_FREE_FOR_ALL_ROOM.md)
Closest pattern to clone: AI 3D Objects ([`../IMPL_FREE_FOR_ALL_AI_3D_OBJECTS.md`](../IMPL_FREE_FOR_ALL_AI_3D_OBJECTS.md)) and the existing **Room Objects** stack.
Branch target: `feature/ffa-world-building`
Last updated: 2026-05-30

---

## Status / Scope

- **Room type:** Free-for-All only (flag-gated; trivially extendable later).
- **Pieces (v1):** `wall`, `floor`, `ramp`. Grid-snapped, 90° rotation, axis-aligned in world space.
- **Interactions:** walls impassable; floors + ramps walkable; anyone places, anyone destroys; persisted + realtime-synced.
- **Engine work:** add verticality via surface-following (`groundHeightAt`) + height-aware wall collision. **No physics engine, no jump in v1.**
- **Explicit non-goals:** free-angle pieces, gravity/jump platforming, destructible HP/resources, per-face paint, logic/triggers, classroom support. (See plan §1.3.)

This doc is written so an engineer can execute it phase-by-phase. Each phase is independently buildable, testable, and demoable, matching the milestones in plan §9 (A = walls, B = floors, C = ramps + polish).

---

## Codebase context (pre-implementation state)

Confirmed by reading the tree on 2026-05-30:

- **Movement** — [`apps/web/lib/useAvatarMovement.ts`](../../../../../apps/web/lib/useAvatarMovement.ts): rAF loop, XZ only, `y = floorYFromZ(z)`, `resolveWallCollisions(current, rawNext, manifest.walls)`. No gravity/jump. Speed `3.2 * walkSpeedMultiplier`. Avatar radius `0.4` (`WALL_AVATAR_RADIUS` in engine).
- **Engine math** — [`packages/room-engine/src/index.ts`](../../../../../packages/room-engine/src/index.ts): `floorYFromZ`, `clampPositionToBounds`, `resolveWallCollisions` (axis-by-axis + FFA radial clamp keyed on `ffa-perim-*`), `createFreeForAllManifest`, FFA constants (`FFA_MAIN_RADIUS=23`, `FFA_HALL_*`, `FFA_ADJOINING_SIZE=14`, `FFA_EXIT_HALF_ARC`, bounds ±43).
- **Contracts** — [`packages/contracts/src/index.ts`](../../../../../packages/contracts/src/index.ts): `WallPlaneSchema` (start/end/height/anchorIds/passable/thickness), `RoomManifestSchema` (walls, tiers, bounds, spawnPoints), `RoomObjectSchema`, `RoomObjectRealtimeMessageSchema` (discriminated union), `RoomObjectRealtimeInboundSchema`, `getRoomTypeFeatureFlags` + `RoomTypeFeatureFlags`, `RoomSettingsSchema`.
- **Room-objects stack to mirror:**
  - Client: [`apps/web/lib/useRoomObjects.ts`](../../../../../apps/web/lib/useRoomObjects.ts) (optimistic apply + server echo), [`apps/web/lib/api.ts`](../../../../../apps/web/lib/api.ts).
  - Server: [`apps/api/src/routes/room-objects.ts`](../../../../../apps/api/src/routes/room-objects.ts), [`apps/api/src/room-objects/*`](../../../../../apps/api/src/room-objects/), [`apps/api/src/repository.ts`](../../../../../apps/api/src/repository.ts), [`apps/api/src/models/mongoose.ts`](../../../../../apps/api/src/models/mongoose.ts).
  - Realtime wiring: [`apps/web/lib/realtime.ts`](../../../../../apps/web/lib/realtime.ts) (`RealtimeMessage` union, reliable/unreliable), broadcast fallback.
- **Placement UX precedent** — `DynamicBoardPlacementTargets` / `DynamicBoardPlacementTarget` in [`apps/web/components/RoomView3D.tsx`](../../../../../apps/web/components/RoomView3D.tsx) (raycast → preview ghost → click commit), [`apps/web/lib/useDynamicWallAnchors.ts`](../../../../../apps/web/lib/useDynamicWallAnchors.ts), `room.board.*` messages.
- **Render scene** — `RoomScene`/wall/floor/tier meshes + `RoomObjectsLayer` mount in `RoomView3D.tsx`. Floor click-to-move via `onDoubleClick` raycast (`FloorMesh`).
- **Feature gating** — `getRoomTypeFeatureFlags` (contracts), `CLIENT_TUNING` (web `lib/config.ts`), `config.tuning.enableFreeForAll` + `ENABLE_FREE_FOR_ALL` (api `config.ts`). FFA room created in [`apps/api/src/routes/rooms-core.ts`](../../../../../apps/api/src/routes/rooms-core.ts).
- **HUD composition** — bottom docks (`MediaControls`, `LiveCaptionsDock`), right rail cards (`RoomObjectsToolbar`, `AiObjectPanel`) in [`apps/web/components/RoomClient.tsx`](../../../../../apps/web/components/RoomClient.tsx).

---

## Design decisions locked for this implementation

1. **`BuildPiece` is a new entity**, not a `RoomObject` variant (structural, grid-quantized, collidable vs free-pose, grabbable, non-colliding). It clones the room-objects *plumbing*.
2. **Integer grid identity.** A piece is identified by `(kind, cell.ix, cell.iz, level, edge?)`. World geometry is derived, never stored. This makes placement idempotent and clients deterministic.
3. **Manifest is untouched.** Build pieces are a runtime overlay merged with `manifest.walls`/tiers on the client for collision/render. "Reset" = delete pieces.
4. **Verticality via surface-follow**, not physics. Two new engine functions: `buildPieceColliders` (derive) and `groundHeightAt` (query). Wall collision becomes height-aware.
5. **Axis-aligned only in v1** (90° rotation) so the existing `resolveWallCollisions` is reused without a general OBB resolver.
6. **Realtime mirrors `room.object.*`**: `room.build.upsert.v1`, `room.build.remove.v1`, `room.build.batch.v1` (drag-paint coalesce), reliable channel, optimistic + server echo.

---

## Shared geometry constants (engine)

Add to `room-engine` (single source of truth, imported by client + server):

```ts
export const BUILD_CELL_SIZE = 2.0;        // m, XZ grid cell
export const BUILD_LEVEL_HEIGHT = 3.0;     // m, one vertical level (== wall height)
export const BUILD_WALL_HEIGHT = 3.0;      // m
export const BUILD_WALL_THICKNESS = 0.2;   // m
export const BUILD_FLOOR_THICKNESS = 0.3;  // m
export const BUILD_STEP_UP_MAX = 0.6;      // m, free step-up tolerance
export const BUILD_MAX_LEVEL = 4;          // height cap (≈12 m)
export const BUILD_MAX_PIECES_PER_ROOM = 1000;
export const BUILD_MAX_PIECES_PER_USER = 400;
export const BUILD_ID_PREFIX = "build:";   // MUST NOT collide with ffa-perim-* radial clamp
```

Cell↔world mapping (cell centers on the grid, origin-aligned):

```ts
export function cellToWorldCenter(ix: number, iz: number) {
  return { x: (ix + 0.5) * BUILD_CELL_SIZE, z: (iz + 0.5) * BUILD_CELL_SIZE };
}
export function worldToCell(x: number, z: number) {
  return { ix: Math.floor(x / BUILD_CELL_SIZE), iz: Math.floor(z / BUILD_CELL_SIZE) };
}
export function levelToY(level: number) { return level * BUILD_LEVEL_HEIGHT; }
```

---

## Phased implementation

### Phase 1 — Contracts + feature flags (no behavior yet)

**`packages/contracts/src/index.ts`**

- `BuildPieceKindSchema = z.enum(["wall", "floor", "ramp"])`.
- `BuildPieceEdgeSchema = z.enum(["n", "e", "s", "w"])`.
- `BuildPieceRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])`.
- `BuildPieceMaterialSchema = z.enum(["stone", "wood", "metal", "glass", "neon"])` (small fixed palette; render maps these to materials).
- `BuildPieceSchema`:
  ```ts
  z.object({
    id: z.string(),
    roomId: z.string(),
    kind: BuildPieceKindSchema,
    cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
    level: z.number().int().min(0).max(BUILD_MAX_LEVEL),
    edge: BuildPieceEdgeSchema.optional(),     // walls only
    rotation: BuildPieceRotationSchema.default(0),
    materialId: BuildPieceMaterialSchema.default("stone"),
    createdByUserId: z.string(),
    createdAt: z.string()
  }).superRefine(/* wall ⇒ edge required; floor/ramp ⇒ edge absent */)
  ```
- REST request/response schemas: `CreateBuildPieceRequestSchema` (kind/cell/level/edge?/rotation/materialId), `CreateBuildPieceResponseSchema` ({ piece, realtimeMessages }), `ListBuildPiecesResponseSchema` ({ pieces }), `DeleteBuildPieceResponseSchema` ({ realtimeMessages }), `CreateBuildPiecesBatchRequestSchema` ({ pieces: […] }) for drag-paint.
- Realtime messages (mirror `room.object.*`):
  - `RoomBuildUpsertMessageV1Schema` `{ type: "room.build.upsert.v1", roomId, piece, sentAt, senderId }`
  - `RoomBuildRemoveMessageV1Schema` `{ type: "room.build.remove.v1", roomId, pieceId, sentAt, senderId }`
  - `RoomBuildBatchMessageV1Schema` `{ type: "room.build.batch.v1", roomId, pieces: BuildPiece[], sentAt, senderId }`
  - `RoomBuildRealtimeMessageSchema = z.discriminatedUnion("type", [...])` + exported `RoomBuildRealtimeMessage` type.
- `RoomObjectRealtimeInbound`-equivalent not needed (no grab/pose); placement goes through REST which returns the canonical realtime messages, same as object create/delete.
- **Feature flag:** add `building: boolean` to `RoomTypeFeatureFlags`; set `true` in `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS`, `false` elsewhere.
- **Room setting:** add `buildDestroyPolicy: z.enum(["anyone", "owner-or-teacher"]).default("anyone")` and `buildingEnabled: z.boolean().default(true)` to `RoomSettingsSchema` (and `parseRoomSettings`).
- Rebuild OpenAPI: `npm run openapi`.

**Engine** (`packages/room-engine/src/index.ts` or a new `build.ts` re-exported from index):

- The constants + `cellToWorldCenter`/`worldToCell`/`levelToY` above.
- `buildPieceColliders(piece): { walls: WallCollider[]; floorTop?: FloorTop; ramp?: RampSurface }` — pure derive (no rendering).
- `isBuildAllowedAt(manifest, piece): { ok: true } | { ok: false; reason }` — no-build-zone + bounds + level-cap predicate (see Phase 4).

**Web config:** `CLIENT_TUNING.enableFreeForAllBuilding` (env `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING`).
**API config:** `config.tuning.enableFreeForAllBuilding` (env `ENABLE_FREE_FOR_ALL_BUILDING`, default false).

**Tests:** zod round-trips; `worldToCell(cellToWorldCenter(...))` identity; wall-requires-edge refinement.

*Exit criteria:* contracts compile, OpenAPI regenerates, flags exist and default off. No UI.

---

### Phase 2 — Persistence + REST + realtime relay (server)

Clone the room-objects server stack.

**`apps/api/src/models/mongoose.ts`** — add `buildPieceSchema` (fields per `BuildPieceSchema`), compound index `{ roomId: 1 }`, and a **unique** index on `{ roomId, kind, cell.ix, cell.iz, level, edge }` so duplicate placements collapse (idempotency). Register `BuildPiece` model.

**`apps/api/src/repository.ts`** (+ in-memory impl):

```
listBuildPiecesForRoom(roomId): Promise<BuildPiece[]>
createBuildPiece(input): Promise<BuildPiece>          // upsert on the unique key (last write wins)
createBuildPiecesBatch(inputs): Promise<BuildPiece[]>
getBuildPiece(roomId, pieceId): Promise<BuildPiece | undefined>
removeBuildPiece(roomId, pieceId): Promise<BuildPiece>
countBuildPiecesForRoom(roomId): Promise<number>
countBuildPiecesForUser(roomId, userId): Promise<number>
deleteAllBuildPiecesForRoom(roomId): Promise<void>    // "clear all" + room delete cascade
```

Wire `deleteAllBuildPiecesForRoom` into the existing room-delete cascade (next to `roomObjects` cleanup near `repository.ts:458`).

**`apps/api/src/build-pieces/`** (mirror `room-objects/`):
- `helpers.ts` — `assertBuildingEnabled(room, settings, featureFlags)`, `assertWithinCaps`, `assertBuildAllowed` (calls engine `isBuildAllowedAt`), `assertCanDestroy(piece, auth, settings)` (anyone vs owner-or-teacher).
- `realtime-outbox.ts` — `buildUpsertMessage`, `buildRemoveMessage`, `buildBatchMessage` builders (stamp `sentAt`, `senderId`).

**`apps/api/src/routes/build-pieces.ts`** (mirror `routes/room-objects.ts`; register in app):
- `GET  /v1/rooms/:roomId/build-pieces` → `{ pieces }` (bulk load; `requireRoomAccess`).
- `POST /v1/rooms/:roomId/build-pieces` → create one → `{ piece, realtimeMessages: [upsert] }`.
- `POST /v1/rooms/:roomId/build-pieces/batch` → create many → `{ pieces, realtimeMessages: [batch] }` (cap batch size, e.g. ≤ 32).
- `DELETE /v1/rooms/:roomId/build-pieces/:pieceId` → `{ realtimeMessages: [remove] }`.
- `DELETE /v1/rooms/:roomId/build-pieces` → clear all (any participant; or gate by setting) → `{ realtimeMessages: [batch-or-clear] }`.
- All enforce: feature flag + `buildingEnabled`, caps, no-build-zone, destroy policy. Server is authoritative; **returns** canonical realtime messages (client broadcasts them, exactly like room objects).

Reuse auth guards from `http/auth-guards.ts` (`requireRoomAccess`, `requireUser`). Errors via `errors.ts` (add `buildDisabled`, `buildRejected`, `buildCapExceeded`, `buildDestroyDenied`).

**Tests** (`apps/api`): create→list→delete; idempotent re-create collapses; cap enforcement; no-build-zone reject; destroy-policy; clear-all; room-delete cascade.

*Exit criteria:* full CRUD works against the in-memory repo with tests; no client yet.

---

### Phase 3 — Client state + realtime plumbing (no rendering yet)

**`apps/web/lib/api.ts`** — `listBuildPieces`, `createBuildPiece`, `createBuildPiecesBatch`, `deleteBuildPiece`, `clearBuildPieces`.

**`apps/web/lib/useBuildPieces.ts`** — clone `useRoomObjects` structure:
- State `piecesById: Record<string, BuildPiece>`; selector `pieces` array (sorted by createdAt).
- `refresh()` bulk-loads on enable; periodic refresh + on-focus (copy the visibility/focus effect).
- `handleRealtimeMessage(message)` applies `room.build.upsert.v1` / `.remove.v1` / `.batch.v1`; returns handled boolean.
- `actions.place(kind, cell, level, edge?, rotation, materialId)` — optimistic upsert (synthesize a temp piece), `POST`, reconcile with server piece + `publishMessages` to LiveKit. Last-write-wins via the unique key means a temp id is replaced by the server id on reconcile.
- `actions.placeBatch(pieces)` — drag-paint; one request, one `batch` broadcast.
- `actions.destroy(pieceId)` — optimistic remove, `DELETE`, broadcast.
- `actions.clearAll()`.

**`apps/web/lib/realtime.ts`** — add `RoomBuildRealtimeMessage` to the `RealtimeMessage` union; `room.build.*` are **reliable** (omit from `ROOM_OBJECT_UNRELIABLE_TYPES`). No transport changes otherwise (JSON over data channel; broadcast fallback already generic).

**`apps/web/components/RoomClient.tsx`** — instantiate `useBuildPieces` gated on `roomTypeFeatures.building && CLIENT_TUNING.enableFreeForAllBuilding && Boolean(session)`. Route incoming realtime messages to `buildPieces.handleRealtimeMessage` in the existing `onMessage` dispatcher (next to `roomObjects.handleRealtimeMessage`). Pass `publish` so optimistic placements broadcast.

*Exit criteria:* place a piece from a console/dev action → it persists, appears in a second tab via realtime, survives refresh. Still invisible (no mesh) — verify via network/log + the bulk list.

---

### Phase 4 — No-build zones + caps in the engine (shared predicate)

**`packages/room-engine`** — `isBuildAllowedAt(manifest, piece)`:
- **Bounds:** every collider corner within `manifest.bounds`.
- **Level cap:** `0 ≤ level ≤ BUILD_MAX_LEVEL`.
- **Spawn keep-out:** reject if the cell footprint is within `SPAWN_OCCUPIED_RADIUS + cell` of any `manifest.spawnPoints` (reuse the constant).
- **FFA exits/halls keep-out:** reject cells that overlap the four exit arcs / hall corridors. Reuse the exit-arc math already in `resolveWallCollisions` (`exitAngles`, `FFA_EXIT_HALF_ARC`) and the hall rectangles from `buildFreeForAllWalls`. Factor that geometry into a reusable `freeForAllExitMask(manifest)` so both collision and build share it.
- **Static boards keep-out:** reject walls on cells fronting `ffa-adj-*-anchor` so builds can't occlude shared boards.
- Returns `{ ok:false, reason }` for the client to surface (red ghost tooltip) and the server to reject.

This function is called by **both** the client (ghost validity) and server (authoritative). Pure + unit-tested with FFA manifest fixtures.

*Exit criteria:* server rejects builds in spawns/exits/over-cap with correct reasons; tests cover each zone.

---

### Phase 5 — Render layer + ghost/grid (Milestone A visible: walls)

**`apps/web/components/BuildLayer.tsx`** (mounted in `RoomView3D` near `RoomObjectsLayer`):
- `pieces.map(piece => <BuildPieceMesh piece={...} />)`.
- `BuildPieceMesh` switches on `kind`:
  - wall → `boxGeometry [BUILD_CELL_SIZE, BUILD_WALL_HEIGHT, BUILD_WALL_THICKNESS]` positioned at the cell edge (from `buildPieceColliders`), `y = levelToY(level) + height/2`.
  - floor → `boxGeometry [CELL, FLOOR_THICKNESS, CELL]` at cell center, top at `levelToY(level)+thickness`.
  - ramp → a wedge geometry (custom `BufferGeometry` or a rotated/sheared box) spanning level→level+1 along `rotation`.
  - material from `materialId` (map to `meshStandardMaterial` presets; `glass` = transparent, `neon` = emissive).
- Reuse skin-aware lighting already in the scene.

**`apps/web/components/BuildControls.tsx`** (bottom dock; idiom of `MediaControls`/`LiveCaptionsDock`):
- Toggle Build Mode; piece buttons Wall/Floor/Ramp/Destroy (keys 1–4); material swatch; rotate button; "Clear all" (with confirm).
- Local UI state via a `useBuildMode()` hook: `{ enabled, tool, materialId, rotation, setTool, rotate, ... }`.

**Ghost + placement targets** (`BuildPlacementController` inside `RoomView3D`, modeled on `DynamicBoardPlacementTargets`):
- A large invisible **ground raycast plane** (reuse/extend `FloorMesh`'s pointer handling) plus raycast against existing `BuildPieceMesh` top faces, to get the hit point + which surface.
- Compute target cell/edge/level from the hit; render a **ghost** `BuildPieceMesh` with translucent green/red (red when `isBuildAllowedAt` fails or slot occupied). Use an emissive outline so it reads over any world skin.
- `onPointerMove` updates ghost; `onClick` calls `buildPieces.actions.place(...)`; pointer-down-drag accumulates cells → `placeBatch` (rate-limited ~10/s).
- `R` key (and a Build Bar button) → `useBuildMode().rotate()`.
- Show a subtle **local build grid** overlay around the avatar while in Build Mode (brightened `gridHelper`-style lines snapped to `BUILD_CELL_SIZE`).
- Destroy tool: hover highlights the nearest `BuildPieceMesh` (raycast), click → `actions.destroy`; drag-rect → multi-destroy.

**Wire Build Mode gating** in `RoomClient`: only mount `BuildControls`/`BuildPlacementController` when `roomTypeFeatures.building && enableFreeForAllBuilding`.

*Exit criteria (Milestone A):* In an FFA room, toggle Build, place walls on the grid, see them in another tab, destroy them. **Walls are full-height barriers** — collision comes in Phase 6. Verify with the preview workflow (screenshot the ghost + a placed wall run).

---

### Phase 6 — Wall collision: make built walls impassable (Milestone A complete)

**`packages/room-engine`** — height-aware wall collision:
- Extend the collider type so a wall carries `baseY` and `height` (existing `WallPlane` is base 0 / full height; build walls have `baseY = levelToY(level)`).
- New `resolveWallCollisionsV2(oldPos3, newPos3, walls, standHeight)` (or augment the existing fn) that **skips a wall when the avatar's vertical span `[y, y+standHeight]` does not overlap `[baseY, baseY+height]`**. Keep the per-axis XZ resolution and the FFA radial clamp unchanged. `standHeight ≈ 1.6` m (avatar torso/head).
- Provide `collectCollisionWalls(manifest, buildPieces)` = `manifest.walls` (treated as base 0) ∪ build-wall colliders ∪ ramp-back barriers. **Ensure build ids use `BUILD_ID_PREFIX`** so they never hit the `ffa-perim-*` radial-clamp branch.

**`apps/web/lib/useAvatarMovement.ts`** — pass the merged wall set + the avatar's current `y`/standHeight into the resolver:
```
const walls = collectCollisionWalls(manifest, buildPieces);   // memoized; from a ref to avoid rAF restarts
const resolved = resolveWallCollisionsV2(current, rawNext, walls, current.y, STAND_HEIGHT);
```
Feed `buildPieces` via a ref (like `walkSpeedMultiplierRef`) so the rAF effect doesn't restart on every placement.

**Regression safety (critical, see plan §7.5):** add tests asserting **ground-level** navigation against `manifest.walls` is byte-for-byte unchanged (FFA perimeter, halls, classroom walls) when there are no build pieces and `y=0`. The height-aware change must be a no-op at ground level.

*Exit criteria:* avatars collide with and slide along built walls just like room walls; existing room collision unchanged (tests green). Verify in two tabs.

---

### Phase 7 — Floors you can stand on (Milestone B: verticality)

**`packages/room-engine`** — `groundHeightAt(x, z, ctx)`:
- `ctx` = `{ manifest, floorTops: FloorTop[], ramps: RampSurface[] }` derived from build pieces (built once per piece-set change, indexed by cell for O(1) lookup).
- Start with `base = floorYFromZ(manifest, z)`.
- For each floor whose footprint contains (x,z): candidate `top = levelToY(level) + BUILD_FLOOR_THICKNESS`.
- For each ramp whose footprint contains (x,z): candidate `top = rampHeightAt(ramp, x, z)` (Phase 8).
- **Support rule:** among `{base} ∪ candidates`, choose the **highest candidate that is ≤ currentY + BUILD_STEP_UP_MAX**. Surfaces higher than that are unreachable from here (you’ll bump their side as a wall). If none qualify above `base`, return the highest surface ≤ current standing (i.e., you descend).
- Deterministic: integer cells + fixed tie-breaks; identical on all clients.
- Build a **spatial index** `BuildSurfaceIndex` keyed by cell so the query checks only the avatar’s cell + 8 neighbors.

**Floor edges as steps, not walls:** a 0.3 m floor lip is < `BUILD_STEP_UP_MAX`, so walking into a floor’s side steps you up onto it automatically — no wall collider needed for floor sides. (Stacked floors creating a full-level lip become un-steppable and read as a wall edge; that’s desired — you need a ramp to go up a level.)

**`useAvatarMovement.ts`** — after wall resolve, set `y`:
```
const surfaces = buildSurfaceIndexRef.current;       // from useBuildPieces, memoized
const groundY = groundHeightAt(resolved.x, resolved.z, { manifest, ...surfaces }, current.y);
next.position = { x: resolved.x, y: groundY, z: resolved.z };
```
Keep `clampPositionToBounds` for XZ bounds but take `y` from `groundHeightAt` (don’t let `floorYFromZ` overwrite it). Also resolve **spawn `y`** through `groundHeightAt` in `createAvatarState` consumers.

**Camera:** `useThirdPersonCamera` pivot follows the avatar `y` (already tracks position; confirm it reads the integrated `y`). Accept minor wall clipping for v1.

**Tests:** stand on a single floor (y rises by a level); step up a 0.3 m lip for free; can’t step up a full level (blocked); walk off a floor edge → descend to base; multi-floor stacks pick the right top; determinism (same inputs → same y).

*Exit criteria (Milestone B):* build a raised platform, walk up onto it from a ramp-less lip where intended, stand and walk on top, walk off and drop. Two-tab consistent. Verify with screenshots + a short driven walk via the preview tools.

---

### Phase 8 — Ramps (Milestone C: complete the kit)

**`packages/room-engine`**:
- `rampHeightAt(ramp, x, z)` — linear interpolation along the ramp’s climb axis (chosen by `rotation`): at the low edge `y = levelToY(level)`, at the high edge `y = levelToY(level)+BUILD_LEVEL_HEIGHT`; clamp to footprint.
- Ramp **back/side barriers**: a wall collider on the high edge + the two sides below the slope so you can’t walk through the solid part; the low edge is open (you walk on).
- Include ramps in `groundHeightAt` candidates and in `collectCollisionWalls` (barriers).
- Step rule makes the **foot of a ramp** (height ≈ base) walk-on-able; the slope then carries you up within step tolerance frame-to-frame (each frame’s rise over a 3.2 m/s step is « 0.6 m).

**Render** — ramp wedge mesh (Phase 5 stub → real geometry); ghost shows climb direction arrow; rotation cycles the 4 directions.

**Placement targeting** — aiming at a floor/level edge auto-orients the ramp to climb from that level to the next (the “1×1 + ramp” affordance from plan §3.3).

**Tests:** walk up a ramp end-to-end (y increases smoothly to next level); walk down; can’t pass through the ramp’s solid back; ramp + floor at top connect (no gap/step).

*Exit criteria (Milestone C):* full wall/floor/ramp kit; build a two-story structure with a ramp and walk up it. 

---

### Phase 9 — 2D view parity + polish

- **`apps/web/components/RoomView2D.tsx`** — draw build footprints: walls as line segments on cell edges, floors as filled squares (opacity by level), ramps as arrows. Source from the same `buildPieces`. (Movement already respects builds in 2D since collision/ground are shared — this is purely visibility.)
- **Drag-paint** finalize: coalesce to `placeBatch`, rate-limit, ghost trail.
- **Optional eased fall** (plan §6.4) behind a constant: when `current.y > groundY + ε`, integrate a small `vy` instead of snapping. Tune in playtest.
- **“Clear all builds”** confirm dialog; **return-to-spawn** self-unstick button (reuse `selectSpawnPoint`).
- **Empty/onboarding state** in `BuildControls` (one-line “Place walls, floors, ramps — anyone can build or remove”).
- **Mobile**: rotate/destroy buttons; place-ahead targeting via `MovementPad` facing.

---

### Phase 10 — Safety, limits, E2E, rollout

- **Caps & abuse:** enforce per-room/per-user piece caps server-side (already Phase 2) + client pre-check; rate-limit placement endpoints (reuse `session-rate-limit` patterns).
- **Telemetry:** room-event log entries for build/destroy/clear (reuse `routes/room-events.ts`) for moderation/debug.
- **E2E (Playwright):** two-context test — A builds a wall, B sees it and is blocked by it; A builds a floor, B stands on it (assert avatar `y`); destroy reflects for both; no-build-zone rejected; refresh persists.
- **Engine unit tests:** the full `groundHeightAt` / collision matrix.
- **Rollout:** default flags **off** in prod; enable in a dev/staging FFA room first. `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING` + `ENABLE_FREE_FOR_ALL_BUILDING` + per-room `buildingEnabled` setting.

**Rollout steps (staging → prod):**
1. Deploy API + web with flags **off** (defaults in `.env.example`).
2. In staging, set `ENABLE_FREE_FOR_ALL_BUILDING=true` and `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL_BUILDING=true` on API/web services.
3. Create or patch one FFA room with `buildingEnabled: true`; smoke-test caps, no-build zones, destroy/clear, and two-client sync.
4. Enable prod flags only after staging E2E (`apps/web/test/world-building.spec.ts`) is green.
5. Optional: tune `BUILD_PLACEMENT_RATE_LIMIT_PER_MINUTE` (default 600) if drag-paint bursts hit 429 in playtests.

---

## Files-to-touch summary

**New**
- `apps/web/components/BuildLayer.tsx`, `BuildPieceMesh.tsx`, `BuildControls.tsx`, `BuildPlacementController.tsx`
- `apps/web/lib/useBuildPieces.ts`, `apps/web/lib/useBuildMode.ts`
- `apps/api/src/routes/build-pieces.ts`
- `apps/api/src/build-pieces/helpers.ts`, `build-pieces/realtime-outbox.ts`
- `packages/room-engine/src/build.ts` (or extend `index.ts`): constants, `cell↔world`, `buildPieceColliders`, `groundHeightAt`, `resolveWallCollisionsV2`, `collectCollisionWalls`, `freeForAllExitMask`, `isBuildAllowedAt`, `BuildSurfaceIndex`
- Tests in `packages/room-engine/tests`, `apps/api` route tests, `apps/web` E2E

**Modified**
- `packages/contracts/src/index.ts` — schemas, realtime union, `RoomTypeFeatureFlags.building`, `RoomSettings` (`buildingEnabled`, `buildDestroyPolicy`), OpenAPI registry
- `apps/api/src/models/mongoose.ts` — `BuildPiece` model + indexes
- `apps/api/src/repository.ts` (+ in-memory) — build-piece methods + room-delete cascade
- `apps/api/src/config.ts` — `enableFreeForAllBuilding`
- `apps/api/src/errors.ts` — build error helpers
- `apps/web/lib/api.ts` — build-piece client calls
- `apps/web/lib/realtime.ts` — `RoomBuildRealtimeMessage` in union (reliable)
- `apps/web/lib/config.ts` — `CLIENT_TUNING.enableFreeForAllBuilding`
- `apps/web/lib/useAvatarMovement.ts` — merged walls (height-aware) + `groundHeightAt` for `y`, via refs
- `apps/web/components/RoomClient.tsx` — mount `useBuildPieces` + Build UI, route realtime
- `apps/web/components/RoomView3D.tsx` — mount `BuildLayer` + `BuildPlacementController`
- `apps/web/components/RoomView2D.tsx` — build footprints
- `apps/web/lib/useThirdPersonCamera.ts` — pivot follows integrated `y` (verify)

---

## Risks during implementation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Height-aware wall change regresses ground-level collision | Med | No-op-at-ground tests (Phase 6); gate behind merged-wall set only when build pieces exist |
| `groundHeightAt` clients disagree → avatar “pops” between heights for observers | Med | Integer cells + deterministic tie-breaks; the *observed* avatar uses the sender’s broadcast `position.y` (we already send full position), so observers don’t recompute — only the local owner queries `groundHeightAt` |
| rAF loop restarts on every placement (perf) | Med | Feed `buildPieces`/surface index via refs (pattern: `walkSpeedMultiplierRef`), not effect deps |
| Per-axis resolver corner squeeze between two build walls | Low | Thickness 0.2 + radius 0.4 keeps it minor; corner-nudge fix if observed |
| Networking burst on drag-paint | Med | Rate-limit + `room.build.batch.v1` coalesce; reliable channel |
| Griefing / trapping | Med | Anyone-destroy + no-build zones + caps + return-to-spawn (plan §7) |
| Camera clips through build walls | Low | Accept v1; camera pull-in is a known follow-up |
| Persistence volume | Low | `{roomId}` index, bulk load, caps, optional TTL/clear |
| 2D players blind to builds | Med | Phase 9 footprints (movement already respects builds) |

---

## Validation evidence (fill in after implementation)

- [x] Two-tab: A builds walls/floor/ramp → B sees them in realtime; refresh persists.
- [x] B is blocked by A’s wall; B stands on A’s floor (assert avatar `y` ≈ level top); B walks up A’s ramp (assert `y` rises to next level).
- [x] No-build zones reject (spawn, exit/hall, board front) on client ghost + server.
- [x] Caps enforced (per-room, per-user, max level); over-cap rejected with reason.
- [x] Ground-level collision unchanged vs `main` (engine regression tests green).
- [x] Destroy: anyone removes any piece; reflects for both tabs; clear-all works.
- [x] Flags off by default; feature absent in classroom/workforce-training rooms (API unit + classroom E2E; workforce-training shares `building: false` in feature flags).
- [ ] Preview screenshots: ghost (green/red), a built two-story structure, an avatar standing on a floor and mid-ramp.

---

## Dependency additions

**None required.** Everything is built on the existing stack: `@react-three/fiber`/`three` (render + raycast), LiveKit data channel (realtime), Mongoose (persistence), Zod (contracts), the existing room-objects/dynamic-board patterns. No physics engine, no new vendor.
