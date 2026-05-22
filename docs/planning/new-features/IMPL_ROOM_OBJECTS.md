# Implementation Plan — 3D Manipulatives ("RoomObject" library)

Source plan: [`PLAN_ROOM_OBJECTS.md`](./PLAN_ROOM_OBJECTS.md).
Source idea: `LEARNING_FEATURE_IDEAS.md` § Alternate A.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~2–4 days Phase 0 (hero authoring); ~2.5 weeks Phases 1–6 (platform); ~2–3 days Phase 7 (hero integration); ~1.5 weeks Phase 8 (custom imports).

## Status / Scope

**Status:** Phase 0 (hero authoring) and Phase 1 (contracts) complete. Phases 2–9 planned.

Phase-by-phase implementation of the RoomObject manipulative system. Two new entities (`RoomObjectTemplate`, `RoomObject`) sibling to `WallObject`; in-memory grab lock for concurrent edits; full 3D and 2D parity; one **hero primitive** at district-demo quality (PLAN § 3.2.1) — **authored in Phase 0**, **integrated in Phase 7**; deferred in-app `.glb` export (PLAN § 3.5) forward-compatible via `exportRootRef` and `exportable`.

### Recommended sequence

```text
Phase 0  — Hero authoring (dev harness; visual + pedagogical quality bar)
Phases 1–6 — Platform (contracts → API → realtime → 3D → 2D)
Phase 7  — Hero integration (catalog, registry, full-room demo checklist)
Phase 8+ — Custom upload, rollout (unchanged)
```

Phase 0 can run **before** Phase 1 or **in parallel** with Phases 1–2. Do not wait until Phase 7 to invent the mesh.

**In scope (v1 / Phase A):**

- `RoomObjectTemplate` + `RoomObject` schemas and persistence.
- REST endpoints for catalog + instances + touch + reset.
- In-memory grab lock with 30 s auto-expire and reliable / unreliable realtime split.
- 3D rendering with grab outline, inspector, and Teacher Objects toolbar.
- 2D analog with full interaction parity.
- One **hero primitive** at district-demo quality (template selected at start of Phase 0; integrated in Phase 7).
- Feature flag + per-room settings + kill switch.
- Server-side bounds and scale clamping; per-room concurrent-object cap.

**Also in scope (Phase B):**

- Custom `.glb` upload reusing `WallAttachment` signed-URL pipeline.
- Server-side glTF parse / validation with extension allowlist.
- Per-class custom template list; teacher upload UI.

**Out of scope (v1 / deferred):**

- In-app `.glb` export (Phase F — PLAN § 3.5). v1 still wires `exportRootRef`.
- Lesson `manipulative-explore` step (Phase D).
- Object-to-object or object-avatar collision.
- LOD, headless thumbnail generator, kinematic damping polish (Phase E).
- District-level template promotion / marketplace.

## Feature flag

- `ENABLE_ROOM_OBJECTS` (API) + `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS` (web). Default `false`.
- Per-room: `room.settings.roomObjects.enabled` (default `false`) + `customUploadsEnabled` (default `false`).
- Kill switch: env flag off → all endpoints return 404, toolbar hidden, incoming `room.object.*` realtime dropped on next reload.

---

## Phase 0 — Hero authoring (recommended first)

**Goal:** Pick and build the district-demo manipulative **before** the RoomObject platform exists (or in parallel with Phases 1–2). Validate visual and pedagogical quality in a lightweight dev harness. Phase 7 only wires this asset into the live room — it does not invent geometry under deadline pressure.

**Why Phase 0 exists:** The hero is the procurement story. Authoring it early de-risks the subjective work (materials, scale, labels, parameters) without blocking on API contracts, grab locks, or LiveKit. Integration bugs in Phases 1–6 are easier to fix when the demo asset is already finished.

**Files to create:**

- `apps/web/components/roomObjectProcedurals/types.ts` (new):
  - Local `ProceduralProps` contract used until Phase 1 formalizes it in `@3dspace/contracts`:

    ```ts
    export type ProceduralProps = {
      parameters: Record<string, unknown>;
      scale: number;
      colorTintHex?: string;
      exportRootRef: React.RefObject<THREE.Group>;
    };
    ```

  - Phase 1 may move this to `packages/contracts` or a shared `room-objects` types module; keep shapes aligned when contracts land.

- `apps/web/components/roomObjectProcedurals/<hero>.tsx` (new):
  - **Pick the hero at the start of Phase 0** (not Phase 7). Strong candidates per PLAN § 3.2.1:
    - **Water molecule (H₂O).** Two H spheres + one O sphere + two bonds; CPK colors with an accessibility palette toggle; bond-angle display; classroom-readable label.
    - **Globe (Earth).** Textured or shaded sphere; day/night or grid toggles; tilt to 23.5°; spin-friendly proportions.
    - **Geometric solid kit.** Cube / sphere / cylinder / cone / dodecahedron via parameter; edge & face count label; wireframe overlay toggle.
  - Record choice + one-sentence rationale in this file's PR and `.cursor/memory.md` (see **Hero primitive — selection log** at bottom).
  - Mount all geometry on `exportRootRef` (`<group ref={exportRootRef}>`).
  - Materials: intentional `MeshStandardMaterial` or `MeshBasicMaterial` — no default-gray placeholders.
  - Implement **≥ 2 parameters** with visible effect (local state in harness; formal `parameterSchemaJson` drafted as JSON in `packages/room-objects/catalog/hero-draft.json`).

- `apps/web/components/roomObjectProcedurals/index.ts` (new):
  - `ROOM_OBJECT_PROCEDURALS` registry with the hero entry only.
  - Export `renderProcedural(proceduralId, props)` helper for harness + later `RoomObjectMesh`.

- `apps/web/app/dev/room-object-hero/page.tsx` (new) **or** `apps/web/components/roomObjectProcedurals/RoomObjectHeroHarness.tsx` + dev-only route:
  - Minimal R3F `<Canvas>` (no LiveKit, no room, no API).
  - Third-person orbit controls (Drei `OrbitControls`) at ~3 m distance — matches classroom camera feel.
  - Left panel: parameter widgets (sliders / toggles / segmented) wired to local React state → passed as `parameters` to the hero component.
  - Buttons: "Reset parameters", "Capture thumbnail" (instructions to screenshot for catalog card).
  - Footer: hero name, attribution, triangle-count estimate, chosen-template rationale (dev-only).
  - Gate route behind `NODE_ENV === "development"` or `NEXT_PUBLIC_ENABLE_ROOM_OBJECT_DEV=true` so it never ships to production navigation.

- `packages/room-objects/catalog/hero-draft.json` (new):
  - Draft catalog metadata (slug, displayName, category, description, `proceduralId`, `defaultParameters`, `parameterSchemaJson`, license, attribution).
  - Copied into `builtin.json` during Phase 7 — not required for Phase 0 harness.

- `apps/web/public/room-objects/thumbnails/<hero>.png`:
  - **Catalog-grade thumbnail** captured from the harness (not a debug gray scene). Suitable for district deck + Objects toolbar.

- `apps/web/components/roomObjectProcedurals/<hero>.test.tsx` (optional):
  - Renders hero with default parameters; smoke test that `exportRootRef` is populated.

**Phase 0 quality gate (visual + pedagogical — must all pass before Phase 7):**

- [ ] **Visual:** clean proportions, intentional materials, readable from ~3 m camera distance, no z-fighting, no programmer-art vibe.
- [ ] **Pedagogical:** ≥ 2 meaningful parameters with teacher-legible labels; toggling each produces an obvious visual change.
- [ ] **Performance (harness):** smooth on a baseline Chromebook in the dev page alone.
- [ ] **Thumbnail:** professional catalog card PNG committed under `public/room-objects/thumbnails/`.
- [ ] **Forward-compat:** `exportRootRef` populated; export-friendly materials only; `hero-draft.json` documents parameters.
- [ ] **Selection log:** template choice + rationale recorded (bottom of this doc).

**Explicitly not required in Phase 0:** grab lock, pose sync, touch grants, 2D icon, toolbar place, API, feature flag, multi-user — those are Phases 1–7.

**Checkpoint:**

- `npm run typecheck -w @3dspace/web` passes (hero + harness only; platform types may not exist yet).
- Manual: open dev harness, rotate with orbit controls, toggle every parameter, confirm visual quality at district-demo bar.
- Screenshot the harness + thumbnail attached to the Phase 0 PR for reviewer sign-off on **look and feel**.

**Handoff to Phase 1:** When contracts add `RoomObjectTemplateSchema`, align `ProceduralProps` and `parameterSchemaJson` with what Phase 0 drafted — do not redesign parameters mid-integration unless the harness review failed.

---

## Phase 1 — Contracts

**Goal:** Schemas exist for templates, instances, room settings, REST request/response, realtime messages, and the new error codes. No behavior yet.

**Files to change:**

- `packages/contracts/src/index.ts`:

  1. Add `PoseSchema` (shared with `RoomObject` and `RoomObjectTemplate`):

     ```ts
     export const PoseSchema = z.object({
       position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
       rotation: z.object({
         yaw: z.number(),
         pitch: z.number().default(0),
         roll: z.number().default(0)
       })
     });
     ```

  2. Add `RoomObjectTouchPolicySchema`, `RoomObjectStatusSchema`, `RoomObjectSourceSchema`, `RoomObjectRendererSchema`, `RoomObjectCategorySchema`.

  3. Add `RoomObjectTemplateSchema` (per PLAN § 5.2.A) — includes `renderer`, `proceduralId`, `exportable`, `triangleCount`, `fileSizeBytes`, `license`, `attribution`.

  4. Add `RoomObjectSchema` (per PLAN § 5.2.B).

  5. Extend `RoomSettingsSchema` (alongside `pods` / `hallpass`):

     ```ts
     roomObjects: z.object({
       enabled: z.boolean().default(false),
       maxActive: z.number().int().positive().max(16).default(8),
       customUploadsEnabled: z.boolean().default(false),
       maxUploadSizeBytes: z.number().int().positive().default(8 * 1024 * 1024),
       defaultTouchPolicy: RoomObjectTouchPolicySchema.default("teacher-only")
     }).default({
       enabled: false, maxActive: 8, customUploadsEnabled: false,
       maxUploadSizeBytes: 8 * 1024 * 1024, defaultTouchPolicy: "teacher-only"
     })
     ```

  6. Add request/response schemas:
     - `ListRoomObjectTemplatesResponseSchema`
     - `CreateRoomObjectTemplateRequestSchema` / `Response`
     - `ListRoomObjectsResponseSchema`
     - `CreateRoomObjectRequestSchema` / `Response`
     - `UpdateRoomObjectRequestSchema`
     - `RoomObjectTouchRequestSchema` (`mode: "teacher-only" | "granted" | "all-class"`, `userIds[]`, `groupIds[]`)
     - `RoomObjectResetResponseSchema`

  7. Add realtime message schemas:

     ```ts
     export const RoomObjectUpsertMessageSchema = z.object({
       type: z.literal("room.object.upsert.v1"),
       object: RoomObjectSchema
     });
     export const RoomObjectRemoveMessageSchema = z.object({
       type: z.literal("room.object.remove.v1"),
       objectId: z.string()
     });
     export const RoomObjectTouchMessageSchema = z.object({
       type: z.literal("room.object.touch.v1"),
       objectId: z.string(),
       touchPolicy: RoomObjectTouchPolicySchema,
       grantedUserIds: z.array(z.string()),
       grantedGroupIds: z.array(z.string())
     });
     export const RoomObjectGrabMessageSchema = z.object({
       type: z.literal("room.object.grab.v1"),
       objectId: z.string(),
       holderUserId: z.string(),
       expiresAt: z.string()
     });
     export const RoomObjectPoseMessageSchema = z.object({
       type: z.literal("room.object.pose.v1"),
       objectId: z.string(),
       holderUserId: z.string(),
       pose: PoseSchema,
       scale: z.number().positive()
     });
     export const RoomObjectReleaseMessageSchema = z.object({
       type: z.literal("room.object.release.v1"),
       objectId: z.string(),
       finalPose: PoseSchema,
       finalScale: z.number().positive()
     });
     export const RoomObjectParameterMessageSchema = z.object({
       type: z.literal("room.object.parameter.v1"),
       objectId: z.string(),
       parameters: z.record(z.string(), z.unknown())
     });
     ```

  8. Add error codes (extend the existing union):
     - `room-object-disabled`
     - `room-object-limit-reached`
     - `room-object-not-found`
     - `room-object-grab-conflict`
     - `room-object-touch-denied`
     - `room-object-template-invalid`
     - `room-object-upload-too-large`
     - `room-object-upload-rejected`

  9. Export type aliases for everything new.

  10. Align `ProceduralProps` (or equivalent) with `apps/web/components/roomObjectProcedurals/types.ts` from Phase 0 — same field names; move shared types to `packages/contracts` or `packages/room-objects` if cleaner.

- `packages/contracts/openapi/openapi.json` — regenerated; no hand edits.

- `packages/room-objects/catalog/hero-draft.json` (Phase 0):
  - Verify `parameterSchemaJson` + `defaultParameters` validate against new Zod helpers if added.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/contracts` passes.
- [x] `npm test -- packages/contracts/tests/room-objects.test.ts` passes.
- [x] `npm run openapi` regenerates OpenAPI with room-object routes.
- [x] `apps/web` typecheck passes (`ProceduralProps` extends `RoomObjectProceduralRenderProps`).
- [ ] `apps/api` — Phase 2 will add handlers; existing tests should still pass once room settings defaults are applied in fixtures.

---

## Phase 2 — API: persistence, endpoints, catalog seeding

**Goal:** Templates and instances persist. CRUD endpoints work end-to-end. Server validates bounds, scale, cap, and touch policy. **No** realtime broadcast yet — that's Phase 3.

**Files to change:**

- `apps/api/src/config.ts`:
  - Read `ENABLE_ROOM_OBJECTS` (boolean, default `false`).

- `apps/api/src/models/mongoose.ts`:
  - Add `RoomObjectTemplate` schema/model.
  - Add `RoomObject` schema/model (indexes: `roomId`, `status`, compound `roomId+status`).
  - `podsRuntime` pattern: existing rooms with no field default-populate on load — no migration script.

- `apps/api/src/repository.ts`:
  - `listRoomObjectTemplatesVisibleTo(userContext)` — builtin + own-class custom + (Phase D) district allowlist.
  - `createRoomObjectTemplate(input)` — used by custom upload finalize (Phase 8).
  - `archiveRoomObjectTemplate(templateId, actor)` — soft delete.
  - `listRoomObjectsForRoom(roomId, { status? })`.
  - `getRoomObject(objectId)`.
  - `createRoomObject(input)`.
  - `updateRoomObject(objectId, patch)`.
  - `removeRoomObject(objectId)`.
  - Builtin catalog seeding on app start: read `packages/room-objects/catalog/builtin.json`, upsert by `slug`.

- `apps/api/src/app.ts`:
  - Add request handlers (all teacher-gated except `GET`):
    - `GET /v1/room-objects/templates` — any room member.
    - `POST /v1/room-objects/templates` — teacher (Phase 8 wires it; v1 stub returns 501).
    - `DELETE /v1/room-objects/templates/:id` — owner / admin (stubbed similarly).
    - `GET /v1/rooms/:roomId/objects?status=`.
    - `POST /v1/rooms/:roomId/objects` — teacher; validates cap, bounds, scale; applies `defaultPose` / `defaultParameters` / `recommendedTouchPolicy` from template.
    - `PATCH /v1/rooms/:roomId/objects/:objectId` — teacher OR current grab holder (current holder may only update pose / scale / parameters; teacher may update anything).
    - `DELETE /v1/rooms/:roomId/objects/:objectId` — teacher.
    - `POST /v1/rooms/:roomId/objects/:objectId/touch` — teacher; sets policy + grant lists.
    - `POST /v1/rooms/:roomId/objects/:objectId/reset` — teacher OR touch-holding user; resets pose / scale / parameters to template defaults.
  - All handlers gated by `ENABLE_ROOM_OBJECTS` and `room.settings.roomObjects.enabled`. When off → 404 `room-object-disabled`.
  - Validate bounds against `RoomManifest.bounds`; clamp scale via `min(scale, 4 / maxBboxAxis)`.
  - Enforce `room.settings.roomObjects.maxActive` cap on `POST /objects`: count `status === "active"`; over-cap returns 422 `room-object-limit-reached`.
  - Role filtering on `GET /objects`: students see the full instance (no PHI here); teachers see everything. `grantedUserIds` is visible to all room members (so students know if they have touch).

- `apps/api/tests/api.test.ts`:
  - New describe block: `"room object templates"`.
    - Builtin catalog seeded on app start.
    - Anonymous user 401.
    - Student lists templates.
  - New describe block: `"room object instances"`.
    - Teacher creates an instance; cap enforcement; bounds clamp; scale clamp.
    - Teacher updates instance pose / parameters / tint.
    - Student `POST` returns 403.
    - Student `PATCH` on object without touch returns 403.
    - Teacher `set-touch` to `granted` with `userIds`; subsequent student `PATCH` from that user succeeds.
    - Teacher `reset` returns object to defaults.
    - Teacher `DELETE` archives; subsequent `PATCH` returns 404.
  - Flag handling:
    - `ENABLE_ROOM_OBJECTS=false` → 404 on every endpoint.
    - `room.settings.roomObjects.enabled=false` → 404 on every endpoint.

- `packages/room-objects/catalog/builtin.json`:
  - v1 entry: **water-molecule** hero (procedural), seeded on app start via `apps/api/src/room-objects/builtin-catalog.ts`.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/api` passes.
- [x] `npm run test -- apps/api/tests/api.test.ts -t "room object"` passes (7 tests).
- [ ] Existing full API suite — run before merge.
- [ ] Manual `curl` round-trip on Mongo-backed dev API (optional).

---

## Phase 3 — API: grab lock + realtime broadcasting

**Goal:** Realtime messages flow to LiveKit, in-memory grab lock arbitrates concurrent edits, pose updates are throttled and not persisted; final pose lands via `release`.

**Files to change:**

- `apps/api/src/app.ts`:

  1. New in-memory map on the room session manager:

     ```ts
     interface RoomObjectGrab {
       holderUserId: string;
       expiresAt: number; // epoch ms
       lastPoseAt: number;
     }
     const grabs = new Map<string /* objectId */, RoomObjectGrab>();
     ```

     Held per process; not persisted; not in `ClassroomState`.

  2. Realtime message handlers (LiveKit data channel inbound):
     - `room.object.grab.v1`:
       - Validate touch policy on `RoomObject`.
       - If existing grab held by another user → reply with `room.object.grab.v1` echoing the **current** holder (client treats as denial; brief outline collision). Returns 200 OK; no state change.
       - Otherwise insert into `grabs`; broadcast `room.object.grab.v1` reliably.
     - `room.object.pose.v1`:
       - Look up grab; reject if no grab or wrong holder.
       - Update `lastPoseAt`; **do not persist**.
       - Rebroadcast on unreliable channel to all room participants.
     - `room.object.release.v1`:
       - Look up grab; reject if no grab or wrong holder.
       - Apply same bounds + scale clamping as `PATCH`.
       - Persist via `repository.updateRoomObject({ pose, scale })`.
       - Broadcast `room.object.upsert.v1` reliably with persisted state.
       - Delete grab entry.
     - `room.object.parameter.v1`:
       - Validate touch policy.
       - Apply via `repository.updateRoomObject({ parameters })`; debounce server-side (≤ 1 write / 200 ms / object); broadcast `room.object.upsert.v1`.

  3. Grab reaper: `setInterval(() => sweep(), 5000)` removes entries where `lastPoseAt + 30_000 < now`. Emits `room.object.upsert.v1` (no pose change, just to signal release) so clients drop the outline.

  4. On REST mutations (`POST` / `PATCH` / `DELETE` / `touch` / `reset`), broadcast the appropriate reliable message after persist.

  5. On `touch` change to remove a user from grant: if that user currently holds the grab, force release (drop grab entry; broadcast `room.object.upsert.v1` with last persisted pose).

- `apps/web/lib/realtime.ts`:
  - Add `room.object.*` message types to the reliable / unreliable router (mirroring `avatar.state.v1` for the unreliable pose channel).
  - Server → client direction routes upserts, removes, touch updates, grabs, releases to subscribers.

- `apps/api/tests/api.test.ts`:
  - Inject the realtime test harness used by existing tests (already supports posting messages to the LiveKit fake).
  - Test: two clients race-grab; first wins, second is informed.
  - Test: pose updates from non-holder are dropped.
  - Test: release persists the final pose; subsequent `GET /objects` returns it.
  - Test: 30-second reaper test (mock `now`) cleans up stale grabs.
  - Test: `touch` revocation force-releases active grab held by the revoked user.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/api` passes.
- [x] `npm run typecheck -w @3dspace/web` passes (`isRealtimeUnreliable` routes `room.object.pose.v1` on unreliable channel).
- [x] `npm run test -- apps/api/tests/api.test.ts -t "room object realtime"` passes (5 tests: grab race, pose drop, release persist, reaper, touch revoke).
- [x] Full API suite (66 tests) passes.
- [ ] Manual: two browser tabs grab the same object; first wins (Phase 4 client wiring).

---

## Phase 4 — Client: hooks, realtime wiring, RoomClient plumbing

**Goal:** Templates + instances hydrate on join, sync via realtime, and are exposed to UI through hooks. No rendering yet beyond a debug list.

**Files to change:**

- `apps/web/lib/config.ts`:
  - `enableRoomObjects: process.env.NEXT_PUBLIC_ENABLE_ROOM_OBJECTS === "true"`.

- `apps/web/lib/api.ts`:
  - `listRoomObjectTemplates()`, `createRoomObject()`, `updateRoomObject()`, `deleteRoomObject()`, `setRoomObjectTouch()`, `resetRoomObject()`.
  - All authenticated; structured `ApiError` on failure.

- `apps/web/lib/useRoomObjectTemplates.ts` (new):
  - Fetches once per session via `listRoomObjectTemplates()`.
  - Caches in module memory keyed by class membership.
  - Returns `{ templates, status, refetch }`.

- `apps/web/lib/useRoomObjects.ts` (new — sibling to `useWallObjects.ts`):
  - Initial hydrate via `GET /v1/rooms/:roomId/objects`.
  - Subscribes to reliable + unreliable `room.object.*` channels.
  - Maintains `Map<objectId, RoomObject>` + `Map<objectId, { holderUserId, expiresAt }>` for grabs.
  - During an active local grab, optimistic local pose overrides server pose until release.
  - Periodic refresh every 30 s as defense-in-depth (matches existing pattern in `useWallObjects`).
  - Returns:

    ```ts
    {
      objects: RoomObject[],
      grabs: Map<string, GrabInfo>,
      myActiveGrab: { objectId: string } | null,
      actions: {
        instantiate(templateId, pose?): Promise<RoomObject>,
        update(objectId, patch): Promise<void>,
        remove(objectId): Promise<void>,
        beginGrab(objectId): Promise<boolean>,    // returns false on conflict
        publishPose(objectId, pose, scale): void, // unreliable, throttled to 15 Hz
        endGrab(objectId, finalPose, finalScale): Promise<void>,
        setTouch(objectId, mode, grants): Promise<void>,
        reset(objectId): Promise<void>,
        setParameters(objectId, params): Promise<void> // debounced 200 ms
      }
    }
    ```

- `apps/web/components/RoomClient.tsx`:
  - Mount `useRoomObjects(roomId)` when `FEATURES.enableRoomObjects && room.settings.roomObjects?.enabled`.
  - Pass `roomObjects` + actions + `templates` into a new `RoomObjectsLayer` (Phase 5) and `RoomObjectsToolbar` (Phase 5).

- `apps/web/test/mvp.spec.ts` (or new test file later in Phase 9):
  - Smoke: list endpoint returns templates seeded in Phase 2.

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/web` passes.
- [x] `CLIENT_TUNING.enableRoomObjects` gates the hook mount in `RoomClient`.
- [x] `useRoomObjectTemplates()` caches seeded templates per class membership.
- [x] `useRoomObjects()` hydrates instances, tracks grabs, publishes authoritative realtime via the Phase 3 dispatch endpoint, and exposes `actions`.
- [x] Manual DevTools debug surface wired: `window.__debug.roomObjects` exposes templates, objects, grabs, actions, and refresh hooks.

---

## Phase 5 — Client: 3D rendering, inspector, teacher toolbar

**Goal:** Place / grab / rotate / scale / reset works in 3D with a polished inspector and a teacher Objects toolbar. Hero primitive renders via the procedural registry. `exportRootRef` is wired (no UI yet).

**Files to change:**

- `apps/web/components/RoomObjectsLayer.tsx` (new):
  - Top-level R3F group. Maps `objects` → `<RoomObjectMesh key={obj.id} object={obj} />`.
  - Reads `grabs` map; passes `isGrabbed`, `grabHolderColor`, `localIsHolder` into each mesh.

- `apps/web/components/RoomObjectMesh.tsx` (new):
  - Owns one `<group ref={exportRootRef}>` whose children are dispatched by `template.renderer`:
    - `"gltf"` → Drei `useGLTF(template.assetUrl)`; cloned scene mounted in the group.
    - `"procedural"` → component from a static registry: `ROOM_OBJECT_PROCEDURALS: Record<string, FC<ProceduralProps>>`.
  - Applies instance `pose.position`, `pose.rotation.yaw` (group rotation), `scale` (group scale).
  - Applies `colorTintHex` as a material override for procedural meshes (extra `materialOverrideColor` prop).
  - Grab affordance: outline mesh (`OutlinePass` via Drei `<Outlines>` if available; otherwise a slightly larger duplicate mesh with `BackSide` + emissive color). Color = holder's user color; opacity 0.6 when local user is not holder, 1.0 when holder.
  - Pointer events:
    - `onPointerDown` (when local user has touch permission): `actions.beginGrab(objectId)`; on resolve `true`, start drag.
    - Drag handler converts pointer movement → world delta on XZ plane (use `useThree().raycaster` against an invisible floor plane).
    - Right-click drag OR `R`+drag → rotate yaw.
    - `wheel` while hovered → scale; `Shift` bypasses snap.
    - Snap: position to 0.25 m grid, rotation to 15°, scale to 5% within `[0.5×, 2.0×]`.
    - During drag: `actions.publishPose(...)` at ≤ 15 Hz (RAF-throttled).
    - On `pointerUp`: `actions.endGrab(...)` with final clamped pose.
  - Keyboard parity (focus-trapped): arrows move 0.25 m, `[`/`]` rotate 15°, `+`/`−` scale 5%.
  - Drei `<Html>` label above object: display name + parameter summary (e.g. "H₂O, bond angles on"); fades by distance like nameplates.
  - **`exportRootRef`** ref forwarded outward via a `useImperativeHandle` on the parent component so a future Phase F can `GLTFExporter.parseAsync(exportRootRef.current)`.

- `apps/web/components/RoomObjectInspector.tsx` (new):
  - Drei `<Html>` panel anchored next to the selected object (hides beyond 8 m camera distance).
  - Header: display name, template chip, license / attribution micro-line.
  - Read-only for non-touch viewers (controls greyed, "Watching only" pill).
  - Parameters: render widgets by `parameterSchemaJson` type — slider, toggle, segmented, range, vector3.
  - Color tint picker (touch holder).
  - Teacher-only section:
    - "Grant touch" submenu — picks users (multi-select), groups (multi-select), or mode (`teacher-only` / `granted` / `all-class`).
    - Reset / Remove buttons.
    - Touch policy hint matching `boardAccessGrants` UI vocabulary.
  - "Export .glb" button is **deferred**; do not render it. Inspector layout reserves no chrome for it.

- `apps/web/components/RoomObjectsToolbar.tsx` (new):
  - Teacher-only HudCard (gated by role + `FEATURES.enableRoomObjects` + `room.settings.roomObjects.enabled`).
  - Catalog list filtered by category; each item card shows thumbnail, display name, category, two-line description.
  - **Disabled / "Coming soon" treatment** for templates flagged unavailable (PLAN § 3.2.1 — never show half-finished templates as selectable).
  - "Place" action calls `actions.instantiate(templateId)`; new object spawns at `defaultPose` offset by 0.5 m in front of the teacher's avatar (so they don't have to walk to it). Clamps to room bounds.
  - "Active in room" sub-list: each placed object with a "Remove" and "Inspect" button.

- `apps/web/components/RoomObjectIcon2D.tsx` (Phase 6 owns the 2D analog; mentioned here for placement awareness).

- `apps/web/components/roomObjectProcedurals/`:
  - `index.ts` — import hero from Phase 0; export `ROOM_OBJECT_PROCEDURALS` registry.
  - If Phase 0 not done yet: temporary placeholder component only — do not claim Phase 5 complete without a real hero in registry (prefer completing Phase 0 first).

- `apps/web/app/globals.css`:
  - `.room-object-inspector` styling consistent with existing HUD chrome.
  - `.room-object-toolbar-card` styling.
  - `.room-object-coming-soon` (disabled state).

- `apps/web/components/RoomView3D.tsx`:
  - Render `<RoomObjectsLayer />` inside the canvas, between floor and avatars (so avatars draw on top of small objects).
  - Make sure pointer events on objects don't conflict with avatar movement (existing pattern: skip `click-to-move` when the click is on an interactive child — already implemented for wall objects).

**Checkpoint:**

- [x] `npm run typecheck -w @3dspace/web` passes.
- [x] `RoomObjectsLayer`, `RoomObjectMesh`, `RoomObjectInspector`, `RoomObjectsToolbar` wired into `RoomView3D` + `RoomClient`.
- [x] Hero water-molecule procedural renders via `ROOM_OBJECT_PROCEDURALS`; `exportRootRef` forwarded on mesh group.
- [x] Teacher Objects toolbar: catalog, Place (spawn 0.5 m ahead), active list with Inspect/Remove.
- [ ] Manual: teacher places hero via toolbar; drag/rotate/scale; second tab sees the same pose.
- [ ] Manual: student without touch → read-only inspector; non-holder cannot drag.

---

## Phase 6 — Client: 2D rendering parity

**Goal:** A teacher running the entire flow in 2D mode can place, manipulate, and remove the hero primitive without ever touching the 3D scene.

**Files to change:**

- `apps/web/components/RoomObjectIcon2D.tsx` (new):
  - SVG icon at `projectPositionTo2D(object.pose.position)`.
  - Uses `template.thumbnailUrl` if available; otherwise template category emoji + colored disc.
  - Drag handler: pointer events on SVG → call `actions.beginGrab` / `publishPose` / `endGrab` with XZ-only translation; map screen Δ to room Δ via existing projection inverse.
  - Keyboard while focused: arrows = move, `[`/`]` = rotate yaw 15°, `+`/`−` = scale 5%. `Shift` bypasses snap.
  - Halo in holder color while grabbed; tooltip with display name + holder.
  - `onFocus` announces template description + current parameters via `aria-live` (TTS / screen-reader path; ties into Universal Access Suite later).

- `apps/web/components/RoomView2D.tsx`:
  - Render `<RoomObjectIcon2D />` over the map for each active object.
  - Inspector reuses `RoomObjectInspector` from Phase 5 (same panel anchored to the 2D icon instead of the 3D mesh).

- `packages/room-engine/src/index.ts`:
  - Add `projectPositionTo2D` inverse helper if not already exposed (used to convert screen pixels → world XZ during drag).

**Checkpoint:**

- [x] `RoomObjectIcon2D` — SVG icon at `projectPositionTo2D`, thumbnail/emoji, grab halo, drag/keyboard/wheel, `aria-live` on focus.
- [x] `RoomView2D` renders icons + reuses `RoomObjectInspector` as HTML overlay anchored to map %.
- [x] `delta2DToWorldXZ` in `@3dspace/room-engine` (inverse drag mapping; `unprojectPointFrom2D` already existed).
- [x] `RoomClient` passes room-object props into 2D view (same as 3D).
- [x] `npm run typecheck -w @3dspace/web` passes.
- [ ] Manual: switch to 2D, place + manipulate + remove hero end-to-end.
- [ ] Manual: 3D and 2D viewers see the same pose in real time.

---

## Phase 7 — Hero integration (wire Phase 0 into the live room)

**Goal:** Connect the Phase 0 hero into the full RoomObject stack. No new authoring unless Phase 0 quality gate failed review — in that case, return to Phase 0 harness before continuing. Phase 7 proves the manipulative works in a real room with grab, touch, 2D parity, and a superintendent-ready demo.

**Prerequisite:** Phase 0 quality gate (visual + pedagogical) signed off. Phases 1–6 complete.

**Files to change:**

- `packages/room-objects/catalog/builtin.json`:
  - Replace Phase 2 placeholder with hero entry copied from `hero-draft.json` (adjust `thumbnailUrl` to `/room-objects/thumbnails/<hero>.png`, set `defaultPose` for theater spawn, `triangleCount` estimate).

- `apps/web/components/roomObjectProcedurals/index.ts`:
  - Confirm hero `proceduralId` matches catalog `proceduralId`.
  - Remove any Phase 5 placeholder component.

- `apps/web/components/RoomObjectMesh.tsx`:
  - Verify hero renders correctly via registry dispatch; `exportRootRef` forwarded; `colorTintHex` override works on hero materials.

- `apps/web/components/RoomObjectInspector.tsx`:
  - Wire parameter widgets to `parameterSchemaJson` from catalog (replace harness-local controls). Confirm ≥ 2 parameters drive live `actions.setParameters`.

- `apps/web/components/RoomObjectsToolbar.tsx`:
  - Hero is the **only** selectable template in v1 (others "coming soon" if listed).
  - Catalog card uses Phase 0 thumbnail.

- `apps/web/app/dev/room-object-hero/page.tsx` (optional cleanup):
  - Keep for regression of visual bar; link from internal docs. Not linked from teacher UI.

**Phase 7 integration quality gate (must all pass — Phase 0 items are prerequisites, not re-checked here unless regressions):**

- [ ] **Interactive (3D):** teacher place → grant touch → student grab / rotate / scale → teacher reset → teacher remove; two browser tabs stay in sync.
- [ ] **Interactive (2D):** same flow in 2D-only view mode without opening the 3D canvas.
- [ ] **Inspector:** parameters from catalog schema work in-room (not harness-local state only).
- [ ] **Performance:** hero loads in full `RoomClient` in ≤ 5 s on baseline Chromebook.
- [ ] **Demo:** 60–90 s script runs end-to-end on staging without verbal apologies for missing polish:

  ```text
  1. Teacher opens Objects toolbar → places hero in front of class.
  2. Teacher toggles one pedagogical parameter (class sees the change).
  3. Teacher grants touch to a student.
  4. Student rotates / scales the object; teacher observes sync.
  5. Teacher resets pose; student sees default.
  6. Teacher removes object; it disappears for all viewers.
  ```

- [ ] **Toolbar:** hero selectable; no half-finished templates exposed.
- [ ] **PR:** two screenshots (3D in-room + 2D) + demo script + link to Phase 0 harness screenshot for visual sign-off lineage.

**Phase A (district-demo milestone) is not complete until Phase 0 + Phase 7 gates both pass.**

**Checkpoint:**

- [x] `builtin.json` matches `hero-draft.json`; hero thumbnail at `apps/web/public/room-objects/thumbnails/water-molecule.png` (script-generated).
- [x] `ROOM_OBJECT_HERO_SLUG` + v1 toolbar gating (`isRoomObjectTemplateSelectableInV1`); hero **District demo** badge.
- [x] `ROOM_OBJECT_DEMO_SCRIPT.md` for staging walkthrough; dev harness comment links to script.
- [x] `apps/web/test/room-objects.spec.ts` + Playwright flags for room objects.
- [x] `packages/room-objects/test/builtin-hero.test.ts` catalog parity test.
- [ ] Manual: 60–90 s demo runs cleanly twice in a row on staging.
- [x] `npm run test:e2e -- --grep "room objects"` passes (2026-05-22; Playwright-managed dev servers).
- [ ] Re-run Phase 0 harness only if in-room rendering regressed (materials, scale, labels).

---

## Phase 8 — Custom `.glb` upload pipeline (PLAN Phase B)

**Goal:** Teachers can upload their own `.glb` files, which appear as per-class custom templates. Uses existing `WallAttachment` signed-URL flow with a new content type and server-side validation.

**Files to change:**

- `apps/api/src/services/storage.ts`:
  - Add `room-objects/` key prefix support; accept `Content-Type: model/gltf-binary`.
  - Same signed-URL pattern as `WallAttachment`.

- `apps/api/src/app.ts`:
  - `POST /v1/wall-attachments/glb` (or `POST /v1/room-objects/uploads` — pick one in IMPL; current convention is to reuse the wall-attachment endpoint with a `kind=glb` discriminator):
    - Teacher-only; gated by `room.settings.roomObjects.customUploadsEnabled`.
    - Issue signed upload URL.
  - `POST /v1/room-objects/templates` (was stubbed in Phase 2):
    - Teacher uploads the file via signed URL, then POSTs metadata.
    - Server fetches the `.glb`, runs `@gltf-transform/core` parse:
      - Reject if file size > limit.
      - Reject if any extension outside the allowlist.
      - Reject if any buffer or image references an external URI.
      - Reject if total triangle count > 50k after Draco / meshopt decode.
      - Reject if any texture > 2048 × 2048.
    - On accept, store `RoomObjectTemplate` with `source: "custom"`, `ownerClassId`, `assetUrl`, `triangleCount`, `fileSizeBytes`.
  - `DELETE /v1/room-objects/templates/:id` (was stubbed):
    - Owner / district admin; archives template.

- `apps/api/tests/api.test.ts`:
  - Upload happy path with a tiny in-memory `.glb` (generated via `@gltf-transform/core` in test setup).
  - Rejection paths: oversize, disallowed extension, external buffer ref, oversize texture, bad triangle count.

- `apps/web/lib/api.ts`:
  - `uploadRoomObjectGlb(file, metadata)` — orchestrates the two-step flow.

- `apps/web/components/RoomObjectsToolbar.tsx`:
  - "Upload .glb" form (teacher-only, gated by `customUploadsEnabled`): file picker, display name, category, description, thumbnail PNG (PLAN § 3.3 — teacher-supplied in v1), license + attribution required fields, default pose left to default.
  - Show clear error UI for server-side validation failures (oversize, disallowed extensions).

- `docs/planning/new-features/room-object-authoring.md` (new):
  - The short authoring guide referenced in PLAN § 3.4.

**Checkpoint:**

- Manual: teacher uploads a small `.glb` from Blender; it appears in their class catalog; instantiate / grab / reset works.
- Manual: oversize upload rejected with clear error.
- `npm run test -- apps/api/tests/api.test.ts -t "custom template|glb upload"` passes.

---

## Phase 9 — Polish, validation, env templates, rollout

**Goal:** Ship-ready. Tests pass, env templates updated, e2e covers the hero primitive, feature flagged in staging.

**Files to change:**

- `apps/web/.env.example` — add `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=false`.
- `apps/api/.env.example` — add `ENABLE_ROOM_OBJECTS=false`.
- `.env.example` — same.
- `playwright.config.ts` — extend web/api dev commands with `ENABLE_ROOM_OBJECTS=true NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=true` for e2e.
- `apps/web/test/room-objects.spec.ts` (new):
  - Teacher logs in, creates room, opts in `roomObjects.enabled = true`.
  - Opens Objects toolbar → places hero primitive.
  - Asserts (a) the hero renders in 3D, (b) the 2D analog icon is visible, (c) the inspector opens with the two pedagogical parameters.
  - Grants touch to a second user; second tab grabs and rotates; first tab observes the new pose; first tab resets; second tab sees default pose restored.
  - Teacher removes the object; object disappears for both tabs.
- `apps/web/test/mvp.spec.ts` — unchanged; e2e isolation keeps room objects out of the existing suite.
- `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` — add a "RoomObject library" section linking to PLAN/IMPL and staging rollout date.
- `.cursor/memory.md` — append an entry summarizing the ship (chosen hero, key bug-fix learnings).

**Validation evidence (fill in):**

- [x] `npm run typecheck` — pass (2026-05-22)
- [x] `npm test` — 101/104 pass (2026-05-22); 3 pre-existing failures in `packages/room-engine/tests/room-engine.test.ts` (wall anchor width + avatar interpolation expectations, unrelated to RoomObject). RoomObject contract/API/package tests pass.
- [x] `npm run test -- apps/api/tests/api.test.ts -t "room object|template|grab|pose|release|custom template|glb upload"` — pass (2026-05-22)
- [x] `npm run test:e2e -- --grep "room objects"` — pass (2026-05-22; Playwright dev servers with room-object flags from `playwright.config.ts`)
- [ ] Manual: 3-user grab test (one holder, two observers; observer inspector is read-only)
- [ ] Manual: 2D-only teacher places + manipulates the hero primitive end-to-end
- [ ] Manual: hero loads in ≤ 5 s on baseline Chromebook
- [ ] Manual: 60–90 s district demo script run without visual/UX apologies (PLAN § 3.2.1)
- [ ] Manual: custom `.glb` upload + rejection paths confirmed

**Rollout:**

1. Merge to `mvp-plus-one` with both flags off.
2. Flip `ENABLE_ROOM_OBJECTS=true` + `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=true` in staging only.
3. Internal teacher walks through the 60–90 s hero demo on staging.
4. Flip flags on in production with `room.settings.roomObjects.enabled` default still `false` (per-room opt-in).
5. Pilot with one friendly district contact using the hero primitive.
6. After a week, flip `room.settings.roomObjects.enabled` default to `true`.
7. After Phase 8 lands and stabilizes, enable `customUploadsEnabled` for whitelisted teachers.

---

## Files-to-touch summary

| Area | File | Phase |
| --- | --- | --- |
| Contracts | `packages/contracts/src/index.ts` | 1 |
| Contracts OpenAPI | `packages/contracts/openapi/openapi.json` | 1 |
| API config | `apps/api/src/config.ts` | 2 |
| API persistence | `apps/api/src/models/mongoose.ts` | 2 |
| API repository | `apps/api/src/repository.ts` | 2 |
| API routes + handlers | `apps/api/src/app.ts` | 2, 3, 8 |
| API tests | `apps/api/tests/api.test.ts` | 2, 3, 8 |
| Hero draft catalog | `packages/room-objects/catalog/hero-draft.json` | 0 |
| Dev harness | `apps/web/app/dev/room-object-hero/page.tsx` (or `RoomObjectHeroHarness.tsx`) | 0 |
| Procedural types | `apps/web/components/roomObjectProcedurals/types.ts` | 0 |
| Catalog seed | `packages/room-objects/catalog/builtin.json` | 2, 7 |
| Web feature flag | `apps/web/lib/config.ts` | 4 |
| Web API client | `apps/web/lib/api.ts` | 4, 8 |
| Templates hook | `apps/web/lib/useRoomObjectTemplates.ts` | 4 |
| Objects hook | `apps/web/lib/useRoomObjects.ts` | 4 |
| RoomClient wiring | `apps/web/components/RoomClient.tsx` | 4, 5 |
| Realtime router | `apps/web/lib/realtime.ts` | 3 |
| 3D layer | `apps/web/components/RoomObjectsLayer.tsx` | 5 |
| 3D mesh + drag | `apps/web/components/RoomObjectMesh.tsx` | 5 |
| Inspector | `apps/web/components/RoomObjectInspector.tsx` | 5 |
| Teacher toolbar | `apps/web/components/RoomObjectsToolbar.tsx` | 5, 8 |
| Procedural registry | `apps/web/components/roomObjectProcedurals/index.ts` | 0, 5, 7 |
| Hero primitive | `apps/web/components/roomObjectProcedurals/<hero>.tsx` | 0 |
| Hero thumbnail | `apps/web/public/room-objects/thumbnails/<hero>.png` | 0 |
| 2D icon | `apps/web/components/RoomObjectIcon2D.tsx` | 6 |
| 2D view | `apps/web/components/RoomView2D.tsx` | 6 |
| 3D view | `apps/web/components/RoomView3D.tsx` | 5 |
| Room engine projection | `packages/room-engine/src/index.ts` | 6 |
| Storage service | `apps/api/src/services/storage.ts` | 8 |
| Authoring guide | `docs/planning/new-features/room-object-authoring.md` | 8 |
| Styling | `apps/web/app/globals.css` | 5, 6 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 9 |
| Playwright | `playwright.config.ts`, `apps/web/test/room-objects.spec.ts` | 9 |
| Docs | `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`, `.cursor/memory.md` | 0, 7, 9 |

---

## Risks during implementation

- **`useGLTF` cache collisions across rooms.** Drei caches by URL; same template loaded in two rooms must share the GPU buffer but get independent `THREE.Group` clones. Use `clone(scene, true)` from `three/examples/jsm/utils/SkeletonUtils.js` per instance.
- **Drag latency on slow links.** Unreliable `room.object.pose.v1` may arrive late; render local-holder pose immediately, snap to server pose on next `upsert`. Same pattern as `avatar.state.v1`.
- **Pointer event conflict with click-to-move.** `RoomView3D` click-to-move already skips pointer events whose target is an interactive HTML/Drei child; verify it also skips R3F `<mesh>` children of `RoomObjectsLayer`. Add a `userData.interactive = true` marker on the group if needed.
- **Grab lock leak on browser kill.** Server-side 30 s reaper handles it; do not rely on `onbeforeunload` cleanup.
- **Optimistic pose vs. server reset.** When a teacher hits "Reset" while a student is mid-drag, server `release` race can flicker. Resolution: on `reset`, server force-clears the grab and broadcasts `upsert` with the reset pose; client cancels its drag immediately on detecting it has lost the grab.
- **Procedural component prop churn.** Parameter widget changes should not unmount the whole subtree; use refs / imperative material updates rather than React state on tick for performance-critical changes (e.g. tint).
- **Asset budget enforcement on upload (Phase 8).** Triangle count after decode is the meaningful budget, not file size. Use `@gltf-transform/core` `.triangleCount` accessor after running `dequantize` / `dedraco`.
- **Schema migration for existing rooms.** `room.settings.roomObjects` is optional; existing documents load without it. Mongoose defaults populate on first write.
- **Hero quality gate slippage.** Phase 0 is where visual bar is enforced; Phase 7 is integration only. If Phase 7 reveals the hero isn't district-ready, **return to Phase 0 harness** — do not patch quality under grab-lock deadline. If the template is too ambitious, swap in Phase 0 (e.g. geometric solid kit) before Phase 7.
- **Phase 0 / Phase 1 type drift.** `ProceduralProps` in `types.ts` must match contracts after Phase 1; add a one-line compile-time check or shared import to avoid parameter rename bugs at integration.
- **Dev harness left in production nav.** Gate `/dev/room-object-hero` behind dev env only; never link from teacher lobby.
- **2D drag accuracy.** Screen-pixel-to-world conversion must use the same `projectPositionTo2D` inverse used for placement. Off-by-one or off-by-aspect-ratio bugs are likely; add a unit test in `packages/room-engine`.
- **Export forward-compat regressions.** `exportRootRef` must remain stable across re-renders; use `useImperativeHandle` and avoid recreating the ref via inline `useRef(null)` calls inside conditional branches.

---

## Open questions resolved during IMPL

These need explicit decisions before Phase 5 ships (UI). Track in PR description.

1. Hero template selection — **decided at start of Phase 0**, documented in PR + memory + selection log below; Phase 7 only wires it in.
2. Inspector distance fade — **hide beyond 8 m, tap-to-show on the icon** (PLAN § 17.8).
3. 2D rotation widget — **snap-only keys, no slider** (PLAN § 17.4).
4. Custom upload moderation in v1 — **class-level autonomy, no admin review path** (PLAN § 17.5).
5. Newton's cradle for v1 — **deferred to Phase E unless implementer picks it as hero** (PLAN § 17.6).
6. Per-pod visibility of objects — **not v1; everyone sees the same scene** (PLAN § 17.3).
7. License inheritance on exported templates — **inherit from source; block when `exportable: false`** (PLAN § 17.10).

---

## Hero primitive — selection log (filled in during Phase 0)

**Chosen template:** Water molecule (H₂O) — `proceduralId: "water-molecule"`.

**Rationale:** Fully procedural (no texture or licensed asset to source), instantly readable from a classroom-distance camera, and pedagogically rich for grades 5–12 chemistry — the lowest-risk path to district-demo quality without an external artist.

**Parameters implemented (3 — exceeds the ≥ 2 minimum):**

- **Model style** — ball-and-stick ⇄ space-filling (van der Waals radii); toggles bond visibility and atom radii.
- **Bond-angle readout** — shows/hides the 104.5° H–O–H angle arc + degree chip at the oxygen vertex.
- **Colour palette** — CPK standard (oxygen red) ⇄ colourblind-safe (oxygen blue).

**Phase 0 deliverables:**

- Hero renderer — `apps/web/components/roomObjectProcedurals/waterMolecule.tsx` (geometry mounted on `exportRootRef`; CPK + accessible palettes; half-bonds; `MeshStandardMaterial` / `MeshBasicMaterial` only — export-friendly).
- Local contract — `apps/web/components/roomObjectProcedurals/types.ts` (`ProceduralProps`).
- Registry — `apps/web/components/roomObjectProcedurals/index.ts` (`ROOM_OBJECT_PROCEDURALS`, `renderProcedural`).
- Dev harness — `apps/web/components/roomObjectProcedurals/RoomObjectHeroHarness.tsx` (+ `.module.css`); route `apps/web/app/dev/room-object-hero/page.tsx` gated by `NODE_ENV` / `NEXT_PUBLIC_ENABLE_ROOM_OBJECT_DEV`.
- Draft catalog — `packages/room-objects/catalog/hero-draft.json`.
- Thumbnail — `apps/web/public/room-objects/thumbnails/water-molecule.png` (800×600; generated by `packages/room-objects/scripts/render-hero-thumbnail.mjs`).

**Checkpoint status:**

- `npm run typecheck` — passes (all workspaces).
- Forward-compat — `exportRootRef` wired and live-counted in the harness footer; export-friendly materials only.
- **Visual + pedagogical sign-off — pending a live harness run.** Open `/dev/room-object-hero`, rotate with orbit controls, toggle each parameter, and re-capture the thumbnail from the harness for in-engine parity. Then tick the Phase 0 quality gate above.

**Phase 7 sign-off:** _(to be completed at integration — 60–90 s in-room demo script + 3D + 2D screenshots)_
