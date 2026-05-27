# Plan — Free-for-All Room Type

Branch: `room-types`  
Last updated: 2026-05-27

---

## 1. Overview

Free-for-All is a new room type where there is no teacher/student split. Everyone in the room is simply a participant with equal permissions for collaboration.

This room type is intended to feel open, social, and self-organized:

- Anyone can create a Free-for-All room from the lobby.
- Anyone can join Free-for-All rooms from the lobby without an invite code.
- Any participant can place room objects.
- Any participant can create and use boards.

The room geometry is intentionally different from Classroom and Workforce Training:

- One large circular main room with cylindrical walls.
- A large central square zone designed for board activity.
- Four exits from the main room, each leading through a short hallway to a medium adjoining room.
- Walls are impassable, matching the strict collision behavior used in Workforce Training.

---

## 2. Phase 1 scope (this plan)

| In scope | Out of scope (later phases) |
|---|---|
| New `"free-for-all"` room type in lobby | Moderation/ranking/reputation systems |
| No teacher/student UI language for this room type | Advanced anti-griefing controls |
| Join flow without invite code for this room type | Custom room-builder UI for arbitrary architecture |
| Equal permissions for objects and board usage | Persistent community ownership roles |
| New board mechanic: participant-created boards on cylindrical walls with custom specs | Board templates marketplace / sharing library |
| New circular room layout + 4 adjoining rooms | Door meshes, lockable doors, or zone permissions |

---

## 3. Roles and permissions

### 3.1 Role model

For Free-for-All, exposed role language should be neutral:

- "Participant" for everyone.
- No "Teacher", "Student", "Instructor", or "Trainee" copy in this room type.

Implementation can still use an internal host/owner concept for room creation metadata, but that should not imply classroom-style authority in Free-for-All UX.

### 3.2 Baseline permissions

Every participant in Free-for-All can:

- Place room objects.
- Move/transform room objects (subject to existing touch/grab rules).
- Create boards.
- Use boards and place board content.
- Remove their own created content (and optionally any content, pending moderation policy decisions).

Room-type feature flags should disable classroom-only mechanics by default (same pattern as Workforce Training), while enabling the collaborative surface tools needed here.

---

## 4. Lobby and join flow

## 4.1 Room-type selector

Add and activate:

```ts
type RoomType = "classroom" | "workforce-training" | "free-for-all";
```

`ROOM_TYPES` gets:

- `value: "free-for-all"`
- `label: "Free-for-All"`
- Description indicating open participation and no code-based join.

### 4.2 Create flow

Create flow remains host-started in the lobby (same structural path as other room types), but copy should be neutral:

- Step label examples: "Name your room", "Create room", "Enter room".
- No teacher/instructor wording.

### 4.3 Join flow (no code)

Free-for-All requires a room-discovery join path in the lobby:

- User selects room type: Free-for-All.
- Lobby lists currently available Free-for-All rooms (search/sort optional in Phase 1).
- User clicks Join on any listed room.
- No invite code requirement for this room type.

Implementation note: invite-based join remains unchanged for classroom/workforce-training. Free-for-All uses additive join UX and additive API behavior.

---

## 5. Room geometry — Free-for-All layout

## 5.1 Main room

The main room is a large circle:

| Property | Value |
|---|---|
| Footprint | Circular main hall |
| Wall type | Cylindrical perimeter wall |
| Wall height | 8 m (recommended for compatibility with current wall/board assumptions) |
| Collision | Impassable perimeter walls |

### 5.2 Central board square

A square zone in the center of the main circular room is reserved as a high-activity collaboration area:

- Large enough to support multiple board placements at once.
- Clear line-of-sight from most points in the main room.
- Serves as default social/working hub.

The exact dimensions should be finalized during implementation testing (recommended initial target: 12 m × 12 m or larger, depending on movement feel and density).

### 5.3 Four exits + adjoining rooms

The main room has four evenly distributed exits:

- North exit
- East exit
- South exit
- West exit

Each exit leads through a short hallway into one medium-sized adjoining room.

| Property | Value |
|---|---|
| Exit count | 4 |
| Hallway length | Short connector hall |
| Adjoining room size | Medium (final dimensions to tune) |
| Collision behavior | All walls impassable |

Recommended starting dimensions for implementation:

- Main room diameter: ~44-50 m
- Hallway width: 4 m
- Hallway length: 5-8 m
- Adjoining rooms: ~14 m × 14 m each

These are tuning values, not fixed product requirements.

### 5.4 Top-down concept diagram

```
                   [ Adjoining Room N ]
                          ┌───────┐
                          │       │
                          └───┬───┘
                              │
                        Short Hallway
                              │
         [Adjoining W] ──── Exit W   ( Circular Main Room )   Exit E ──── [Adjoining E]
                              │         ┌────────────────┐
                              │         │  Central       │
                              │         │   Square       │
                              │         │  (boards hub)  │
                              │         └────────────────┘
                              │
                        Short Hallway
                              │
                          ┌───┴───┐
                          │       │
                          └───────┘
                   [ Adjoining Room S ]
```

---

## 6. Board system — new mechanic

This is the core new mechanic for Free-for-All and should be treated as a first-class system, not a small extension.

### 6.1 Board types in Free-for-All

Free-for-All supports two board categories:

1. **Pre-existing boards** (static anchors, similar to current rooms).
2. **Participant-placed boards** (dynamic anchors created at runtime).

### 6.2 Placement surfaces

Participant-placed boards can be attached to:

- Cylindrical walls of the main room.
- Walls of adjoining rooms.
- (Optional, if approved) freestanding in the central square area.

Phase 1 recommendation: start with wall-attached boards only, then consider freestanding boards in a follow-up phase to reduce collision and visibility complexity.

### 6.3 Board specs participants can choose

At creation time, participant selects:

- Width
- Height (or aspect preset)
- Orientation (wall-normal alignment by default)
- Title/name

Suggested guardrails:

- Minimum size to keep interaction accessible.
- Maximum size to avoid wall domination and overlap chaos.
- Snap increments for dimensions and placement.

### 6.4 Safety and conflict rules

Dynamic board creation requires strict constraints:

- No board overlap with existing boards.
- No board placement that intersects doorways/exits.
- No board placement that blocks hallway entrances.
- Minimum spacing between boards for readability and click/touchability.
- Per-room cap on total dynamic boards.
- Optional per-user cap to reduce spam.

### 6.5 Ownership + moderation baseline

Phase 1 baseline recommendation:

- Creator can edit/remove their board.
- Any participant can use the board content surface.
- Room-level cleanup action (e.g., prune unused boards) is available to a backend/system operator path as a safety valve.

Follow-up policy options:

- Shared board ownership transfer.
- Vote-to-remove abusive boards.
- Time-based board expiration.

---

## 7. Data and API model implications

### 7.1 Room type

Add room type value:

```ts
type RoomType = "classroom" | "workforce-training" | "free-for-all";
```

### 7.2 Dynamic boards entity (recommended)

Existing static `WallAnchor` data in manifest is not enough for participant-created boards. Add a persisted runtime entity, e.g.:

- `RoomBoard` (or `DynamicWallAnchor`)
  - `id`
  - `roomId`
  - `createdBy`
  - `surfaceRef` (wall id / zone id)
  - `position` + `normal`
  - `width` + `height`
  - `title`
  - `createdAt` / `updatedAt`

Static manifest anchors remain supported and are merged client-side with dynamic boards into one unified board view model.

### 7.3 Realtime events

Add reliable events:

- `room.board.created.v1`
- `room.board.updated.v1`
- `room.board.removed.v1`

Clients subscribe and reconcile similarly to existing wall-object sync patterns.

---

## 8. Implementation phases

### Phase 1 — Contracts and feature flags

- Add `"free-for-all"` to room type schema.
- Add/extend room-type feature flags for Free-for-All behavior.
- Add initial dynamic board schemas/contracts.
- Add env flags:
  - `ENABLE_FREE_FOR_ALL`
  - `NEXT_PUBLIC_ENABLE_FREE_FOR_ALL`

### Phase 2 — Lobby create/join UX

- Activate Free-for-All option in room type selector.
- Add neutral create flow copy.
- Add room list browsing/join path without invite code for Free-for-All.
- Keep invite-code join flow unchanged for other room types.

### Phase 3 — Geometry factory

- Implement `createFreeForAllManifest()` in `packages/room-engine`.
- Build circular main room + central square zone + 4 hallway connectors + 4 adjoining rooms.
- Ensure all walls are impassable with workforce-training-style strict collision behavior.
- Add geometry tests for bounds, exits, and collision edge cases.

### Phase 4 — Dynamic board platform

- Persist dynamic board records.
- Add create/update/remove API routes.
- Add validation: size, spacing, doorway exclusion, wall-surface clamping.
- Add realtime create/update/remove events.

### Phase 5 — 3D + 2D rendering integration

- Render static and dynamic boards together.
- Support dynamic board placement UI in 3D.
- Support 2D parity for board display and interaction affordances.
- Validate visibility/occlusion in curved-wall spaces.

### Phase 6 — Permissions, polish, and abuse controls

- Verify all participants can place objects and boards as intended.
- Add board count caps and basic anti-spam constraints.
- Add E2E coverage: create room, open join, multi-user board placement/use, collision constraints.

---

## 9. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Access model | Open join without code for Free-for-All only | Matches product goal of public/open collaboration while preserving invite-gated behavior for classroom/training rooms |
| Role language | Participant-only labels | Avoids teacher/student framing in this room type |
| Geometry model | Dedicated `createFreeForAllManifest()` factory | Keeps room-type geometry isolated and maintainable |
| Wall behavior | Impassable walls | Consistent with Workforce Training collision expectations and avoids escaping geometry |
| Board architecture | Keep static anchors + add persisted dynamic board entity | Preserves existing systems while enabling participant-created boards |
| Initial placement surfaces | Wall-attached dynamic boards first | Reduces complexity/risk for v1 of the mechanic |

---

## 10. Open questions to resolve during implementation

1. Should Free-for-All rooms be globally discoverable or only discoverable within a class/org context?
2. What is the exact moderation baseline for user-generated board spam or abuse?
3. Do we allow any participant to remove any board, or creator-only removal in Phase 1?
4. Should dynamic boards support the full wall-object type matrix immediately, or launch with a subset?
5. Is there a maximum concurrent participant target distinct from classroom limits?
6. Do adjoining rooms also support dynamic board placement at launch, or main room only initially?
7. Should freeform board sizing use presets only, true custom dimensions, or both?

---

## 11. Relationship to existing room types

```
Room Type Registry
├── Classroom
│   ├── Teacher/Student model
│   ├── Invite-code join
│   └── Classroom-specific orchestration features
│
├── Workforce Training
│   ├── Instructor/Trainee labels
│   ├── Invite-code join
│   └── Multi-room training geometry
│
└── Free-for-All (this plan)
    ├── Participant-only model
    ├── Open join (no code)
    ├── Circular hub + 4 adjoining rooms
    └── Dynamic participant-created boards
```

Free-for-All should remain additive to the existing system: it introduces a new participation model and board mechanic without regressing classroom/training behavior.
