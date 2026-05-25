# Planning Doc — 3D Manipulatives ("RoomObject" library)

Source idea: `LEARNING_FEATURE_IDEAS.md` § Alternate A.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~4–6 weeks for a curated launch library + custom import.

## One-line pitch

Free-standing **3D manipulatives** that live on the floor (or float in air) of a 3DSpace room — number lines, base-10 blocks, molecules, globes, geometric solids, word tiles — that students can grab, rotate, scale, and reconfigure in real time. Teachers pick from a curated library or import their own `.glb` files. This is what finally makes the 3D engine *teach*, not just *seat*.

**v1 ships one hero manipulative first** — authored in-engine at implementation time, district-demo quality, ready to show a superintendent in 90 seconds. The full launch library follows; the hero primitive is not a placeholder.

---

## 1. Why this now

Every interactive surface in 3DSpace today is mounted on a wall anchor. The 3D affordance is therefore mostly **seat layout** — we use the spatial axis for "where you sit," not "what you touch." For K–12 math (manipulatives are the curriculum), science (molecules, cells, planetary motion), geography (globes, terrain), and ELA (word tiles, sentence-building), the **manipulative *is* the lesson**. A flat board can show a picture of a water molecule; only a 3D room lets a student walk around it, rotate it, and watch the bond angles change.

This idea also answers the most common "why 3D?" objection from district evaluators: *"Couldn't this just be a Zoom call?"* A breakout pod is hard to demo in 30 seconds; a class manipulating a 3D DNA helix together is not.

It is also a near-pure additive feature: nothing depends on `RoomObject`, no existing entity needs migration, and the touch/permission model is small enough to land in one phase.

---

## 2. Vocabulary

| Term | Meaning |
| --- | --- |
| **RoomObject** | A free-standing 3D thing in the room. Lives on the floor or floats in air; not attached to a wall anchor. |
| **Template** | A server-vetted catalog entry that a teacher instantiates into a room. Holds the `.glb` asset URL, default pose, parameter schema, license, and license attribution. |
| **Instance** | A live `RoomObject` placed in a specific room. Has pose, scale, color tint, parameters, touch policy. |
| **Pose** | `{ position: {x,y,z}, rotation: {yaw,pitch,roll}, scale: number }`. Quantized for snap-to-grid in v1. |
| **Touch** | The right to grab, rotate, scale, or reset an object. Granted per-object, per-user (or per-group). |
| **Grab** | An exclusive short-lived lock on an object during a drag. One holder at a time. |
| **glTF** | Khronos open standard 3D format. We accept binary `.glb` only (single file). |
| **Custom template** | A teacher- or class-uploaded `.glb` registered as a template scoped to the uploading class. |

---

## 3. The "easy to create / import" requirement

This is the single hardest non-rendering requirement in the brief. The plan resolves it three ways:

### 3.1 Standard file format: glTF 2.0 binary (`.glb`)

- **Why glTF.** Khronos open standard, native browser support via Three.js / Drei (`useGLTF`), single binary container (mesh + materials + textures + PBR), small file size, broad authoring-tool coverage (Blender, Maya, Cinema 4D, SketchUp via plugin, Tinkercad export, Spline, Adobe Substance, online glTF viewers). It is *the* web 3D format.
- **Why `.glb` only (not `.gltf` + separate `.bin`/textures).** Single file; no path-resolution surprises; no MIME-type traps in R2; one signed URL per object.
- **Spec subset.** Accept glTF 2.0 core + the following Khronos / common extensions, allowlisted server-side:
  - `KHR_materials_unlit` (flat shading for diagrams).
  - `KHR_texture_transform`.
  - `KHR_draco_mesh_compression` (Draco decompression supported by Three.js).
  - `KHR_mesh_quantization`.
  - `EXT_meshopt_compression`.
- **Reject.** Anything outside the allowlist (notably custom extensions and any glTF that references external buffers / textures). Reject on upload, not at render time.

### 3.2 Curated launch library (no upload required)

Most teachers will not author their own assets in v1. We ship a small, vetted library so the feature is useful day one with zero authoring step. Initial slate (5–8 templates), chosen for breadth across subjects:

| Template | Subject | Notable interactions |
| --- | --- | --- |
| **Number line** | Math (K–6) | Adjustable range, integer / fraction tick density, drag markers along the line |
| **Base-10 blocks** | Math (1–4) | Spawn ones / tens / hundreds; combine by snapping; built-in count label |
| **Water molecule (H₂O)** | Chemistry (5–12) | Rotate freely; bond-angle label; sphere-color toggle (CPK vs. accessibility palette) |
| **Methane molecule (CH₄)** | Chemistry (5–12) | Same affordances as H₂O |
| **DNA double helix (10 bp)** | Biology (6–12) | Spin Y axis; toggle backbone vs. base-pair labels; scale to "walk around" |
| **Globe (Earth)** | Geography (3–12) | Spin; tilt to 23.5°; day/night terminator toggle; latitude/longitude grid toggle |
| **Geometric solid kit** | Math (3–12) | Cube / sphere / cylinder / cone / dodecahedron; toggle wireframe; edge & face counts |
| **Newton's cradle** | Physics (6–12) | Drag-and-release one ball; kinematic swing for 10 s, then friction-damped to rest |

Each template ships with a license (`CC-BY`, `CC0`, or partner-licensed), attribution string, default pose, and a parameter schema. Templates **after** the hero primitive may use a 3D artist contractor (~1–2 weeks in parallel with engineering); the hero itself is **not** outsourced.

### 3.2.1 Hero first primitive — district-demo quality (committed)

**Commitment:** The implementer **creates the first manipulative** before or in parallel with the RoomObject platform — not a gray-box stand-in, not a "coming soon" card, not mockup-quality geometry. It is the **reference template** for the whole feature: the one we put in front of a school district when they ask *"what does 3D actually buy us?"*

**IMPL sequencing:** [`IMPL_ROOM_OBJECTS.md`](./IMPL_ROOM_OBJECTS.md) **Phase 0** authors the hero in a dev harness (visual + pedagogical bar). Phases 1–6 build plumbing. **Phase 7** wires the hero into the live room and runs the full integration + demo checklist.

#### Selection at implementation time

The catalog table above lists candidates; **we do not pre-commit to which one ships first**. At the **start of Phase 0** (recommended) or no later than Phase 7 integration, the implementer picks **one** template from that list (or a tightly scoped variant) based on:

- Confidence they can execute it to **district-demo** standard in the first slice.
- Visual impact in a 90-second superintendent walkthrough (readable from across the theater, impressive when rotated).
- Fit with procedural / in-engine authoring (no dependency on an external artist for the hero).
- Parameter interactions that prove the manipulative is *alive*, not a static prop.

Likely strong candidates (not a decision yet): **water molecule (H₂O)**, **globe (Earth)**, or **geometric solid kit** — each scores high on "wow per triangle" and is achievable without a contractor. The implementer documents the choice in the PR / `IMPL_ROOM_OBJECTS.md` checkpoint with one sentence of rationale.

#### Quality bar — "ready to go," not half-assed

The hero primitive must pass the **visual + pedagogical** rows of this bar in Phase 0 (harness), and the **full** bar (including interaction + demo) before Phase A is considered done:

| Dimension | Requirement |
| --- | --- |
| **Visual** | Clean proportions, intentional materials (not default gray), readable labels from third-person camera distance; no z-fighting, no obvious CSG seams, no "programmer art" vibe |
| **Pedagogical** | At least two meaningful inspector parameters (e.g. bond-angle display + CPK palette; or lat/long grid + tilt) with labels a teacher recognizes |
| **Interactive** | Full grab / rotate / scale / reset / touch-grant loop works in 3D and 2D; multi-user sync verified with two clients |
| **Performance** | Loads and runs smoothly on a baseline Chromebook within the asset budget |
| **Demo script** | A 60–90 s flow is documented: teacher places → grants touch → student rotates → teacher resets — suitable for a live procurement demo without apology |
| **Thumbnail / catalog** | Professional catalog card (thumbnail + one-line description); not a screenshot of a debug scene |
| **Asset optional** | May ship as `renderer: "procedural"` and/or a build-time `.glb` checked into the repo; either way it must look **finished** |

**Explicitly out of scope for the hero:** "We'll polish later," wireframe-only meshes, Comic Sans labels, parameters that do nothing, or a second template at 50% quality to pad the catalog count.

#### v1 catalog shape around the hero

| Ship order | What |
| --- | --- |
| **Phase A (required)** | Full RoomObject platform + **one hero template** at district-demo quality |
| **Phase A+ / follow-on sprint** | Additional launch-library templates at the same bar, one or two at a time |
| **Phase B** | Custom `.glb` import (teachers bring assets; hero proves the pipeline) |

Internal QA and the first district-facing demo use **only the hero** until a second template meets the same bar. The Objects toolbar may list future templates as disabled / "coming soon" if helpful for roadmap storytelling, but **must not** show half-finished manipulatives as selectable.

### 3.3 Custom import (Phase B)

Teachers and district admins upload their own `.glb` files via the existing signed-URL R2 pipeline (mirrors `WallAttachment`):

- **Limit:** ≤ 15 MB compressed; ≤ 50k triangles after Draco / meshopt decode; ≤ 8 textures; max texture 2048 × 2048.
- **Validation:** server-side glTF parse on finalize (`@gltf-transform/core` or `@loaders.gl/gltf` on the Node API). Reject on extension allowlist failure, oversize, or invalid bounding box.
- **Thumbnail:** teacher uploads a PNG (the importing UI gives a one-click "snapshot current pose" alternative in Phase C via a headless Three.js renderer; v1 requires a teacher-supplied PNG).
- **Scope:** custom templates are visible to the uploading class only. District admins can promote a custom template to the district allowlist (Phase D).

### 3.4 Authoring guidance

Even with a great file format, a wrongly-built asset can ruin the UX (origin at the wrong point, scale off by 100×, unreadable materials). We ship one short authoring guide in `docs/planning/new-features/room-object-authoring.md` (Phase B) with:

- Coordinate convention: +Y up, +Z toward the room front, origin at the object's natural base.
- Scale: 1 unit = 1 meter (matches `RoomManifest.dimensions`).
- One material per object recommended; PBR allowed; emissive ok but no animated emissives.
- No baked animations in v1 (we drive motion from the client).
- Pre-flight check: open the `.glb` in https://gltf-viewer.donmccurdy.com/ — if it looks right there, it will look right in 3DSpace.

This satisfies the "easy to create" requirement without us building a 3D editor.

### 3.5 Export to `.glb` from the app (planned — not v1)

**Status:** Deferred. No harm in designing for it now so v1 does not paint us into a corner.

Teachers may eventually want to **save what the class built in the room** as a portable `.glb` — e.g. a stacked base-10 arrangement, a molecule posed a certain way, or a composite of procedural parts. That is separate from **custom import** (Phase B), which ingests files authored outside 3DSpace.

#### What export would produce

| Included in the `.glb` | Not included |
| --- | --- |
| Mesh geometry (merged `THREE.Group` at export time) | Touch policy, grab lock, lesson bindings |
| World transform baked in (position, rotation, uniform scale) | Parameter schema / sliders (unless we opt into glTF `extras`) |
| Simple materials (`MeshStandardMaterial`, unlit) and color tint | Kinematic scripts, snap rules, 2D icon |
| Optional `extras` metadata: `sourceTemplateSlug`, `exportedAt`, `roomId` (non-standard; viewers ignore) | Per-student or per-group visibility |

Export is a **snapshot of appearance**, not a reusable manipulative template. Re-importing an export creates a **static custom template** (no parameters) unless the teacher re-uploads through the normal catalog flow.

#### Technical approach (when we build it)

- **Client:** Three.js `GLTFExporter` (`three/examples/jsm/exporters/GLTFExporter.js`) — already available via the `three` dependency; no new runtime dep required.
- **Source object:** Each `RoomObjectMesh` (or procedural equivalent) exposes a stable `exportRootRef: RefObject<THREE.Group>` pointing at the subtree to serialize. v1 IMP should wire this ref even if nothing calls export yet.
- **Flow:**

  ```text
  Teacher clicks "Export .glb" in inspector
    → clone exportRootRef.current (avoid mutating live scene)
    → apply instance pose + scale + tint to clone
    → GLTFExporter.parseAsync(clone, { binary: true })
    → Blob → trigger browser download OR POST to custom-template upload (Phase F option B)
  ```

- **Validation:** Files produced in-app should pass the same server-side glTF checks as uploaded custom templates (size, extension allowlist, triangle budget) before "Save as class template" is offered.
- **Limits:** Same caps as upload (≤ 15 MB, ≤ 50k triangles). Composite exports (e.g. merged base-10 stack) may need a pre-export triangle count warning in the UI.
- **Procedural templates:** Export captures the **current parameter state** as geometry (e.g. number line at range −10…10), not the parameter schema. Re-opening that `.glb` elsewhere loses adjustability — document clearly in the inspector.

#### Two delivery modes (pick one at implementation time)

| Mode | UX | Reuses |
| --- | --- | --- |
| **F1 — Download only** | "Download .glb" saves to disk; teacher uploads manually if desired | Phase B upload pipeline only |
| **F2 — Save as class template** | "Save to my library" runs export → signed URL upload → `POST /v1/room-objects/templates` in one flow | Phase B end-to-end |

Default recommendation: ship **F1** first (smaller surface), then **F2** once custom templates are stable.

#### v1 forward-compat (build now, export later)

These choices in Phases A–B cost little and unblock Phase F:

| Decision | Rationale |
| --- | --- |
| `RoomObjectTemplate.renderer`: `"gltf" \| "procedural"` | Procedural builtins still get an `exportRootRef`; catalog may also ship repo-built `.glb` for CDN parity |
| `RoomObjectTemplate.exportable`: `boolean` (default `true` for procedural + custom, `false` for licensed partner assets if contract requires) | Inspector hides export when false |
| `RoomObjectMesh` holds `exportRootRef` | Single hook for `GLTFExporter` |
| Materials export-friendly | Avoid custom shaders on exportable templates; stick to Standard / unlit |
| Build-time asset script | `scripts/generate-room-object-assets.ts` can emit the same geometry as procedural builtins → checked-in `.glb` for catalog URLs; same meshes exportable in-app |

No new API endpoints in v1. Phase F may add `POST /v1/rooms/:roomId/objects/:objectId/export` only if we need server-side merge/validate before upload (**F2**); **F1** is client-only.

#### Build-time `.glb` generation (parallel to in-app export)

For the launch library we can also generate `.glb` files **outside** the browser (no user action):

- Node script: Three.js `GLTFExporter` or `@gltf-transform/core` → `packages/room-objects/assets/*.glb` → committed to git → seeded `assetUrl` in the template manifest.
- Keeps the catalog on the `.glb` path from day one while procedural renderers remain the source of truth for interaction.

In-app export (§ 3.5) and build-time generation share the same mesh conventions; they are not mutually exclusive.

---

## 4. The "must be interactive" requirement

A `RoomObject` is uninteresting if it's a static prop. Every instance supports the same base interactions; templates *opt in* to additional interactions via their `parameterSchema`.

### 4.1 Base interactions (every object)

| Interaction | Input (3D) | Input (2D) | Permission |
| --- | --- | --- | --- |
| **Grab + translate (XZ)** | Pointer-drag the object | Drag the icon on the top-down map | Touch granted |
| **Rotate (Y / yaw)** | Right-click drag or `R` + drag | `[ ` / `]` keys | Touch granted |
| **Uniform scale** | Mouse wheel while hovered | `+` / `−` keys | Touch granted |
| **Color tint** | Color picker in object inspector | Same inspector | Touch granted |
| **Reset to spawn pose** | Inspector button | Inspector button | Touch granted |
| **Inspect / read metadata** | Click → inspector panel opens | Same | Always |
| **Snapshot pose** | Teacher inspector → "Save this as default" | Same | Teacher-only |

### 4.2 Optional template interactions

Templates declare additional parameters via a Zod schema. The inspector renders the right widget per parameter type:

- `number` → slider (min/max/step from schema).
- `boolean` → toggle (e.g., "show bond angles").
- `enum` → segmented control (e.g., CPK palette / accessibility palette).
- `range` → dual-handle slider (e.g., number-line range).
- `vector3` → x/y/z numeric input (advanced).

Parameter changes broadcast like pose updates; templates implement a `render(parameters)` function client-side that re-skins or re-meshes the glTF accordingly.

### 4.3 Movement model — no physics in v1

- **Snap-to-grid:** translation snaps to a 0.25 m grid on the floor. Rotation snaps to 15°. Scale snaps to 5% steps within `[0.5×, 2.0×]` of the template default.
- **No collision detection.** Objects can overlap with avatars, walls, or each other. Acceptable v1 trade-off; the workaround is "drag it somewhere else."
- **Bounds enforcement.** Translation clamps to `RoomManifest.bounds`. Scale × bounding box clamps to ≤ 4 m per axis to prevent floor-sized props.
- **One exception:** Newton's cradle (and any future template flagged `kinematic: true`) runs a per-template script that updates pose at 30 Hz on the client; the server stores only the resting pose.

### 4.4 Grab lock

Concurrent edits would be chaos (a student dragging while the teacher rotates). Solution: a short-lived exclusive lock.

- Client emits `room.object.grab.v1 { objectId, holderId }`.
- Server validates touch permission, attaches a grab record `{ objectId, holderUserId, expiresAt: now + 30 s }` to the in-memory room state.
- Other clients display the object with a colored outline = holder's user color, and their inspector controls become read-only.
- Holder emits `room.object.pose.v1` at ≤ 15 Hz during the drag (unreliable channel ok; the server doesn't persist these).
- Holder emits `room.object.release.v1 { objectId, finalPose }` at drag end. The server persists the final pose (`PATCH /v1/rooms/:roomId/objects/:objectId`), broadcasts `room.object.upsert.v1` with the new state, and clears the grab record.
- Grab expires automatically after 30 s of no `pose.v1` updates (network drop or browser close).

### 4.5 Touch policy

Per instance, three modes (mirrors `WallObjectCreationPolicy`):

- `teacher-only` (default) — only the room teacher can touch.
- `granted` — touch is granted to a list of user IDs (mirrors `boardAccessGrants`) or to a group ID.
- `all-class` — anyone in the room can touch (sandbox / exploration). Teacher can still revoke instantly.

The inspector exposes a "Grant touch" submenu next to the object. Granting touch to a group means every member of that group has touch; revoking the group revokes all of them.

---

## 5. Functional scope

### 5.1 What stays the same

- `RoomManifest` is unchanged. Manipulatives live outside the manifest (same pattern as `WallObject`).
- `WallObject` is unchanged. The wall remains where boards / posts / shares go.
- `ClassroomState` does not change. Object touch grants live on the object itself, not on the room state.
- `ClassroomGroup` is unchanged. A group can be the subject of a "Grant touch" call, but groups carry no object data.
- Movement, spatial audio, and avatar systems are untouched.

### 5.2 What is new

#### A. New entity `RoomObjectTemplate`

```ts
RoomObjectTemplateSchema = z.object({
  id: z.string(),
  slug: z.string().min(2).max(64),
  displayName: z.string().min(1).max(120),
  category: z.enum(["math", "science", "geography", "ela", "art", "custom"]),
  description: z.string().max(500),
  assetUrl: z.string().url(),
  thumbnailUrl: z.string().url(),
  defaultPose: PoseSchema,
  defaultScale: z.number().positive().default(1),
  defaultColorTintHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  defaultParameters: z.record(z.string(), z.unknown()).default({}),
  parameterSchemaJson: z.string().default("{}"),
  recommendedTouchPolicy: z.enum(["teacher-only", "granted", "all-class"]).default("teacher-only"),
  kinematic: z.boolean().default(false),
  ownerClassId: z.string().optional(),
  source: z.enum(["builtin", "custom", "partner"]).default("builtin"),
  license: z.string().max(60).default("CC-BY"),
  attribution: z.string().max(240).default(""),
  renderer: z.enum(["gltf", "procedural"]).default("gltf"),
  proceduralId: z.string().optional(),
  exportable: z.boolean().default(true),
  fileSizeBytes: z.number().int().nonnegative(),
  triangleCount: z.number().int().nonnegative(),
  createdAt: z.string()
});
```

- **`renderer`** — `"gltf"` loads `assetUrl` via `useGLTF`; `"procedural"` dispatches to a registered client component by `proceduralId`. Builtin launch templates may use either; catalog `assetUrl` can still point at a build-time `.glb` for thumbnails and upload-pipeline testing.
- **`exportable`** — when `false`, the inspector omits export actions (partner/licensed assets). Forward-compat for § 3.5; no export UI in v1.

Built-in templates are seeded by the API at startup from a JSON manifest checked into the repo. Custom templates persist to MongoDB.

#### B. New entity `RoomObject`

```ts
RoomObjectSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  templateId: z.string(),
  displayName: z.string().min(1).max(120),
  pose: PoseSchema,
  scale: z.number().positive(),
  colorTintHex: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  touchPolicy: z.enum(["teacher-only", "granted", "all-class"]).default("teacher-only"),
  grantedUserIds: z.array(z.string()).default([]),
  grantedGroupIds: z.array(z.string()).default([]),
  status: z.enum(["active", "locked", "archived"]).default("active"),
  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
});

PoseSchema = z.object({
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  rotation: z.object({ yaw: z.number(), pitch: z.number().default(0), roll: z.number().default(0) })
});
```

Persisted in a Mongoose `RoomObject` collection (sibling to `WallObject`).

#### C. Per-room object settings on `RoomSettingsSchema`

```ts
roomObjects: z.object({
  enabled: z.boolean().default(false),
  maxActive: z.number().int().positive().max(16).default(8),
  customUploadsEnabled: z.boolean().default(false),
  maxUploadSizeBytes: z.number().int().positive().default(15 * 1024 * 1024),
  defaultTouchPolicy: z.enum(["teacher-only", "granted", "all-class"]).default("teacher-only")
}).default({
  enabled: false, maxActive: 8, customUploadsEnabled: false,
  maxUploadSizeBytes: 15 * 1024 * 1024, defaultTouchPolicy: "teacher-only"
})
```

#### D. New REST endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/v1/room-objects/templates` | any room member | List visible templates (builtin + own-class custom + district allowlist) |
| `POST` | `/v1/room-objects/templates` | teacher / admin | Register a custom template (after asset upload) |
| `DELETE` | `/v1/room-objects/templates/:id` | template owner / admin | Archive a custom template |
| `GET` | `/v1/rooms/:roomId/objects` | room member | List room objects (status filter) |
| `POST` | `/v1/rooms/:roomId/objects` | teacher | Instantiate a template into the room |
| `PATCH` | `/v1/rooms/:roomId/objects/:objectId` | teacher / current grab holder | Update pose / parameters / tint / policy |
| `DELETE` | `/v1/rooms/:roomId/objects/:objectId` | teacher | Remove from room |
| `POST` | `/v1/rooms/:roomId/objects/:objectId/touch` | teacher | Grant or revoke touch (`userIds[]`, `groupIds[]`, `mode`) |
| `POST` | `/v1/rooms/:roomId/objects/:objectId/reset` | teacher / touch holder | Reset to template default pose |
| `POST` | `/v1/wall-attachments/glb` | teacher | Custom-template asset upload (reuses `WallAttachment` storage; new content-type bucket) |

The template asset upload path reuses the existing signed-URL flow we already have for `WallAttachment` so we don't build a parallel storage pipeline.

#### E. Realtime messages

| Message | Direction | Reliability | Purpose |
| --- | --- | --- | --- |
| `room.object.upsert.v1` | server → all | reliable | New / changed object (after `POST` / `PATCH`) |
| `room.object.remove.v1` | server → all | reliable | Object deleted |
| `room.object.touch.v1` | server → all | reliable | Touch policy / grants changed |
| `room.object.grab.v1` | client → server → all | reliable | Claim grab lock |
| `room.object.pose.v1` | client → server → all | **unreliable**, ≤ 15 Hz | Live pose during drag (not persisted) |
| `room.object.release.v1` | client → server → all | reliable | Release grab; server persists final pose |
| `room.object.parameter.v1` | client → server → all | reliable | Parameter slider change (debounced 200 ms) |

`pose.v1` parallels the existing `avatar.state.v1` unreliable channel — same pattern, same throttle. The reliable upsert that follows release ensures persistence.

#### F. Client architecture

- **`useRoomObjects(roomId)`** — sibling to `useWallObjects`. Hydrates from `GET /v1/rooms/:roomId/objects`, listens to the four reliable messages, applies optimistic local pose updates for the local participant during a drag.
- **`useRoomObjectTemplates()`** — caches the template catalog per session.
- **`RoomObjectMesh` (R3F component)** — owns one instance. Uses Drei `useGLTF` with shared asset cache (or a procedural sub-renderer when `renderer === "procedural"`). Renders with the instance's `pose`, `scale`, `colorTintHex`, and parameter-driven re-skinning. Exposes **`exportRootRef`** (`RefObject<THREE.Group>`) on the exportable subtree for future `GLTFExporter` use (§ 3.5) — wired in v1, unused until Phase F.
- **`RoomObjectInspector`** — HUD panel anchored beside the object (Drei `<Html>`); shows display name, parameters, touch grant, reset, color tint, "remove" for teacher. Export actions deferred to Phase F; layout should reserve no extra chrome in v1.
- **`RoomObjectsToolbar`** — teacher-only HUD card with template picker, upload form (when `customUploadsEnabled`), and a list of active objects in the room.
- **`RoomObjectIcon2D`** (2D analog) — sprite/icon at the projected XZ position; supports translate + yaw rotation; opens the same inspector (without the 3D affordance).

---

## 6. The 2D analog

This is non-negotiable per the existing project rules — every 3D interaction has a 2D fallback so accessibility / low-end / network-degraded users can still participate.

In 2D mode:

- Each `RoomObject` shows as an icon sprite at the projected XZ position, with the template's thumbnail.
- The icon shows a halo in the grab holder's color while grabbed.
- Drag the icon to translate; `[` / `]` keys rotate yaw in 15° steps; `+` / `−` scale uniformly.
- Inspector opens to the side, with the same parameter widgets as 3D.
- Color tint is shown as a corner badge.
- TTS reads the template description + current parameter values when the icon is focused (Universal Access tie-in).
- Reset / remove / touch-grant work identically.

Acceptance test: a teacher running an entire lesson in 2D mode can instantiate, place, manipulate, and remove every launch-library template. No 3D interaction is required to use the feature.

---

## 7. Permissions matrix

| Action | Teacher | Touch holder | Other student |
| --- | --- | --- | --- |
| Instantiate template into room | yes | no | no |
| Remove instance | yes | no | no |
| Grant / revoke touch | yes | no | no |
| Change touch policy | yes | no | no |
| Grab (with valid policy) | yes | yes | only if policy allows |
| Pose update (during grab) | yes | yes | only if policy allows |
| Reset to default pose | yes | yes | only if policy allows |
| Parameter change | yes | yes | only if policy allows |
| Read state (list / inspect) | yes | yes | yes |
| Upload custom template | yes | no | no |
| Delete custom template | template owner / district admin | no | no |
| Promote custom template district-wide (Phase D) | district admin | no | no |

The server enforces every row independently of the client; the client UI hides operations the user cannot perform. Permission failures return 403 with a structured `ApiError` (already established pattern).

---

## 8. Overlap with existing functionality

This is the section the user asked us to be careful about (mirrors `PLAN_BREAKOUT_PODS.md` § 5). Every adjacent feature gets an explicit decision.

### 8.1 `WallObject` (the wall-mounted entity)

**Decision: parallel, not extended.**

- `WallObject` is mounted on a wall anchor; `RoomObject` is free-standing on the floor / air. Distinct entities.
- They share storage (R2 signed URL) but not schema, not endpoints, not realtime messages.
- The Wall sidebar continues to drive wall objects; a new **Objects toolbar** HudCard drives room objects.
- Rationale: trying to stretch `WallObject` (which has wall-anchor metadata: `anchorId`, `placement`, `allowedObjectTypes`) onto a free-standing thing was considered and rejected — the schema diverges quickly, and we'd lose the per-anchor occupancy logic that wall objects need.

### 8.2 `WallAttachment` (the file-asset entity)

**Decision: reuse storage, dedicated bucket prefix.**

- We extend `WallAttachment` *only* to accept `mime: "model/gltf-binary"` and store under a `room-objects/` key prefix in R2.
- Validation: file size, glTF parse, extension allowlist — all run server-side on finalize.
- No changes to existing `WallAttachment` consumers (image/video/audio).
- Rationale: avoid building a second signed-URL pipeline.

### 8.3 `RoomManifest`

**Decision: no change.**

- The manifest stays geometry / spawn / wall / projection only. Manipulatives are mutable; the manifest is the room's *fixed* shape.
- Same separation we used for wall objects: anchors live in the manifest, content lives outside.

### 8.4 `ClassroomState`

**Decision: no change in v1.**

- Touch grants live on the `RoomObject` itself, not on `ClassroomState`. Rationale: each object has its own grant list and policy; bundling them all in `ClassroomState` would bloat that document and create a write hotspot.
- The **grab lock** is held in an in-memory map on the API, not on Mongo, and not on `ClassroomState`. Grabs expire automatically; we do not need persistence.

### 8.5 `ClassroomGroup`

**Decision: read-only consumer.**

- A `RoomObject` can target a `grantedGroupIds` list. When a group is released or archived, the grant on that object continues until the teacher explicitly revokes it (predictable failure mode: revoking the group does not silently revoke object permissions).
- No schema change to `ClassroomGroup`.

### 8.6 `boardAccessGrants`

**Decision: parallel pattern, separate field.**

- `boardAccessGrants` is for who can post on a wall anchor. `RoomObject.grantedUserIds` is for who can touch a free-standing object. Distinct.
- We mirror the *UX*: the inspector "Grant touch" submenu reuses the same dropdown / chip pattern as the People-panel board-access UI.

### 8.7 `LessonRun`

**Decision: no change in v1; new step kind in v2.**

- v1: teachers place and manage objects independently of any lesson run. The recap doesn't track object interactions.
- v2 candidate: `manipulative-explore` lesson step. Payload: `{ templateId, defaultTouchPolicy, parameters }`. On begin, the server instantiates the template + grants touch to all students; on end, archives the instance. Recap shows per-student "did they grab it" boolean.

### 8.8 `useSpatialAudio` + camera billboards

**Decision: no change.**

- Manipulatives have no audio source. Spatial audio routing ignores them.
- Camera billboards (pinned `camera.live` on a wall) are unrelated.

### 8.9 `Whisper` / `Pods` (audio modes)

**Decision: no change.**

- Whispers and pods are listener-side gain attenuation. RoomObjects are silent. The two systems don't interact.

### 8.10 Avatars and movement

**Decision: no change in v1.**

- Avatars walk through objects (no collision). Acceptable trade-off — the alternative is a collision system we don't need yet.
- v2 candidate: optional "solid" flag per template (a globe you can't walk through). Requires extending the movement validator.

### 8.11 `hallpassHoldingZone`

**Decision: no change.**

- The hallpass zone is purely spatial; objects can be placed inside it, but it would be a UX anti-pattern. The toolbar shows a soft warning if a teacher tries to place there.

### 8.12 Feature-flag interactions

| Flag | RoomObject behavior |
| --- | --- |
| `ENABLE_ROOM_OBJECTS=false` (default) | All endpoints return 404; toolbar hidden; render layer skipped; no realtime messages emitted. |
| `ENABLE_ROOM_OBJECTS=true`, `room.settings.roomObjects.enabled=false` | Toolbar visible only to teachers, with a "Enable in room settings" callout. |
| `ENABLE_ROOM_OBJECTS=true`, `room.settings.roomObjects.enabled=true`, `customUploadsEnabled=false` | Catalog-only mode. Custom upload UI hidden. |
| `ENABLE_ROOM_OBJECTS=true`, `room.settings.roomObjects.enabled=true`, `customUploadsEnabled=true` | Full mode including custom uploads. |

---

## 9. Performance and asset budget

The single biggest risk is loading 8 × 15 MB `.glb` files on a Chromebook with 4 GB RAM.

| Lever | Budget / target |
| --- | --- |
| Per-template asset size | ≤ 15 MB compressed (Draco-encoded) |
| Per-room concurrent active objects | ≤ 8 (configurable, hard cap 16) |
| Per-template triangle count | ≤ 50k triangles after decode |
| Per-template texture count | ≤ 8 textures |
| Max texture dimension | 2048 × 2048 |
| Initial load target | All 8 objects rendered ≤ 5 s on baseline Chromebook (Intel N4020 class) over 50 Mbps |
| Pose update bandwidth | ≤ 1.5 KB/s per grabbed object (15 Hz × ~100 B per message) |
| Memory per object | ≤ ~20 MB GPU + ~10 MB JS heap |
| Draw calls per object | ≤ 4 |

Caching strategy:

- All template `.glb` URLs are R2-signed with **long** TTL (24 h) and `Cache-Control: public, max-age=86400, immutable`. Cloudflare CDN handles repeat fetches across rooms.
- The catalog response (`GET /templates`) is cached per session in React Query (or our equivalent SWR hook), with an `ETag` for revalidation.
- Drei `useGLTF` already deduplicates loads across React components by URL — multiple instances of the same template share GPU buffers.
- LOD support is **not** in v1. Templates that need detail-reduction at distance are a v2 task.

---

## 10. User stories

### Teacher

- **T1.** As a teacher, I open the **Objects** toolbar, pick "Water molecule," and drop it on the floor in front of the class.
- **T2.** As a teacher, I grant touch to the "Lab Group" so all four members can rotate the molecule. The rest of the class watches.
- **T3.** As a teacher, I switch the touch policy to "all-class" for a 90-second free exploration, then revoke and the molecule returns to teacher-only.
- **T4.** As a teacher, I open the inspector and click "Reset" to put the molecule back at its starting pose.
- **T5.** As a district teacher, I upload a custom `.glb` of my regional state capitol building. It appears in my class's template list only.
- **T6.** As a teacher, I hit "Remove" and the object disappears for everyone within 250 ms.
- **T7.** *(Phase F)* As a teacher, I export the current manipulative pose as a `.glb` and either download it or save it to my class template library.

### Student

- **S1.** As a student in the Lab Group, I see a halo on the molecule when I grab it. I rotate it, my classmates see the rotation in real time.
- **S2.** As a student outside the Lab Group, I can click the molecule to read its label and watch — but the inspector controls are read-only.
- **S3.** As a student using 2D mode, I drag the molecule icon on the top-down map and rotate it with `[` / `]`. The class sees the new pose.
- **S4.** As a student with a low-end Chromebook, I see the launch library load progressively and the inspector is responsive even before the highest-resolution texture lands.

### Observer / accessibility

- **O1.** As a low-vision student, I focus the object icon in 2D mode; my screen reader announces "Water molecule, currently rotated 30 degrees, scale 1.2×, three parameters."
- **O2.** As a teacher with reduced-motion mode on, the kinematic Newton's cradle animation is replaced with a static "you released this ball" annotation; releasing the ball jumps it back to rest after 1 s.

---

## 11. Acceptance criteria (v1)

A shippable v1 requires all of the following:

1. **Hero primitive — district-demo ready.** One manipulative (§ 3.2.1) is selectable, fully interactive in 3D and 2D, and meets the quality bar table — suitable for a live superintendent demo without caveats. Implementer records which template was chosen and why in the PR.
2. **Catalog renders.** A teacher in a room with `ENABLE_ROOM_OBJECTS=true` and `roomObjects.enabled=true` opens the **Objects** toolbar and sees at least the hero template; additional launch-library entries may ship in follow-on sprints once they meet the same bar (not before).
3. **Place + persist.** Teacher instantiates the hero template; the object renders in both 3D and 2D for all participants within 500 ms of API response; persists across room rejoin.
4. **Touch policy + grab.** Default `teacher-only` works. Granting touch to a student or group lets them grab and manipulate. Revoking touch mid-grab releases the lock within one frame.
5. **Pose sync.** Translation, rotation, scale during a drag arrive on all clients at ≥ 10 Hz with median end-to-end latency < 250 ms on local LiveKit.
6. **Snap behavior.** Translation snaps to 0.25 m; rotation to 15°; scale to 5% within `[0.5×, 2×]`.
7. **Reset.** Reset returns the object to template default pose for all viewers.
8. **2D parity.** Every interaction in #3–#7 is operable in 2D mode without touching the 3D scene.
9. **Cap enforcement.** The 9th instantiation in a room returns 422 `room-object-limit-reached`; UI surfaces a clear error.
10. **Bounds clamp.** Translation outside `RoomManifest.bounds` clamps to bounds; scale × bbox clamps to ≤ 4 m per axis.
11. **No regression.** All 47 existing tests pass; wall objects, lesson runs, classroom state, and audio modes behave identically to pre-RoomObject.
12. **Permissions.** Server rejects student instantiation, student touch outside grants, custom upload from non-teachers — each with a structured `ApiError`.
13. **Asset budget.** The hero template loads on a baseline Chromebook in ≤ 5 s.
14. **Kill switch.** Flipping `ENABLE_ROOM_OBJECTS` off hides all UI and ignores all RoomObject realtime messages on the next reload.

---

## 12. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| `.glb` payload bloat → slow load on school Chromebooks | Per-template 15 MB cap, Draco mandatory, CDN immutable cache, lazy-load until toolbar opens |
| Concurrent grabs cause visual jitter / desync | Server-side grab lock; clients show holder color outline and disable inspector for non-holders |
| Malicious `.glb` with custom extensions / external refs | Server-side parse with `@gltf-transform/core`; extension allowlist; reject external buffer refs |
| Custom uploads pollute storage / spam R2 | Per-class quota (`maxCustomTemplates: 10` v1); admin review path Phase B |
| Object covers an avatar or wall and breaks teaching | Teacher one-click remove; bounds clamp; status `locked` to freeze an object in place |
| 2D-only users can't operate complex parameters (vector3) | Vector3 widget is collapsible; defaults shown; teacher can pre-set complex params before granting touch |
| LOD missing → 8 detailed objects tank FPS | Per-room cap (8), Draco compression, triangle budget, profiling target documented |
| Pose-update bandwidth at 30 students × 8 active objects | Only the grab holder publishes pose; 15 Hz cap; ≤ 1.5 KB/s per active grab; matches existing `avatar.state.v1` budget |
| License / copyright on custom uploads | Template `license` and `attribution` fields are required and surfaced on the inspector; district admins gate uploads |
| Schema drift between template `parameterSchemaJson` and rendered widgets | Parse the JSON schema with `zod` (already in stack); fail-soft to no controls if invalid; flag template as "needs review" |
| Snap-to-grid frustrates fine adjustments | `Shift`-drag bypasses snap (3D); inspector numeric inputs always allow exact values |
| Kinematic templates (Newton's cradle) drift between clients | Server-side seeded RNG + deterministic damping function; clients run identical script keyed by `objectId + releaseTimestamp` |

---

## 13. What we deliberately don't build in v1

- **In-app export to `.glb`.** Deferred to Phase F (§ 3.5). v1 still wires `exportRootRef` and `exportable` on templates so we do not refactor meshes later. Build-time `.glb` generation for the catalog (optional script) is not blocked.
- **A 3D scene editor.** We do not build an in-browser glTF authoring tool. Teachers use Blender / Tinkercad / Spline / partner libraries and import a `.glb`, or (Phase F) export a snapshot from the room.
- **Per-object animations.** No skeletal animation, no keyframes. Motion is client-script-driven (kinematic templates) or user-driven (grab).
- **Object-to-object collision.** Avatars walk through objects; objects can overlap each other.
- **Object-driven sound.** No audio source on a manipulative; this is a `WallObject.audio.file` use case if needed.
- **Per-student object state.** Every viewer sees the same object pose. No "your view of the molecule is different from mine" mode (would require per-viewer instances; deferred).
- **Programmable behavior / scripting.** Templates are render-only configurations; no Lua / JS hook for districts to add custom interactions in v1.
- **Marketplace.** Phase D candidate; v1 ships only builtin + per-class custom uploads.
- **VR headset interaction.** Pointer / 2D analog only.
- **Recording / playback of object manipulation.** Time-capsule capture (the Big Idea) could later snapshot object state at lesson end.

---

## 14. Feature flag and rollout

- `ENABLE_ROOM_OBJECTS` (API) + `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS` (web). Both default `false`.
- `room.settings.roomObjects.enabled` defaults `false` (per-room opt-in even when the env flag is on).
- `room.settings.roomObjects.customUploadsEnabled` defaults `false` (catalog-only mode by default).
- Rollout sequence:
  1. Ship behind the env flag with all room defaults off (Phases 1–6 of the IMPL doc).
  2. Internal QA: teacher creates a room, opts in `roomObjects.enabled`, places three different templates, grants touch to one student.
  3. Flip the env flag on in staging; teachers opt-in per room.
  4. Pilot with one friendly classroom; record performance metrics.
  5. Flip `room.settings.roomObjects.enabled` to default `true` after a one-week soak.
  6. Phase B: enable `customUploadsEnabled` for whitelisted teachers.
- Kill switch: flipping the env flag off → next reload, all RoomObject UI hidden and incoming `room.object.*` messages dropped. Stored data is unaffected.

---

## 15. Phased delivery

| Phase | Ships | Effort |
| --- | --- | --- |
| **0 — Hero authoring** *(IMPL)* | One manipulative in dev harness; visual + pedagogical bar; thumbnail + `hero-draft.json`; template chosen at start of Phase 0 | ~2–4 days |
| **A — Platform + hero integration** | Full RoomObject stack (IMPL Phases 1–7); hero wired into live room; 60–90 s district demo script | ~3 weeks (includes IMPL 1–6 + 7) |
| **A+ — Launch library expansion** | Additional catalog templates, each at the hero quality bar; no "filler" entries | ~1 week per template (parallelizable) |
| **B — Custom imports** | `.glb` upload validation pipeline; per-class custom templates; authoring guide; thumbnail upload | ~1.5 weeks |
| **C — Touch grants + groups** | Grant touch to user / group; "all-class" mode; revoke; holder outline UI | ~1 week (overlaps A — actually shipped within Phase A scope; called out here for clarity) |
| **D — Lesson integration + district library** | `manipulative-explore` lesson step; per-step auto-instantiate; recap row; district-admin promote-to-allowlist | ~2 weeks |
| **E — Polish / v2 candidates** | LOD, collision opt-in, headless thumbnail generator, animated kinematic templates with proper damping, marketplace surface | indefinite |
| **F — Export to `.glb`** | Inspector export via `GLTFExporter`; **F1** download and/or **F2** save-as-class-template; reuses Phase B validation | ~3–5 days after B |

Phase A (platform + hero) is the **district-demo milestone**. Phase A+ and B extend the catalog and import path; the original "4–6 weeks" estimate assumed a multi-template launch library — rescope district pitches to the hero until A+ catches up.

**v1 IMPL must still:** attach `exportRootRef` on `RoomObjectMesh`, set `exportable` on templates, use export-friendly materials on the hero; **start hero authoring in Phase 0** so district-demo polish is not squeezed into the integration sprint; do not ship many rough templates to pad the catalog.

---

## 16. Validation evidence (filled in during implementation)

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass (existing 47 + new RoomObject tests)
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "room object|template"` — pass
- [ ] `npm run test:e2e` — pass (existing + new RoomObject browser test)
- [ ] Manual: 3-user grab test (one holder, two observers; observer inspector is read-only)
- [ ] Manual: 2D-only teacher places + manipulates the hero primitive end-to-end
- [ ] Manual: hero primitive loads in ≤ 5 s on baseline Chromebook
- [ ] Manual: 60–90 s district demo script run on staging without visual/UX apologies (§ 3.2.1)
- [ ] PR notes: which hero template was chosen at implementation time and why
- [ ] Manual: custom `.glb` upload + validation rejects oversize / disallowed-extension files

---

## 17. Open product questions

These deserve an explicit decision before Phase A IMPL Phase 4 (UI ships):

1. **Launch library headcount.** **Resolved for v1:** one hero at district-demo quality (§ 3.2.1); additional templates only in A+ when they meet the same bar. Open: order of A+ additions after hero ships.
2. **Touch defaults for `group-work` lesson step.** When a teacher places an object during a `group-work` step, should it default to "all members of the active group" rather than "teacher-only"?
3. **Object visibility per group.** Should a teacher be able to show an object only to a single group (private to that group)? v1 says no (everyone sees the same scene); v2 could add `visibleToGroupIds`.
4. **2D rotation widget.** Snap-only (`[` / `]` keys), or expose a slider? Snap-only is simpler; slider needs a tiny widget on the icon.
5. **Custom upload moderation.** Teacher upload goes live immediately, or queues for district-admin review when the district has an admin? Probably class-level autonomy in v1 + a "report" link for peers.
6. **Newton's cradle authoring scope.** Is kinematic motion important for v1, or defer to Phase E? If we ship without it, the launch library is 4 + 1 (4 static, 1 deferred).
7. **License pre-vetting for builtin library.** Confirm every launch asset is CC0 / CC-BY or partner-licensed before contracting; document in the asset manifest.
8. **Distance-attenuated inspector.** When the camera is > 8 m from the object, hide the inspector to reduce HUD clutter? Or always show? Decision: hide beyond 8 m; show on hover-from-distance via tap.
9. **Export delivery (Phase F).** Download-only (**F1**) vs one-click save-as-class-template (**F2**)? Default: F1 first.
10. **Exported `.glb` licensing.** When a teacher exports a builtin template pose, does the new custom template inherit the builtin license + attribution? Default: yes, copy from source template; block export when `exportable === false`.

---

## 18. Glossary of state machines

```
RoomObject lifecycle:
  active → locked → archived
                  ↘ active (teacher unlock)

Touch policy:
  teacher-only ↔ granted (with grantedUserIds / grantedGroupIds) ↔ all-class
  (teacher can switch freely; ungranted users drop from active grabs immediately)

Grab lock:
  none → held(holderUserId, expiresAt) → none
  (auto-expire after 30 s of no pose updates; release on release.v1)

Template source:
  builtin (seeded) | custom (per-class) | partner (district-promoted)
```

---

## 19. Next document

`IMPL_ROOM_OBJECTS.md` — phase-by-phase implementation plan, file-by-file changes, validation steps. The IMPL doc follows the existing shape (see `IMPL_BREAKOUT_PODS.md`): **Phase 0 hero authoring** (§ 3.2.1, dev harness) → Contracts → API + persistence → Realtime + grab lock → 3D rendering → 2D rendering → **Phase 7 hero integration** → Custom upload pipeline → Polish & rollout. Phase F (export) is documented in § 3.5 here; IMPL should call out `exportRootRef` in the 3D rendering phase even though export UI ships later. Phase A is not complete until the hero passes the full district-demo checklist (Phase 0 visual bar + Phase 7 integration bar).
