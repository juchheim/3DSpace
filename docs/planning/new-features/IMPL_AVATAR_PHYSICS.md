# Implementation — Avatar Physics Engine (Free-for-All first)

Plan: [`./PLAN_AVATAR_PHYSICS.md`](./PLAN_AVATAR_PHYSICS.md)
Patterns to clone: the **build-pieces movement stack** (`collectCollisionWalls`, `BuildSurfaceIndex`, `groundHeightAt`, `buildCollisionWallsCacheKey`) and the **tuning stack** (`apps/api/src/config.ts` `tuning`, `apps/web/lib/config.ts` `CLIENT_TUNING`, `RoomSettingsSchema`, `WorldSkinOverridesSchema`).
Branch target: `feature/avatar-physics` (one PR per phase)
Feature flag: `ENABLE_PHYSICS` / `NEXT_PUBLIC_ENABLE_PHYSICS` (default **off**)
Last updated: 2026-06-01

---

## Status / Scope

**Status:** Not started (planning only).

Adds **Rapier** (`@dimforge/rapier3d-compat`) as a client-side physics engine that drives the **local player's avatar** as a kinematic capsule with gravity, real fall, and jump — in **Free-for-All rooms only**, behind a flag. Tunable via **env vars → world-skin overrides → room overrides**, collapsed by a pure resolver. Owner-authoritative networking is **unchanged**: each client simulates only its own avatar; remote avatars render at broadcast `position.y`.

**Out of scope (v1):** server-side physics, remote-avatar simulation, avatar-vs-avatar collision, room-object physics, moving platforms, non-FFA rooms. See PLAN §6.2.

---

## Codebase context (what we touch and why)

| Concern | Existing (reuse/branch) | New |
|---|---|---|
| Local movement loop | `useAvatarMovement.ts` (rAF, `verticalVelocityRef`, `applyGroundHeight`, `syncGroundHeightContext`) | physics branch delegating to `PhysicsController` |
| Wall collision | `resolveWallCollisionsV2` + `WallCollider` (`wall-collision.ts`) | mapped to Rapier cuboids |
| Walkable surfaces | `groundHeightAt` + `BuildSurfaceIndex` + `FloorTop`/`RampSurface` (`ground-height.ts`, `build.ts`) | mapped to Rapier floor/ramp colliders |
| Collider union + cache | `collectCollisionWalls`, `collectLogicDoorColliders`, `buildCollisionWallsCacheKey` (`avatar-movement-collision.ts`) | `buildPhysicsWorldSpec` + `physicsWorldSpecCacheKey` |
| Movement constants | `AVATAR_STAND_HEIGHT=1.6`, `WALL_AVATAR_RADIUS=0.4`, `BUILD_STEP_UP_MAX=0.6`, `BUILD_FALL_GRAVITY=28` | `PhysicsTuning` defaults derive from these |
| Env tuning (api) | `apps/api/src/config.ts` `tuning` + `envNumber`/`envBoolean` + `requiredInProduction` | `tuning.physics*` |
| Env tuning (web) | `apps/web/lib/config.ts` `CLIENT_TUNING` + `buildingEnvEnabled` | `CLIENT_TUNING.physics*` + `physicsEnvEnabled(roomType)` |
| Room overrides | `RoomSettingsSchema` (`buildingEnabled`, `logicEnabled`, `playModeEnabled`) | `RoomSettingsSchema.physics` (partial) |
| Environment overrides | `WorldSkinOverridesSchema.walkSpeedMultiplier` (Mars precedent) | `gravityMultiplier`, `jumpMultiplier` |
| Room-type gate | `getRoomTypeFeatureFlags(type)`, `isFreeForAllManifest` | `RoomTypeFeatureFlags.physics` |
| Wire message | `AvatarStateMessageSchema`, `AvatarMovementSchema` (`idle`/`walking`) | keep `AvatarMovementSchema` unchanged; add optional `AvatarAirborneStateSchema` for remote animation |
| Mount point | `RoomClient.tsx` (`useAvatarMovement({... walkSpeedMultiplier, buildPiecesRef ...})`, `activeSkinForRoom`) | pass resolved `PhysicsTuning` |

**Invariant carried from build/logic:** only the **local owner** simulates; observers render remote avatars at broadcast `position.y`. Physics must not change this. The server is non-authoritative for movement.

---

## Contracts (Phase 0 + 1)

### `PhysicsTuningSchema` (`packages/contracts/src/index.ts`)

```ts
export const PhysicsTuningSchema = z.object({
  enabled: z.boolean().default(false),
  gravity: z.number().min(0).max(100).default(24),          // m/s² downward
  moveSpeed: z.number().positive().max(20).default(3.2),    // == current walk speed
  jumpHeight: z.number().min(0).max(10).default(1.3),       // peak height; v0 = sqrt(2*g*h)
  maxFallSpeed: z.number().positive().max(200).default(40),
  airControl: z.number().min(0).max(1).default(0.6),
  coyoteTimeMs: z.number().int().min(0).max(500).default(120),
  capsuleRadius: z.number().positive().max(2).default(0.4),    // == WALL_AVATAR_RADIUS
  capsuleHeight: z.number().positive().max(4).default(1.6),    // == AVATAR_STAND_HEIGHT
  maxSlopeClimbDeg: z.number().min(0).max(89).default(50),
  autoStepHeight: z.number().min(0).max(2).default(0.6),       // == BUILD_STEP_UP_MAX
  snapToGroundDist: z.number().min(0).max(2).default(0.3)
});
export type PhysicsTuning = z.infer<typeof PhysicsTuningSchema>;

// Per-room override: every field optional, wins last.
export const PhysicsRoomOverrideSchema = PhysicsTuningSchema.partial();
```

### `RoomSettingsSchema` (add near `playModeEnabled` / `logicEnabled`)

```ts
physics: PhysicsRoomOverrideSchema.default({})   // {} = inherit env/skin defaults
```

### `WorldSkinOverridesSchema` (add near `walkSpeedMultiplier`)

```ts
gravityMultiplier: z.number().positive().max(4).optional(),  // Mars ≈ 0.38
jumpMultiplier: z.number().positive().max(4).optional()
```

### `AvatarMovementSchema` + airborne specificity

`AvatarMovementSchema` already carries a specific meaning in the wire format: **horizontal locomotion**. Keep that meaning stable.

```ts
export const AvatarMovementSchema = z.enum(["idle", "walking"]);
export const AvatarAirborneStateSchema = z.enum(["grounded", "jumping", "falling"]);
```

Add an optional field on `AvatarStateMessage`, for example:

```ts
airborneState: AvatarAirborneStateSchema.optional()
```

- Older clients continue to emit and consume `movement: "idle" | "walking"` unchanged.
- Newer clients may emit `airborneState`, and older clients can ignore that field safely.
- `airborneState` is produced **only** by the owner and consumed **only** for remote animation — never to move a remote avatar.
- `grounded` is optional on the wire; omitting the field is acceptable when not airborne. If included, it is purely explicit state, not a different movement mode.

### `RoomTypeFeatureFlags` (add `physics`)

```ts
// FFA: physics true (still env-gated); others false in v1
physics: boolean
```

After any contract change: rebuild OpenAPI (`packages/contracts/openapi/openapi.json`) and update `parseRoomSettings` consumers if needed.

---

## Phase 0 — Vendor, flags, contracts (no behavior)

**Dependency:** add `@dimforge/rapier3d-compat` to `apps/web` (`npm i @dimforge/rapier3d-compat` in `apps/web`). Confirm Next 16 / webpack handles the WASM asset (compat package ships async `init()`; no top-level await). Add a minimal smoke check in Phase 0 that dynamic-imports the package and awaits `init()` in the web test/build environment so bundler/WASM breakage is caught before any controller work. Add to bundle-analysis note if needed.

**Contracts:** `PhysicsTuningSchema`, `PhysicsRoomOverrideSchema`, `RoomSettings.physics`, `WorldSkinOverrides.gravity/jumpMultiplier`, `AvatarAirborneStateSchema` + optional `AvatarStateMessage.airborneState`, `RoomTypeFeatureFlags.physics`. OpenAPI rebuild. Unit test: defaults parse; FFA flag true; `AvatarMovementSchema.parse("walking")` still valid; `airborneState` is optional and parses when present.

**Env (api `config.ts`):**
- `tuning.physics`: `enablePhysics: envBoolean(raw, "ENABLE_PHYSICS", false)` plus `physicsGravity`, `physicsMoveSpeed`, `physicsJumpHeight`, `physicsMaxFallSpeed`, `physicsAirControl`, `physicsCoyoteTimeMs`, `physicsMaxSlopeClimbDeg`, `physicsAutoStepHeight`, `physicsSnapToGroundDist` via `envNumber` with the schema defaults. No `requiredInProduction` additions (no secret).

**Env (web `config.ts`):**
- `CLIENT_TUNING.enablePhysics = process.env.NEXT_PUBLIC_ENABLE_PHYSICS === "true"` + the `NEXT_PUBLIC_PHYSICS_*` numbers.
- `physicsEnvEnabled(roomType)` mirroring `buildingEnvEnabled` → true only for `"free-for-all"` in v1.

**`.env.example` ×3** (`/.env.example`, `apps/api/.env.example`, `apps/web/.env.example`): add the `ENABLE_PHYSICS=false` / `NEXT_PUBLIC_ENABLE_PHYSICS=false` block + `PHYSICS_*` defaults, commented (FFA-only, default off until staging), next to the `ENABLE_FREE_FOR_ALL_BUILDING` block.

*Exit:* `tsc` + contracts tests green; flags readable on both sides; nothing changes at runtime.

---

## Phase 1 — Pure engine: world spec + tuning resolver

All in `packages/room-engine` (no Rapier import — stays pure/testable).

**`packages/room-engine/src/physics-spec.ts`:**

```ts
export type ColliderSpec =
  | { kind: "cuboid"; id: string; center: Vec3; half: Vec3; rotationY?: number }
  | { kind: "ramp";   id: string; /* lowY/highY/climbAxis/climbSign + footprint */ }
  | { kind: "ground"; id: string; /* base plane/large cuboid from getBaseY */ };

export function buildPhysicsWorldSpec(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  logicDoors?: { pieces: BuildLogicPiece[]; nodes: LogicState["nodes"] }
): ColliderSpec[];

export function physicsWorldSpecCacheKey(
  manifest: RoomManifest, buildPieces: BuildPiece[],
  logicDoors?: ...
): string;  // mirror buildCollisionWallsCacheKey
```

- Walls: from `collectCollisionWalls(manifest, buildPieces)` filter `passable === false` → cuboid (span × thickness × height at `baseY`). Reuse the exact data `resolveWallCollisionsV2` consumes.
- Floors/ramps: from `BuildSurfaceIndex.fromPieces(buildPieces)` (or `buildPieceColliders`) → floor cuboids (top at `topY`, `BUILD_FLOOR_THICKNESS` below) and ramp specs.
- Doors: `collectLogicDoorColliders(pieces, nodes)` → cuboid only when not open.
- Ground: one base collider from `floorYFromZ`/`getBaseY` so the capsule always lands. (FFA perimeter radial clamp is **not** a collider here — applied in JS post-step; see Phase 2.)

**`packages/room-engine/src/physics-tuning.ts`:**

```ts
export function resolvePhysicsTuning(input: {
  defaults: PhysicsTuning;                                   // env-derived
  skin?: { gravityMultiplier?: number; jumpMultiplier?: number; walkSpeedMultiplier?: number };
  room?: Partial<PhysicsTuning>;
  featureEnabled: boolean;                                   // FFA + env flag
}): PhysicsTuning;
```

Precedence (PLAN §3.2): defaults → multiply skin multipliers (gravity, jump, moveSpeed via walkSpeedMultiplier) → spread room partial (hard override) → `enabled = featureEnabled && (room.enabled ?? defaults.enabled)` → re-clamp every field via `PhysicsTuningSchema`.

Export both from `packages/room-engine/src/index.ts`.

**Tests (`packages/room-engine/tests/physics-spec.test.ts`, `physics-tuning.test.ts`):**
- Empty manifest → only ground collider. Wall piece → cuboid matching its `WallCollider`. Floor → cuboid top at `topY`. Ramp → ramp spec with right `climbAxis/sign`. Closed door → cuboid; open door → none.
- Cache key changes iff geometry/door-open changes (mirror the build cache-key tests).
- Resolver: env-only passthrough; Mars skin (`gravityMultiplier 0.38`) lowers gravity + (jump height effectively higher); room partial overrides skin; `enabled` ANDs flags; clamps applied after multiply.

*Exit:* engine produces correct collider specs + resolved tuning, fully unit-tested, zero Rapier dependency.

---

## Phase 2 — PhysicsController (gravity + ground, no jump)

New dir `apps/web/lib/physics/`. This is the only place Rapier is imported.

**`apps/web/lib/physics/rapier.ts`** — lazy singleton:
```ts
let ready: Promise<typeof import("@dimforge/rapier3d-compat")> | null = null;
export function loadRapier() { return (ready ??= import("@dimforge/rapier3d-compat").then(async (R) => { await R.init(); return R; })); }
```
Dynamic-import so non-physics builds never pay the WASM cost.

**`apps/web/lib/physics/PhysicsController.ts`:**
- `async create(tuning, spec)`: build `World` with `gravity {0,-tuning.gravity,0}`; add static colliders from `ColliderSpec[]`; add one kinematic-position capsule rigid body + capsule collider (radius/halfHeight from tuning); create `KinematicCharacterController(offset)` with `setMaxSlopeClimbAngle`, `enableAutostep(autoStepHeight, …)`, `enableSnapToGround(snapToGroundDist)`.
- `setTuning(tuning)`: update gravity + controller params live (so room/skin changes apply without rebuild).
- `syncColliders(spec, cacheKey)`: if key unchanged, no-op; else remove old static colliders + add new (capsule + KCC persist).
- `step(input: { moveX, moveZ, dtSeconds }) → { position, grounded, vy, airborne }`:
  - Fixed-timestep accumulator (e.g. 1/60); consume `dtSeconds` (already ≤ 0.05 clamp upstream).
  - Per substep: `vy -= gravity*h` (clamp to `-maxFallSpeed`); desired = `{moveX*moveSpeed*h, vy*h, moveZ*moveSpeed*h}`; `controller.computeColliderMovement(capsule, desired)`; apply `controller.computedMovement()`; if `computedGrounded()` → `vy = 0`.
  - Apply FFA radial clamp (port the `ffa-perim-*` / `FFA_MAIN_RADIUS` / exit-arc logic) to the post-step XZ.
  - Return capsule translation as feet `position`.
- `dispose()`: free world.

*No jump yet.* Stepping off a floor/ramp edge now **falls** under gravity instead of snapping.

**Unit-ish test (jsdom or node with Rapier):** capsule on a floor stays grounded; capsule walking past a floor edge gains downward `vy` and descends; collides with a wall cuboid (XZ blocked); lands on the ground collider.

*Exit:* a standalone harness (or temporary debug mount) shows a capsule that walks, collides, and falls off edges. Not yet wired to the avatar.

---

## Phase 3 — Wire into `useAvatarMovement` (walk + fall parity)

Branch the loop; **do not** delete the existing path.

**`useAvatarMovement.ts` new inputs:** `physicsTuning?: PhysicsTuning`, reuse `buildPiecesRef`, `logicPiecesRef`, `logicNodesRef`, `manifest`.

**Logic:**
- A `physicsActive = !!physicsTuning?.enabled && input.viewMode === "3d"` gate.
- On activation: `loadRapier()` → `PhysicsController.create(tuning, buildPhysicsWorldSpec(...))`; seed capsule at current `stateRef.position`. Hold in a ref. Show no spawn hitch (init before first move; spawn already async).
- In `tick(now)`:
  - If `physicsActive` and controller ready: compute `localX/localZ` + camera-yaw world transform **exactly as today**; call `controller.syncColliders(spec, key)` (diff); `const out = controller.step({ moveX, moveZ, dtSeconds })`; `nextPosition = out.position`; `movement` remains `walking`/`idle` from horizontal speed; `airborneState` is omitted in this phase.
  - Else: current `resolveAvatarXZWithWalls` + `applyGroundHeight` path verbatim.
- `moveTo3DPoint` / `teleportToPosition` / `returnToSpawn`: when physics active, set the capsule translation (`rigidBody.setNextKinematicTranslation` / teleport) and zero `vy`, then read back; otherwise current behavior.
- Lifecycle: dispose controller on unmount / when `physicsActive` flips false; rebuild on manifest change.

**`RoomClient.tsx`:** compute `physicsTuning` = `resolvePhysicsTuning({ defaults: clientPhysicsDefaults, skin: activeSkinForRoom?.overrides, room: room.settings.physics, featureEnabled: physicsEnvEnabled(roomType) && roomTypeFeatures.physics })` and pass to `useAvatarMovement`. `walkSpeedMultiplier` is now folded into `moveSpeed` via the resolver (keep the existing toast).

*Exit:* in an FFA room with the flag on, walking + wall collision matches today and **walking off a ledge falls**; flag off → identical to current build. Two-tab: faller's descent shows on the observer via broadcast `y`.

---

## Phase 4 — Jump

**Input:** `Space` keydown in the `useAvatarMovement` key handler (guard `isKeyboardOwnedTarget`, `preventDefault` to stop page scroll). Touch: a jump button via `MovementPad` / HUD calling a `requestJump()` callback.

**Controller:** `requestJump()` sets a `jumpQueued` flag; in `step`, if `jumpQueued && (grounded || withinCoyote)` → `vy = sqrt(2 * gravity * jumpHeight)`, clear coyote, clear flag. Track `lastGroundedAt` for `coyoteTimeMs`. While airborne, scale horizontal input by `airControl`.

**Movement states:** owner keeps `movement = "walking"`/`"idle"` based on horizontal motion. Owner additionally sets `airborneState = "jumping"` while `vy>0` airborne, `"falling"` while `vy<0` airborne, and either omits the field or sets `"grounded"` when grounded. Broadcast as-is.

**Remote animation (`RoomView3D.tsx` / avatar render):** map `airborneState` `jumping`/`falling` to the existing avatar animation/pose (or a simple vertical offset already implied by broadcast `y`). Never simulate — purely visual.

**Tests:** jump from ground reaches ≈ `jumpHeight` then lands; can't double-jump in air (no coyote after first); coyote lets a jump fire within the window after walking off an edge; headroom blocks the rise (jump under a low floor doesn't clip up).

*Exit:* space jumps with a real arc; jump + walk-off-edge feel correct; observers see a plausible jump animation.

---

## Phase 5 — Tuning surfaces (env → skin → room) end-to-end

Mostly wiring (schemas exist from Phase 0/1).

- **Env:** confirm `PHYSICS_*` (api) + `NEXT_PUBLIC_PHYSICS_*` (web) flow into the `defaults` passed to `resolvePhysicsTuning`. Build `clientPhysicsDefaults` from `CLIENT_TUNING`.
- **Room override UI:** add a **Physics** section to the room settings panel (where `buildingEnabled`/`playModeEnabled` live) — enable toggle + gravity/jumpHeight/moveSpeed sliders writing `RoomSettings.physics`. Author/owner only. Persists via the existing room-settings update route.
- **World-skin:** add `gravityMultiplier`/`jumpMultiplier` to the **Mars** skin (`packages/world-skins` catalog) → moon-jump. Verify the resolver picks them up live when a skin is applied.
- Live updates: changing room/skin tuning calls `controller.setTuning(resolved)` without rebuilding colliders.

**Tests:** env change shifts defaults; Mars skin → lower effective gravity / higher hang time; room partial pins gravity over skin+env; `enabled=false` room override forces the fallback path even with the env flag on.

*Exit:* all three layers demonstrably change feel with correct precedence; Mars moon-jump works.

---

## Phase 6 — Collider refresh, door swap, 2D analog, perf

- **Refresh on build edits:** `syncColliders` already diffs by `physicsWorldSpecCacheKey`; confirm placing/destroying a build piece rebuilds statics within a frame and doesn't drop the capsule.
- **Door swap:** on `room.logic.state.v1` open/close, the spec key changes → collider added/removed. (FFA has no logic doors today, but keep the path correct for reuse.)
- **2D analog:** `physicsActive` already requires `viewMode === "3d"`. Verify a 2D user moves via the existing kinematic path and their broadcast `y` tracks the surface; switching 2D↔3D re-seeds the capsule at the current position.
- **Perf/CCD:** enable CCD on the capsule; verify no tunneling at `maxFallSpeed` through `BUILD_WALL_THICKNESS`/floor thickness; profile per-frame `computeColliderMovement` (one capsule) — should be negligible. Rebuild only on key change.

**Tests:** place a floor under a falling avatar → lands on it; destroy the floor they stand on → they fall; 2D move parity; high-speed fall doesn't tunnel.

*Exit:* physics is robust against live world edits and view switches; no tunneling; no per-frame rebuild thrash.

---

## Phase 7 — Validation & rollout

- **Feel pass:** tune default `gravity`/`jumpHeight`/`airControl`/`coyoteTimeMs`; lock the env defaults.
- **E2E (`apps/web/test/avatar-physics.spec.ts`):** flag-on FFA room — jump produces vertical delta then returns; walk off a built tower → `y` decreases over multiple frames (not a single snap); room override `physics.enabled=false` → no jump (space is a no-op vertically); (optional) Mars skin → measurably longer hang time. Add `ENABLE_PHYSICS` to `playwright.config.ts`.
- **Regression:** flag-off run of existing movement/build specs unchanged; remote-`y` test (observer position == broadcast).
- **Docs:** finalize `.env.example` ×3; update this doc's validation checklist; update `MVP_PLUS_ONE_STATUS.md` if relevant; update `.cursor/memory.md`.

*Exit:* feature shippable behind `ENABLE_PHYSICS` for FFA; green build/tsc/tests/E2E.

---

## Files-to-touch summary

**New**
- `packages/room-engine/src/physics-spec.ts` — `buildPhysicsWorldSpec`, `physicsWorldSpecCacheKey`, `ColliderSpec`
- `packages/room-engine/src/physics-tuning.ts` — `resolvePhysicsTuning`
- `apps/web/lib/physics/rapier.ts` — lazy WASM loader
- `apps/web/lib/physics/PhysicsController.ts` — Rapier world + kinematic capsule + KCC + fixed-step `step()`
- Tests: `packages/room-engine/tests/physics-spec.test.ts`, `physics-tuning.test.ts`; `apps/web/test/avatar-physics.spec.ts`

**Modified**
- `packages/contracts/src/index.ts` — `PhysicsTuningSchema`, `PhysicsRoomOverrideSchema`, `RoomSettings.physics`, `WorldSkinOverrides.gravity/jumpMultiplier`, `AvatarAirborneStateSchema` + optional `AvatarStateMessage.airborneState`, `RoomTypeFeatureFlags.physics`; OpenAPI regen
- `packages/room-engine/src/index.ts` — export new helpers
- `apps/api/src/config.ts` — `tuning.physics*` env reads
- `apps/web/lib/config.ts` — `CLIENT_TUNING.physics*` + `physicsEnvEnabled`
- `apps/web/lib/useAvatarMovement.ts` — physics branch, controller lifecycle, jump input
- `apps/web/components/RoomClient.tsx` — resolve + pass `physicsTuning`; physics room-settings UI
- `apps/web/components/RoomView3D.tsx` — remote `jumping`/`falling` animation mapping; jump touch button
- `packages/world-skins/catalog/*` (Mars) — `gravityMultiplier`/`jumpMultiplier`
- `apps/web/package.json` — `@dimforge/rapier3d-compat`
- `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` — `ENABLE_PHYSICS` + `PHYSICS_*`
- `apps/web/playwright.config.ts` — `ENABLE_PHYSICS` for the physics spec

---

## Test matrix

| Area | Assertions |
|---|---|
| World spec (pure) | empty→ground only; wall→cuboid==WallCollider; floor→top at `topY`; ramp→axis/sign; door open/closed; cache key flips only on geometry/door change |
| Tuning resolver (pure) | env passthrough; skin multipliers; room partial overrides skin+env; `enabled` ANDs flags; clamp after multiply |
| Controller | grounded stays; walk off edge → falls; wall blocks XZ; lands on ground; jump reaches ~`jumpHeight`; no double-jump; coyote window; headroom blocks rise; `maxFallSpeed` clamp; no tunneling |
| Movement integration | walk/collide parity with flag off; fall replaces snap with flag on; teleport/spawn re-seed capsule; 2D path unchanged |
| Networking | owner emits `position` + `movement` + optional `airborneState`; observer renders broadcast `y` (no re-sim); old clients ignore `airborneState`, new clients parse it |
| Tuning surfaces | env shift; Mars moon-jump; room override pin/disable; live `setTuning` without collider rebuild |

---

## Validation evidence (fill in after implementation)

- `npx vitest run packages/contracts/tests/avatar-physics.test.ts packages/room-engine/tests/physics-spec.test.ts packages/room-engine/tests/physics-tuning.test.ts apps/web/tests/rapier-loader.test.ts apps/web/tests/physics-controller.test.ts apps/web/tests/useAvatarMovement.physics.test.ts` — pass.
- `npm run typecheck -w @3dspace/contracts` — pass.
- `npm run typecheck -w @3dspace/room-engine` — pass.
- `npm run typecheck -w @3dspace/api` — pass.
- `npm run typecheck -w @3dspace/web` — pass.
- `npm run build -w @3dspace/web` — pass.
- `npx playwright test apps/web/test/avatar-physics.spec.ts` — pass.

- [x] Phase 0: dep vendored, Rapier import/init smoke check passes, flags read both sides, contracts parse (incl. old `AvatarMovement` values and optional `airborneState`).
- [x] Phase 1: `buildPhysicsWorldSpec` + `resolvePhysicsTuning` unit tests green.
- [x] Phase 2: capsule walks/collides/falls in harness (no jump).
- [x] Phase 3: FFA flag-on walk+fall parity; flag-off identical; two-tab fall via broadcast `y`.
- [x] Phase 4: jump arc + coyote + headroom; remote jump animation.
- [x] Phase 5: env/skin/room precedence demonstrated; Mars moon-jump.
- [x] Phase 6: live build-edit refresh, door swap, 2D parity, no tunneling.
- [x] Phase 7: E2E green; `.env.example` ×3 synced; `npm run build` + API `tsc` clean.

---

## Dependency additions

**`@dimforge/rapier3d-compat`** (Rapier physics, Rust→WASM, async `init()`) added to `apps/web` — the project's **first** physics engine (the escape-room logic doc explicitly noted "No physics engine, no new vendor"; this plan changes that, scoped behind a flag). Dynamic-imported so non-physics builds don't pay the WASM cost. No new server-side or persistence dependency.
