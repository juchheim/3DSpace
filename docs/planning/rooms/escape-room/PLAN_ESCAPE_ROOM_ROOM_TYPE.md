# Plan — Escape Room Room Type

Roadmap (logic + triggers): [`../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`](../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md)
World-building engine (reused): [`../free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](../free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md)
Companion implementation docs: [`./IMPL_ESCAPE_ROOM_ROOM_TYPE.md`](./IMPL_ESCAPE_ROOM_ROOM_TYPE.md) (Phase −1) · [`./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md`](./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md) (Phases 0–1) · [`./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md`](./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md) (Phases 2–10)
Branch target: `feature/escape-room-type` (lands before trigger-block phases in the roadmap)
Last updated: 2026-05-31

---

## 0. TL;DR

**Escape Room** is a fourth room type: an **empty 80×80 m canvas** where an **author** builds puzzle layout with the existing world-building kit, places clue boards on build walls, and (in later roadmap phases) wires trigger blocks. **Players** join to play — not to edit.

This plan covers **Phase −1** from the roadmap: room type, manifest, lobby, flags, permissions, and build-mask changes. It does **not** ship logic/triggers (Phases 2–10 of the roadmap).

**Why not Free-for-All?** FFA is an open social sandbox (circular hub, halls, anyone-destroys). Escape rooms need a blank stage, author-owned layout, and play mode. Reusing the **engine** without the **room type** fights geometry and permissions.

---

## 1. Overview

### 1.1 Product intent

| Actor | Goal |
|-------|------|
| **Author** (room owner) | Create a room, build structure, place boards/clues, wire puzzles (later), publish for players |
| **Player** | Join, read clues, solve puzzles, beat the timer, escape |

Escape rooms are **designed experiences** — closer to a lesson activity or training scenario than a hangout space.

### 1.2 Phase 1 scope (this plan only)

| In scope | Out of scope (roadmap) |
|----------|------------------------|
| `"escape-room"` room type in contracts, API, lobby | Trigger blocks / channel bus (`BuildLogicPiece`) |
| `createEscapeRoomManifest()` — empty canvas | Play session timer, win zone |
| Feature flags + escape-specific default settings | Door / button / teleporter logic pieces |
| Author vs player permissions + UI copy | Prefabs, undo (Phase 0 of roadmap) |
| Build + dynamic boards on **escape-room** type | Escape room browse directory (optional later) |
| Escape-specific `isBuildAllowedAt` (no FFA mask) | Classroom / FFA behavior changes |
| Env flags `ENABLE_ESCAPE_ROOM` | |

### 1.3 What “empty canvas” means in practice

The manifest ships **no puzzle** — only a walkable floor and bounds:

- **No** interior walls, halls, tiers, or static board anchors.
- **No** cylindrical perimeter or radial collision special cases.
- Authors use **build pieces** (wall / floor / ramp) for all structure.
- Authors use **dynamic boards** on build walls for clues (same pipeline as FFA, extended to this type).

Players should land on a flat floor and see nothing until the author builds — or loads a future template stamp.

---

## 2. Room geometry — `createEscapeRoomManifest()`

### 2.1 Design goals

1. **Maximum author freedom** — no pre-placed geometry competing with the puzzle layout.
2. **Predictable bounds** — authors know the build volume.
3. **Simple movement** — flat base at `y = 0`; verticality from build pieces only.
4. **No accidental FFA behavior** — zero `ffa-perim-*` walls; no radial clamp path in collision.

### 2.2 Proposed constants

Add to `packages/room-engine` (single source of truth):

```ts
export const ESCAPE_ROOM_HALF_EXTENT = 40;        // m → 80×80 m total
export const ESCAPE_ROOM_WALL_HEIGHT = 8;         // m, for dimensions metadata / skybox
export const ESCAPE_ROOM_MANIFEST_FEATURE = "escape-room-canvas";
```

### 2.3 Manifest shape

```ts
createEscapeRoomManifest({
  roomId,
  name?: "Escape Room",
  config?: Partial<RoomEngineConfig>,
}): RoomManifest
```

| Field | Value | Notes |
|-------|-------|-------|
| `dimensions.width` / `depth` | `80` | Matches bounds; drives `FloorMesh` in `RoomView3D` |
| `dimensions.height` | `8` | Metadata; no manifest walls to enforce it |
| `bounds` | `minX/Z: -40`, `maxX/Z: +40` | `clampPositionToBounds` + build validation |
| `walls` | `[]` | **Empty** — all structure is `BuildPiece` |
| `wallAnchors` | `[]` | All boards are dynamic on build walls |
| `tiers` | `[]` | `floorYFromZ` → `0` everywhere |
| `spawnPoints` | See §2.4 | Minimal defaults |
| `features` | `[{ key: "escape-room-canvas", enabled: true }]` | Detect escape manifest in engine (`isEscapeRoomManifest`) |
| `projection` | `{ kind: "top-down-v1", scale: 1, origin: { x: 0, y: 0 } }` | Same as other types |

### 2.4 Spawn points (v1 defaults)

Authors will move player spawns into their start room via build workflow later; v1 needs sane defaults:

| Id | Label | Position | Purpose |
|----|-------|----------|---------|
| `spawn-author` | Author spawn | `(0, 0, 0)` | Owner lands at canvas center when editing |
| `spawn-player-1` | Player 1 | `(-4, 0, 0)` | Offset 4 m west — author rebuilds puzzle around these |
| `spawn-player-2` | Player 2 | `(4, 0, 0)` | Co-op testing |
| `spawn-player-3` | Player 3 | `(0, 0, 4)` | Optional third |

**Spawn keep-out for building:** reuse `BUILD_SPAWN_KEEP_OUT_RADIUS` (4 m) around each spawn — same as world-building, but **only** this rule (no FFA halls/exits/board zones).

### 2.5 Outer walls — decision

**Ship v1 without manifest outer walls.**

| Option | Verdict |
|--------|---------|
| **A. Open bounds (recommended)** | Invisible clamp at ±40 m. Play mode adds “return to spawn” near edge (roadmap Phase 1.4). Authors build their own perimeter walls if the puzzle needs them. |
| **B. Low lip / full box in manifest** | Deferred. Optional room setting `perimeterWalls: true` or a **prefab stamp** (“perimeter box”) in roadmap Phase 0. |

**Rationale:** Pre-placed outer walls consume build budget, constrain layouts that should abut the edge, and confuse authors (“is this wall part of my puzzle?”). Escape rooms often *want* a hidden passage at the boundary or a false wall — that requires author control.

**Edge behavior in play mode:** When avatar XZ hits bounds, clamp (existing) + optional HUD hint (“You can't go that way"). Return-to-spawn button for stuck players (reuse `selectSpawnPoint`).

### 2.6 Floor and sky rendering

- **Floor:** Existing `FloorMesh` uses `manifest.dimensions` → single 80×80 slab at `y = 0`. World skins apply via `worldSkins` flag (dark/night default encouraged in settings).
- **Walls to render:** None from manifest. Built walls render via `BuildLayer`.
- **Sky / dome:** Optional neutral dome from world skin; no FFA panorama requirement.
- **Build grid overlay:** Shown in build mode only (existing `BuildPlacementController` behavior).

### 2.7 Top-down concept

```
                    80 m
    ┌──────────────────────────────────────┐
    │                                      │
    │   (empty — author builds here)       │
    │                                      │
    │              · spawn-author          │
    │         · player spawns nearby       │
    │                                      │
    │   bounds clamp at dashed line        │
    └──────────────────────────────────────┘
              no manifest walls
```

After authoring, the same canvas might look like:

```
    ┌────────┬──door──┬────────┐
    │ Start  │ hall   │ Vault  │  ← all BuildPiece walls
    │ board  │ plate  │ + door │
    └────────┴────────┴────────┘
```

---

## 3. Roles and permissions

### 3.1 Role model (UX)

| Internal role | Escape room UX label | Capabilities |
|---------------|------------------------|--------------|
| Room owner / `teacher` | **Author** | Build, destroy, boards, logic (later), start session, toggle play mode |
| Joiner / `student` | **Player** | Walk, interact (later), read boards; **cannot** build or destroy |

No “Teacher” / “Student” copy in this room type (same pattern as FFA’s “Participant”, but asymmetric).

### 3.2 Baseline permissions (Phase 1)

| Action | Author | Player |
|--------|--------|--------|
| Place / destroy build pieces | Yes (when `buildingEnabled` and not in play mode*) | No |
| Create / edit dynamic boards | Yes | No (v1; optional player-readable-only) |
| Place room objects / props | Yes | No |
| Clear all builds | Yes (with confirm) | No |
| Join session | Yes | Yes (invite or class roster) |

\*Play mode (`playModeEnabled`) ships in roadmap Phase 1; until then, enforce `buildDestroyPolicy: owner-or-teacher` always for escape-room type.

### 3.3 Default room settings

Escape rooms get **different defaults** than FFA when created via `escapeRoomSettings(config)` helper (mirror `roomSettings()`):

| Setting | Escape room default | FFA for comparison |
|---------|---------------------|-------------------|
| `buildDestroyPolicy` | `"owner-or-teacher"` | `"anyone"` |
| `buildingEnabled` | `true` | `true` |
| `wallObjectCreation` | `"teacher-only"` | participant-direct for FFA |
| `roomObjects.defaultTouchPolicy` | `"teacher-only"` | more open in FFA |
| `worldSkins.enabled` | `true` | off in FFA |
| `worldSkins.skinDayNightMode` | `"night"` (suggested) | — |
| `aiMeetingNotes.enabled` | `false` | `true` in FFA |
| `sharedBrowsers.enabled` | `false` (v1) | `true` in FFA |
| `liveCaptions.enabled` | `false` | `true` in FFA |
| `hallpass.enabled` | `false` | — |
| `pods.enabled` | `false` | — |

Add when play mode lands (roadmap Phase 1):

| Setting | Default |
|---------|---------|
| `playModeEnabled` | `false` |
| `logicEnabled` | `true` (no-op until logic ships) |

---

## 4. Feature flags

Extend `RoomTypeFeatureFlags` in `packages/contracts`:

```ts
export type RoomTypeFeatureFlags = {
  // ... existing ...
  building: boolean;
  dynamicBoards: boolean;
  logic: boolean;   // NEW — trigger blocks; true for escape-room, false elsewhere initially
};
```

**`ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS`:**

| Flag | Value |
|------|-------|
| `building` | `true` |
| `dynamicBoards` | `true` |
| `logic` | `true` |
| `worldSkins` | `true` |
| `aiObjects` | `true` |
| `whiteboards` | `true` |
| `openJoin` | `false` |
| `aiMeetingNotes` | `false` |
| `sharedBrowsers` | `false` |
| `liveCaptions` | `false` |
| All classroom* | `false` |

**Env gating:**

| Env | Purpose |
|-----|---------|
| `ENABLE_ESCAPE_ROOM` | API room creation |
| `NEXT_PUBLIC_ENABLE_ESCAPE_ROOM` | Lobby selector + client features |

Default **off** until staging validation.

---

## 5. Build validation — escape-specific mask

Today `isBuildAllowedAt(manifest, piece)` applies FFA hall/exit/board masks when `isFreeForAllManifest(manifest)`.

**Add:**

```ts
export function isEscapeRoomManifest(manifest: RoomManifest): boolean {
  return manifest.features.some(
    (f) => f.key === ESCAPE_ROOM_MANIFEST_FEATURE && f.enabled
  );
}
```

**Escape path in `isBuildAllowedAt`:**

1. Bounds check (unchanged).
2. Level cap (unchanged).
3. Spawn keep-out (unchanged).
4. **Skip** FFA hall / exit wedge / board keep-out entirely.

Route build-piece API validation through room type or manifest detection so escape rooms never hit FFA masks.

**Caps:** Reuse `BUILD_MAX_PIECES_PER_ROOM` (1000) initially; consider `1500` for escape-room type if large layouts need it (config constant, not blocking v1).

---

## 6. Boards and clues on escape rooms

### 6.1 Dynamic boards only

There are no static `wallAnchors` in the manifest. **All clue surfaces are dynamic boards on build walls** — same entity and API as FFA (`DynamicWallAnchor`, `boardPlacementWalls`).

Extend API guards currently restricted to `room.type === "free-for-all"`:

- `apps/api/src/routes/wall-objects.ts` (dynamic anchor CRUD)
- Placement validation already uses merged build walls

**Author-only board creation** in v1 (`wallObjectCreation: teacher-only`).

### 6.2 How boards combine with structure (author mental model)

| Author places | Player experience |
|---------------|-------------------|
| **Walls** enclosing a space | “Room” — discovery boundary |
| **Door** (logic, later) on wall edge | Gate — clue in room B until room A solved |
| **Board** on wall inside room | Explicit clue (text, image, video) |
| **Light** (logic, later) | Reveal board in dark room when switch flipped |
| **Props** (room objects) | Environmental search target |

Phase 1 of this plan enables **walls + boards**; logic combinations are documented in the [roadmap §4](../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md#4-puzzle-recipes--combining-elements).

---

## 7. Lobby and join flow

### 7.1 Room type selector

```ts
type RoomType = "classroom" | "workforce-training" | "free-for-all" | "escape-room";
```

**Lobby entry** (behind `NEXT_PUBLIC_ENABLE_ESCAPE_ROOM`):

```ts
{
  value: "escape-room",
  label: "Escape Room",
  description: "Build puzzle rooms on an empty canvas. Share an invite for players to join."
}
```

**Form defaults:**

```ts
"escape-room": { className: "Puzzle Lab", roomName: "The Locked Study" }
```

**Join copy:**

```ts
"escape-room": {
  guestSingular: "player",
  hostSingular: "author",
  joinButtonLabel: "Join escape room"
}
```

### 7.2 Create flow

Same host path as classroom: author creates room under a class → receives **invite link** for players.

**Not** open browse-by-default (contrast FFA). Authors share invites to a specific experience. Optional later: curated public escape directory.

### 7.3 Join flow

- **Invite code / link** (primary) — same as classroom.
- Players join as **Player** role; author is **Author**.
- No FFA shared-password flow.

---

## 8. Data and API model

### 8.1 Contracts

| Change | Location |
|--------|----------|
| `RoomTypeSchema` + union | `packages/contracts/src/index.ts` |
| `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS` + `logic` on flags | same |
| `getRoomTypeFeatureFlags("escape-room")` case | same |
| Mongoose room `type` enum | `apps/api/src/models/mongoose.ts` |

### 8.2 Room creation

In `apps/api/src/routes/rooms-core.ts`:

```ts
if (roomType === "escape-room" && !config.tuning.enableEscapeRoom) {
  throw forbidden("Escape Room is disabled in this environment");
}
const manifestFactory =
  roomType === "workforce-training" ? createWorkforceTrainingManifest :
  roomType === "free-for-all"       ? createFreeForAllManifest :
  roomType === "escape-room"        ? createEscapeRoomManifest :
  createDefaultRoomManifest;
// ...
settings: roomType === "escape-room" ? escapeRoomSettings(config) : roomSettings(config),
```

### 8.3 Build pieces

Existing `/v1/rooms/:roomId/build-pieces` routes gate on `getRoomTypeFeatureFlags(room.type).building` — escape room passes with flag on.

### 8.4 Dynamic boards

Generalize type check from `free-for-all` only to:

```ts
function supportsDynamicBoards(room: { type?: RoomType }) {
  return getRoomTypeFeatureFlags(room.type).dynamicBoards;
}
```

---

## 9. Client integration

### 9.1 `RoomClient.tsx`

| Concern | Change |
|---------|--------|
| Role labels | `case "escape-room":` → Author / Player |
| Room title suffix | `"Escape Room"` |
| Feature gates | `roomTypeFeatures.building`, `.dynamicBoards`, `.logic` |
| HUD | Hide classroom panels; show build controls when author + building enabled |
| Copy | “Edit layout” / “Play test” when play mode ships |

### 9.2 `Lobby.tsx`

- Extend local `RoomType` union and `ROOM_TYPES`.
- Add `renderRoomTypeSteps()` case: create flow like classroom (class + name + invite), not FFA browser.
- Filter behind `CLIENT_TUNING.enableEscapeRoom`.

### 9.3 2D view

Existing build footprints + movement collision work once build pieces exist. No FFA-specific 2D assumptions.

---

## 10. Implementation phases

### Phase 1 — Contracts and feature flags

- Extend `RoomTypeSchema` with `"escape-room"`.
- Add `logic` to `RoomTypeFeatureFlags`.
- Add `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS`.
- Add env flags to `.env.example`.
- Regenerate OpenAPI.

### Phase 2 — Geometry factory

- Implement `createEscapeRoomManifest()` + constants.
- Implement `isEscapeRoomManifest()`.
- Update `isBuildAllowedAt` escape path.
- Unit tests: bounds, empty walls, spawn keep-out, **no** FFA mask applied.

### Phase 3 — API and persistence

- Room creation dispatch + `escapeRoomSettings()`.
- Mongoose enum update.
- Generalize dynamic board routes to `dynamicBoards` flag.
- API tests: create escape room, build piece on canvas, board on build wall.

### Phase 4 — Lobby and client

- Lobby selector + create/join copy.
- `RoomClient` role labels and feature gates.
- Hide irrelevant classroom/FFA HUD cards.

### Phase 5 — Validation and rollout

- E2E: author creates escape room, builds walls, places board, player joins via invite, sees structure.
- Enable in staging via env flags.
- Document author quickstart (link to roadmap recipes).

---

## 11. Technical decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Room type | Dedicated `"escape-room"` | Blank canvas + permissions don’t fit FFA |
| Canvas | 80×80 m, no manifest walls | Author owns all structure; see §2.5 |
| Outer walls | None in v1 | Avoid fighting author layout; stamp optional later |
| Clue surfaces | Dynamic boards on build walls only | Reuses shipped pipeline |
| Join model | Invite-first (classroom-like) | Authored experiences, not public hangout |
| Destroy policy | `owner-or-teacher` default | Protect puzzles |
| FFA build mask | Not applied | `isEscapeRoomManifest` bypass |
| Logic flag | On type, behavior later | Room type ready before trigger implementation |
| Manifest marker | `features: escape-room-canvas` | Engine detection without coupling to DB room type in pure functions |

---

## 12. Relationship to other room types

```
Room Type Registry
├── Classroom          — teacher/student, invite, fixed manifest
├── Workforce Training — instructor/trainee, invite, multi-zone manifest
├── Free-for-All       — participant sandbox, open join, hub geometry
└── Escape Room (this plan)
    ├── Author / Player roles, invite join
    ├── Empty 80×80 canvas (no manifest walls)
    ├── World-building + dynamic boards
    └── Logic / triggers / session (roadmap Phases 1–10)
```

**Reuse diagram:**

```
                    ┌─────────────────────┐
                    │  escape-room type   │
                    │  (this plan)        │
                    └──────────┬──────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
 createEscapeRoomManifest   BuildPiece stack    DynamicWallAnchor
 (new)                      (world-building)    (FFA, generalized)
         │                     │                     │
         └─────────────────────┴─────────────────────┘
                               │
                    BuildLogicPiece + triggers
                    (roadmap — not this plan)
```

---

## 13. Open questions

1. **Canvas size** — Is 80×80 m sufficient? Prototype a 6-room layout during Phase 2; bump to 100×100 if tight.
2. **Perimeter stamp** — Ship with roadmap Phase 0 prefabs instead of manifest walls?
3. **Public directory** — Ever list escape rooms like FFA browse, or always invite-only?
4. **Player board edit** — Should players annotate boards, or read-only forever?
5. **Max participants** — Default 6 for co-op escapes vs general 30 cap?
6. **2D authoring** — Required for escape room v1 or follow world-building Phase 0.8?
7. **Skin default** — Force dark ambient for new escape rooms, or neutral day?

---

## 14. Success criteria (Phase 1 complete)

- [ ] Author creates `"escape-room"` from lobby (flag on).
- [ ] Room loads flat 80×80 canvas — no manifest walls, no FFA geometry.
- [ ] Author places build walls/floors/ramps; player cannot destroy them.
- [ ] Author places dynamic board on build wall; player sees clue after join.
- [ ] Build rejected in spawn keep-out; **not** rejected for fake “hall/exit” reasons.
- [ ] Classroom and FFA unchanged (regression tests green).
- [ ] Flags off → type hidden in lobby; API returns forbidden on create.

---

## 15. Implementation docs (written)

| Doc | Roadmap phases | Covers |
|-----|----------------|--------|
| [`IMPL_ESCAPE_ROOM_ROOM_TYPE.md`](./IMPL_ESCAPE_ROOM_ROOM_TYPE.md) | −1 | Room type, manifest, flags, build/board gating generalization, lobby/client |
| [`IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md`](./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md) | 0–1 | Undo, prefabs/stamps, doorway/window/glass, lights, onboarding, play mode |
| [`IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md`](./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md) | 2–10 | `BuildLogicPiece`, channel bus, detection, session, door/button/teleporter/light, emitters, 6.1 UX |

Build order: this plan (Phase −1) → authoring/play mode → trigger blocks. Each IMPL doc is independently demoable phase-by-phase.
