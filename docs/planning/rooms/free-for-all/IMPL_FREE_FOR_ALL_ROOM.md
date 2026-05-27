# Implementation — Free-for-All Room Type

Source plan: [`PLAN_FREE_FOR_ALL_ROOM.md`](./PLAN_FREE_FOR_ALL_ROOM.md)
Branch: `room-types`
Last updated: 2026-05-27

---

## Status / Scope

**Status:** Not started. Planning only.

Phase 1 ships a new `"free-for-all"` room type end-to-end. It is the third room type after `"classroom"` and `"workforce-training"` (already shipped on `room-types`). Free-for-All has three substantive new mechanics compared to the existing room types:

1. **No teacher/student model.** Everyone is a "Participant". Internal role mapping continues to use `teacher` for the host and `student` for joiners, but UI surfaces use `Participant` universally and no host-only HUD/panels render.
2. **Open join without invite code.** The lobby exposes a browseable list of currently-active Free-for-All rooms; any signed-in user can join one with a single click. Invite-code flow stays available but is not required.
3. **Participant-placed boards.** Boards are not fixed `WallAnchor` records in the manifest. Any participant can create new boards at runtime by picking a wall, position, size, and title. These boards are persisted as a new `DynamicWallAnchor` entity, sync via realtime messages, and merge with static manifest anchors in both 3D and 2D.

The geometry is a large circular hub with cylindrical impassable walls, a central square board zone, and four short halls leading to four medium adjoining rooms (one per cardinal exit).

**In scope (Phase 1):**

- Extend `RoomTypeSchema` to `["classroom", "workforce-training", "free-for-all"]`.
- Extend `getRoomTypeFeatureFlags()` with a `free-for-all` branch (no classroom tools; dynamic boards on; world skins off in Phase 1).
- New `createFreeForAllManifest()` factory in `@3dspace/room-engine` (circular main room + 4 halls + 4 adjoining rooms, all with thick impassable walls).
- New `DynamicWallAnchor` contract + Mongoose model + REST + realtime events (`room.board.created.v1` / `updated.v1` / `removed.v1`) + per-room cap and collision validation.
- New lobby chooser entry, neutral copy, room-discovery list, and no-code join API endpoint.
- New `RoleLabels` profile for Free-for-All rooms (Participant copy throughout).
- 3D + 2D rendering of dynamic boards merged with static anchors.
- Feature flag `ENABLE_FREE_FOR_ALL` / `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL` (default `false`).

**Out of scope (later phases):**

- Moderation/voting/reporting tools beyond creator-self-cleanup.
- Freestanding (non-wall-attached) boards in the central square.
- Custom dynamic board *types* (Phase 1 supports the existing wall-object type matrix on top of the new anchor; the type matrix itself is not changed).
- World skins for circular geometry (panorama unwrap of curved walls is a follow-up; rooms render with solid wall material in Phase 1).
- Room-builder UI for custom geometry.
- Per-user board count limits beyond the global per-room cap.
- Vote-to-remove or time-based expiration.
- Public global directory across orgs (Phase 1 lists FFA rooms within the same `classId` scope or globally per env flag — see Phase 4).

---

## Codebase context (pre-implementation state)

Line numbers below are accurate as of `room-types` HEAD on 2026-05-27. The workforce-training feature is fully shipped, so all the touchpoints for "add a new room type" already exist — this doc focuses primarily on what is *additionally* needed for FFA's open join and dynamic boards.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomTypeSchema = z.enum(["classroom", "workforce-training"])` at line 308. Must extend to add `"free-for-all"`. `getRoomTypeFeatureFlags()` at line 824 currently returns `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` for `"classroom"` and `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` otherwise. Must add a `"free-for-all"` case that mirrors non-classroom defaults but turns on `dynamicBoards` (a new flag introduced here). `RoomSchema.type` at line 895 stays `RoomTypeSchema.default("classroom")` — the union expansion is enough. `CreateRoomRequestSchema.type` at line 905 already accepts the discriminator. `RoomObjectTemplate.visibleRoomTypes` at line 373 means custom RoomObject uploads will not leak between room types unless explicitly authored for FFA. |
| `packages/contracts/src/index.ts` (feature flags) | A new boolean `dynamicBoards: boolean` must be added to the `RoomTypeFeatureFlags` shape (alongside existing flags like `hallPass`, `worldSkins`, `roomObjects`, etc.). Default to `false` in both classroom and non-classroom defaults; set `true` only for `"free-for-all"`. |
| `packages/room-engine/src/index.ts` | `createDefaultRoomManifest()` line 150 → classroom shell. `createWorkforceTrainingManifest()` line 588 → multi-zone factory with thick walls. `resolveWallCollisions()` line 685 already supports thick walls (`wall.thickness > 0`). `applyDefaultRoomGeometry()` line 1020 is already room-type-aware and short-circuits for non-classroom types. **New work:** `createFreeForAllManifest()` (circular geometry via N short straight segments approximating the cylinder), plus optional helper `circleWallSegments(radius, segmentCount, gaps)` for the curved perimeter. |
| `apps/api/src/app.ts` | `POST /v1/rooms` line 2778: `const roomType = body.type ?? "classroom"; if (roomType === "workforce-training" && !config.tuning.enableWorkforceTraining) throw …`. Must add an analogous gate for `"free-for-all"`. `manifestFactory` dispatch at line 2793 currently branches `"workforce-training"` vs default. Must extend to dispatch FFA to `createFreeForAllManifest()`. `requireRoomAccess()` (around line 220) calls `applyDefaultWallAnchorDimensions(manifest, room.type)` — no change needed because the helper already short-circuits non-classroom. Classroom action endpoints already 4xx for non-classroom rooms via `getRoomTypeFeatureFlags()` — that gating extends automatically to FFA. |
| `apps/api/src/app.ts` (new endpoints) | Two new endpoints land here in Phase 4: `GET /v1/rooms/free-for-all` (list joinable FFA rooms) and `POST /v1/rooms/:roomId/sessions` flow that does **not** require an invite token for FFA rooms. Wall-anchor / dynamic board endpoints land alongside the existing wall object endpoints (search for `/v1/rooms/:roomId/wall-objects` to find the right block). |
| `apps/web/components/Lobby.tsx` | `type RoomType` at line 17 currently `"classroom" \| "workforce-training"`. `ROOM_TYPES` at line 19. `ROOM_TYPE_FORM_DEFAULTS` at line 24. `ROOM_TYPE_JOIN_COPY` at line ~30. `renderRoomTypeSteps()` at line 192 has a `case "workforce-training":` branch at line 319. The dropdown filter at line 491 only shows workforce-training when `CLIENT_TUNING.enableWorkforceTraining` is on. Add the FFA option behind `enableFreeForAll` and add a new dedicated case in `renderRoomTypeSteps()` plus a new browse-and-join sub-UI inside the join column. |
| `apps/web/lib/config.ts` | `CLIENT_TUNING` already includes `enableWorkforceTraining` (line 18). Add `enableFreeForAll: process.env.NEXT_PUBLIC_ENABLE_FREE_FOR_ALL === "true"`. |
| `apps/web/lib/api.ts` | `createRoom(identity, classId, name, type?)` already widened to accept `RoomType`. **New:** `listFreeForAllRooms(identity)`, `joinFreeForAllRoom(identity, roomId)`, `createDynamicWallAnchor(identity, roomId, payload)`, `updateDynamicWallAnchor()`, `removeDynamicWallAnchor()`. |
| `apps/web/lib/manifest.ts` | `normalizeRoomManifest(manifest, roomType)` already takes a `roomType`. Already correctly short-circuits non-classroom. No change. |
| `apps/web/components/RoomClient.tsx` | Derives `roleLabels` from `sessionInfo.room.type`. Must add a `"free-for-all"` branch returning Participant labels. Must also pass a new `dynamicBoardsEnabled` boolean down to `RoomView3D` / `RoomView2D` / `AnchorPanel`, gated on `roomTypeFeatures.dynamicBoards`. `RoomClient` is also where the new `useDynamicWallAnchors(roomId)` hook is mounted; it hydrates persisted dynamic anchors, listens for `room.board.*` realtime messages, and exposes create/update/remove + an optimistic local view. |
| `apps/web/components/RoomView3D.tsx` | Walls iterate `manifest.walls.map(...)` (lines 1094 / 1114 / 1458). Static anchors come from `manifest.wallAnchors`. **Change:** the wall-anchor render pass becomes `[...manifest.wallAnchors, ...dynamicAnchors]` so dynamic boards reuse the existing `AnchorMesh` + `WallObjectSurface` pipeline without code duplication. A new "placement preview" mesh follows the cursor when dynamic-board placement mode is active. |
| `apps/web/components/RoomView2D.tsx` | `projectAnchorRectTo2D(manifest, anchor)` (line 287) is shape-agnostic. **Change:** include dynamic anchors in the projection pass, same merge as 3D. 2D placement uses `unprojectPointFrom2D` for the picked wall position. |
| `apps/web/components/AnchorPanel.tsx` | The existing Boards panel surfaces wall-anchor creation actions for an *occupied/empty* anchor. **New:** in FFA rooms (where `dynamicBoards` is true), the panel grows a "Create new board" button that opens a placement-mode overlay; once placed, the new dynamic anchor is selectable like any static one. |
| `apps/web/lib/useAvatarMovement.ts` | Already calls `resolveWallCollisions(manifest, …)`. Because FFA walls have `thickness > 0`, collision math (lines 139, 192) already blocks movement at the wall face. No code change. |
| `apps/api/src/repository.ts` | Repository accepts `type` on `createRoom`. **New:** add `listFreeForAllRoomsForUser(userId, ?classId)`, `createDynamicWallAnchor()`, `getDynamicWallAnchorsForRoom()`, `updateDynamicWallAnchor()`, `removeDynamicWallAnchor()`. Each gets a Mongoose impl + a memory impl. |
| `apps/api/src/models/mongoose.ts` | `RoomDocument` already has `type` with enum + default `"classroom"`. Extend the enum to include `"free-for-all"`. **New collection:** `DynamicWallAnchorDocument` (id, roomId, createdByUserId, wallId, centerX, centerY, centerZ, normalX, normalY, normalZ, width, height, title, createdAt, updatedAt). Index `{ roomId: 1 }`. |
| `apps/web/lib/realtime.ts` | Already routes typed realtime messages by `kind`. Add `room.board.created.v1`, `room.board.updated.v1`, `room.board.removed.v1` to the message union and the dispatch table. Use the reliable channel (same as wall object create/remove). |
| `apps/web/lib/wallObjectSurface.ts` | The HTML overlay scaler is anchor-driven. Because dynamic anchors share the same `WallAnchor` shape, no code change is required. |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` each have an `ENABLE_WORKFORCE_TRAINING=false` line. Add `ENABLE_FREE_FOR_ALL=false` and `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=false` immediately below. |

---

## Plan adjustments

Three clarifications on top of the PLAN doc, derived from the codebase walkthrough:

**A. Dynamic boards are modeled as a new entity, not by mutating `RoomManifest`.** PLAN § 7.2 suggested either a `RoomBoard` or `DynamicWallAnchor` model. Implementation chooses `DynamicWallAnchor` because:

- The shape is intentionally identical to the existing `WallAnchorSchema` plus a small audit envelope (`createdByUserId`, `createdAt`, `updatedAt`). Reusing the schema means `RoomView3D` / `RoomView2D` / `AnchorPanel` / `WallObjectSurface` / `projectAnchorRectTo2D` / wall-object creation flows all work unchanged — the merged list `[...manifest.wallAnchors, ...dynamicAnchors]` flows through the same pipeline.
- It cleanly avoids the alternative of mutating the persisted `RoomManifest` per room. The manifest stays generated from `createFreeForAllManifest()`; dynamic boards are user-generated content layered on top, in the same architectural slot as `WallObject` to `WallAnchor`.

**B. Circular walls are approximated by N straight segments, not curved geometry.** The existing wall renderer (`WallMesh`) draws line-segment walls. Phase 1 generates the cylindrical perimeter as 32 short straight segments (~5° each), with four explicit gaps for the cardinal exits. This is invisible at typical wall heights and avoids introducing curved-mesh support to the wall pipeline. `resolveWallCollisions()` keeps working unchanged because each segment is just another wall.

**C. Open join is a new dedicated session endpoint, not a relaxation of invite-token enforcement.** PLAN § 4.3 says no invite code is required. Implementation adds a sibling endpoint that the lobby calls for FFA rooms only:

- `POST /v1/rooms/:roomId/free-for-all-sessions` — creates a participant session for the calling Clerk user, asserting the room has `type === "free-for-all"`. No invite token required.
- Existing `POST /v1/rooms/:roomId/sessions` (invite-token-based) remains untouched and continues to handle classroom + workforce-training flows.

This keeps the change additive, leaves the secured invite path unchanged, and avoids tangling auth logic with room-type discrimination at the existing session endpoint.

**D. No new role enum.** Internal `RoleSchema` stays `["teacher", "student"]`. The FFA creator maps to `teacher` internally (so room ownership + create rights survive); joiners map to `student` internally. UX strips both labels and replaces them with "Participant". This matches the workforce-training pattern and avoids `RoleSchema` ripple.

---

## Phased implementation

### Phase 1 — Contracts: extend `RoomType` and feature flags

Goal: schemas accept the new discriminator and a new `dynamicBoards` capability flag.

**File: `packages/contracts/src/index.ts`**

1. Extend `RoomTypeSchema` (line 308):

   ```ts
   export const RoomTypeSchema = z.enum([
     "classroom",
     "workforce-training",
     "free-for-all"
   ]);
   ```

2. Extend `RoomTypeFeatureFlags` (search for the type definition above `getRoomTypeFeatureFlags()` at line 824) with:

   ```ts
   dynamicBoards: boolean;
   openJoin: boolean;
   ```

   Set both to `false` in `CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` and `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS`.

3. Add a `FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS` constant that:
   - Inherits all `NON_CLASSROOM_ROOM_TYPE_FEATURE_FLAGS` defaults (no lessons/private checks/breakout pods/hall pass/whisper/etc.).
   - Sets `roomObjects: true` (per PLAN § 3.2 — anyone can place objects).
   - Sets `dynamicBoards: true`.
   - Sets `openJoin: true`.
   - Sets `worldSkins: false` (Phase 1 — curved geometry not yet panorama-mapped).

4. Extend `getRoomTypeFeatureFlags()` (line 824) with the new case:

   ```ts
   case "free-for-all":
     return FREE_FOR_ALL_ROOM_TYPE_FEATURE_FLAGS;
   ```

5. Add the new `DynamicWallAnchorSchema` alongside the existing `WallAnchorSchema` (which is already exported):

   ```ts
   export const DynamicWallAnchorSchema = WallAnchorSchema.extend({
     createdByUserId: z.string().min(1),
     createdAt: z.string().datetime(),
     updatedAt: z.string().datetime(),
     roomId: z.string().min(1)
   });
   export type DynamicWallAnchor = z.infer<typeof DynamicWallAnchorSchema>;
   ```

6. Add request schemas:

   ```ts
   export const CreateDynamicWallAnchorRequestSchema = z.object({
     wallId: z.string().min(1),
     center: z.object({ x: z.number(), y: z.number(), z: z.number() }),
     normal: z.object({ x: z.number(), y: z.number(), z: z.number() }),
     width: z.number().min(1.0).max(8.0),
     height: z.number().min(0.75).max(5.0),
     title: z.string().min(1).max(80),
     accepts: z.array(WallObjectKindSchema).default(FULL_WALL_OBJECT_ACCEPTS)
   });
   export const UpdateDynamicWallAnchorRequestSchema =
     CreateDynamicWallAnchorRequestSchema.partial();
   ```

7. Add realtime message variants to the existing `RealtimeMessage` union (already organized in this file): `RoomBoardCreatedMessageV1`, `RoomBoardUpdatedMessageV1`, `RoomBoardRemovedMessageV1` — each carrying a `DynamicWallAnchor` payload (and `id` only on the remove variant).

8. Regenerate OpenAPI: `npm run openapi` (from `packages/contracts`). Commit the regenerated `openapi.json`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/contracts` passes.
- [ ] `npm test -- packages/contracts/tests` passes (existing tests still validate against the widened `RoomTypeSchema`).

---

### Phase 2 — Room engine: `createFreeForAllManifest()`

Goal: a new geometry factory that produces the circular hub + 4 halls + 4 adjoining rooms, with thick impassable walls.

**File: `packages/room-engine/src/index.ts`**

1. Below `createWorkforceTrainingManifest()` (ends around line 657), add exported constants:

   ```ts
   // ── Free-for-All layout ─────────────────────────────────────────────────────
   // Circular main room (Ø ~46 m) centered on origin. Four cardinal exits open
   // into short 6 m halls leading to four 14×14 m medium adjoining rooms. All
   // walls are thick + impassable (matches workforce-training collision style).

   export const FFA_MAIN_RADIUS = 23;            // ~46 m diameter
   export const FFA_WALL_HEIGHT = 8;
   export const FFA_WALL_THICKNESS = 0.3;
   export const FFA_HALL_LENGTH = 6;
   export const FFA_HALL_WIDTH = 4;
   export const FFA_ADJOINING_SIZE = 14;
   export const FFA_PERIMETER_SEGMENTS = 32;     // 360° / 32 = 11.25° per segment
   export const FFA_EXIT_ANGULAR_WIDTH_RAD = (FFA_HALL_WIDTH / FFA_MAIN_RADIUS); // ~10°
   export const FFA_CENTRAL_SQUARE_SIZE = 12;    // central board zone (visual only in Phase 1)
   export const FFA_STATIC_BOARD_WIDTH = 6;
   export const FFA_STATIC_BOARD_HEIGHT = widescreenHeight(FFA_STATIC_BOARD_WIDTH);
   ```

2. Add `circleWallSegments()` helper (private):

   ```ts
   function circleWallSegments(args: {
     centerX: number;
     centerZ: number;
     radius: number;
     segmentCount: number;
     thickness: number;
     height: number;
     gaps: { angleRad: number; widthRad: number; idPrefix: string }[];
     idPrefix: string;
   }): WallSegment[] {
     // Returns straight-segment WallSegments around a circle, skipping any
     // segment whose midpoint falls inside one of `gaps`. Each emitted segment
     // ends are world-space points at radius `radius` from (centerX, centerZ).
     // ...
   }
   ```

3. Implement the factory:

   ```ts
   export function createFreeForAllManifest(input: {
     id?: string;
     roomId: string;
     name?: string;
     version?: number;
     createdAt?: string;
     config?: Partial<RoomEngineConfig>;
   }): RoomManifest {
     const config: RoomEngineConfig = {
       ...DEFAULT_ROOM_ENGINE_CONFIG,
       ...input.config,
       spatialAudio: { ...DEFAULT_SPATIAL_AUDIO, ...input.config?.spatialAudio }
     };

     // Cardinal exit angles: 0 (east), π/2 (south), π (west), 3π/2 (north).
     // Each exit cuts a hall-wide gap in the circular perimeter, and a short
     // straight hall leads outward to an adjoining 14×14 room.

     const manifest: RoomManifest = {
       id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
       roomId: input.roomId,
       version: input.version ?? 1,
       name: input.name ?? "Free-for-All",
       dimensions: {
         // Outer extents include adjoining rooms: radius + hall + room
         //   = 23 + 6 + 14 = 43 m to each side → 86 m square
         width: 86,
         depth: 86,
         height: FFA_WALL_HEIGHT
       },
       bounds: {
         // Phase 1: single rectangular outer bound, thick walls enforce real
         // impassability.
         minX: -43, maxX: 43,
         minZ: -43, maxZ: 43
       },
       tiers: [],
       spawnPoints: buildFreeForAllSpawnPoints(),
       walls: buildFreeForAllWalls(),
       wallAnchors: buildFreeForAllStaticAnchors(),
       projection: { kind: "top-down-v1", scale: 1, origin: { x: 0, y: 0 } },
       capabilities: createRoomCapabilities(config),
       spatialAudio: config.spatialAudio,
       features: [],
       createdAt: input.createdAt ?? new Date().toISOString()
     };

     return RoomManifestSchema.parse(manifest);
   }
   ```

4. `buildFreeForAllWalls()` (private):

   | Surface | Notes |
   |---|---|
   | Circular perimeter | 32 short segments at radius 23 m, with 4 gaps (one per cardinal exit), all `thickness: FFA_WALL_THICKNESS`. |
   | Hall walls (east) | 2 parallel side walls along the +X axis from radius 23 to 29 m, plus the adjoining-room left/right walls inside the hall corridor. |
   | Hall walls (south) | Same pattern along +Z. |
   | Hall walls (west) | Same along −X. |
   | Hall walls (north) | Same along −Z. |
   | Adjoining-room perimeter (east) | 4 walls forming a 14×14 box centered at (23 + 6 + 7, 0); entrance wall (the one facing the hall) is split into two collinear segments around the 4 m doorway. |
   | Adjoining-room perimeter (south, west, north) | Same pattern, rotated 90°/180°/270°. |

   Total wall count: ~32 (perimeter) − 4 (gaps) + 4 halls × 2 side walls + 4 rooms × ~5 segments ≈ **52 wall segments**.

5. `buildFreeForAllStaticAnchors()` (private):

   Each adjoining room gets one large pre-existing static anchor centered on its back wall (the wall opposite the doorway), 6 m wide, at `y = 4.0`. The cylindrical main room hosts zero static anchors in Phase 1 — boards in the main room are entirely participant-placed. Total: **4 static anchors** (one per adjoining room).

   The central square is a *visual* zone (rendered floor tint in Phase 5) but does **not** generate manifest anchors; participants placing boards there happens via dynamic anchors only.

6. `buildFreeForAllSpawnPoints()` (private):

   Generate ~8 spawn points inside the main circle, distributed on a smaller inner circle (~10 m radius) at evenly spaced angles. Spawn rotations face toward the room center, computed via `rotationFacingRoomCenter`.

**File: `packages/room-engine/tests/room-engine.test.ts`**

7. New `describe("free-for-all manifest", ...)` block:

   - Manifest parses against `RoomManifestSchema`.
   - Has exactly 4 static anchors (one per adjoining room).
   - Perimeter has exactly 4 entrance gaps (count distinct angular ranges with no wall).
   - All walls have `thickness === FFA_WALL_THICKNESS`.
   - `resolveWallCollisions()` blocks a movement vector aimed at a perimeter wall (avatar centered at origin, moving to `{ x: 40, z: 0 }` — must clamp to a point inside radius 23 minus avatar radius along the +X axis where the east exit is, *except* through the eastward exit gap).
   - `applyDefaultRoomGeometry(ffaManifest, "free-for-all")` returns the input unchanged.
   - Spawn points are all inside the main circle (`sqrt(x² + z²) < FFA_MAIN_RADIUS - 1`).

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/room-engine` passes.
- [ ] `npm test -- packages/room-engine/tests/room-engine.test.ts -t "free-for-all"` passes.

---

### Phase 3 — API: dispatch, persistence, feature flag

Goal: `POST /v1/rooms` accepts FFA; persistence stores it; new server config flag gates creation.

**File: `apps/api/src/app.ts`**

1. Import the new factory:

   ```ts
   import {
     // existing imports
     createFreeForAllManifest
   } from "@3dspace/room-engine";
   ```

2. In `POST /v1/rooms` (line ~2778):

   - Add the flag guard:

     ```ts
     if (roomType === "free-for-all" && !config.tuning.enableFreeForAll) {
       throw forbidden("Free-for-All rooms are disabled in this environment");
     }
     ```

   - Extend the `manifestFactory` dispatch at line ~2793:

     ```ts
     const manifestFactory =
       roomType === "workforce-training" ? createWorkforceTrainingManifest :
       roomType === "free-for-all"       ? createFreeForAllManifest :
       createDefaultRoomManifest;
     ```

**File: `apps/api/src/config.ts`**

3. Read `ENABLE_FREE_FOR_ALL` (boolean, default `false`) and expose under `config.tuning.enableFreeForAll`. Follow the same pattern as `enableWorkforceTraining`.

**File: `apps/api/src/models/mongoose.ts`**

4. Update `RoomDocument.type` enum:

   ```ts
   type: {
     type: String,
     enum: ["classroom", "workforce-training", "free-for-all"],
     default: "classroom"
   }
   ```

5. Add a new `DynamicWallAnchorDocument` mongoose model (collection name: `dynamic_wall_anchors`) with fields matching `DynamicWallAnchorSchema`, plus an index on `{ roomId: 1 }`.

**File: `apps/api/src/repository.ts`**

6. Add interface + impls (in-memory and Mongoose):

   ```ts
   listFreeForAllRooms(args: { classId?: string }): Promise<RoomRecord[]>;
   listDynamicWallAnchorsForRoom(roomId: string): Promise<DynamicWallAnchor[]>;
   createDynamicWallAnchor(input: DynamicWallAnchor): Promise<DynamicWallAnchor>;
   updateDynamicWallAnchor(id: string, patch: Partial<DynamicWallAnchor>): Promise<DynamicWallAnchor>;
   removeDynamicWallAnchor(id: string, roomId: string): Promise<void>;
   countDynamicWallAnchorsForRoom(roomId: string): Promise<number>;
   ```

**File: `apps/api/tests/api.test.ts`**

7. New `describe("free-for-all room type", ...)` block:

   - With `ENABLE_FREE_FOR_ALL=false`, `POST /v1/rooms` with `type: "free-for-all"` returns 403.
   - With the flag on, `POST /v1/rooms` with `type: "free-for-all"` returns a room with `type === "free-for-all"` and a manifest with the FFA outer width 86.
   - `getRoomTypeFeatureFlags("free-for-all")` returns `{ dynamicBoards: true, openJoin: true, lessons: false, ... }`.
   - Existing classroom + workforce-training tests still pass.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/api` passes.
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "free-for-all"` passes.
- [ ] Full API suite still passes.

---

### Phase 4 — API: dynamic boards + open join endpoints

Goal: REST + realtime surface for dynamic boards and a no-code session endpoint.

**File: `apps/api/src/app.ts`**

#### 4.1 Dynamic wall anchors

Add four endpoints alongside the existing wall-object routes:

```ts
// GET /v1/rooms/:roomId/dynamic-wall-anchors
//   Returns DynamicWallAnchor[] for the room. Requires room access.

// POST /v1/rooms/:roomId/dynamic-wall-anchors
//   Body: CreateDynamicWallAnchorRequest
//   Asserts:
//     - room.type === "free-for-all"
//     - feature flag dynamicBoards is true (defensive)
//     - validateDynamicAnchorAgainstManifest(manifest, allAnchors, body)
//         - wallId references an existing manifest wall
//         - center lies on the wall surface (within thickness/2 tolerance)
//         - normal matches the wall normal direction
//         - placement does not intersect any entrance gap on that wall
//         - placement does not overlap any existing anchor (static or dynamic)
//           by more than DYNAMIC_BOARD_MIN_SPACING (default 0.25 m)
//         - countDynamicWallAnchorsForRoom(roomId) < MAX_DYNAMIC_ANCHORS_PER_ROOM (default 32)
//   Persists, emits room.board.created.v1, returns the new anchor.

// PATCH /v1/rooms/:roomId/dynamic-wall-anchors/:anchorId
//   Body: UpdateDynamicWallAnchorRequest
//   Authz: requesting user must equal createdByUserId OR be room owner.
//   Re-runs placement validation against the new payload.
//   Emits room.board.updated.v1.

// DELETE /v1/rooms/:roomId/dynamic-wall-anchors/:anchorId
//   Authz: same as PATCH.
//   Emits room.board.removed.v1.
//   Cascade-deletes any WallObject pinned to this anchor (or 409 if non-empty;
//   choose one — see § Open implementation questions).
```

All four endpoints return 404 (`room-type-not-supported`) when called against non-FFA rooms.

Validation helper signature (new file or inline in app.ts):

```ts
function validateDynamicAnchorAgainstManifest(
  manifest: RoomManifest,
  existingAnchors: WallAnchor[],
  proposed: { wallId: string; center: Vector3; normal: Vector3; width: number; height: number; }
): { ok: true } | { ok: false; reason: "wall-not-found" | "off-wall-surface" | "intersects-entrance" | "overlaps-anchor" | "too-many-anchors"; details?: unknown }
```

#### 4.2 Open join (no invite code)

```ts
// GET /v1/rooms/free-for-all
//   Optional query: classId, limit (default 20, max 100).
//   Returns: { rooms: { id, name, classId, createdAt, participantCount }[] }
//   Only returns rooms with type === "free-for-all".
//   Server policy decision: scope by classId by default; allow ?global=true
//   only when ENABLE_FREE_FOR_ALL_GLOBAL_LISTING=true on the server.

// POST /v1/rooms/:roomId/free-for-all-sessions
//   No invite token required. Requires authenticated Clerk identity.
//   Asserts room.type === "free-for-all".
//   Issues the same session response shape as POST /v1/rooms/:roomId/sessions
//   (LiveKit token, manifest, settings, room, role: "student").
```

Note that `role: "student"` is the *internal* role used so the join path produces the same downstream session record shape; UI labels override to "Participant".

**File: `apps/api/tests/api.test.ts`**

Tests in the new `describe("free-for-all dynamic boards", ...)` and `describe("free-for-all open join", ...)` blocks:

- POST creates a dynamic anchor on the east-room back wall and returns 200; GET sees it.
- POST fails (`409`/`422`) when overlapping an existing static anchor.
- POST fails when placed across an entrance gap.
- PATCH by a different user is forbidden unless that user is the room owner.
- DELETE removes the anchor and emits `room.board.removed.v1` via the outbox.
- POST count cap returns 409 once `MAX_DYNAMIC_ANCHORS_PER_ROOM` is reached.
- `GET /v1/rooms/free-for-all` returns only FFA rooms.
- `POST /v1/rooms/:roomId/free-for-all-sessions` succeeds without an invite token for an FFA room and 4xx for a classroom room.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/api` passes.
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "free-for-all"` passes (10+ new tests).

---

### Phase 5 — Web client: hooks, realtime, and lobby UX

Goal: client posts the new type, lists/joins open FFA rooms, hydrates dynamic anchors, listens to realtime, and renders them as anchors everywhere `wallAnchors` are used.

**File: `apps/web/lib/api.ts`**

1. Add typed wrappers:

   ```ts
   export function listFreeForAllRooms(identity: ApiIdentity, opts?: { classId?: string; limit?: number; global?: boolean }) { ... }
   export function joinFreeForAllRoom(identity: ApiIdentity, roomId: string) { ... }

   export function listDynamicWallAnchors(identity: ApiIdentity, roomId: string) { ... }
   export function createDynamicWallAnchor(identity: ApiIdentity, roomId: string, body: CreateDynamicWallAnchorRequest) { ... }
   export function updateDynamicWallAnchor(identity: ApiIdentity, roomId: string, anchorId: string, patch: UpdateDynamicWallAnchorRequest) { ... }
   export function removeDynamicWallAnchor(identity: ApiIdentity, roomId: string, anchorId: string) { ... }
   ```

**File: `apps/web/lib/config.ts`**

2. Add `enableFreeForAll: process.env.NEXT_PUBLIC_ENABLE_FREE_FOR_ALL === "true"`.

**File: `apps/web/lib/realtime.ts`**

3. Extend the realtime message union with the three new variants and route them through to subscribers (same pattern as the wall-object variants).

**File: `apps/web/lib/useDynamicWallAnchors.ts` (new)**

4. New hook mirroring the shape of `useWallObjects`:

   ```ts
   export function useDynamicWallAnchors(args: {
     identity: ApiIdentity | null;
     roomId: string | null;
     enabled: boolean;             // gated on roomTypeFeatures.dynamicBoards
     realtime: RealtimeBus;
   }): {
     anchors: DynamicWallAnchor[];
     create: (body: CreateDynamicWallAnchorRequest) => Promise<DynamicWallAnchor>;
     update: (id: string, patch: UpdateDynamicWallAnchorRequest) => Promise<DynamicWallAnchor>;
     remove: (id: string) => Promise<void>;
     refresh: () => Promise<void>;
     error: string | null;
   }
   ```

   Behavior:
   - Initial hydrate via `listDynamicWallAnchors()`.
   - 30 s periodic refresh (matches `useWallObjects` cadence).
   - Realtime subscriptions reconcile created/updated/removed events.
   - Optimistic local insert on `create`; reconcile when server responds.

**File: `apps/web/components/RoomClient.tsx`**

5. Derive a `roleLabels` branch for FFA:

   ```ts
   const roleLabels = useMemo(() => {
     switch (sessionInfo?.room.type) {
       case "workforce-training":
         return { hostSingular: "Instructor", hostInitial: "I", guestSingular: "Trainee", guestPlural: "Trainees" };
       case "free-for-all":
         return { hostSingular: "Participant", hostInitial: "P", guestSingular: "Participant", guestPlural: "Participants" };
       default:
         return { hostSingular: "Teacher", hostInitial: "T", guestSingular: "Student", guestPlural: "Students" };
     }
   }, [sessionInfo?.room.type]);
   ```

6. Derive `roomTypeFeatures = getRoomTypeFeatureFlags(sessionInfo?.room.type)` and pass `roomTypeFeatures.dynamicBoards` down to `RoomView3D`, `RoomView2D`, and `AnchorPanel`.

7. Mount `useDynamicWallAnchors({ ... enabled: roomTypeFeatures.dynamicBoards })` and merge `[...manifest.wallAnchors, ...dynamicAnchors]` into the props passed downstream.

**File: `apps/web/components/AnchorPanel.tsx`**

8. When `dynamicBoardsEnabled` is true and no anchor is selected, show a "Create new board" button that activates **placement mode** (a transient UI state shared via context or a hoisted state in `RoomClient`).

9. In placement mode, the cursor over a wall in 3D shows a translucent preview rectangle (see Phase 6). Confirming places the board via the `create` mutation.

10. Once an anchor is selected, surface a "Resize / Move / Rename" submenu for anchors whose `createdByUserId` equals the local user (and for the room owner). Hide for static anchors.

**File: `apps/web/components/Lobby.tsx`**

11. Extend the `RoomType` union:

    ```ts
    type RoomType = "classroom" | "workforce-training" | "free-for-all";
    ```

12. Extend `ROOM_TYPES`:

    ```ts
    { value: "free-for-all", label: "Free-for-All", description: "Open, social rooms. No invite code; place your own boards." }
    ```

13. Extend the dropdown filter (line 491) to also hide `"free-for-all"` when `CLIENT_TUNING.enableFreeForAll` is off.

14. Extend `ROOM_TYPE_FORM_DEFAULTS` with example FFA copy (e.g., `className: "Open Lounge"`, `roomName: "Hangout"`).

15. Extend `ROOM_TYPE_JOIN_COPY` with FFA copy (`guestSingular: "participant"`, `hostSingular: "host"`, `joinButtonLabel: "Browse rooms"`).

16. Add `case "free-for-all":` to `renderRoomTypeSteps()` (line 192). Structure:

    - Step 1: Create — single text input ("Room name"), button "Create room".
    - Step 2: Share — neutral invite code copy (FFA rooms *also* mint a code for direct linking, but it isn't required to join).
    - Step 3: Enter — button "Enter room".

17. Add a new **Browse Free-for-All rooms** UI inside the join column. This is a sibling of the existing "Join by invite code" form, gated to render only when `roomType === "free-for-all"` is selected:

    ```tsx
    {roomType === "free-for-all" && CLIENT_TUNING.enableFreeForAll && (
      <FreeForAllRoomList
        identity={identity}
        onJoin={(roomId) => void joinFreeForAllAndEnter(roomId)}
      />
    )}
    ```

    `FreeForAllRoomList` (new component in `apps/web/components/FreeForAllRoomList.tsx`) lists rooms from `listFreeForAllRooms()`, refreshes on a polling interval, and renders a Join button per row.

**File: `apps/web/components/Roster.tsx`**

18. Already accepts `roleLabels` — no code change needed; the `"P"` initial flows through.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: with the flag on, the lobby shows the Free-for-All option, the browse list, and the Create/Share/Enter steps with neutral copy.
- [ ] Manual: a participant joining an FFA room sees a Participant tag in the People panel, no Teacher tools, and the **Create new board** button in the Boards panel.

---

### Phase 6 — 3D + 2D rendering integration

Goal: dynamic anchors render alongside static ones; placement preview works in both views.

**File: `apps/web/components/RoomView3D.tsx`**

1. Accept a new `dynamicWallAnchors: WallAnchor[]` prop (same shape as static anchors) and a `placementMode: { active: boolean; previewWidth: number; previewHeight: number; } | null` prop.

2. Merge anchors when rendering:

   ```tsx
   const allAnchors = useMemo(() => [...manifest.wallAnchors, ...dynamicWallAnchors], [manifest.wallAnchors, dynamicWallAnchors]);
   ```

   Existing iteration sites at lines 1094 / 1114 / 1458 reference `allAnchors` instead of `manifest.wallAnchors`.

3. Placement preview: when `placementMode?.active`, attach a pointer-move handler to wall meshes that:

   - Raycasts pointer position against the wall mesh.
   - Computes the closest valid center on the wall surface (snapped to 0.25 m grid horizontally).
   - Renders a translucent rectangle of `previewWidth × previewHeight` oriented to the wall normal.
   - On click, calls `placementMode.onConfirm({ wallId, center, normal, width, height })` which routes through `useDynamicWallAnchors().create()`.

4. Curved walls: because the perimeter is 32 short straight segments, raycasts already hit the correct segment; no special handling needed.

**File: `apps/web/components/RoomView2D.tsx`**

5. Same merge: `[...manifest.wallAnchors, ...dynamicWallAnchors]` flows through `projectAnchorRectTo2D()` (line 287) untouched.

6. 2D placement mode: pointer-down on a wall projects to world space via `unprojectPointFrom2D`, finds the nearest wall segment, snaps to it, and triggers the same `create()` call.

**File: `apps/web/components/RoomView3D.tsx` (central square zone)**

7. Render the central 12×12 m square as a tinted floor decal (a flat `meshBasicMaterial` overlay at `y = 0.01`) to mark the activity hub visually. No collision or movement effect.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: a participant clicks "Create new board", points at the cylindrical wall, sees a translucent rectangle following the cursor, clicks to place, and the board appears immediately and on the second tab within ~1 s.

---

### Phase 7 — Polish and abuse controls

Goal: per-room caps surface to UX, spam prevention, and basic edge cases.

1. **Per-room cap UX.** When `countDynamicWallAnchorsForRoom(roomId) >= MAX_DYNAMIC_ANCHORS_PER_ROOM`, the "Create new board" button disables with the tooltip "This room is at the board limit (32 of 32)."

2. **Per-user soft cap (optional).** Track `dynamicWallAnchorsCreatedByUser[userId]` for the room and warn (but do not block) at 8+ per user. Hard block at 16 per user. Configurable via server env `FFA_PER_USER_BOARD_LIMIT` (default 16).

3. **Cascading delete on WallObjects.** Document the behavior: removing a dynamic anchor either (a) cascade-removes any wall objects pinned to it, or (b) requires the anchor to be empty first and returns 409 otherwise. Implementation chooses **(b)** in Phase 1 — safer and matches the existing "anchor is busy" pattern.

4. **Cleanup safety valve.** Add `DELETE /v1/rooms/:roomId/dynamic-wall-anchors` (no path id) gated on a backend admin Clerk role (or env-based admin email allowlist) to prune all dynamic anchors in a room. Not exposed to room participants.

5. **Title length / profanity guardrail.** Title is already capped at 80 chars in `CreateDynamicWallAnchorRequestSchema`. No profanity filter in Phase 1 (out of scope; documented).

6. **Audit trail.** Each create/update/remove writes a `RoomEvent` record (existing `RoomEvents` collection) for forensic purposes — same pattern as wall objects.

---

### Phase 8 — Feature flag rollout, env, and Playwright

**Env templates** — add to `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`:

```
ENABLE_FREE_FOR_ALL=false
NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=false
# Optional admin lever — gates the cross-org room browse list
ENABLE_FREE_FOR_ALL_GLOBAL_LISTING=false
# Per-user soft + hard caps for participant-placed boards (default 16)
FFA_PER_USER_BOARD_LIMIT=16
```

**Playwright** (`apps/web/test/free-for-all.spec.ts`, new):

```ts
test("participant creates an FFA room and a second participant joins without code", async ({ context }) => {
  // (1) Host tab: lobby → pick Free-for-All → create room.
  // (2) Second tab: lobby → pick Free-for-All → browse list → click Join.
  // (3) Both spawn in main circle; assert participant count = 2.
});

test("participant places a board on the cylindrical wall and second participant sees it", async ({ context }) => {
  // (1) Tab A: open Boards panel → Create new board → click on a perimeter wall.
  // (2) Assert anchor appears in DOM.
  // (3) Tab B: assert anchor appears in DOM via realtime sync.
  // (4) Tab A: delete the board → assert it disappears in both tabs.
});

test("ffa walls block movement", async ({ page }) => {
  // Move avatar toward a perimeter wall via window.__debug; assert clamped at face.
});
```

The Playwright web servers must boot with `ENABLE_FREE_FOR_ALL=true` and `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL=true` (update `playwright.config.ts`).

**Rollout:**

1. Land Phases 1–7 on `room-types` with both flags `false`. CI must stay green.
2. Flip flags on in staging. Internal walkthrough: 3 participants, exercise placement, deletion, and adjoining-room circulation.
3. Update `.cursor/memory.md` with a "ship" note (final dimension constants, board cap, join policy).
4. Update `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` with a "Free-for-All room type" section.
5. Production rollout: flip flags on. Room creators must still explicitly pick Free-for-All in the dropdown — no behavioral change to existing rooms.

---

## Files-to-touch summary

| Area | File | Phase |
|---|---|---|
| Contracts | `packages/contracts/src/index.ts` | 1 |
| OpenAPI | `packages/contracts/openapi/openapi.json` | 1 (regenerated) |
| Room engine | `packages/room-engine/src/index.ts` | 2 |
| Room engine tests | `packages/room-engine/tests/room-engine.test.ts` | 2 |
| API routes | `apps/api/src/app.ts` | 3, 4 |
| API config | `apps/api/src/config.ts` | 3 |
| API repository | `apps/api/src/repository.ts` | 3, 4 |
| API persistence | `apps/api/src/models/mongoose.ts` | 3, 4 |
| API tests | `apps/api/tests/api.test.ts` | 3, 4 |
| Web API client | `apps/web/lib/api.ts` | 5 |
| Web config flag | `apps/web/lib/config.ts` | 5 |
| Web realtime bus | `apps/web/lib/realtime.ts` | 5 |
| Dynamic board hook | `apps/web/lib/useDynamicWallAnchors.ts` | 5 |
| Room client wiring | `apps/web/components/RoomClient.tsx` | 5, 6 |
| Boards panel | `apps/web/components/AnchorPanel.tsx` | 5, 6 |
| Lobby UI | `apps/web/components/Lobby.tsx` | 5 |
| FFA browse list | `apps/web/components/FreeForAllRoomList.tsx` | 5 (new file) |
| 3D view | `apps/web/components/RoomView3D.tsx` | 6 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 6 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 8 |
| Playwright | `apps/web/test/free-for-all.spec.ts`, `playwright.config.ts` | 8 |
| Memory + status | `.cursor/memory.md`, `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` | 8 |

---

## Risks during implementation

- **Dynamic anchor validation completeness.** Server validation must reject every disallowed placement (off-wall, across entrance, overlapping). A weak validator allows participants to grief the room with overlapping or misplaced boards. **Mitigation:** dedicated `validateDynamicAnchorAgainstManifest()` helper with full unit coverage in `apps/api/tests/api.test.ts`, plus a Playwright test that attempts an overlap and confirms 409.
- **Realtime ordering.** Two participants creating boards in nearly the same spot can race. **Mitigation:** server validates against a fresh count + overlap check before insert; client treats `create()` as optimistic and reconciles on the server's response. Document that "last writer wins" for true ties.
- **Curved-wall raycast accuracy.** 32 straight segments mean the perimeter is faceted. Placement preview must snap to the *picked segment's* normal, not an interpolated normal, or the rectangle will appear to float. **Mitigation:** preview uses the raw wall normal from the hit segment; no interpolation.
- **Open join discoverability.** A globally-listed FFA room directory raises moderation and abuse concerns. **Mitigation:** Phase 1 default scopes the listing by `classId`. `ENABLE_FREE_FOR_ALL_GLOBAL_LISTING` is the explicit lever for org-wide listing later.
- **Wall object cascade.** Deleting an anchor that holds a wall object risks orphaning content. **Mitigation:** Phase 1 chooses the "anchor must be empty" rule and surfaces a clear 409 error in the UI.
- **2D circle projection.** `RoomView2D` currently assumes axis-aligned rectangles. Circular perimeter walls each project as separate small lines; the 2D map will look like a polygon. **Acceptable Phase 1 visual** — documented as such.
- **No movement-occlusion for hallway gaps in collision math.** The thick-wall `resolveWallCollisions()` blocks at the wall face; the perimeter gaps are simply *absent* wall segments. Verify that the gap angular width covers an entire hallway entrance (no half-width). **Mitigation:** a Phase 2 test sweeps avatar positions across each cardinal exit and asserts no collision blocks the doorway.
- **Mongoose default for legacy room docs.** `Room.type` already defaults to `"classroom"` at the schema layer; widening the enum to include `"free-for-all"` is backward-compatible. Confirmed — no migration required.

---

## Open implementation questions (resolved here)

| Question | Decision |
|---|---|
| Extend `RoleSchema` with a `participant` role? | **No.** Internal roles stay `teacher`/`student`; UX overrides labels to "Participant". |
| Use one `DynamicWallAnchor` entity or multiple per dynamic anchor type? | **One.** Reuses the existing `WallAnchor` shape end-to-end. |
| Render circular perimeter as curved geometry or straight segments? | **32 straight segments** (~5° each). Avoids new mesh code. |
| Reuse existing `POST /v1/rooms/:roomId/sessions` for open join? | **No.** New dedicated `POST /v1/rooms/:roomId/free-for-all-sessions` endpoint; existing invite-gated path untouched. |
| World skins in FFA Phase 1? | **No.** Curved-wall panorama unwrap is a follow-up. |
| Allow freestanding boards in the central square? | **No, Phase 1.** Wall-attached only. |
| Cascade delete of wall objects when removing their anchor? | **No.** Require anchor empty; return 409 otherwise. |
| Global cross-org FFA listing? | **Off by default.** Gated by `ENABLE_FREE_FOR_ALL_GLOBAL_LISTING`. |
| Per-user board cap? | **Soft warn at 8, hard at 16.** Configurable via `FFA_PER_USER_BOARD_LIMIT`. |
| Per-room board cap? | **32 dynamic anchors.** Plus the 4 static adjoining-room anchors = 36 total possible boards. |
| New realtime channel? | **No.** Reuses the existing reliable channel that already carries wall-object messages. |
| Allow Free-for-All rooms to be deleted by anyone? | **No.** Only the original creator (or admin) can delete the room. Anchors follow per-creator authz. |

---

## Validation evidence (fill in after implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing + new room-engine + API FFA tests)
- [ ] `npm run test -- packages/room-engine/tests/room-engine.test.ts -t "free-for-all"` — pass
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "free-for-all"` — pass
- [ ] `npm run test:e2e -- --grep "free-for-all"` — pass (3 specs)
- [ ] Manual: open-join flow (no invite code) works end-to-end with two browser tabs.
- [ ] Manual: dynamic board placement syncs across tabs within ~1 s.
- [ ] Manual: overlap and entrance-blocking placements are rejected with a clear error.
- [ ] Manual: cylindrical perimeter is impassable except through the 4 cardinal exits.
- [ ] Manual: adjoining-room static anchors render and accept the existing wall-object type set.
- [ ] Manual: with the feature flag off, the lobby dropdown shows only Classroom + Workforce Training.
