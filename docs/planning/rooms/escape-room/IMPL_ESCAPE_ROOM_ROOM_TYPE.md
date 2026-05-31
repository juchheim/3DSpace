# Implementation — Escape Room Room Type (Phase −1)

Plan: [`./PLAN_ESCAPE_ROOM_ROOM_TYPE.md`](./PLAN_ESCAPE_ROOM_ROOM_TYPE.md)
Roadmap: [`../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`](../free-for-all/world-building/ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md)
Closest patterns to clone: `createFreeForAllManifest` (room-engine), the FFA room-type wiring, the build-pieces feature gating.
Branch target: `feature/escape-room-type`
Last updated: 2026-05-31

---

## Status / Scope

**Status:** Phase −1 complete (Phases 1–5). Depends on world-building (shipped) + dynamic boards (shipped).

Ships the `"escape-room"` room type end-to-end: a new manifest factory (empty canvas), feature flags, env gating, escape-specific build mask, author/player permissions, dynamic-board generalization, and lobby/client wiring. **No logic/triggers/session** — those are the trigger-blocks IMPL.

**In scope:**

- `RoomTypeSchema` → add `"escape-room"`.
- `RoomTypeFeatureFlags` → add `logic: boolean`; add `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS`.
- `createEscapeRoomManifest()` + `isEscapeRoomManifest()` + escape build-mask path in `isBuildAllowedAt`.
- Generalize build + dynamic-board gating from FFA-only to feature-flag-based (so escape rooms get them too).
- API room creation dispatch + `escapeRoomSettings()`.
- Env flags `ENABLE_ESCAPE_ROOM` / `NEXT_PUBLIC_ENABLE_ESCAPE_ROOM`.
- Lobby selector + create/join copy + `RoomClient` role labels.

**Out of scope:** undo/prefabs/doorways/lights (Phase 0 IMPL), play mode (Phase 1 IMPL), all logic (Phases 2–10 IMPL).

---

## Codebase context (pre-implementation state)

Confirmed by reading the tree on 2026-05-31. The FFA + build stack means "add a room type" is well-trodden — most touchpoints already branch on room type.

| File | What matters |
|---|---|
| `packages/contracts/src/index.ts` | `RoomTypeSchema = z.enum(["classroom","workforce-training","free-for-all"])` (line 343); `RoomType` (344). `RoomTypeFeatureFlags` type (968). Three frozen flag blocks: `NON_CLASSROOM_*` (~990), `CLASSROOM_*` (~1011), `FREE_FOR_ALL_*` (~1034). `getRoomTypeFeatureFlags()` switch (~1059). `RoomSettingsSchema` (1078) with `buildingEnabled`/`buildDestroyPolicy` (1201–1202). `RoomSchema.type` (1214) + `CreateRoomRequestSchema.type` (1224). |
| `packages/room-engine/src/index.ts` | `createFreeForAllManifest` (1028), `createWorkforceTrainingManifest` (658), `createDefaultRoomManifest`. `floorYFromZ` (1167) returns 0 when no tiers. `clampPositionToBounds` (1175). |
| `packages/room-engine/src/build.ts` | `isBuildAllowedAt(manifest, piece)` (232) applies FFA mask via `isFreeForAllManifest(manifest)` (263). `BUILD_MAX_PIECES_PER_ROOM/USER`. |
| `packages/room-engine/src/free-for-all-build-mask.ts` | `isFreeForAllManifest` (checks `ffa-perim-*` wall ids), `BUILD_SPAWN_KEEP_OUT_RADIUS`, hall/exit/board mask helpers. |
| `apps/api/src/routes/rooms-core.ts` | `POST /v1/rooms` (51): room-type env gate (56–64), `manifestFactory` dispatch (77–80), `settings: roomSettings(config)` (88). |
| `apps/api/src/rooms-core/settings.ts` | `roomSettings(config)` builds default `RoomSettings`. |
| `apps/api/src/models/mongoose.ts` | room `type` enum (148): `["classroom","workforce-training","free-for-all"]`. |
| `apps/api/src/build-pieces/helpers.ts` | `assertBuildingEnabled(config, room)` (56) gates on **`config.tuning.enableFreeForAllBuilding`** + `getRoomTypeFeatureFlags(room.type).building` + `room.settings.buildingEnabled`. The env check is FFA-named and must be generalized. |
| `apps/api/src/routes/wall-objects.ts` | Dynamic-anchor CRUD guards `if (room.type !== "free-for-all") throw notFound(...)` at lines 259/268/332/391. Must generalize to the `dynamicBoards` flag. |
| `apps/api/src/config.ts` | `tuning.enableFreeForAll` (68), `enableFreeForAllBuilding` (69); env parse (300–302). |
| `apps/web/lib/config.ts` | `CLIENT_TUNING.enableFreeForAll` / `enableFreeForAllBuilding` (19–20). |
| `apps/web/components/Lobby.tsx` | local `RoomType` union (19), `ROOM_TYPES` (21), `ROOM_TYPE_FORM_DEFAULTS` (27), `ROOM_TYPE_JOIN_COPY` (33), `DEFAULT_ROOM_TYPE` (42), `renderRoomTypeSteps()`. |
| `apps/web/components/RoomClient.tsx` | room-type → role labels + title (259/268), feature gating via `getRoomTypeFeatureFlags`. |

**Key insight:** Building and dynamic boards are currently gated on **FFA-specific** checks (`enableFreeForAllBuilding`, `room.type !== "free-for-all"`). Generalizing those two gates is the bulk of the non-manifest work.

---

## Design decisions locked

1. **New room type, not an FFA flavor.** Separate manifest, flags, permissions (plan §1).
2. **Empty canvas.** `createEscapeRoomManifest()` emits a flat 80×80 floor, **no walls / tiers / anchors**, marked with a `features: [{ key: "escape-room-canvas", enabled: true }]` entry so pure engine functions can detect it without a DB round-trip.
3. **No outer walls v1** (plan §2.5). Bounds clamp only.
4. **Reuse, don't fork.** Generalize build + board gating to feature flags; do **not** copy the FFA mask.
5. **Author/Player permissions.** Default `buildDestroyPolicy: "owner-or-teacher"`.
6. **Env-flag off by default.**

---

## Phased implementation

### Phase 1 — Contracts + flags

**`packages/contracts/src/index.ts`**

- Extend `RoomTypeSchema`:
  ```ts
  export const RoomTypeSchema = z.enum(["classroom", "workforce-training", "free-for-all", "escape-room"]);
  ```
- Add `logic: boolean` to `RoomTypeFeatureFlags` (set `false` in `NON_CLASSROOM_*`, `CLASSROOM_*`, `FREE_FOR_ALL_*`).
- Add `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS` (freeze), per plan §4: `building/dynamicBoards/logic/worldSkins/aiObjects/whiteboards = true`; `openJoin/aiMeetingNotes/sharedBrowsers/liveCaptions = false`; all classroom* `false`.
- Add `case "escape-room":` to `getRoomTypeFeatureFlags()`.
- No new fields on `RoomSettingsSchema` in this phase (`playModeEnabled`/`logicEnabled` land with play mode / logic). `buildingEnabled` + `buildDestroyPolicy` already exist.
- Rebuild OpenAPI: `npm run openapi`.

**Tests (`packages/contracts/tests`):** extend `build-pieces.test.ts`-style assertions — `getRoomTypeFeatureFlags("escape-room")` has `building/dynamicBoards/logic = true`; FFA/classroom unchanged.

*Exit:* contracts compile, OpenAPI regenerates, flags exist.

---

### Phase 2 — Manifest factory + build mask (engine)

**`packages/room-engine/src/index.ts`** — `createEscapeRoomManifest(input)` mirroring `createFreeForAllManifest`'s signature (`{ id?, roomId, name?, version?, createdAt?, config? }`):

```ts
export const ESCAPE_ROOM_HALF_EXTENT = 40;   // → 80×80 m
export const ESCAPE_ROOM_WALL_HEIGHT = 8;
export const ESCAPE_ROOM_MANIFEST_FEATURE = "escape-room-canvas";
```

Manifest fields (plan §2.3): `dimensions { width:80, depth:80, height:8 }`, `bounds {±40}`, `walls: []`, `wallAnchors: []`, `tiers: []`, `spawnPoints` per plan §2.4 (`spawn-author` at origin + 3 player spawns), `features: [{ key: ESCAPE_ROOM_MANIFEST_FEATURE, enabled: true, config: {} }]`, `projection: top-down-v1`, `capabilities`/`spatialAudio` from config. End with `RoomManifestSchema.parse(manifest)`.

**`packages/room-engine/src/free-for-all-build-mask.ts`** (or a new `escape-room.ts` re-exported from index):

```ts
export function isEscapeRoomManifest(manifest: RoomManifest): boolean {
  return manifest.features.some((f) => f.key === ESCAPE_ROOM_MANIFEST_FEATURE && f.enabled);
}
```

**`packages/room-engine/src/build.ts`** — in `isBuildAllowedAt`, leave bounds/level/spawn-keepout checks as-is; they already run for every manifest. The FFA-specific block is already guarded by `isFreeForAllManifest(manifest)`, so an escape manifest (no `ffa-perim-*` walls) **already skips** the hall/exit/board masks. **No new branch needed** — just confirm with a test. (Optional: early-return after spawn keep-out when `isEscapeRoomManifest` for clarity.)

**Tests (`packages/room-engine/tests`):**

- `createEscapeRoomManifest` → empty walls/anchors/tiers; bounds ±40; has the canvas feature; `RoomManifestSchema` valid.
- `isEscapeRoomManifest` true for escape, false for FFA/classroom.
- `isBuildAllowedAt` on escape manifest: rejects out-of-bounds + spawn-keepout; **accepts** a wall at a cell that would be a "hall/exit/board" reject in FFA (proves no FFA mask leaks).
- `floorYFromZ(escapeManifest, z) === 0` for all z.

*Exit:* factory + detection tested; no FFA behavior on escape canvas.

---

### Phase 3 — API: creation, settings, gating generalization

**`apps/api/src/config.ts`** — add `tuning.enableEscapeRoom` + env `ENABLE_ESCAPE_ROOM` (default false), mirroring `enableFreeForAll`.

**`apps/api/src/rooms-core/settings.ts`** — add `escapeRoomSettings(config)` returning defaults per plan §3.3 (start from `roomSettings(config)`, override `buildDestroyPolicy: "owner-or-teacher"`, `worldSkins.skinDayNightMode: "night"`, disable `aiMeetingNotes`/`sharedBrowsers`/`liveCaptions`/`hallpass`/`pods`).

**`apps/api/src/routes/rooms-core.ts`** — in `POST /v1/rooms`:

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

**`apps/api/src/models/mongoose.ts`** — extend room `type` enum (line 148) to include `"escape-room"`.

**Generalize building gate — `apps/api/src/build-pieces/helpers.ts`:** `assertBuildingEnabled` currently requires `config.tuning.enableFreeForAllBuilding`. Change to: allowed if **either** FFA building is on (existing) **or** the room type's `building` flag + an `enableBuilding`-style gate is on. Simplest: gate purely on `getRoomTypeFeatureFlags(room.type).building && room.settings.buildingEnabled`, and treat `enableFreeForAllBuilding` as the FFA env switch only. Recommended: introduce a small helper `buildingEnvEnabled(config, roomType)`:
```ts
function buildingEnvEnabled(config, roomType) {
  if (roomType === "free-for-all") return config.tuning.enableFreeForAllBuilding;
  if (roomType === "escape-room") return config.tuning.enableEscapeRoom; // building is intrinsic to escape rooms
  return false;
}
```
Keep the per-room-type `building` flag + `room.settings.buildingEnabled` checks.

**Generalize board gate — `apps/api/src/routes/wall-objects.ts`:** replace the four `if (room.type !== "free-for-all") throw notFound(...)` guards with a shared predicate:
```ts
function assertDynamicBoardsSupported(room) {
  if (!getRoomTypeFeatureFlags(room.type).dynamicBoards) {
    throw notFound("Dynamic wall anchors are only available where dynamic boards are enabled");
  }
}
```

**Tests (`apps/api/tests/routes`):**

- Create escape room (flag on) → 201, manifest has no walls; flag off → 403.
- `build-pieces` create on escape room → succeeds (mirror `build-pieces.test.ts`, `createClassAndRoom(app, teacher, "escape-room")`).
- Dynamic board create on escape room build wall → succeeds; on classroom → 404.
- Destroy policy: a non-owner player cannot destroy an author's piece (`owner-or-teacher` default).

*Exit:* full CRUD against in-memory repo for an escape room; FFA/classroom regression green.

---

### Phase 4 — Lobby + client

**`apps/web/lib/config.ts`** — add `CLIENT_TUNING.enableEscapeRoom = process.env.NEXT_PUBLIC_ENABLE_ESCAPE_ROOM === "true"`.

**`apps/web/components/Lobby.tsx`:**

- Extend local `RoomType` union with `"escape-room"`.
- `ROOM_TYPES` entry (behind `CLIENT_TUNING.enableEscapeRoom`): label "Escape Room", description per plan §7.1.
- `ROOM_TYPE_FORM_DEFAULTS["escape-room"] = { className: "Puzzle Lab", roomName: "The Locked Study" }`.
- `ROOM_TYPE_JOIN_COPY["escape-room"] = { guestSingular: "player", hostSingular: "author", joinButtonLabel: "Join escape room" }`.
- `renderRoomTypeSteps()`: add a `case "escape-room":` — **classroom-style** create (class + name → invite), **not** the FFA browser. Join via invite link (reuse classroom path).

**`apps/web/components/RoomClient.tsx`:**

- Role labels: `case "escape-room":` → Author/Player.
- Title suffix: "Escape Room".
- Feature gating via `getRoomTypeFeatureFlags(room.type)` — `building`, `dynamicBoards` already drive the existing build/board UI; mounting `useBuildPieces` should gate on `roomTypeFeatures.building && (CLIENT_TUNING.enableFreeForAllBuilding || CLIENT_TUNING.enableEscapeRoom)` (or generalize the client building gate same as server).
- Hide FFA/classroom-only HUD cards for escape rooms.

**Tests:** extend an existing web test (e.g. a room-type fixture) asserting an escape room loads with empty manifest walls and the build UI mounts for the author.

*Exit:* author creates an escape room from the lobby, lands on the empty canvas, build UI is available.

---

### Phase 5 — Validation + rollout

- **E2E (Playwright):** author creates escape room → builds a wall run → places a board on a build wall → player joins via invite → sees structure + board; player cannot destroy.
- `.env.example` (api + web): add `ENABLE_ESCAPE_ROOM` / `NEXT_PUBLIC_ENABLE_ESCAPE_ROOM` (default false) with a comment.
- **Rollout:** deploy flags off → enable in staging → smoke test (create, build, board, two-client, destroy policy) → enable prod after E2E green.

---

## Files-to-touch summary

**New**
- `packages/room-engine/src/escape-room.ts` (or extend `index.ts`): constants, `createEscapeRoomManifest`, `isEscapeRoomManifest`
- `apps/api/src/rooms-core/settings.ts`: `escapeRoomSettings` (or co-locate)
- Tests: room-engine manifest/mask, api route tests, web E2E

**Modified**
- `packages/contracts/src/index.ts` — `RoomTypeSchema`, `RoomTypeFeatureFlags.logic`, `ESCAPE_ROOM_ROOM_TYPE_FEATURE_FLAGS`, `getRoomTypeFeatureFlags`, OpenAPI
- `packages/room-engine/src/build.ts` — confirm/clarify escape path in `isBuildAllowedAt`
- `apps/api/src/config.ts` — `enableEscapeRoom`
- `apps/api/src/routes/rooms-core.ts` — env gate + manifest dispatch + settings
- `apps/api/src/models/mongoose.ts` — room type enum
- `apps/api/src/build-pieces/helpers.ts` — generalize `assertBuildingEnabled`
- `apps/api/src/routes/wall-objects.ts` — generalize dynamic-board guard
- `apps/web/lib/config.ts` — `enableEscapeRoom`
- `apps/web/components/Lobby.tsx` — registry + create/join copy
- `apps/web/components/RoomClient.tsx` — role labels, gating
- `.env.example` (api + web)

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Generalizing FFA building/board gates regresses FFA | Med | Keep FFA env switch; add escape path additively; FFA route tests must stay green |
| Empty manifest breaks a renderer assuming ≥1 wall | Low | `RoomView3D` walls map over `manifest.walls` (empty ok); test render with 0 walls |
| Spawn-only keep-out lets author trap players at bounds | Low | Play-mode return-to-spawn (Phase 1 IMPL); bounds clamp already exists |
| `isBuildAllowedAt` accidentally applies FFA mask | Low | Test asserts a cell that FFA would reject is accepted on escape canvas |

---

## Validation evidence (fill in after implementation)

- [x] Escape room creates from lobby (flag on); hidden + 403 when off. (`escape-room.spec.ts` lobby option; `apps/api/tests/routes/escape-room.test.ts` 403)
- [x] Manifest: 0 walls / 0 anchors / 0 tiers; bounds ±40; canvas feature present. (room-engine + API + E2E)
- [x] Build pieces place on escape canvas; player (non-owner) cannot destroy. (API + E2E)
- [x] Dynamic board places on a build wall in an escape room. (API + E2E)
- [x] Build accepted where FFA mask would reject (no leak); spawn keep-out still rejects. (`packages/room-engine/tests/escape-room.test.ts`)
- [x] FFA + classroom regression tests green. (existing route + E2E suites)
- [x] OpenAPI regenerated. (`packages/contracts/openapi/openapi.json`)

---

## Next

Proceed to [`./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md`](./IMPL_ESCAPE_ROOM_AUTHORING_AND_PLAY_MODE.md) (Phases 0–1) then [`./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md`](./IMPL_ESCAPE_ROOM_TRIGGER_BLOCKS.md) (Phases 2–10).
