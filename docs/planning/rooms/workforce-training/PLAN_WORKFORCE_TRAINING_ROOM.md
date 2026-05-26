# Plan — Workforce Training Room Type

Branch: `room-types`  
Last updated: 2026-05-26

---

## 1. Overview

Workforce Training is a **new room type** in 3DSpace, distinct from the existing Classroom. It shares the same lobby creation flow and invite mechanics but uses a different spatial layout and different role terminology. The room is designed for corporate/organizational training scenarios where an **Instructor** leads **Trainees**.

### 1.1 What this is NOT

- This is NOT a classroom. "Classroom" becomes one room type among many.
- The Instructor is NOT a teacher — they share none of the classroom-specific teacher abilities (lesson planning, private checks, focus, groups, etc.) at this stage.
- There are NO special instructor abilities in this initial release. Those will be designed and implemented in subsequent phases.

### 1.2 Phase 1 scope (this plan)

| In scope | Out of scope (later phases) |
|---|---|
| New `"workforce-training"` option in the lobby room-type selector | Instructor-specific abilities (whiteboard tools, breakout rooms, etc.) |
| Same create/share/enter flow as Classroom | Custom training-specific HUD panels |
| Instructor role (maps internally to the host/teacher permission level for room ownership) | Trainee sub-roles or permissions beyond basic participant |
| Trainee invite (same mechanic as student invite) | Analytics, attendance tracking, certifications |
| New room geometry: large central room + surrounding hallways + smaller side rooms | Trainee progress tracking |
| Boards on every wall of every room | Training-specific wall object types |

---

## 2. Roles

| Role | Lobby label | In-room label | Permission level (Phase 1) |
|---|---|---|---|
| Instructor | "Instructor" | "Instructor" | Same permission bits as `teacher` internally — owns the room, can place wall objects, etc. No extra instructor-specific actions yet. |
| Trainee | "Trainee" | "Trainee" | Same permission bits as `student` internally — joins via invite code, moves freely, interacts with boards when granted access. |

The internal permission model (`ClassMembership.role`) may introduce `"instructor"` / `"trainee"` values or may alias to `"teacher"` / `"student"` — implementation decides. The key constraint is that **UI copy** always says Instructor/Trainee, never Teacher/Student, inside a Workforce Training room.

---

## 3. Lobby flow

### 3.1 Room-type selector

The lobby already has a `RoomType` union and `ROOM_TYPES` registry (currently only `"classroom"` is active; `"workforce-training"` is commented out). Phase 1 uncomments and activates it:

```ts
type RoomType = "classroom" | "workforce-training";

const ROOM_TYPES = [
  { value: "classroom", label: "Classroom", description: "Live 3D sessions with students and a shareable invite code." },
  { value: "workforce-training", label: "Workforce Training", description: "Immersive training sessions for teams and organizations." },
];
```

### 3.2 Create flow

When the Instructor selects "Workforce Training":

1. **Step 1 — Name the training** (same UI as Classroom Step 1): text inputs for Organization/Team name and Session name. Labels change from "Class name" / "Room name" to "Team name" / "Session name".
2. **Step 2 — Create** (same API call as Classroom): `POST /v1/classes` + `POST /v1/rooms` with the room type stored in the room document.
3. **Step 3 — Share invite** (same mechanic): generates an invite code; Instructor copies it and shares with Trainees.
4. **Step 4 — Enter room** (same button): navigates to `/room/[roomId]`.

The backend `Room` document gains a `type` field:

```ts
type: z.enum(["classroom", "workforce-training"]).default("classroom")
```

Existing rooms without a `type` field default to `"classroom"` (no migration required).

### 3.3 Trainee join

Trainees use the same invite code entry flow students currently use. The join page should display "Join Training" instead of "Join Class" when the invite resolves to a workforce-training room.

---

## 4. Room geometry — Workforce Training layout

The Workforce Training room is significantly larger and more complex than the Classroom (30×30 m square shell).

### 4.1 Central training room

A large rectangular space where the Instructor presents:

| Dimension | Value |
|---|---|
| Width | 40 m |
| Depth | 40 m |
| Wall height | 8 m (matches Classroom for panorama compatibility) |

The Instructor's default spawn faces into the room from the front wall (same pattern as teacher in Classroom). Trainees spawn in the center area.

### 4.2 Surrounding hallways

Three hallways wrap around the central room on the **left**, **right**, and **back** sides. The **front wall** (behind the Instructor) has no hallway.

| Property | Value |
|---|---|
| Hallway width | 4 m |
| Hallway height | 8 m |
| Hallway length | Matches the adjacent wall of the central room |

These are **not three isolated hallway stubs**. Together they form **one continuous U-shaped circulation path** around the left, back, and right perimeter of the central room:

- The **left hallway connects directly to the back hallway** at the back-left corner.
- The **right hallway connects directly to the back hallway** at the back-right corner.
- There is **no hallway across the front wall**, so the open circulation path is a `U`, not a full ring.

This means a participant can move:

- from the **left side room** to the **back side room** without entering the central room,
- from the **back side room** to the **right side room** without entering the central room,
- and from the **left side room** to the **right side room** by following the connected hallway path around the back of the central room.

Each hallway is accessed from the central room through an entrance (open doorway, no door mesh):

- **Left hallway** — entrance on the left wall of the central room
- **Right hallway** — entrance on the right wall of the central room
- **Back hallway** — entrance on the back wall of the central room

In other words, the central room opens into the hallway network, but the hallway network also remains internally connected on its own. Re-entering the central room is optional, not required, for room-to-room circulation.

### 4.3 Side rooms (breakout/workshop rooms)

Off each hallway is a single smaller room:

| Property | Value |
|---|---|
| Room width | 10 m |
| Room depth | 10 m |
| Wall height | 8 m |
| Entrance | One open doorway from the adjacent hallway |
| Count | 3 total (one per hallway) |

Each side room connects to the shared U-shaped hallway path, not directly to the central room. The travel pattern is:

- **Left side room** → left hallway → back hallway → right hallway → **right side room**
- **Left side room** → left hallway → back hallway → **back side room**
- **Right side room** → right hallway → back hallway → **back side room**

So the side rooms form a connected outer circulation system around the main training space.

### 4.4 Boards

Every room (central + 3 side rooms) has a **large board in the middle of each wall**:

- **Central room**: 4 boards (one per wall, centered, even on walls with hallway entrances — the board is above/beside the entrance)
- **Each side room**: 4 boards (one per wall, centered; the entrance wall's board is above the doorway)

Total boards: 4 (central) + 3 × 4 (side rooms) = **16 boards**.

Each board uses the same `WallAnchor` system as the existing Classroom boards, supporting the full wall-object type set (files, live shares, links, notes, polls, timers, etc.).

### 4.5 Layout diagram (top-down)

```
       ┌────────┐   ╔═══════════════════════════════════════════════╗   ┌────────┐
       │  Left  │───║                                               ║───│ Right  │
       │ Side   │   ║              Back Hallway (4m)                ║   │ Side   │
       │ Room   │   ║         ┌─────────────────────────┐           ║   │ Room   │
       └────┬───┘   ║         │     Back Side Room      │           ║   └───┬────┘
            │       ║         │         10 × 10         │           ║       │
            │       ╚══════╗  └────────────┬────────────┘  ╔═════════╝       │
            │              ║               │               ║                 │
            │              ║     entrance  │  entrance     ║                 │
            │              ║               │               ║                 │
            │   Left       ║   ┌─────────────────────────┐ ║      Right      │
            └── Hallway ───║── │  Central Training Room  │ ║─── Hallway ─────┘
                (4m)       ║   │         40 × 40 m       │ ║       (4m)
                           ║   │                         │ ║
                           ║   │   Instructor at front   │ ║
                           ║   └─────────────────────────┘ ║
                           ╚═══════════════════════════════╝
                                 Front Wall (no hallway)
```

`═` marks the continuous hallway network. A user can stay in that outer path and move from one side room to another without crossing through the central training room.

### 4.6 Spatial audio

Spatial audio works the same as in the Classroom. Voices attenuate with distance. This means:
- Trainees in side rooms will be acoustically isolated from the central room (distance attenuation).
- The Instructor's voice carries from the central room (existing teacher-voice-always-carries logic applies to the Instructor role).

---

## 5. Room manifest structure

The room manifest for a Workforce Training room will be generated by a new factory function (sibling to `createDefaultRoomManifest`):

```ts
export function createWorkforceTrainingManifest(input: {
  name?: string;
  version?: number;
}): RoomManifest {
  // Generates: central room walls, hallway walls, side room walls,
  // entrances (gaps in wall segments), floor zones, boards (WallAnchors),
  // spawn points, walkable bounds per zone.
}
```

The manifest must define:
- Wall segments for every surface (central room, hallways, side rooms)
- Entrances as gaps between wall segments (no physical door)
- Hallway-corner continuity so the left, back, and right hallways are one connected walkable path
- `WallAnchor` for each of the 16 boards
- Walkable bounds that include hallways and side rooms
- Side-room entrances that open into the hallway path rather than directly into the central room
- Spawn points: Instructor at front of central room, Trainees distributed in central room center
- Floor zones (for potential future 2D map rendering of the multi-room layout)

---

## 6. Implementation phases

### Phase 1 — Contracts and room type field

- Add `RoomTypeSchema = z.enum(["classroom", "workforce-training"])` to contracts.
- Add `type` field to `RoomSchema` (default `"classroom"`).
- Ensure existing rooms without `type` default gracefully.

### Phase 2 — Lobby activation

- Uncomment `"workforce-training"` in `ROOM_TYPES` array and `RoomType` union.
- Add `case "workforce-training":` to `renderRoomTypeSteps()` with Instructor/Trainee labeling.
- Pass `roomType` to the create API call; backend stores it on the room document.
- Update the join page to show "Join Training" for workforce-training rooms.

### Phase 3 — Room geometry (manifest factory)

- Implement `createWorkforceTrainingManifest()` in `packages/room-engine/src/index.ts`.
- Define all wall segments, entrances, hallways, side rooms, boards, spawn points.
- Unit test: manifest is valid, has 16 anchors, correct dimensions.

### Phase 4 — 3D rendering support

- Ensure `RoomView3D` can render the multi-room manifest (it already renders from manifest walls/anchors — the challenge is the larger geometry and multiple connected spaces).
- Handle entrance rendering (gaps in walls).
- Boards render via existing `WallAnchor` → wall object surface pipeline.
- Camera/movement must work across room boundaries (walkable bounds encompass all connected spaces).

### Phase 5 — 2D analog

- The 2D map must show the full multi-room layout (central room + hallways + side rooms).
- Board icons render on all 16 walls.
- Trainee/Instructor presence dots render correctly across zones.

### Phase 6 — Polish and validation

- Role labels in all UI (HUD, roster, nameplates): Instructor / Trainee.
- Feature flag: `ENABLE_WORKFORCE_TRAINING` / `NEXT_PUBLIC_ENABLE_WORKFORCE_TRAINING` (default `false`).
- Env templates updated.
- Playwright test: Instructor creates a Workforce Training room, Trainee joins, both can navigate between central room and side rooms, boards are interactive.

---

## 7. Technical decisions

| Decision | Choice | Rationale |
|---|---|---|
| Internal role mapping | Alias instructor→teacher, trainee→student in Phase 1 | Avoids a full role system rewrite; UI label is the only user-visible difference. Proper role divergence happens when instructor-specific abilities are added. |
| Room type storage | `room.type` field on the Room document | Minimal schema change; room manifests are already room-specific. |
| Manifest generation | Separate factory function per room type | Keeps `createDefaultRoomManifest()` untouched; each room type owns its geometry. |
| Hallway topology | One continuous U-shaped outer corridor (left ↔ back ↔ right) | Makes side-room-to-side-room travel possible without routing participants back through the central training room. |
| Entrance rendering | Gap in wall segments (no door mesh) | Simpler to implement; open archways read well in 3D at 8 m height. |
| Board count | 16 (4 central + 12 side rooms) | Every wall surface is usable; Instructor or granted Trainees can place content anywhere. |
| Hallway boards | No boards in hallways | Hallways are circulation space, not working space. Side rooms are the working spaces. |
| World skins | Not supported in Phase 1 | Multi-room panorama mapping is non-trivial; defer to a later phase. |

---

## 8. Open questions (to resolve during implementation)

1. **Should hallways have boards?** Current plan says no — hallways are circulation only. Could revisit if training scenarios want poster/wayfinding boards in corridors.
2. **Ceiling/roof rendering?** Current Classroom has no visible ceiling. Workforce Training could benefit from a ceiling in side rooms to reinforce enclosure. Defer to polish.
3. **Zone-based audio attenuation vs. pure distance?** Pure distance works but side rooms may leak audio from the central room if walls don't fully occlude. Could add wall-occlusion attenuation in a later phase.
4. **Should the Instructor voice carry to side rooms?** Current "teacher voice always carries" may not be appropriate for a 40 m + hallway + side room distance. Consider an opt-in broadcast toggle.
5. **Maximum trainees?** Classroom caps at 30 students. Workforce Training may need higher capacity for large org training. Decide based on LiveKit/performance constraints.

---

## 9. Future instructor abilities (out of scope for Phase 1)

These will be designed separately once the base room type ships:

- Broadcast announcement (voice/text to all zones simultaneously)
- Zone lock/unlock (restrict Trainee movement to specific rooms)
- Progress checkpoints per side room
- Screen share to all boards simultaneously
- Trainee grouping and room assignment
- Timer/agenda board for the training schedule
- Attendance and completion tracking
- Certification/badge grant on session end

---

## 10. Relationship to existing system

```
Room Type Registry (Lobby)
├── Classroom (existing)
│   ├── Teacher / Student roles
│   ├── 30×30 m single room
│   ├── Lesson planning, private checks, focus, groups, breakout pods
│   └── All existing classroom tools
│
└── Workforce Training (this plan)
    ├── Instructor / Trainee roles
    ├── 40×40 m central room + 3 hallways + 3 side rooms
    ├── 16 boards (standard WallAnchor system)
    └── No special abilities in Phase 1 (same base interaction as Classroom minus classroom-specific tools)
```

The lobby `ROOM_TYPES` registry + `renderRoomTypeSteps()` switch is the extension point. Each room type owns:
- Its lobby step UI (labels, copy)
- Its manifest factory (geometry)
- Its role labels (UI only in Phase 1)
- Eventually: its own HUD panels, actions, and tools
