# Plan — Avatar Physics Engine (Free-for-All first)

Companion implementation doc: [`./IMPL_AVATAR_PHYSICS.md`](./IMPL_AVATAR_PHYSICS.md)
Closest prior thinking: [`../rooms/free-for-all/world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md`](../rooms/free-for-all/world-building/IDEAS_FREE_FOR_ALL_WORLD_BUILDING.md) §2.6 ("Turn on eased fall, then add jump") and [`../rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](../rooms/free-for-all/world-building/PLAN_FREE_FOR_ALL_WORLD_BUILDING.md) §1.3 / §6.4 (verticality, deferred gravity).
Movement code this replaces/augments: [`apps/web/lib/useAvatarMovement.ts`](../../../apps/web/lib/useAvatarMovement.ts), [`apps/web/lib/avatar-movement-collision.ts`](../../../apps/web/lib/avatar-movement-collision.ts), [`packages/room-engine/src/ground-height.ts`](../../../packages/room-engine/src/ground-height.ts), [`packages/room-engine/src/wall-collision.ts`](../../../packages/room-engine/src/wall-collision.ts).
Branch target: `feature/avatar-physics` (additive; ships behind `ENABLE_PHYSICS`, default off)
Last updated: 2026-06-01

---

## 0. TL;DR

Today an avatar's motion is **surface-following, not physics**: each frame `useAvatarMovement` resolves X/Z against wall colliders (`resolveWallCollisionsV2`) and then **snaps Y** to the highest walkable surface under the avatar (`groundHeightAt`). There is no gravity, no momentum, no jump, and stepping off a ledge **teleports** you down to the surface below instead of falling. An eased-fall integrator exists but is hard-disabled (`BUILD_ENABLE_EASED_FALL = false`), and there is **no physics engine vendored anywhere** in the repo (the escape-room logic doc states this explicitly).

This plan introduces a **real physics engine** — **Rapier** (`@dimforge/rapier3d-compat`, Rust→WASM) — to drive the **local player's avatar** as a **kinematic capsule** controlled by Rapier's built-in `KinematicCharacterController`. That gives us, for free and correctly:

- **Jump** with real ballistic arc (apply vertical velocity, gravity integrates it back down).
- **Walk off the side of a ramp/floor/tower and fall** with real acceleration (no teleport-snap).
- **Slopes, auto-step, and ground-snapping** handled by the controller instead of the hand-rolled `BUILD_STEP_UP_MAX` heuristics.

It is **Free-for-All only in v1**, gated by a feature flag, and **tunable at three layers** that already exist in the codebase:

1. **Environment variables** — deployment-wide defaults (`PHYSICS_GRAVITY`, `PHYSICS_JUMP_HEIGHT`, …), mirrored to the client via `NEXT_PUBLIC_*`, exactly like every other tunable.
2. **Environment (world skin) overrides** — a skin can scale gravity/jump (e.g. **Mars low-gravity**), the natural extension of the existing `WorldSkinOverridesSchema.walkSpeedMultiplier`.
3. **Per-room overrides** — a `physics` block on `RoomSettingsSchema`, like `buildingEnabled` / `logicEnabled` / `playModeEnabled`.

A pure, testable resolver collapses those three layers into one effective `PhysicsTuning` per room.

**Critical constraint preserved:** the existing **owner-authoritative** movement model is unchanged. Each client simulates **only its own** avatar; remote avatars keep rendering at their **broadcast `position.y`**. The server stays non-authoritative for movement. This is what keeps two clients from disagreeing, and physics must not break it.

---

## 1. Why now / why this is realistic

The hard part of "real physics" — a per-frame ground-height query that depends on `x`, `z`, and the live set of build pieces — **already exists and is already deterministic** (`BuildSurfaceIndex`, `groundHeightAt`, `collectCollisionWalls`). What we are adding is the **integrator and resolver** on top of that geometry, which is precisely what a character controller is.

Three facts make this a contained change rather than a rewrite:

- **The engine already emits collider descriptions.** `buildPieceColliders(piece)` yields `WallCollider[]` + `FloorTop` + `RampSurface`; `collectCollisionWalls(manifest, pieces)` and `collectLogicDoorColliders(...)` already union them for movement. Translating those into Rapier colliders is a pure mapping — no new authoring, no new persistence.
- **Movement is already isolated behind a hook.** `useAvatarMovement` is the single owner of the local avatar's transform and the single producer of `AvatarStateMessage`. We can branch *inside* it: physics path when enabled, the current surface-following path otherwise. Nothing else in the app needs to know.
- **The tuning plumbing is mature.** `apps/api/src/config.ts` (`tuning`), `apps/web/lib/config.ts` (`CLIENT_TUNING`), `RoomSettingsSchema`, and `WorldSkinOverridesSchema` are all established override surfaces with tests. We are adding fields, not inventing a config system.

The IDEAS doc already proposed flipping on eased-fall and bolting a one-line jump impulse onto the existing integrator (§2.6). This plan goes further on purpose: the hand-rolled integrator cannot give correct ledge-fall, slope behavior, ceiling/headroom blocking on the way up, or coyote-time jump without re-deriving a small physics engine. **Vendoring Rapier is less code and more correct** than maturing the bespoke integrator, and it sets up the "play layer" (parkour, platforming) the IDEAS doc envisions.

---

## 2. Engine selection

| Option | Lang/runtime | Character controller | R3F fit | Verdict |
|---|---|---|---|---|
| **Rapier** (`@dimforge/rapier3d-compat`) | Rust → WASM | **Built-in** `KinematicCharacterController` (slopes, autostep, snap-to-ground, max-slope-climb) | Used by `@react-three/rapier`; works fine standalone | **Chosen** |
| cannon-es | Pure JS | None built-in (roll your own raycast controller) | Mature R3F bindings | Rejected — slower, less maintained, no controller |
| Jolt (`jolt-physics`) | C++ → WASM | Has a character controller | Heavier, newer JS bindings | Rejected for v1 — larger bundle, less ecosystem precedent |
| Mature the bespoke integrator | TS | Hand-rolled | N/A | Rejected — re-implements a physics engine badly |

**Why `@dimforge/rapier3d-compat` (not `@react-three/rapier`):** our movement loop lives in a plain `requestAnimationFrame` loop inside `useAvatarMovement`, **not** inside R3F's `useFrame`/scene graph. We need exactly **one** kinematic body plus a static collider set, queried imperatively and stepped on a fixed timestep — not a declarative `<RigidBody>` tree synced to meshes. The `compat` package (async WASM init, no top-level await / bundler glue) keeps physics in the hook/engine layer, decoupled from rendering, and avoids fighting R3F over who owns the transform. `@react-three/rapier` is the right tool when the scene graph *is* the physics world; here the room geometry is derived data, not React-rendered colliders.

**Determinism note:** Rapier is deterministic given identical inputs and step order, but we do **not** rely on cross-client determinism — each client only simulates its own avatar (§4). We rely on Rapier only for *single-client* correctness and feel.

---

## 3. Tunability model (the three layers)

The user requirement is "easily tunable via environment variables, environment, and room overrides." The codebase already has exactly these three surfaces. We define one resolved shape and one pure resolver.

### 3.1 The resolved shape

```ts
// packages/contracts/src/index.ts
PhysicsTuningSchema = z.object({
  enabled: z.boolean(),
  gravity: z.number(),            // m/s² downward magnitude (default 24)
  moveSpeed: z.number(),          // horizontal m/s (default 3.2, matches current speed)
  jumpHeight: z.number(),         // peak height in m (default 1.3) — jump velocity derived: v = sqrt(2*g*h)
  maxFallSpeed: z.number(),       // terminal velocity clamp (default 40)
  airControl: z.number(),         // 0..1 steering authority while airborne (default 0.6)
  coyoteTimeMs: z.number(),       // grace window to jump after leaving ground (default 120)
  capsuleRadius: z.number(),      // default 0.4 (== WALL_AVATAR_RADIUS)
  capsuleHeight: z.number(),      // default 1.6 (== AVATAR_STAND_HEIGHT)
  maxSlopeClimbDeg: z.number(),   // default 50
  autoStepHeight: z.number(),     // default 0.6 (== BUILD_STEP_UP_MAX)
  snapToGroundDist: z.number()    // default 0.3
});
```

### 3.2 Override precedence (lowest → highest)

```
built-in code defaults
   ⌄  overridden by
ENV VARS              (apps/api config.tuning.physics + NEXT_PUBLIC_* mirror)  → deployment-wide
   ⌄  overridden by
ENVIRONMENT (world skin)  (WorldSkinOverridesSchema.gravityMultiplier / jumpMultiplier / walkSpeedMultiplier)
   ⌄  overridden by
ROOM OVERRIDES        (RoomSettingsSchema.physics — partial)                   → per-room final say
```

- **Env layer** sets the deployment defaults (e.g. staging runs hotter gravity to test feel). `walkSpeedMultiplier` already lives on skins; `moveSpeed` base lives in env.
- **Environment/world-skin layer** is *multiplicative* and intentionally limited to feel knobs — `gravityMultiplier`, `jumpMultiplier`, and the existing `walkSpeedMultiplier`. **Mars low-gravity becomes real**: the Mars skin already sets `walkSpeedMultiplier`; add `gravityMultiplier: 0.38` and a moon-jump falls out for free. This is the single most compelling demo of the feature.
- **Room layer** is a `partial()` of the resolved fields and wins last, so a teacher/owner can pin gravity/jump/disable physics for a specific room regardless of skin or deployment.

### 3.3 The resolver (pure, testable)

```ts
// packages/room-engine — pure, no side effects, unit-tested
resolvePhysicsTuning({
  defaults: PhysicsTuning,            // from env-derived config
  skin?: { gravityMultiplier?; jumpMultiplier?; walkSpeedMultiplier? },
  room?: Partial<PhysicsTuning>       // RoomSettings.physics
}): PhysicsTuning
```

Multipliers apply to the env defaults; room partials hard-override the result; `enabled` ANDs the env flag, the room-type feature flag (FFA), and any room opt-out. The resolver is the **only** place precedence lives, so the rules are testable in one file.

---

## 4. Networking & the owner-authoritative invariant

This is the part most likely to break, so it is designed first.

**Today:** `useAvatarMovement` computes the local avatar's full transform and emits `AvatarStateMessage` (`position` incl. `y`, `rotation`, `movement: "idle" | "walking"`). Remote clients render each avatar at its **broadcast** `position.y` — they do **not** re-simulate. The "determinism rule" carried through the build/logic docs is: *only the local owner runs `groundHeightAt`/detection; observers trust the broadcast.*

**With physics, we keep exactly this:**

- Physics simulates **only the local player's** capsule. The output is still just a transform we drop into `AvatarStateMessage.position`. Remote avatars are **not** physics bodies on observers — they continue to render at broadcast `y` and interpolate (`AVATAR_INTERPOLATION_MS`).
- The server remains **non-authoritative** for movement. No server-side physics, no reconciliation, no rollback. (Anti-cheat is a non-goal for an educational sandbox.)
- We **extend** `AvatarStateMessage` additively so remote *animation* can reflect vertical state without re-simulating:
  - `AvatarMovementSchema` gains `"jumping"` and `"falling"` (back-compat: optional/defaulted; old clients ignore unknown values gracefully — verify the enum parse path).
  - Optionally a small `vy` (vertical velocity) hint for blending the fall/land animation. Pure cosmetic; never used to move a remote avatar.
- **Send rate unchanged** (`avatarSendHz`, default 12). A jump arc at 12 Hz interpolated over 120 ms reads fine for a third party (this is the same fidelity walking already has). We do **not** raise the rate for physics.

**Why this is safe:** the broadcast contract is still "here is where I am." Physics only changes *how the owner decides where it is*. Because no observer re-derives `y`, there is no new opportunity for two clients to disagree.

---

## 5. Architecture

### 5.1 Layering (preserve the pure/impure boundary)

```
┌─ packages/room-engine (PURE, deterministic, unit-tested) ─────────────────┐
│  • buildPhysicsWorldSpec(manifest, buildPieces, logicDoors): ColliderSpec[] │
│      reuses collectCollisionWalls + BuildSurfaceIndex (floors/ramps)        │
│  • resolvePhysicsTuning(defaults, skin, room): PhysicsTuning                │
│  • physicsWorldSpecCacheKey(...) — fingerprint for diffing (reuse pattern)  │
└────────────────────────────────────────────────────────────────────────────┘
                 │ ColliderSpec[] (plain serializable data)
                 ▼
┌─ apps/web/lib/physics/* (IMPURE, owns Rapier WASM) ───────────────────────┐
│  • PhysicsController: lazy-init Rapier world, build/refresh static          │
│    colliders from ColliderSpec[], one kinematic capsule + KCC,              │
│    fixed-timestep step(input, dt) → { position, grounded, vy, airborne }    │
└────────────────────────────────────────────────────────────────────────────┘
                 │ resolved transform
                 ▼
┌─ apps/web/lib/useAvatarMovement.ts (branch) ──────────────────────────────┐
│  if (physics.enabled) → drive via PhysicsController                         │
│  else                → current resolveWallCollisionsV2 + groundHeightAt     │
└────────────────────────────────────────────────────────────────────────────┘
```

The engine stays pure: it never imports Rapier. It produces **collider descriptors** (cuboid for walls/floors, a slope primitive or tri for ramps, the FFA perimeter as either a clamp kept in JS or a ring of segments). All Rapier statefulness is quarantined in `apps/web/lib/physics/`. This keeps `room-engine` tests fast and deterministic and lets us swap engines later without touching geometry math.

### 5.2 Collider mapping

| Source | Today | Rapier collider |
|---|---|---|
| `manifest.walls` (+ build walls) via `collectCollisionWalls` | `WallCollider` (segment + thickness + `baseY` + `height` + `passable`) | Fixed cuboid per non-passable wall, sized from span × thickness × height, positioned at `baseY` |
| Floors (`FloorTop`) from `BuildSurfaceIndex` | walkable top in `groundHeightAt` | Fixed cuboid (footprint × `BUILD_FLOOR_THICKNESS`) with top at `topY` |
| Ramps (`RampSurface`) | linear `rampHeightAt` | Fixed slope (rotated cuboid / convex wedge) matching `lowY`→`highY` along `climbAxis` |
| Logic doors (`collectLogicDoorColliders`) | conditional wall when closed | Cuboid present only when `node.open !== true` (swap on `room.logic.state.v1`) |
| FFA perimeter (`ffa-perim-*`, radial clamp + exit arc) | special clamp in `resolveWallCollisionsV2` | Keep the radial clamp in JS (apply to the post-step XZ) — cheaper and exact than approximating a circle with segments |
| Terrain base (`floorYFromZ` / `getBaseY`) | base candidate in `groundHeightAt` | A large ground cuboid/plane at the room's base Y so the capsule always lands |

### 5.3 Capsule + controller

- Capsule: radius `capsuleRadius` (default 0.4 = `WALL_AVATAR_RADIUS`), height `capsuleHeight` (default 1.6 = `AVATAR_STAND_HEIGHT`). Feet at `position.y`.
- `KinematicCharacterController` configured with `maxSlopeClimbAngle = maxSlopeClimbDeg`, `enableAutostep(autoStepHeight, …)`, `enableSnapToGround(snapToGroundDist)`. These replace `BUILD_STEP_UP_MAX` and the snap/walk modes of `groundHeightAt`.
- Each fixed step: build a **desired translation** = horizontal input (`moveSpeed`, world-transformed from camera yaw exactly as today) + vertical velocity integrated by gravity; `computeColliderMovement(...)`; read `computedMovement()` + `computedGrounded()`; reset `vy` to 0 on grounded, apply jump impulse on jump-and-(grounded||coyote).

### 5.4 Fixed timestep

Render fps varies; physics should not. The controller runs an **accumulator at a fixed dt** (e.g. 1/60s), consuming the variable rAF delta (already clamped to ≤ 0.05 s in the loop), and the rendered transform is the latest stepped result (optionally interpolated). This keeps jump height and fall feel identical at 30 fps and 144 fps.

### 5.5 Collider refresh / perf

Build pieces change at runtime. We **diff** the world spec using the same fingerprint trick `buildCollisionWallsCacheKey` already uses (`avatar-movement-collision.ts`): when the key is unchanged, reuse the Rapier colliders; when it changes, rebuild only the static set (the capsule + KCC persist). Door open/close is a targeted add/remove keyed on the logic node. Static colliders are cheap; the cost is the per-frame `computeColliderMovement` for one capsule, which is negligible.

---

## 6. Scope

### 6.1 In scope (v1)

- Rapier-driven **local-player** movement in **Free-for-All** rooms, behind `ENABLE_PHYSICS`.
- **Jump** (spacebar / on-screen button for touch), with coyote time and grounded gating.
- **Real fall** off ramp/floor/tower edges with gravity + terminal velocity (replaces snap-down).
- **Slopes / auto-step / ground-snap** via the controller.
- Three-layer tuning (env → world-skin → room) + pure resolver.
- World-skin **gravity/jump multipliers** (Mars moon-jump).
- Additive `AvatarMovementSchema` states (`jumping`, `falling`) for remote animation only.
- Clean **fallback**: flag off → byte-for-byte the current movement path.
- 2D analog handling (see §7).

### 6.2 Out of scope (v1)

- Physics in classroom / workforce-training / escape-room rooms (flag/feature-gate; FFA first).
- **Server-authoritative** physics, reconciliation, rollback, anti-cheat.
- Remote avatars as physics bodies (they render at broadcast `y`).
- Avatar-vs-avatar collision / pushing (capsule collides with world, not with other players).
- Physics on **room objects** / grabbed objects / projectiles (RoomObject stack untouched).
- Moving platforms, elevators, conveyor surfaces (post-v1; needs kinematic-platform carry).
- Ragdoll, IK, or animation-driven motion.
- Mobile-first tuning beyond a working jump button.

---

## 7. The 2D analog

The product requires a 2D top-down analog (`enable2DAnalog`). Gravity and jump have no meaning in a top-down projection, so:

- **3D view** uses the physics controller (jump, fall, slopes).
- **2D view** keeps the existing kinematic projection (`moveTo2DPoint`, `unprojectPointFrom2D`, surface `y` via `groundHeightAt("teleport")`). Jump is a no-op in 2D (or a tiny cosmetic hop). A 2D user's broadcast `y` continues to track the surface so their 3D-viewing peers see them at the right height.
- The branch is on `viewMode`, which `useAvatarMovement` already reads every frame. No mode is "second-class": 2D simply doesn't expose ballistic motion, the same way it doesn't expose free-look camera.

---

## 8. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Movement *feel* regresses (floaty/heavy, jump wrong) | High | High | Tunable everywhere; pick defaults from a feel pass; ship behind flag; keep old path as instant fallback |
| WASM init cost / bundle size on first FFA load | Med | Med | `compat` lazy async init; load only when physics-enabled FFA room mounts; show no hitch (init before spawn) |
| Owner-authoritative invariant accidentally broken | Med | High | Observers never simulate; only `position` broadcast; explicit test that remote `y` = broadcast `y` |
| Per-frame collider rebuild thrash on active builds | Med | Med | Diff via fingerprint (reuse `buildCollisionWallsCacheKey` pattern); rebuild statics only on key change |
| Tunnel through thin walls at high fall speed | Med | Med | Fixed timestep + CCD on the capsule; clamp `maxFallSpeed`; thickness ≥ step size |
| FFA perimeter (circle + exit arc) hard to model as colliders | Med | Low | Keep radial clamp in JS post-step (don't approximate circle with segments) |
| Jump lets players clip onto unintended ledges | Med | Med | Controller blocks on headroom; test "can't mount a level via jump unless intended" |
| Determinism tests in `room-engine` can't cover Rapier | Low | Low | Engine stays pure (spec + resolver tested); physics behavior covered by web integration/E2E, not unit determinism |
| Skin/room tuning produces unplayable values | Low | Med | Clamp every field in the schema; resolver re-clamps after multipliers |

---

## 9. Phasing (summary — see IMPL for detail)

0. **Vendor + flags + contracts** — add Rapier dep, `ENABLE_PHYSICS` env (api + web mirror), `PhysicsTuningSchema`, no behavior.
1. **Pure engine** — `buildPhysicsWorldSpec` (colliders from manifest/build/doors) + `resolvePhysicsTuning` + cache key, fully unit-tested.
2. **PhysicsController** — `apps/web/lib/physics/`: lazy Rapier world, static colliders, kinematic capsule + KCC, fixed-timestep `step()`. Gravity + ground only (**no jump**); walking off an edge falls.
3. **Wire into movement** — branch in `useAvatarMovement`; FFA + flag → physics path; parity for walk/collide; fallback identical when off.
4. **Jump** — spacebar + touch button, coyote time, grounded gating, air control; `AvatarMovementSchema` `jumping`/`falling` (additive).
5. **Tuning surfaces** — env vars wired through `config.ts` (api) + `CLIENT_TUNING` (web); `RoomSettings.physics`; `WorldSkinOverrides` gravity/jump multipliers (Mars).
6. **Polish + perf + 2D** — collider diff/refresh on build edits + door swap; 2D analog branch; remote fall/land animation from broadcast state.
7. **Validation** — feel pass, E2E (jump arc, fall off tower, Mars moon-jump, room override pins gravity), `.env.example` sync, docs.

---

## 10. Acceptance criteria (v1)

- In an FFA room with `ENABLE_PHYSICS=true`, pressing **space** produces a real jump arc and landing; walking off a built floor/ramp/tower **falls** with acceleration (no snap-teleport).
- Flipping `ENABLE_PHYSICS=false` (or in a non-FFA room) yields **exactly** today's surface-following movement.
- Setting `PHYSICS_GRAVITY` / `PHYSICS_JUMP_HEIGHT` env vars changes feel deployment-wide; a **world skin** can scale gravity (Mars moon-jump); a **room override** pins/disables physics regardless of skin/env.
- A second participant sees the jumper's arc/landing animate plausibly **without** re-simulating (they render broadcast `y`); two clients never disagree on the jumper's position.
- 2D-view users move as before; their broadcast `y` still tracks the surface.
- `room-engine` unit tests (spec + resolver) and a web E2E jump/fall spec are green; `npm run build` + API `tsc` clean.

---

## 11. Open questions

- **Default gravity/jump values** — pick after a feel pass; the schema defaults above are a starting point (`g=24`, `h=1.3`).
- **`vy` in the wire message** — include for nicer remote fall blending, or infer airborne purely from the `movement` enum to keep the message small? (Lean: enum-only in v1, add `vy` if animation looks flat.)
- **Coyote time + jump buffering** — include both, or coyote only for v1? (Lean: coyote only; buffering is polish.)
- **FFA central cube / exit-arc** — confirm the radial clamp composes cleanly with capsule output at the arc seam (test at the boundary).
- **Bundle strategy** — dynamic-import the physics module so non-physics builds don't pay the WASM cost at all.
