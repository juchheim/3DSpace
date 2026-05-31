# Implementation — Escape Room Trigger Blocks & Logic (Roadmap Phases 2–10)

Plan: [`./PLAN_ESCAPE_ROOM_ROOM_TYPE.md`](./PLAN_ESCAPE_ROOM_ROOM_TYPE.md)
Roadmap: [`../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`](../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md) (Phases 2–10, §2–§6 for the model, §4 recipes)
Prereqs: [`./IMPL_ESCAPE_ROOM_ROOM_TYPE.md`](./IMPL_ESCAPE_ROOM_ROOM_TYPE.md) (Phase −1), [`./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md`](./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md) (Phases 0–1)
Closest patterns to clone: the **build-pieces stack** (`BuildPiece` entity, `room.build.*`, `useBuildPieces`, `routes/build-pieces.ts`) and **dynamic boards** realtime.
Branch target: `feature/escape-room-logic` (multi-PR; one PR per phase)
Last updated: 2026-05-31

---

## Status / Scope

**Status:** Phase 9 complete (remaining emitters). Phase 10 pending.

This doc covers the **logic system**: a stateful sibling entity (`BuildLogicPiece`), a server-authoritative **channel bus**, **emitters** (button, plate, proximity, timer) and **consumers** (door, light, teleporter), interaction **detection**, and the **escape session** (timer/reset/win). Phase 10 is the trigger-blocks **product** (wiring UX + starter kit).

**Architectural fork (roadmap §1, IDEAS §12 #1):** `BuildPiece` stays static (geometry derived from grid data). Logic pieces are a **separate entity with runtime state**, synced via a new `room.logic.*` family. We **special-case** stateful geometry (door first) rather than generalizing the surface index up front.

**Out of scope:** moving platforms/elevators (post-6.1), node-graph scripting, HP/economy.

---

## Codebase context (patterns to mirror)

| Concern | Existing (clone this) | New |
|---|---|---|
| Entity + deterministic id | `BuildPiece` + `buildPieceStableId` (`room-engine/build.ts`) | `BuildLogicPiece` + `logicPieceStableId` |
| Persistence | `repository.{list,create,get,remove,count,deleteAll}BuildPiecesForRoom` + Mongoose `buildPieceSchema` | `*LogicPiecesForRoom` + `logicPieceSchema` + `LogicState` |
| REST | `apps/api/src/routes/build-pieces.ts` | `routes/logic-pieces.ts`, `routes/escape-session.ts` |
| Realtime | `RoomBuildRealtimeMessageSchema` (`room.build.upsert/remove/batch`), reliable in `realtime.ts` (line 60/81–91) | `RoomLogicRealtimeMessageSchema` (`room.logic.upsert/remove/state`), `room.session.v1` |
| Client state | `useBuildPieces.ts` (optimistic + echo) | `useLogicPieces.ts`, `useEscapeSession.ts` |
| Movement reads | `useAvatarMovement.ts` (`resolveWallCollisionsV2`, `groundHeightAt`, refs) | door collider injection, step-on/proximity detection, teleport |
| Surface | `groundHeightAt(x,z,index,y)` with `"teleport"` mode + `BuildSurfaceIndex` (`ground-height.ts`) | door = conditional wall in `collectCollisionWalls`; teleporter uses `"teleport"` |
| Render | `BuildLayer` / `BuildPieceMesh` | `LogicLayer` / `LogicPieceMesh` (door/button/plate/light/teleporter) |
| Controls | `BuildControls` / `useBuildMode` / `BuildPlacementController` | logic sub-mode + `LogicControls` + channel UI |
| Helpers/outbox/telemetry | `build-pieces/{helpers,realtime-outbox,telemetry}.ts` | `logic-pieces/*` mirror |
| Errors | `errors.ts` `build*` (94–119) | `logic*` errors |
| Config | `tuning.enableEscapeRoom` (Phase −1) | reuse; logic gated by `getRoomTypeFeatureFlags(type).logic` |

**Determinism rule (carried from build):** only the **local owner** runs detection/`groundHeightAt`; observers render remote avatars at broadcast `position.y`. The **server** owns logic state transitions, so two clients never disagree on whether a door is open.

---

## Data model

### `BuildLogicPiece` (contract)

```ts
LogicPieceKindSchema = z.enum([
  // emitters
  "button", "pressurePlate", "proximityZone", "timer",
  // consumers
  "door", "light", "teleporter"
]);

LogicRoleSchema = z.enum(["emitter", "consumer"]); // derived from kind; stored for query convenience

BuildLogicPieceSchema = z.object({
  id: z.string(),                       // == logicPieceStableId(piece)
  roomId: z.string(),
  kind: LogicPieceKindSchema,
  cell: z.object({ ix: z.number().int(), iz: z.number().int() }),
  level: z.number().int().min(0),
  edge: BuildPieceEdgeSchema.optional(),       // door (wall edge), button (wall-mounted)
  rotation: BuildPieceRotationSchema.default(0),
  channelId: z.string().max(64).optional(),    // emitters write, consumers read
  linkId: z.string().max(64).optional(),       // teleporter pair
  config: LogicConfigSchema.default({}),        // mode-specific (below)
  createdByUserId: z.string(),
  createdAt: z.string()
});

LogicConfigSchema = z.object({
  fireMode: z.enum(["pulse", "toggle", "whileHeld"]).default("pulse"),   // emitters
  listenMode: z.enum(["momentary", "toggle", "latch"]).default("latch"), // consumers
  requireAll: z.array(z.string()).default([]),                          // AND of channels (consumer)
  delayMs: z.number().int().min(0).max(600000).default(0),              // timer
  intervalMs: z.number().int().min(0).max(600000).default(0),          // timer (0 = one-shot)
  debounceMs: z.number().int().min(0).max(10000).default(250),
  isExit: z.boolean().default(false),                                   // win zone (plate/floor)
  initialState: z.record(z.unknown()).default({})                       // e.g. { open:false, on:false, armed:false }
}).default({});
```

**Slot id (deterministic, like build):** `logic:{kind}:{ix},{iz}:{level}:{edge??}` — a logic slot is independent of build slots (own `logic:` namespace), so a button can sit on the same wall a build piece occupies without id collision. Doors reuse a wall **edge** slot but in the logic namespace.

### `LogicState` (runtime, server-authoritative)

Per-room map persisted separately from placement (so reset is cheap):

```ts
LogicState = {
  roomId: string;
  channels: Record<string, { latched: boolean; lastPulseAt: number }>;
  nodes: Record<string /*logicPieceId*/, { open?: boolean; on?: boolean; armed?: boolean }>;
  updatedAt: string;
}
```

### `EscapeSession`

```ts
EscapeSessionSchema = z.object({
  roomId: z.string(),
  status: z.enum(["idle", "running", "won", "ended"]).default("idle"),
  startedAt: z.string().nullable().default(null),
  durationSec: z.number().int().positive().max(7200).default(900),
  endedAt: z.string().nullable().default(null)
});
```

### Realtime (`room.logic.*`, `room.session.*`) — mirror `room.build.*`, reliable

- `room.logic.upsert.v1 { roomId, piece, sentAt, senderId }`
- `room.logic.remove.v1 { roomId, pieceId, sentAt, senderId }`
- `room.logic.state.v1 { roomId, channels?, nodes?, sentAt, senderId }` (authoritative patch; clients replace listed keys)
- `room.session.v1 { roomId, session, sentAt, senderId }`

Add `RoomLogicRealtimeMessage` + `RoomSessionRealtimeMessage` to the `realtime.ts` union (line ~81); keep them **out** of `ROOM_OBJECT_UNRELIABLE_TYPES` (reliable).

---

## Phase 2 — Logic layer (empty bus)

Stand up persistence + sync + authoring with **no behavior** yet.

**Contracts:** `BuildLogicPieceSchema`, `LogicConfigSchema`, REST req/resp schemas (mirror build-piece ones), `RoomLogicRealtimeMessageSchema`, `LogicStateSchema`. OpenAPI rebuild.

**Engine (`room-engine`):** `logicPieceStableId`, `logicRoleForKind(kind)`, `isLogicPlacementAllowed(manifest, piece)` (reuse bounds/spawn checks; logic pieces need **no** structural collision). Pure + tested.

**API:**
- `apps/api/src/models/mongoose.ts` — `logicPieceSchema` (`_id` = slot id, index `{roomId}`), `logicStateSchema` (one doc per room).
- `apps/api/src/repository.ts` (+ in-memory) — `list/create/get/remove/deleteAll LogicPiecesForRoom`, `getLogicState`, `patchLogicState`, `resetLogicState`. Wire `deleteAllLogicPiecesForRoom` + `resetLogicState` into room-delete cascade (next to build-piece cleanup).
- `apps/api/src/routes/logic-pieces.ts` (mirror `build-pieces.ts`): `GET` list, `POST` create, `PATCH` update config/channel, `DELETE` one, `DELETE` all. Gate with `assertLogicEnabled(config, room)` = `getRoomTypeFeatureFlags(room.type).logic && room.settings.logicEnabled` and **author-only** writes (`requireRoomTeacher`) — players never author logic.
- `logic-pieces/{helpers,realtime-outbox,telemetry}.ts` mirror.
- `errors.ts` — `logicDisabled`, `logicNotFound`, `logicSlotOccupied`, `logicDestroyDenied`.

**Client:**
- `apps/web/lib/api.ts` — logic CRUD calls.
- `apps/web/lib/useLogicPieces.ts` — clone `useBuildPieces` (optimistic, deterministic id, `handleRealtimeMessage` for `room.logic.*`). Add `applyStatePatch` for `room.logic.state.v1`.
- `apps/web/lib/realtime.ts` — union + reliable.
- `RoomClient.tsx` — mount `useLogicPieces` gated on `roomTypeFeatures.logic`; route `room.logic.*` in the dispatcher.
- Logic authoring sub-mode in `useBuildMode` (a "Logic" tool group distinct from structural).

**Settings:** add `logicEnabled: z.boolean().default(true)` to `RoomSettingsSchema` (escape default true).

*Exit:* author places a logic node (renders as a placeholder mesh), it persists + syncs to a second tab, survives refresh. No behavior.

---

## Phase 3 — Interaction detection

Centralize "did the player do something?" Local-owner only.

**Engine:** pure helpers `avatarCellFromPosition(pos)` (reuse `worldToCell` + level from `groundHeightAt`), `pointInLogicFootprint(piece, x, z)`, `footprintForZone(piece)`.

**`useAvatarMovement.ts`** (or a sibling `useLogicDetection` reading the same position ref):
- **3.1 cell tracking** — each frame derive `{ix,iz,level}`; expose via ref.
- **3.2 interact** — `E` key / click raycast against `LogicPieceMesh` in play mode → call `logic.actions.interact(pieceId)`.
- **3.3 step-on** — when avatar cell enters/exits a logic piece's cell → `stepOn`/`stepOff(pieceId)`.
- **3.4 proximity** — when avatar enters/exits a `proximityZone` footprint → `enter`/`exit(pieceId)`.
- Debounce per piece (config `debounceMs`).

These call **client actions** that POST to the server (the server validates + decides channel effects in Phase 6). In Phase 3 they just log to a dev HUD.

*Exit:* a debug node logs interact/step/proximity events; 2D avatars feed the same cell query (verify with `enable2DAnalog`).

---

## Phase 4 — Escape session & reset

**Contracts:** `EscapeSessionSchema`, `room.session.v1`.

**API (`routes/escape-session.ts`):**
- `GET /v1/rooms/:roomId/escape-session` → current.
- `POST .../start` (author) → set `running`, `startedAt`, broadcast.
- `POST .../reset` (author) → `resetLogicState(roomId)` (all nodes/channels back to `initialState`), set `idle`, broadcast `room.logic.state.v1` (full reset) + `room.session.v1`; clients also teleport players to spawn.
- `POST .../win` (server-internal, called when an `isExit` step-on fires) → `won`, `endedAt`.

**Client:** `useEscapeSession.ts` + a **timer HUD** (countdown in play mode). Reset clears local logic state from the broadcast patch.

*Exit:* author starts a 15-min session, reset returns every node to initial state and respawns players.

---

## Phase 5 — Door consumer (first stateful geometry)

**Engine:** door state lives in `LogicState.nodes[doorId].open`. Provide `doorCollider(piece)` → a `WallCollider` on the door's edge (same shape as a build wall) **only when closed**.
- Extend `collectCollisionWalls(manifest, buildPieces, logicState?)` (or a new `collectCollisionWallsWithDoors`) to append closed-door colliders. Open door → no collider.
- Movement (`useAvatarMovement`) feeds the merged set via a ref that updates on `room.logic.state.v1`.

**Render:** `LogicPieceMesh` door — closed: slab on the edge; open: slid/rotated/faded. Driven by local logic state.

**Server:** `PATCH .../logic-pieces/:id/state` (author/dev) to toggle `open`, broadcast `room.logic.state.v1`. (Channel-driven open comes in Phase 6.)

*Exit:* two-tab — author toggles door; avatar blocked when closed, passes when open; both tabs agree.

---

## Phase 6 — Channel bus + button (the minimal loop)

**Server channel bus (`logic-pieces/channel-bus.ts`):**
- `pulseChannel(roomId, channelId)` and `setChannel(roomId, channelId, latched)` mutate `LogicState.channels`, then **resolve consumers**: for every consumer whose `channelId` (or any in `requireAll`) matches, recompute its node state per `listenMode`:
  - `momentary` → open while a pulse is fresh / channel latched true.
  - `toggle` → flip on each rising edge.
  - `latch` → set true on pulse; cleared only by reset.
  - `requireAll` → open only when all listed channels latched.
- Emit a single `room.logic.state.v1` patch with changed channels + nodes. Server-authoritative; clients apply.

**Button emitter:** `interact(pieceId)` (from Phase 3.2) → server validates (play mode, piece exists, debounce) → `pulseChannel`/toggle per `fireMode` → consumers resolve. Visual: emissive pulse + optional click sound.

**Client:** `logic.actions.interact/stepOn/...` POST to `POST .../logic-pieces/:id/signal { kind: "interact" }`; server returns/broadcasts the resulting state patch.

*Exit:* press button → door on the same `channelId` opens, in two tabs. **This is the §4.1 tutorial recipe.**

---

## Phase 7 — Teleporter pads

**Engine:** reuse `groundHeightAt(..., "teleport")` for landing `y`. `teleportTarget(piece, logicPieces)` resolves the paired pad by `linkId`.

**Behavior:** step-on (Phase 3.3) a teleporter whose node `armed !== false` → local owner sets avatar position to the paired pad (server validates the pair + that the source is armed). Channel-gated arm: a consumer field `armed` toggled by a channel (recipe §4.7).

*Exit:* walk on pad A → appear at pad B; pad C inactive until its arm channel pulses.

---

## Phase 8 — Light consumer

**Engine/render:** light node state `on`. Reuse the Phase 0.4 light render (emissive + budgeted `pointLight`); `on=false` → emissive off + no light (still counts against nearest-N only when on).

**Behavior:** channel listener flips `on` (recipe §4.2 dark-room reveal). No collision.

*Exit:* button in a dark room → light on → board readable.

---

## Phase 9 — Remaining emitters

- **9.1 pressurePlate** — step-on/off (Phase 3.3) → pulse/`whileHeld` channel; `whileHeld` keeps a `momentary` door open only while occupied (recipe §4.3). Multi-occupancy AND via `requireAll` on the consumer (recipe §4.6).
- **9.2 proximityZone** — enter/exit/sustain (Phase 3.4) → channel (recipe §4.7 secret).
- **9.3 timer emitter** — server schedules: on a trigger channel (or session start), after `delayMs` (and every `intervalMs`) pulse its `channelId` (recipe §4.5). Server-side timer keyed to the room; cleared on reset/empty.
- **9.4 modes** — finalize `fireMode`/`listenMode`/`requireAll` config across kinds.

**Sequence puzzles (recipe §4.4):** v1 fakes with chained channels (`step-1`,`step-2`,…). If awkward, add a `sequenceGate` consumer kind later (open question).

*Exit:* plate holds a door; proximity lights a corridor; timer unlocks a door after a delay.

---

## Phase 10 — Trigger blocks 6.1 (authoring product) ✅

The engine exists; this is the **builder-facing UX**. **Done 2026-05-31.**

- [x] **10.1 channel picker** — `LogicControls` channel combobox (`<datalist>` of existing channels via `logicChannelsFromPieces` + free text) with a color swatch; in-world color coding via engine `logicChannelColor` / `primaryChannelForPiece`, threaded `channelColor` through `LogicLayer` → `LogicPieceMesh` (teleporters tint by `linkId`).
- [x] **10.2 logic inspector** — `LogicInspector.tsx`: click a node (authoring) → panel with kind/role, channel(s), editable config (channel, fire/listen mode, link, delay, win-exit), live runtime state, and clickable linked peers (same channel / `linkId`). Selection highlight via `selected` edges. Edits go through new `updateLogicPiece` API + `useLogicPieces.update`.
- [x] **10.3 logic build bar** — `useLogicMode` extended with `fireMode`/`listenMode`/`linkId`/`isExit`/`delayMs` + `buildPlacementConfig()`; contextual mode controls in `LogicControls`; `place(...,{config,linkId})` threaded through `LogicPlacementController`.
- [x] **10.4 debug overlay** — `LogicDebugOverlay.tsx` (author + play mode): live channel latched/pulse state + every consumer node's runtime state.
- [x] **10.5 starter escape stamp** — `buildStamps` extended with `RoomStamp { buildPieces, logicPieces }` + `roomStampToTargets`; `ESCAPE_STARTER_KIT` (room shell + button→door, light reveal, win plate); "Starter kit" button in `LogicControls` → `applyStarterKit` (build `placeBatch` + logic `place`). Win-zone wired: `isExit` step-on triggers `escape-session/win` via `useEscapeSession.win` (client) + `winEscapeSession` API.
- [x] **10.6 docs + E2E** — author guide `GUIDE_ESCAPE_ROOM_AUTHORING.md` (recipe catalog §4) + two-client `apps/web/test/escape-room-logic.spec.ts` (start session → button opens door → light reveal → exit plate → win). Engine tests `logic-channels.test.ts`; stamp tests in `buildStamps.test.ts`.

*Exit:* a new author stamps the starter kit, hits Play test, and a second user completes a 5-minute escape with no dev tools. **6.1 shipped for escape rooms.**

---

## Files-to-touch summary

**New**
- `packages/room-engine/src/logic.ts` — `logicPieceStableId`, `logicRoleForKind`, `isLogicPlacementAllowed`, `doorCollider`, `teleportTarget`, channel-resolution pure helpers
- `apps/api/src/routes/logic-pieces.ts`, `routes/escape-session.ts`
- `apps/api/src/logic-pieces/{helpers,realtime-outbox,telemetry,channel-bus}.ts`
- `apps/web/lib/useLogicPieces.ts`, `useEscapeSession.ts`, `useLogicDetection.ts`
- `apps/web/components/LogicLayer.tsx`, `LogicPieceMesh.tsx`, `LogicControls.tsx`, `LogicInspector.tsx`, `EscapeTimerHud.tsx`
- Tests: engine (channel resolution, door collider, teleport, modes), api routes, web E2E

**Modified**
- `packages/contracts/src/index.ts` — logic schemas, session schema, realtime unions, `RoomSettings.logicEnabled`, OpenAPI
- `packages/room-engine/src/build.ts` / `ground-height.ts` — `collectCollisionWalls` accepts door colliders; teleport landing
- `apps/api/src/models/mongoose.ts` — `logicPieceSchema`, `logicStateSchema`, `escapeSessionSchema`
- `apps/api/src/repository.ts` (+ in-memory) — logic + state + session methods, room-delete cascade
- `apps/api/src/errors.ts` — `logic*` errors
- `apps/api/src/routes/register-routes.ts` — register new routes
- `apps/web/lib/api.ts`, `realtime.ts` — logic/session calls + union
- `apps/web/lib/useAvatarMovement.ts` — detection hooks + door colliders + teleport
- `apps/web/components/RoomClient.tsx` — mount logic hooks, route realtime, logic sub-mode, timer HUD
- `apps/web/components/RoomView3D.tsx` — mount `LogicLayer`
- `apps/web/components/BuildControls.tsx` / `useBuildMode.ts` — logic tool group

---

## Test matrix (engine, deterministic)

| Area | Assertions |
|---|---|
| Channel resolution | pulse opens `momentary`; toggle flips; latch persists until reset; `requireAll` needs all channels |
| Door collider | closed → wall in `collectCollisionWalls`; open → absent; ground-level FFA/escape collision unchanged with no doors |
| Detection | cell enter/exit fires once (debounced); proximity enter/exit symmetric; 2D + 3D feed same cell |
| Teleporter | step-on armed → land at paired pad y via `groundHeightAt("teleport")`; disarmed → no-op |
| Timer | one-shot after `delayMs`; interval repeats; cleared on reset |
| Session reset | all nodes → `initialState`; channels cleared; players respawned |
| Determinism | same inputs → same state; only owner detects, server authoritative |

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Stateful pieces break "geometry from static data" assumption | High | Separate `BuildLogicPiece` + `LogicState`; special-case door/teleporter; don't generalize surface index yet (roadmap §1) |
| Client/server disagree on door/channel state | Med | Server authoritative; clients apply `room.logic.state.v1` patches only; owner-only detection |
| Channel resolution races (concurrent signals) | Med | Serialize per-room state mutation server-side; idempotent patches |
| Timer drift / orphaned timers | Med | Server-scheduled, room-keyed; clear on reset + room empty + delete |
| Detection cost per frame | Low | Cell-indexed lookup (reuse `BuildSurfaceIndex` idea); only owner runs it |
| Logic griefing (player spams button) | Med | Author-only logic authoring; `debounceMs`; play-mode interact only |
| Door collider regresses ground collision | Med | No-op-without-doors test (mirror build §7.5 regression) |

---

## Validation evidence (fill in after implementation)

- [x] Logic node persists/syncs/refresh (Phase 2). (`BuildLogicPiece`, `logic-pieces` routes, `useLogicPieces`, `LogicLayer` / `LogicPlacementController`)
- [x] Detection logs interact/step/proximity for 2D + 3D (Phase 3).
- [x] Session start/reset/timer works; reset restores all state (Phase 4).
- [x] Door blocks closed / passes open, two-tab consistent (Phase 5).
- [x] Button → door on same channel (Phase 6) — §4.1.
- [x] Teleporter pair + channel-gated arm (Phase 7) — §4.7.
- [x] Light reveal via channel (Phase 8) — §4.2.
- [x] Plate hold + proximity + delayed timer (Phase 9) — §4.3/§4.5/§4.7.
- [ ] Channel picker + inspector + starter kit; E2E full escape (Phase 10) — §4.10.
- [ ] Engine determinism + no-op-without-doors regression green.

---

## Dependency additions

**None.** Built on the existing stack (Three/R3F render + raycast, LiveKit data channel realtime, Mongoose persistence, Zod contracts, the build-pieces + dynamic-board patterns). No physics engine, no new vendor.
