# Implementation — Escape Room Authoring & Play Mode (Roadmap Phases 0–1)

Plan: [`./PLAN_ESCAPE_ROOM_ROOM_TYPE.md`](./PLAN_ESCAPE_ROOM_ROOM_TYPE.md)
Roadmap: [`../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`](../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md) (Phases 0–1)
Prereq: [`./IMPL_ESCAPE_ROOM_ROOM_TYPE.md`](./IMPL_ESCAPE_ROOM_ROOM_TYPE.md) (Phase −1)
Idea sources: [`../free-for-all/world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md`](../free-for-all/world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md) §2.4, §2.5, §3.1, §3.3, §4.1
Branch target: `feature/escape-room-authoring`
Last updated: 2026-05-31

---

## Status / Scope

**Status:** Phases 0–1 complete.

Ships the **authoring baseline** that makes escape rooms buildable in <10 min, plus **play mode** (the build-vs-play separation every puzzle needs). These are world-building improvements (from IDEAS §2–§4) applied to — and mostly shared with — the escape-room type.

**In scope:**

- **Phase 0:** Undo/redo, prefabs/stamps, doorway/window walls, static placeable lights, build onboarding.
- **Phase 1:** `playModeEnabled` setting, author "Edit layout ↔ Play test" toggle, destroy-policy enforcement in play mode, return-to-spawn at bounds.

**Out of scope:** all logic/triggers (Phases 2–10), session timer/win (Phase 4), instancing/camera/2D-authoring (deferred per roadmap Phase 0 note).

**Reuse note:** Doorway walls, lights, prefabs, and undo are **engine/UI features**, not escape-specific. They land in the world-building stack and become available to FFA too; escape rooms just consume them. Play mode is escape-room-first but designed as a general room capability.

---

## Codebase context

| File | What matters |
|---|---|
| `packages/room-engine/src/build.ts` | `buildPieceColliders` (162) switches on `kind`; `BuildPieceColliders { walls, floorTop?, ramp? }`. Adding a piece behavior = a branch here. `wallSegmentForEdge`, `impassableWall`. |
| `packages/contracts/src/index.ts` | `BuildPieceKindSchema` (`wall|floor|ramp`), `BuildPieceSchema`, `RoomBuildRealtimeMessageSchema`. New kinds extend the enum + `buildPieceColliders`. `RoomSettingsSchema` for `playModeEnabled`. |
| `apps/web/lib/useBuildPieces.ts` | `actions { place, placeBatch, destroy, clearAll }`, optimistic apply keyed by `buildPieceStableId`, realtime handler. Undo wraps these actions. |
| `apps/web/components/BuildControls.tsx`, `useBuildMode.ts` | bottom-dock tool bar + local UI state (tool, material, rotation). New tools/onboarding here. |
| `apps/web/components/BuildPlacementController.tsx` | raycast → ghost → place; drag-paint → `placeBatch`; destroy hover. Ghost validity from `isBuildAllowedAt`. |
| `apps/web/components/BuildPieceMesh.tsx` | per-kind mesh (wall box, floor slab, ramp wedge). New kinds add a mesh branch. |
| `apps/web/lib/useAvatarMovement.ts` | rAF loop; `resolveWallCollisionsV2` + `groundHeightAt`; `selectSpawnPoint` reachable for return-to-spawn. |
| `apps/api/src/build-pieces/helpers.ts` | `assertCanDestroyBuildPiece` already honors `buildDestroyPolicy`. Play mode tightens this. |

---

## Phase 0 — Authoring baseline

### 0.1 Undo / redo — IDEAS §2.4

**Client-only** (no schema change). Add `useBuildHistory` (or fold into `useBuildMode`): a bounded stack of inverse ops.

- On each successful `place` / `placeBatch` / `destroy`, push an inverse descriptor:
  - `place` → inverse `destroy(id)`
  - `destroy(piece)` → inverse `place(piece spec)` (capture full spec before removal)
  - `placeBatch(specs)` → inverse batch destroy of the ids actually created (use returned `pieces`)
- `Ctrl/Cmd-Z` pops + issues the inverse via existing `actions`; `Ctrl/Cmd-Shift-Z` redoes.
- **Conflict rule:** if the target slot's `createdByUserId` changed (someone else re-took it), the undo no-ops with a toast. Deterministic ids make this checkable from `piecesById`.
- Cap stack (~50). Clear on room switch.

**Soft-delete grace (optional, server):** tombstone destroyed pieces for ~10s so undo of a destroy re-creates identical content even across the realtime echo. v1 can skip if the client retains the spec.

**Tests:** unit the inverse-op derivation; integration: place→undo removes, destroy→undo restores, redo re-applies.

### 0.2 Prefabs / stamps — IDEAS §4.1

A **stamp** = a relative `BuildPiece[]` (cells normalized to a 0,0 origin + level offset).

- **Storage v1:** ship built-in stamps as JSON in the web bundle (`apps/web/lib/buildStamps.ts`): single room shell, corridor, 2×2 cell, stairwell, perimeter box (the §2.5 outer-wall option).
- **Placement:** select stamp → ghost shows the whole cluster at the target cell (rotate applies to the set) → commit translates cells, re-derives ids, calls `placeBatch`. Overlaps skip-on-conflict (existing batch behavior).
- **Save-selection (optional v1+):** box-select existing pieces → "Save as stamp" → persist to a new `BuildStamp` doc (room- or user-scoped). Defer persistence if shipping built-ins first.

**UI:** a "Stamps" tab/section in `BuildControls`.

**Tests:** stamp translate/rotate math (cells map correctly); batch placement count; overlap skip.

### 0.3 Doorway / window wall — IDEAS §3.1

Two new wall variants that connect rooms without logic doors. Two implementation options:

- **Option A (recommended): new `BuildPieceKind` values** `doorway` and `window`.
  - `BuildPieceKindSchema = z.enum(["wall","floor","ramp","doorway","window"])`.
  - `buildPieceColliders`: emit **two stacked wall colliders** with a passable gap:
    - `doorway` → sill collider `baseY..gapBottom` low + lintel `gapTop..top`; the avatar-height band (`gapBottom≈0`, `gapTop≈2.2`) is open → height-aware `resolveWallCollisionsV2` lets the avatar pass.
    - `window` → sill `0..1.0` + lintel `1.4..2.0`; mid band open but **too low to walk through** (sill blocks feet) → blocks movement, allows sight. (Or render transparent + full collider — see glass §below.)
  - Mesh: a framed opening in `BuildPieceMesh` (box with a hole via two sub-boxes, or a frame + transparent panel for window).
- **Option B:** keep `kind: "wall"`, add a `variant` field. More schema churn on existing pieces; A is cleaner.

**Note on glass walls (IDEAS §3.2):** trivial follow-on — a `wall` with `materialId: "glass"` already renders transparent and keeps a full collider. No engine change; just expose the material. Good "see-but-can't-reach" escape primitive.

**Tests:** doorway collider has a passable band (avatar at feetY=0 passes); window blocks at feetY=0; both axis-aligned; slot id unique per edge/level.

### 0.4 Static placeable lights — IDEAS §3.3

A decorative + illuminating piece. Static here (no toggle — that's logic Phase 8).

- **Option:** new `BuildPieceKind: "light"` occupying a **flat slot** (cell+level center) or a wall-mounted variant. v1: cell-center floor-mounted lamp.
- `buildPieceColliders` → `{ walls: [] }` (non-colliding) + a marker the render layer reads.
- **Render (`BuildPieceMesh`):** emissive mesh + a real `pointLight` (budgeted).
- **Perf cap (critical):** hard-limit active dynamic lights (e.g. nearest-N to camera, N≈8). Add a `BuildLayer`-level light manager that mounts only the nearest N `light` pieces as real lights; the rest render emissive-only. Document the cap.

**Tests:** light piece persists/syncs like any piece; light manager selects nearest-N deterministically.

### 0.5 Build onboarding — IDEAS §2.5, §2.7

- First-open coachmark in `BuildControls` ("1 Wall · 2 Floor · 3 Ramp · 4 Destroy · R rotate · drag to paint · Stamps"). Dismiss persists in `localStorage`.
- Ghost rejection tooltip: surface the `isBuildAllowedAt` reason (`spawn-keep-out`, `out-of-bounds`, `level-cap`) near the cursor. (Engine already returns `{ ok:false, reason }`.)
- Empty-canvas hint for escape rooms: "Build walls to make your first room, or drop a Room stamp."

*Exit (Phase 0):* author stamps a 3-room shell, adds doorways + lights, iterates with undo, in <10 min.

---

## Phase 1 — Play mode

### 1.1 `playModeEnabled` room setting

**`packages/contracts/src/index.ts`** — add to `RoomSettingsSchema`:
```ts
playModeEnabled: z.boolean().default(false),
```
Apply via `parseRoomSettings`; default `false` so a fresh escape room opens in **build** mode for the author.

### 1.2 Author toggle (Edit layout ↔ Play test)

- API: `PATCH /v1/rooms/:roomId` already accepts partial `settings` (rooms-core.ts). Toggling `playModeEnabled` reuses it; guard with `requireRoomTeacher` (owner-only). Broadcast a realtime settings change so all clients switch modes live (reuse the existing room-settings update path; if none broadcasts, add `room.settings.v1` or piggyback on an existing channel).
- Client (`RoomClient`): an author-only "Play test" / "Edit layout" button. In play mode, hide `BuildControls` + `BuildPlacementController` for everyone; in build mode, show them for the author only.

### 1.3 Destroy/placement enforcement in play mode

**Server (`apps/api/src/build-pieces/helpers.ts`):**
- `assertBuildingEnabled`: also throw `buildDisabled()` when `room.settings.playModeEnabled` is true (no structural edits during play), **except** allow the room teacher/owner (so an author could hot-fix — or simply block everyone and require toggling back to edit; recommend block-all for predictability).
- This makes build/destroy/clear all 4xx during play, server-authoritative — not just hidden UI.

**Client:** gate `useBuildPieces` action availability on `!playModeEnabled || isAuthor` to avoid optimistic ops that will 4xx.

### 1.4 Return-to-spawn at bounds

- The escape canvas has no outer walls (plan §2.5). In play mode, if an avatar reaches the bounds clamp edge, show a HUD hint and a "Return to spawn" button.
- Reuse `selectSpawnPoint` (engine) → set avatar position to a player spawn; resolve `y` via `groundHeightAt`.
- Also expose return-to-spawn as a general self-unstick (covers being walled in).

*Exit (Phase 1):* author builds a layout, hits "Play test" → joiners (and the author) can walk but not build/destroy; "Edit layout" returns to authoring. Build/destroy during play returns 4xx server-side.

---

## Files-to-touch summary

**New**
- `apps/web/lib/useBuildHistory.ts` (undo/redo) — or extend `useBuildMode.ts`
- `apps/web/lib/buildStamps.ts` (built-in stamps) + stamps UI in `BuildControls.tsx`
- Tests: engine collider tests (doorway/window/light), stamp math, undo derivation

**Modified**
- `packages/contracts/src/index.ts` — `BuildPieceKindSchema` (+doorway/window/light), `RoomSettingsSchema.playModeEnabled`, OpenAPI
- `packages/room-engine/src/build.ts` — `buildPieceColliders` branches for doorway/window/light
- `apps/web/components/BuildPieceMesh.tsx` — meshes for new kinds
- `apps/web/components/BuildControls.tsx` / `useBuildMode.ts` — new tools, onboarding, stamps tab
- `apps/web/components/BuildPlacementController.tsx` — stamp ghost, rejection tooltip
- `apps/web/components/BuildLayer.tsx` — nearest-N light manager
- `apps/web/lib/useBuildPieces.ts` — expose hooks undo needs (return created specs already do)
- `apps/api/src/build-pieces/helpers.ts` — play-mode block in `assertBuildingEnabled`
- `apps/web/components/RoomClient.tsx` — Edit/Play toggle, gate build UI, return-to-spawn
- `apps/api/src/routes/rooms-core.ts` — (no change; PATCH settings already supports it)

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| New piece kinds churn the build slot-id / placement code | Med | Reuse edge slot (doorway/window) + flat slot (light); add kinds to enums in lockstep; cover with collider tests |
| Dynamic lights tank perf | Med | Hard nearest-N cap + emissive-only fallback; document budget |
| Play-mode toggle desyncs clients | Med | Broadcast settings change; server-authoritative build block so stale clients still 4xx |
| Undo races with another user's edit | Low | No-op undo when slot owner changed; toast |
| Doorway passable band wrong vs avatar height | Med | Test against `BUILD_STAND_HEIGHT`; gap `0..2.2` clears 1.6 m avatar |

---

## Validation evidence (fill in after implementation)

- [x] Undo removes a placed piece; undo restores a destroyed one; redo re-applies; no-op on stolen slot. (`useBuildHistory.ts`, `useBuildHistory.test.ts`, ⌘Z in `RoomClient`)
- [x] Stamp places a multi-piece room in one action; overlaps skip. (`buildStamps.ts`, stamp ghost + `placeBatch`, `buildStamps.test.ts`)
- [x] Doorway is walk-through; window blocks but shows through; glass wall blocks + transparent. (collider tests in `build.test.ts`; glass via `materialId: "glass"` on walls)
- [x] Lights illuminate; nearest-N cap holds with many lights. (`BuildLayer` nearest-N manager, `BUILD_MAX_ACTIVE_LIGHTS`)
- [x] Coachmark + rejection tooltips show; dismissal persists. (`BuildControls` coachmark + `BuildPlacementController` tooltip copy)
- [x] Play mode hides build UI and 4xx's build/destroy server-side; author can toggle back. (`playModeEnabled`, `room.play-mode.v1`, API test)
- [x] Return-to-spawn recovers a player at the canvas edge. (play-mode dock + existing `returnToSpawn`)

---

## Next

Proceed to [`./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md`](./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md) (Phases 2–10): the logic layer, detection, session, and trigger blocks (6.1).
