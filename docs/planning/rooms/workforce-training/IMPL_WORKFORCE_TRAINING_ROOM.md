# Implementation — Workforce Training Room Type

Source plan: [`PLAN_WORKFORCE_TRAINING_ROOM.md`](./PLAN_WORKFORCE_TRAINING_ROOM.md)
Branch: `room-types`
Last updated: 2026-05-26

---

## Status / Scope

**Status:** Not started. Planning only.

Phase 1 ships a new `"workforce-training"` room type end-to-end: a lobby entry, an API discriminator on `Room`, a new room-engine manifest factory with a multi-zone walkable layout (central training room + connected U-shaped outer hallway + three side rooms), 3D and 2D rendering of that geometry, and Instructor/Trainee UI relabeling. **No** new instructor abilities, no new HUD panels, no new realtime messages, no new actions, no world-skin support. Everything builds on the existing `RoomManifest`, `WallAnchor`, and classroom permission rails.

**In scope (Phase 1):**

- `RoomTypeSchema` discriminator on `Room` + `Room.type` field with `"classroom"` default for back-compat.
- Lobby room-type chooser activates `"workforce-training"`; new `case` in `renderRoomTypeSteps()` with Instructor/Trainee copy.
- `POST /v1/rooms` accepts an optional `type` and dispatches manifest generation accordingly.
- `createWorkforceTrainingManifest()` in `@3dspace/room-engine`: central + 3 hallways + 3 side rooms, 16 boards, connected outer corridor.
- `applyDefaultRoomGeometry()` and `applyDefaultWallAnchorDimensions()` become room-type-aware (must not normalize a workforce-training manifest into the classroom shell).
- `RoomView3D` + `RoomView2D` render the manifest as-is (no geometry-specific branching beyond existing wall iteration).
- Spatial audio falls out of distance-based attenuation; no zone occlusion.
- Instructor/Trainee labels in roster/HUD/lobby copy (UI only — internal roles still `teacher`/`student`).
- Feature flag `ENABLE_WORKFORCE_TRAINING` / `NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING` (default `false`).

**Out of scope (later phases):**

- New `instructor` / `trainee` role values in `RoleSchema`.
- Any instructor-specific classroom actions.
- Zone-aware spatial audio attenuation (walls don't occlude in Phase 1).
- World-skin support for workforce-training geometry.
- Per-zone bounds (`clampPositionToBounds` uses one outer rectangle in Phase 1).
- Ceilings / occluded skybox / interior dome.
- Per-zone 2D map overlays beyond a flat top-down projection.
- Trainee capacity above the current `maxRoomParticipants` default.

---

## Codebase context (pre-implementation state)

Before touching anything, note the following relevant code locations. Line numbers are accurate as of `room-types` HEAD.

| File | What matters |
|---|---|
| `apps/web/components/Lobby.tsx` | Room-type registry already scaffolded (lines 14–24). Active union is `RoomType = "classroom"` (line 17); `"workforce-training"` is commented in both the union (line 18) and the `ROOM_TYPES` array (line 22). `renderRoomTypeSteps()` at line 170 has a single `"classroom"` case with the three-step Create/Share/Enter grid and a commented placeholder at line 297. `createClassroom()` (line 71) hardcodes `createInvite(..., { role: "student", ... })` and the join button copy is `"Join class room"` (line 389). |
| `apps/web/lib/api.ts` | `createRoom(identity, classId, name)` at line 138 posts `{ classId, name }` to `POST /v1/rooms`. Must take an optional `type` argument and forward it. |
| `packages/contracts/src/index.ts` | `RoleSchema = z.enum(["teacher", "student"])` at line 4 — **do not extend in Phase 1**. `RoomSchema` at line 828 has no `type` field. `CreateRoomRequestSchema` at line 838 has `{ classId, name }`. `RoomManifestSchema` at line 133 is already shape-agnostic (variable-length `walls`, `spawnPoints`, `wallAnchors`, `tiers`, `bounds`) — no schema change needed for the multi-zone geometry. |
| `apps/api/src/app.ts` | `POST /v1/rooms` handler at line 2753 calls `createDefaultRoomManifest({...})` unconditionally (line 2758) and persists with `repository.createRoom({...})` (line 2772). Must branch on `body.type`. `applyDefaultWallAnchorDimensions(manifest)` is applied to fetched manifests at line 224 and line 2852 — these calls must skip workforce-training rooms. |
| `packages/room-engine/src/index.ts` | `createDefaultRoomManifest()` at line 149 is the canonical factory shape — copy this signature for `createWorkforceTrainingManifest()`. `applyDefaultRoomGeometry()` at line 652 **overwrites** `dimensions`, `bounds`, `tiers`, `spawnPoints`, `walls`, `wallAnchors`, `hallpassHoldingZone` of any passed manifest — this will destroy a workforce-training manifest unless gated. `applyDefaultWallAnchorDimensions()` at line 629 only touches anchors that share IDs with the classroom defaults, so it is mostly safe but still should be gated. `clampPositionToBounds()` at line 366 clamps to a single rectangular `manifest.bounds` — Phase 1 uses one outer rectangle that encloses the entire workforce-training footprint; walls (rendered server-side from manifest) provide the visual room separation but **do not occlude movement** in Phase 1. |
| `apps/web/lib/manifest.ts` | `normalizeRoomManifest()` unconditionally calls `applyDefaultRoomGeometry()`. Must become room-type-aware (or — preferred — be removed once `applyDefaultRoomGeometry` itself is gated). |
| `apps/web/components/RoomView3D.tsx` | Walls are rendered by `manifest.walls.map((wall) => <WallMesh ... />)` at lines 1094, 1114, 1458. No code change required — geometry-agnostic. The third-person camera follow + click-to-move are also manifest-driven and need no change. |
| `apps/web/components/RoomView2D.tsx` | Uses `projectAnchorRectTo2D(manifest, anchor)` at line 287. Projects from `manifest.bounds`, so a single enclosing rectangle works for Phase 1. |
| `apps/web/lib/useAvatarMovement.ts` | Calls `clampPositionToBounds(input.manifest, ...)` at lines 139 and 192. Phase 1 accepts that walkable bounds = one outer rectangle. |
| `apps/web/components/Roster.tsx` | Hardcodes `"T"` tag for teachers (line 116) and uses `role === "teacher"` for sort priority (lines 36–47). Label is short enough to be ambiguous — Phase 1 swaps to `"I"` for instructor in workforce-training rooms via a new `roleLabels` prop. |
| `apps/web/components/RoomClient.tsx` | Receives `manifest` and `role` from the room session response; threads `role` into `Roster` and similar components. Right place to derive `roomType` from the room session response and pass a `roleLabels` bag downstream. |
| `apps/api/src/repository.ts` | `createRoom` signature at line 89 (interface) and line 330 (in-memory impl) accepts `{ classId; name; settings; manifest }`. Add `type` to the input. Mongoose schema in `apps/api/src/models/mongoose.ts` line 470 likewise needs the field. |
| `apps/api/src/models/mongoose.ts` | `RoomDocument` schema persists `RoomRecord` fields. Add `type` with `default: "classroom"`. |

---

## Plan adjustments

Two clarifications on top of the PLAN doc, based on the codebase walkthrough:

**A. `applyDefaultRoomGeometry` must become room-type-aware before any new manifest factory ships.** PLAN § 5 implies the new factory is additive. In practice the existing normalization pipeline aggressively rewrites every fetched manifest to the default classroom shell (see `apps/web/lib/manifest.ts` → `applyDefaultRoomGeometry`). The first server-side write would persist a workforce-training manifest, then the first client fetch would re-normalize it into a 30×30 classroom and the geometry would silently disappear. Phase 1 explicitly fixes this in the same commit that introduces the factory.

**B. Phase 1 walkable bounds = one outer rectangle, not per-zone polygons.** PLAN § 4.6 hints at zone-based audio. Phase 1 keeps `clampPositionToBounds` as-is (single `manifest.bounds` rectangle) and lets manifest walls visually divide the spaces. Practical consequence: in Phase 1 a Trainee can walk through a wall mesh by holding a movement key — accepted Phase 1 limitation, called out in § 8 of the PLAN. Real wall-occlusion movement is a follow-up; doing it now would inflate the scope of `room-engine`.

**C. No new role enum value.** PLAN § 2 leaves the choice open. Implementation chooses **alias instructor→teacher, trainee→student**. Reasons: (i) `RoleSchema` flows through more than a dozen schemas + UI files + tests; (ii) Phase 1 has no behavior divergence; (iii) UI relabeling is a localized prop change. The new role values land when the first instructor-specific ability lands.

---

## Phased implementation

### Phase 1 — Contracts: `RoomType` + `Room.type`

Goal: schemas accept a discriminator and existing rooms continue to validate.

**File: `packages/contracts/src/index.ts`**

1. Above `RoomSettingsSchema`, add:

   ```ts
   export const RoomTypeSchema = z.enum(["classroom", "workforce-training"]);
   export type RoomType = z.infer<typeof RoomTypeSchema>;
   ```

2. Extend `RoomSchema` (currently at line 828) with:

   ```ts
   type: RoomTypeSchema.default("classroom"),
   ```

   Place it adjacent to `name` for readability. The `.default("classroom")` is required so existing persisted documents validate.

3. Extend `CreateRoomRequestSchema` (currently at line 838) with:

   ```ts
   type: RoomTypeSchema.optional(),
   ```

   Treat absence as `"classroom"` for back-compat with current clients.

4. Regenerate OpenAPI: `npm run openapi` (script lives in `packages/contracts/package.json`). Commit the regenerated `packages/contracts/openapi/openapi.json`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/contracts` passes.
- [ ] `npm test -- packages/contracts/tests` passes (existing room tests still validate against the new `.default("classroom")`).

---

### Phase 2 — Room-engine: `createWorkforceTrainingManifest()`

Goal: a new manifest factory and a normalization helper, with unit-test parity to the classroom factory.

**File: `packages/room-engine/src/index.ts`**

1. Below the classroom `createDefaultRoomManifest()` block (around the end of its definition at line ~600), add a new factory. Use exported constants for every dimension so tests and renderers can reference them.

   ```ts
   // ── Workforce Training layout ──────────────────────────────────────────────
   // Central training room (40×40 m) sits at the origin. Outer U-shaped hallway
   // wraps the left, back, and right sides. One 10×10 side room hangs off each
   // hallway. The three hallways are joined at the back corners so a participant
   // can move side-room → hallway → side-room without re-entering the central
   // room.

   export const WT_CENTRAL_WIDTH = 40;
   export const WT_CENTRAL_DEPTH = 40;
   export const WT_WALL_HEIGHT = 8;
   export const WT_HALLWAY_WIDTH = 4;
   export const WT_SIDE_ROOM_SIZE = 10;
   export const WT_ENTRANCE_WIDTH = 3; // doorway opening on each entrance wall
   export const WT_BOARD_WIDTH = 6;
   export const WT_BOARD_HEIGHT = widescreenHeight(WT_BOARD_WIDTH);
   ```

2. Implement the factory:

   ```ts
   export function createWorkforceTrainingManifest(input: {
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

     // Coordinate convention (matches the classroom factory):
     //   +X = right, +Z = back (away from instructor), Y = up.
     //   Central room is centered on the origin: x ∈ [-20, 20], z ∈ [-20, 20].
     //   Outer rectangle includes the hallway band on left/back/right:
     //     x ∈ [-20 - 4, 20 + 4] = [-24, 24]
     //     z ∈ [-20,     20 + 4] = [-20, 24]   (no hallway on the front wall)
     //   Side rooms hang off the outer edge of each hallway:
     //     Left  side room: x ∈ [-24 - 10, -24], z ∈ [-5, 5]
     //     Back  side room: x ∈ [-5, 5],         z ∈ [24, 24 + 10]
     //     Right side room: x ∈ [24, 24 + 10],   z ∈ [-5, 5]
     //
     // Phase 1 walkable bounds are one rectangle that covers the whole footprint;
     // walls visually divide the spaces but do not occlude movement.

     const manifest: RoomManifest = {
       id: input.id ?? `${input.roomId}:manifest:v${input.version ?? 1}`,
       roomId: input.roomId,
       version: input.version ?? 1,
       name: input.name ?? "Workforce Training",
       dimensions: {
         // outer extents including hallways + side rooms
         width: 68,  // -34 .. +34
         depth: 54,  // -20 .. +34
         height: WT_WALL_HEIGHT
       },
       bounds: {
         minX: -34, maxX: 34,
         minZ: -20, maxZ: 34
       },
       tiers: [],
       spawnPoints: [
         // Instructor — front of central room, facing the back of the room.
         { id: "spawn-instructor", label: "Instructor", position: { x: 0, y: 0, z: -17 }, rotation: { y: 0 } },
         // Trainees — center of the central room, also facing the front wall.
         { id: "spawn-trainee-1", label: "Trainee 1", position: { x: -3, y: 0, z: 0 }, rotation: { y: Math.PI } },
         { id: "spawn-trainee-2", label: "Trainee 2", position: { x:  0, y: 0, z: 0 }, rotation: { y: Math.PI } },
         { id: "spawn-trainee-3", label: "Trainee 3", position: { x:  3, y: 0, z: 0 }, rotation: { y: Math.PI } },
         // (additional trainee spawns omitted here for brevity — generate in a 5×5 grid
         //  inside the central room, x ∈ [-9, 9], z ∈ [-3, 9])
       ],
       walls: buildWorkforceTrainingWalls(),
       wallAnchors: buildWorkforceTrainingAnchors(),
       projection: { kind: "top-down-v1", scale: 1, origin: { x: 0, y: 0 } },
       capabilities: createRoomCapabilities(config),
       spatialAudio: config.spatialAudio,
       hallpassHoldingZone: { minX: -22, maxX: -20, minZ: -2, maxZ: 2 },
       features: [
         // Same default features as the classroom; no workforce-specific feature
         // flags exist yet.
       ],
       createdAt: input.createdAt ?? new Date().toISOString()
     };

     return RoomManifestSchema.parse(manifest);
   }
   ```

3. Implement `buildWorkforceTrainingWalls()` as a private helper inside the same file. Wall segments are split around entrances; this is the same pattern the classroom factory uses for the back wall.

   Required wall segments (16 visual walls minimum, each with one entrance becomes 2 collinear segments per wall with an entrance):

   | Wall | Segments | Notes |
   |---|---|---|
   | Central front (z = -20) | 1 segment | No entrance. Holds the main instructor board anchor. |
   | Central left (x = -20)  | 2 segments | Entrance opening centered on z = 0 of width `WT_ENTRANCE_WIDTH`. |
   | Central right (x = 20)  | 2 segments | Entrance centered on z = 0. |
   | Central back (z = 20)   | 2 segments | Entrance centered on x = 0. |
   | Hallway outer left (x = -24)  | 1 segment, z = -20 .. 20 | No entrance — outer skin. |
   | Hallway outer back (z = 24)   | 2 segments | Entrance to the back side room centered on x = 0. |
   | Hallway outer right (x = 24)  | 1 segment, z = -20 .. 20 | No entrance — outer skin. |
   | Hallway front caps (z = -20, x ∈ [-24,-20] and x ∈ [20,24]) | 1 segment each | Closes the U at the front. |
   | Left  side room (4 walls) | 4 segments, one has the entrance to the hallway | Entrance on the side wall facing the hallway. |
   | Back  side room (4 walls) | 4 segments, entrance on the south wall | Faces the hallway. |
   | Right side room (4 walls) | 4 segments, entrance on the side wall | Faces the hallway. |

   Hallway-corner continuity at `(±20 ± 4, 20 ± 4)` is achieved by **not** adding any internal wall segment between the left/back and right/back hallway bands. The connector squares stay open to each other, but short outer-cap segments at `x = ±24, z ∈ [20, 24]` and `z = 24, x ∈ [-24, -20] ∪ [20, 24]` keep participants inside the intended hallway-plus-rooms footprint.

4. Implement `buildWorkforceTrainingAnchors()` — 16 `WallAnchor` records:

   | Zone | Anchors | Notes |
   |---|---|---|
   | Central room | 4 (front, left, right, back) | Front anchor is the main instructor board; widths = `PRIMARY_BOARD_WIDTH` / `WT_BOARD_WIDTH` as appropriate. `metadata.accepts = [...FULL_WALL_OBJECT_ACCEPTS]`. |
   | Left side room | 4 (one per wall) | All accept `FULL_WALL_OBJECT_ACCEPTS`. |
   | Back side room | 4 (one per wall) | Same. |
   | Right side room | 4 (one per wall) | Same. |

   Centers: each anchor is centered on the midpoint of its wall, at world Y = 4.0, with `normal` pointing inward.

5. Make the normalization helpers room-type-aware:

   ```ts
   // Replace the two helpers' top-level signatures or add early-return guards.

   export function applyDefaultRoomGeometry(
     manifest: RoomManifest,
     roomType: RoomType = "classroom"
   ): RoomManifest {
     if (roomType !== "classroom") return manifest;
     // ... existing classroom rewrite ...
   }

   export function applyDefaultWallAnchorDimensions(
     manifest: RoomManifest,
     roomType: RoomType = "classroom"
   ): RoomManifest {
     if (roomType !== "classroom") return manifest;
     // ... existing classroom anchor dimension rewrite ...
   }
   ```

   `RoomType` import comes from `@3dspace/contracts`. The `= "classroom"` defaults keep existing call sites compiling; the targeted updates in Phase 3/4 pass the real `room.type`.

**File: `packages/room-engine/tests/room-engine.test.ts`**

6. New `describe("workforce training manifest", ...)` block:

   - Manifest parses against `RoomManifestSchema`.
   - Has exactly 16 `wallAnchors`.
   - Has at least one wall segment per outer surface (~22 segments minimum).
   - `applyDefaultRoomGeometry(workforceManifest, "workforce-training")` returns the input unchanged.
   - `applyDefaultRoomGeometry(workforceManifest, "classroom")` overwrites geometry (current behavior preserved; test guards against an accidental future change).
   - `clampPositionToBounds(workforceManifest, { x: 0, y: 0, z: 0 })` returns the input (origin is walkable).
   - Spawn points include `"spawn-instructor"` and at least one `spawn-trainee-*`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/room-engine` passes.
- [ ] `npm test -- packages/room-engine/tests/room-engine.test.ts` passes.

---

### Phase 3 — API: dispatch on `Room.type`

Goal: `POST /v1/rooms` accepts the new discriminator; persistence stores it; fetched manifests aren't reset to the classroom layout.

**File: `apps/api/src/app.ts`**

1. Import the new factory and the helpers:

   ```ts
   import {
     applyDefaultWallAnchorDimensions,
     createDefaultRoomManifest,
     createWorkforceTrainingManifest,
     // ...existing imports
   } from "@3dspace/room-engine";
   ```

2. In `POST /v1/rooms` (line 2753), dispatch on `body.type`:

   ```ts
   const roomType: RoomType = body.type ?? "classroom";
   const manifestFactory =
     roomType === "workforce-training"
       ? createWorkforceTrainingManifest
       : createDefaultRoomManifest;

   const manifest = manifestFactory({
     roomId,
     name: body.name,
     config: { ...same tuning config as before... }
   });

   return RoomWithManifestSchema.parse(
     await repository.createRoom({
       classId: body.classId,
       name: body.name,
       type: roomType,
       settings: roomSettings(config),
       manifest
     })
   );
   ```

3. Update **both** call sites of `applyDefaultWallAnchorDimensions(manifest)`:

   - Line 224 (`requireRoomAccess` helper return) — pass `room.type` as second arg.
   - Line 2852 (`POST /v1/rooms/:roomId/session` handler) — pass `room.type` as second arg.

   Both call sites already have the loaded `RoomRecord` (`room`) in scope, so this is a one-line edit each.

4. **Feature flag gate** on the create handler:

   ```ts
   if (roomType === "workforce-training" && !config.featureFlags.enableWorkforceTraining) {
     throw forbidden("Workforce training rooms are disabled in this environment");
   }
   ```

   Place the check immediately after parsing `body` and resolving `roomType`.

**File: `apps/api/src/config.ts`**

5. Read `ENABLE_WORKFORCE_TRAINING` (boolean, default `false`) and expose it under `config.featureFlags.enableWorkforceTraining`. Follow the same pattern used for `ENABLE_BREAKOUT_PODS` / `ENABLE_ROOM_OBJECTS`.

**File: `apps/api/src/repository.ts`**

6. Add `type: RoomType` to the `createRoom` input shape (line 89 interface, line 330 in-memory impl). Default to `"classroom"` when missing for safety. Update `normalizeRoomRecord` (around line 362) similarly.

**File: `apps/api/src/models/mongoose.ts`**

7. Add to the `RoomDocument` schema (line ~470):

   ```ts
   type: { type: String, enum: ["classroom", "workforce-training"], default: "classroom" }
   ```

   Existing documents load with `type: "classroom"` via the schema default.

**File: `apps/api/tests/api.test.ts`**

8. New `describe("workforce-training room type", ...)` block:

   - With `ENABLE_WORKFORCE_TRAINING=false`, `POST /v1/rooms` with `type: "workforce-training"` returns 403.
   - With the flag on, `POST /v1/rooms` with `type: "workforce-training"` returns a room with `type === "workforce-training"` and a manifest with 16 anchors.
   - The created room's manifest contains a wall anchor whose label includes `"left side room"` (sanity check that we built the multi-room shape, not the classroom).
   - `GET /v1/rooms/:roomId/manifest` for that room **does not** rewrite geometry to the classroom — `manifest.dimensions.width === 68`.
   - Existing classroom tests (room creation without `type`) still pass with the new `Room.type` defaulting to `"classroom"`.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/api` passes.
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "workforce-training"` passes (4 new tests).
- [ ] Full API suite still passes.

---

### Phase 4 — Web client: API surface + manifest normalization

Goal: client posts `type` on create, doesn't re-normalize workforce-training manifests, and threads `roomType` into the room view.

**File: `apps/web/lib/api.ts`**

1. Widen `createRoom`:

   ```ts
   export function createRoom(
     identity: ApiIdentity,
     classId: string,
     name: string,
     type: RoomType = "classroom"
   ) {
     return apiFetch<RoomWithManifest>("/v1/rooms", {
       method: "POST",
       identity,
       body: { classId, name, type }
     });
   }
   ```

   Import `RoomType` from `@3dspace/contracts`.

**File: `apps/web/lib/manifest.ts`**

2. Make the normalizer room-type-aware:

   ```ts
   import type { RoomManifest, RoomType } from "@3dspace/contracts";
   import { applyDefaultRoomGeometry } from "@3dspace/room-engine";

   export function normalizeRoomManifest(
     manifest: RoomManifest,
     roomType: RoomType = "classroom"
   ): RoomManifest {
     return applyDefaultRoomGeometry(manifest, roomType);
   }
   ```

3. Audit every existing call site of `normalizeRoomManifest` (`grep` the workspace). Each must pass the room type from the session response. The session response includes a `room` field — use `room.type`.

**File: `apps/web/lib/config.ts`**

4. Add the client flag:

   ```ts
   enableWorkforceTraining: process.env.NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING === "true",
   ```

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: `curl` `POST /v1/rooms` with `type: "workforce-training"` and verify the response has the multi-zone manifest.

---

### Phase 5 — Lobby: activate the room-type chooser

Goal: an Instructor can pick "Workforce Training" in the lobby and walk through Create / Share / Enter without touching the existing classroom flow.

**File: `apps/web/components/Lobby.tsx`**

1. Activate the union and registry (uncomment lines 18, 22):

   ```ts
   type RoomType = "classroom" | "workforce-training";

   const ROOM_TYPES: { value: RoomType; label: string; description: string }[] = [
     { value: "classroom",          label: "Classroom",          description: "Live 3D sessions with students and a shareable invite code." },
     { value: "workforce-training", label: "Workforce Training", description: "Immersive training sessions for teams and organizations." },
   ];
   ```

2. **Behind the client flag**, hide the option when the flag is off — render only the entries from `ROOM_TYPES` whose value is allowed in this build. Reuse the existing render loop:

   ```ts
   {ROOM_TYPES
     .filter((rt) => rt.value !== "workforce-training" || CLIENT_TUNING.enableWorkforceTraining)
     .map((rt) => ...)}
   ```

3. Generalize the existing `createClassroom()` (line 71). Rename it to `createRoomOfType(roomType: RoomType)` and pass the type to `createRoom()`:

   ```ts
   const classRecord = await createClass(identity, className);
   const room = await createRoom(identity, classRecord.id, roomName, roomType);
   const invite = await createInvite(identity, classRecord.id, { role: "student", roomId: room.room.id });
   ```

   The invite role stays `"student"` because internal roles are unchanged in Phase 1. The lobby copy elsewhere is what changes.

4. Update `renderRoomTypeSteps()` (line 170) to add the workforce-training case. Keep the three-step Create / Share / Enter grid but relabel: `"Class name"` → `"Organization / Team name"`, `"Room name"` → `"Session name"`, the Step 1 button reads `"Create training"`, Step 2 reads `"Share with trainees"`, Step 3 reads `"Enter training"`. Code structure mirrors the classroom case verbatim.

   ```tsx
   case "workforce-training":
     return (
       <div className="lb-steps-grid">
         {/* Step 1: Create */}
         <div className="lb-step-col">
           <div className="lb-step-hd">
             <div className={`lb-step-badge${hasRoom ? " lb-step-badge-done" : ""}`}>
               {hasRoom ? "✓" : "1"}
             </div>
             <div>
               <p className="lb-step-title">Create</p>
               <p className="lb-step-desc">Name your team and session</p>
             </div>
           </div>
           <div className="lb-step-body">
             <div className="lb-field">
               <label className="lb-label" htmlFor="lb-team-name">Organization / Team name</label>
               <input id="lb-team-name" className="lb-inp" value={className}
                 onChange={(e) => setClassName(e.target.value)}
                 placeholder="e.g. Acme Field Ops" />
             </div>
             <div className="lb-field">
               <label className="lb-label" htmlFor="lb-session-name">Session name</label>
               <input id="lb-session-name" className="lb-inp" value={roomName}
                 onChange={(e) => setRoomName(e.target.value)}
                 placeholder="e.g. Compliance Refresher" />
             </div>
             <button className="lb-btn lb-btn-pri" disabled={busy || authDisabled}
               onClick={() => void createRoomOfType("workforce-training")}>
               {busy ? "Creating…" : "Create training"}
             </button>
           </div>
         </div>
         {/* Steps 2 + 3 follow the same structure with trainee-flavored copy */}
       </div>
     );
   ```

5. Update the student-invite block (lines 364–393): the divider pill, the button label, and the heading hint are currently classroom-flavored. Keep the existing copy — Phase 1 does not branch the join page on roomType; the same invite-code box accepts both classroom and workforce-training invites. (A future polish item is to swap the lobby pill copy based on the type that the invite resolves to, but resolution happens server-side after submit.)

6. Update `apps/web/test/mvp.spec.ts` only if the button label `"Join class room"` is changed. **Phase 1 keeps that label** to minimize churn; Trainees and Students share the same join control.

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: with the flag on, picking "Workforce Training" shows the relabeled three-step UI; picking "Classroom" preserves the existing UI verbatim.
- [ ] Manual: with the flag off, only "Classroom" appears in the dropdown.

---

### Phase 6 — In-room labels: Instructor / Trainee

Goal: roster, nameplates, and any teacher-flavored copy in the live room read "Instructor" / "Trainee" when `room.type === "workforce-training"`.

**Design:** add a single derived `roleLabels` object plumbed from `RoomClient` down to leaf components. Avoid switching on `room.type` in every component.

**File: `apps/web/components/RoomClient.tsx`**

1. Near the top of the component, derive labels from the session response:

   ```ts
   const roleLabels = useMemo(() => {
     if (sessionInfo?.room.type === "workforce-training") {
       return { hostSingular: "Instructor", hostInitial: "I", guestSingular: "Trainee", guestPlural: "Trainees" };
     }
     return { hostSingular: "Teacher", hostInitial: "T", guestSingular: "Student", guestPlural: "Students" };
   }, [sessionInfo?.room.type]);
   ```

2. Thread `roleLabels` into `<Roster ... />` and any nameplate / HUD callsite that hardcodes "Teacher" / "Student".

**File: `apps/web/components/Roster.tsx`**

3. Accept `roleLabels` as an optional prop with a classroom default. Use `roleLabels.hostInitial` for the role tag at line 116 and the `aria-label` text at line 110. Sort priority logic stays unchanged (it uses internal `role`, not the label).

**Other label sites** (audit and update with the same prop):

- Avatar nameplate "Teacher" tags (if any).
- Help-queue badge copy ("teacher will be with you shortly" etc.).
- People panel tooltips.

`grep -ri "Teacher\|Student" apps/web/components` after Phase 6 should return only the strings inside `roleLabels` defaults, plus existing classroom-only HUD copy that is **not** reachable in workforce-training rooms (because none of the classroom tools — lesson run, private check, group work, breakout pods — are surfaced in workforce-training rooms in Phase 1).

**Checkpoint:**

- [ ] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: in a workforce-training room the People panel shows an "I" tag on the host; in a classroom it still shows "T".

---

### Phase 7 — Geometry verification & polish

Goal: visual + interaction sanity in 3D and 2D. No new code; manual walk-through plus targeted unit tests covering edges of the layout.

**Manual scripted walkthrough (two browser tabs):**

1. Instructor creates a Workforce Training room.
2. Trainee accepts the invite.
3. Both spawn inside the central room.
4. Instructor walks out the **left** entrance → enters left hallway → walks back along the hallway → reaches **back hallway corner** without crossing through the central room.
5. From the back hallway corner, walks across the back hallway → reaches the **right hallway** → re-enters the central room from the right.
6. Same exercise via each side room: enter side room from its adjacent hallway, exit, traverse via hallway path to another side room.
7. Each room contains 4 boards; placing a wall object on each side-room board syncs to the other tab.

**Acceptance:**

- [ ] U-shape circulation works: a participant can move from the left side room to the right side room via the hallway path without entering the central room.
- [ ] 2D map renders the central + outer hallway band + three side rooms as a single top-down projection from the manifest bounds.
- [ ] All 16 boards accept wall objects via the existing `WallAnchor` pipeline.
- [ ] Spatial audio attenuates with distance (Phase 1 expectation: voices from the central room are quieter but audible in side rooms — see § 8 of the PLAN).

**Edge tests** (in `packages/room-engine/tests/room-engine.test.ts`):

- Walking from a point inside the left side room (e.g. `{ x: -30, y: 0, z: 0 }`) to a point inside the right side room (`{ x: 30, y: 0, z: 0 }`) via `clampPositionToBounds` always returns a valid in-bounds position. (Sanity: bounds rectangle covers both side rooms.)
- A point outside the outer rectangle (e.g. `{ x: 40, y: 0, z: 0 }`) clamps to `manifest.bounds.maxX = 34`.

---

### Phase 8 — Feature flag rollout

Goal: ship the type behind a flag, off by default; flip on per-environment.

**Env templates:** add the new vars to `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example`:

```
ENABLE_WORKFORCE_TRAINING=false
NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING=false
```

Place them adjacent to the existing `ENABLE_BREAKOUT_PODS` / `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS` lines.

**Playwright** (`apps/web/test/workforce-training.spec.ts`, new): one happy-path test.

```ts
test("instructor creates workforce-training room and trainee joins", async ({ context }) => {
  // (1) Instructor tab: open lobby, pick Workforce Training, create room.
  // (2) Capture invite code.
  // (3) Open second context, join via invite.
  // (4) Both spawn; assert manifest.dimensions.width === 68 via window.__debug.manifest.
  // (5) Trainee walks ~+30 along X; movement remains in bounds.
});
```

Mirror the existing classroom Playwright setup (`apps/web/test/mvp.spec.ts`). The Playwright config must boot the dev servers with both `ENABLE_WORKFORCE_TRAINING=true` flags.

**Rollout:**

1. Land Phases 1–7 on `room-types` with both flags `false`. CI must stay green.
2. Flip `ENABLE_WORKFORCE_TRAINING=true` + `NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING=true` in staging.
3. Internal walkthrough: instructor + 2 trainees, exercise the U-shape circulation.
4. Update `.cursor/memory.md` with a "ship" note (chosen `type` enum values, room dimensions, hallway topology).
5. Update `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` with a "Workforce Training room type" section.
6. Production rollout: flip both flags on; per-room defaults remain unchanged (creation still requires explicit dropdown selection by the host).

---

## Files-to-touch summary

| Area | File | Phase |
|---|---|---|
| Contracts | `packages/contracts/src/index.ts` | 1 |
| OpenAPI | `packages/contracts/openapi/openapi.json` | 1 (regenerated) |
| Room engine | `packages/room-engine/src/index.ts` | 2 |
| Room engine tests | `packages/room-engine/tests/room-engine.test.ts` | 2, 7 |
| API routes | `apps/api/src/app.ts` | 3 |
| API config | `apps/api/src/config.ts` | 3 |
| API repository | `apps/api/src/repository.ts` | 3 |
| API persistence | `apps/api/src/models/mongoose.ts` | 3 |
| API tests | `apps/api/tests/api.test.ts` | 3 |
| Web API client | `apps/web/lib/api.ts` | 4 |
| Web manifest helper | `apps/web/lib/manifest.ts` | 4 |
| Web feature flag | `apps/web/lib/config.ts` | 4 |
| Lobby UI | `apps/web/components/Lobby.tsx` | 5 |
| Room client wiring | `apps/web/components/RoomClient.tsx` | 6 |
| Roster labels | `apps/web/components/Roster.tsx` | 6 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 8 |
| Playwright | `apps/web/test/workforce-training.spec.ts`, `playwright.config.ts` | 8 |
| Memory + status | `.cursor/memory.md`, `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` | 8 |

---

## Risks during implementation

- **`applyDefaultRoomGeometry` clobber.** The single biggest risk. The current normalizer is unconditional and rewrites every persisted manifest into the classroom shell on the way to the client. Phase 2 + Phase 4 gate it on `roomType`. A regression here silently turns a workforce-training room back into a classroom. **Mitigation:** the Phase 3 API test asserts `manifest.dimensions.width === 68` on the fetched manifest, which is impossible if normalization fired.
- **Wall segments + entrances.** Manifest walls are line segments, not polygons. Each entrance becomes a gap by splitting the wall into two collinear segments. Miscalculated split coordinates create visible holes or block doorways. **Mitigation:** constants for every dimension (`WT_*` exports) and a Phase 2 unit test that counts wall segments per zone.
- **No movement occlusion in Phase 1.** Walkable bounds are one outer rectangle; walls don't stop the avatar. Trainees can walk through any wall. **Mitigation:** documented as Phase 1 limitation in PLAN § 8. Promoted to a follow-up phase before public launch.
- **`RoleSchema` not extended.** Some downstream copy may hardcode `"teacher"` / `"student"` (HUD strings, log messages). The Phase 6 grep audit must be thorough; missed strings will leak Classroom vocabulary into workforce-training rooms.
- **Classroom-only tools surfacing in workforce-training rooms.** Lesson run, private check, breakout pods, hall pass all gate on their own feature flags and on classroom UI patterns. Phase 1 does **not** disable them by `room.type` — they remain available because internal roles are unchanged. If a district enables both `ENABLE_CLASSROOM_LESSONS` and `ENABLE_WORKFORCE_TRAINING`, a workforce-training room can technically run a "lesson". Documented Phase 1 behavior; intentional follow-up.
- **2D bounds rectangle.** A 68×54 rectangle is larger than the classroom's 30×30. The 2D map will render at a different scale by default. `projectAnchorRectTo2D` already scales by manifest bounds, so this is mostly automatic, but the 2D HUD card sizing in `RoomView2D` may need a CSS aspect tweak.
- **Mongoose default for existing docs.** Phase 3 step 7 sets `default: "classroom"`. Mongoose only applies defaults on **write**, so existing docs that have never been re-saved may parse as `type: undefined`. The Zod `.default("classroom")` on `RoomSchema` covers this at read time; the Mongoose default ensures new persistence has the field. Both are required.
- **Playwright dev-server flag.** Existing Playwright config must boot the API + web servers with `ENABLE_WORKFORCE_TRAINING=true`; otherwise the dropdown won't render and the test silently times out.

---

## Open implementation questions (resolved here)

| Question | Decision |
|---|---|
| Extend `RoleSchema` with `"instructor"` / `"trainee"` in Phase 1? | **No.** UI-only relabel; internal roles unchanged. |
| Single rectangular `bounds` or per-zone bounds? | **Single outer rectangle** for Phase 1. Per-zone clamp is a follow-up. |
| Should workforce-training rooms allow world skins? | **No** (PLAN § 7). Skin chooser is hidden when `room.type !== "classroom"`. |
| Should hallway entrances render a door mesh? | **No** — open gap in wall segments. |
| Should classroom-only HUD panels (lesson run, private check, etc.) be hidden in workforce-training rooms? | **Not in Phase 1.** Tools remain available because internal roles map straight through. Documented follow-up. |
| Where do we draw boards above the central-room doorways? | Anchor centers sit **above** the entrance opening (anchor `y = 4.0` with `WT_BOARD_HEIGHT ≈ 3.4`). Entrance height is half the wall height; the board lives in the upper half. |
| New realtime messages? | **None.** Avatar state + wall object messages already work geometry-agnostic. |

---

## Validation evidence (fill in after implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing + new room-engine + API workforce-training tests)
- [ ] `npm run test -- packages/room-engine/tests/room-engine.test.ts -t "workforce training"` — pass
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "workforce-training"` — pass
- [ ] `npm run test:e2e -- --grep "workforce training"` — pass
- [ ] Manual: U-shape circulation walkthrough (Instructor + 1 Trainee, two browser tabs)
- [ ] Manual: 2D map shows central + outer hallway band + three side rooms
- [ ] Manual: People panel shows "I" tag on the host in workforce-training, "T" in classroom
- [ ] Manual: with the feature flag off, the lobby dropdown shows only Classroom
