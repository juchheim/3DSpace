# Plan — World Building (Free-for-All Room Type)

Source room type: [`../PLAN_FREE_FOR_ALL_ROOM.md`](../PLAN_FREE_FOR_ALL_ROOM.md)
Implementation parent: [`../IMPL_FREE_FOR_ALL_ROOM.md`](../IMPL_FREE_FOR_ALL_ROOM.md)
Sibling FFA features: [`../PLAN_FREE_FOR_ALL_AI_3D_OBJECTS.md`](../PLAN_FREE_FOR_ALL_AI_3D_OBJECTS.md), [`../PLAN_FREE_FOR_ALL_LIVE_CAPTIONS.md`](../PLAN_FREE_FOR_ALL_LIVE_CAPTIONS.md)
Companion implementation doc: [`./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`](./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md)
Branch target: `feature/ffa-world-building` (additive feature; lands after FFA Phase 1)
Last updated: 2026-05-30

---

## 0. TL;DR — is this realistic?

**Yes — and the codebase is already ~70% of the way there for walls, ~40% for floors, and the floor/ramp _walkability_ is the one genuinely hard part.**

The room already has:

- A **persisted, realtime-synced, grab/edit/delete object system** (`RoomObject` + `room.object.*` realtime messages) that is the perfect template for build pieces — see [`useRoomObjects.ts`](../../../../../apps/web/lib/useRoomObjects.ts) and [`RoomObjectRealtimeMessageSchema`](../../../../../packages/contracts/src/index.ts).
- A **click-on-a-surface-to-place** UX precedent (dynamic wall boards) with a ghost preview, snapping, and realtime broadcast — see `DynamicBoardPlacementTargets` in [`RoomView3D.tsx`](../../../../../apps/web/components/RoomView3D.tsx) and [`useDynamicWallAnchors.ts`](../../../../../apps/web/lib/useDynamicWallAnchors.ts).
- A **wall collision resolver** that already eats line-segment walls with thickness and an avatar radius — see `resolveWallCollisions` in [`room-engine/src/index.ts`](../../../../../packages/room-engine/src/index.ts). User walls are "just more walls."
- A wide-open circular FFA arena (Ø 46 m hub + four 14×14 rooms, bounds ±43 m) with almost no furniture to fight for space — see `createFreeForAllManifest`.

The thing the engine does **not** have today is **verticality**. Movement is 2.5D: an avatar's `y` is a pure function of `z` via `floorYFromZ(manifest, z)` (tiered z-bands), with no gravity, no jump, and no concept of "standing on top of something." Walls have a `height` but movement never checks it. So **walls and the _impassable_ requirement are easy; walkable floors at arbitrary heights and ramps require a real (if small) movement-engine upgrade**: a ground-height query that depends on `x` AND `z` AND on the set of build pieces, plus step-up / step-down / fall handling.

This plan treats that upgrade as the spine of the feature and everything else as plumbing we already know how to build.

---

## 1. Overview

Add a **World Building** capability to Free-for-All rooms. Any participant can enter a lightweight **Build Mode** and place structural pieces — **walls, floors, and ramps** — that become part of the shared, persistent world. Pieces are **interactive**:

- **Walls** are impassable (avatars collide and slide along them, exactly like room walls today).
- **Floors** are walkable raised surfaces — you can stand and walk on top of them.
- **Ramps** are walkable inclined surfaces that carry an avatar smoothly between two heights.

Anything a participant builds, **any participant can destroy** (FFA's cooperative-cleanup norm, same as the AI-object and dynamic-board features). Build pieces persist with the room and are synced in realtime so everyone sees the same structure.

The interaction model is **deliberately Fortnite-like but simplified**: pick a piece type from a build bar, a translucent **ghost preview** snaps to a build grid in front of you, you rotate with a key, and a click commits it instantly. Switch to **Edit/Destroy** to delete pieces you (or anyone) placed.

### 1.1 Why Free-for-All only (for v1)

Same rationale as AI Meeting Notes and AI Objects: FFA is the open, equal-permissions sandbox where "anyone can place / anyone can remove" is already the norm and there are no minor-presence, moderation, or instructional-integrity concerns to design around first. The feature flag plumbing (`getRoomTypeFeatureFlags`) makes it trivial to extend to other room types later behind teacher gating.

### 1.2 Product goals

1. Any FFA participant can toggle Build Mode and place **walls, floors, and ramps** with a simple, fast, Fortnite-style ghost-and-click flow.
2. Placed pieces are **structurally real**: walls block movement; floors and ramps are walkable surfaces at non-zero height.
3. **Anything built can be destroyed** by anyone in the room, with a clear targeting + confirmation affordance.
4. Builds are **shared and persistent** — they sync in realtime and survive rejoin, like room objects.
5. The system is **griefing-resistant**: caps, no-build zones, and "destroy anything" keep a bad actor from permanently ruining a room.
6. Building feels **good on desktop first** (keyboard + mouse), with a usable touch fallback, reusing existing movement/HUD idioms.

### 1.3 Non-goals (Phase 1)

- **Curved / free-angle geometry.** v1 pieces are grid-snapped and rotate in 90° steps so they stay axis-aligned in world space (this lets us reuse the existing collision resolver — see §6.3). Arbitrary-angle walls are a fast-follow that needs a general circle-vs-segment resolver.
- **Gravity / jumping for avatars in general.** We add *surface support* (standing on floors, walking up ramps, dropping off ledges) but not free-fall platforming, double-jumps, or air control. Movement stays speed-clamped horizontal navigation; `y` follows the surface.
- **Destructible-health / harvesting economy** (Fortnite's "shoot the wall, it has HP"). v1 destruction is instant. Health/resources are an expansion idea (§8).
- **Per-piece materials, textures, or paint.** v1 pieces use a small fixed palette of solid-color/material presets. Painting reuses the world-skin texture stack later (§8).
- **Build pieces in classroom / workforce-training rooms.** Flag-gated to FFA.
- **Logic blocks / triggers / minigame scripting** (buttons, doors, teleporters). Expansion (§8).
- **Slopes that change walk speed, slipperiness, or physics props.** Ramps are purely kinematic height ramps in v1.
- **Mesh-level CSG / boolean ops, welding, or merging pieces into one collider.** Each piece is independent.

---

## 2. The build vocabulary (v1 piece kit)

Three piece types, each occupying one cell of a **build grid** (default cell = **2 m**, matching a comfortable doorway/wall span and keeping piece counts low). All dimensions are world meters.

| Piece | Shape | Footprint | Walkable? | Impassable? | Notes |
|---|---|---|---|---|---|
| **Wall** | Thin vertical slab | 2 m wide × `wallHeight` (default 3 m) tall × 0.2 m thick | No (it's a barrier) | **Yes** | Snaps to a cell *edge*; rotates to the 4 edges of a cell. Reuses `WallPlane` collision semantics. |
| **Floor** | Flat slab | 2 m × 2 m × 0.3 m thick | **Yes (top face)** | Sides act as a low step you walk up onto | Snaps to a cell *center* at a chosen height level (stacks in 1 m or `wallHeight` increments). |
| **Ramp** | Inclined slab (wedge) | 2 m × 2 m footprint, rises `rampRise` (default = one floor level) along one axis | **Yes (sloped top face)** | Underside/back is a wall-like barrier | Snaps to a cell center; rotation chooses which of 4 directions it climbs. |

Design rationale:

- **A 2 m cell** keeps the grid coarse enough that piece counts stay in the low hundreds even for ambitious builds (good for networking + collision cost), while still letting people make rooms, ramps, towers, and mazes that an avatar (radius 0.4 m, ~1.7 m tall) can navigate.
- **Walls snap to cell edges; floors/ramps snap to cell centers.** This is the core Fortnite insight: walls live "between" cells, floors live "on" cells. It makes structures line up automatically and makes the ghost preview unambiguous.
- **Height levels are quantized** (default level height = 3 m to match wall height, with floors also placeable at 1 m sub-steps for terracing). Quantized heights make the ground-height query cheap and make ramps connect cleanly from level *N* to level *N+1*.

---

## 3. How a participant builds (UX)

### 3.1 Entering Build Mode

A **Build** toggle joins the existing HUD rail (next to the Room Objects / AI Object cards in [`RoomClient.tsx`](../../../../../apps/web/components/RoomClient.tsx)). Toggling it on:

- Shows a bottom-center **Build Bar** (idiom: the existing `MediaControls` / `LiveCaptionsDock` bottom dock) with three piece buttons — **Wall (1)**, **Floor (2)**, **Ramp (3)** — plus an **Edit/Destroy (4)** tool and a piece-material swatch.
- Overlays the **build grid** near the avatar (a subtle projected grid, like the existing `gridHelper` but local and brighter) so the snapping is legible.
- Switches the cursor/reticle to a **ghost preview** of the selected piece.

Build Mode is a *local* UI state — it does not change your avatar to anyone else; others just see pieces appear/disappear.

### 3.2 Placing a piece (the core loop)

This mirrors `DynamicBoardPlacementTargets` (raycast → preview → click commits) but targets the ground/structure instead of walls:

1. **Aim.** A raycast from the camera through the cursor (desktop) or from the avatar's facing (touch) hits the floor or the top face of an existing piece. We compute the **target cell** and **height level** under the hit point.
2. **Ghost.** A translucent preview of the selected piece renders snapped to that cell/edge/level (green = placeable, red = blocked). For walls, the preview snaps to the nearest of the cell's 4 edges based on hit position; for ramps, the current rotation determines climb direction.
3. **Rotate.** `R` (or a Build Bar rotate button / two-finger tap) rotates the ghost 90°. Walls cycle edges; floors are rotation-invariant; ramps cycle climb direction.
4. **Commit.** Left-click (or tap) places the piece. It appears instantly (optimistic) and is broadcast to everyone. Holding the button and dragging **paints a row** of pieces (rate-limited) for fast wall runs and floors — a key Fortnite-speed affordance.
5. **Validity.** A placement is rejected (red ghost, no-op on click) if it: overlaps an existing piece of the same slot, lands in a **no-build zone** (§7.2), exceeds the **per-room or per-user cap**, or exceeds the **max build height**.

Placement is **forgiving, not precise** — the whole point of the grid is that you don't have to be accurate. You stand roughly where you want the structure and the grid does the aligning.

### 3.3 Building up (verticality)

- Placing a **floor** while aiming at the top edge of an existing wall/floor snaps it to the **next height level**, so you can build a second story by walling, flooring on top, and ramping up — the canonical Fortnite "1×1 with a ramp."
- **Ramps** auto-target the level transition: aim at a floor edge and the ramp ghost spans from that level up to the next, giving the avatar a walkable climb.
- You can only place where a raycast can reach, so you build outward/upward from where you stand — no placing pieces across the map.

### 3.4 Destroying

- Selecting **Edit/Destroy** turns the reticle into a **highlighter**: hovering any build piece outlines it (and dims non-pieces). Click/tap removes it instantly with a small "poof" and a broadcast remove.
- **Anyone can destroy any piece** (FFA norm). The piece's creator is shown on hover (like AI-object history) for social accountability, not as a permission gate. (A room setting can flip this to owner-only / teacher-only later — see §7.3.)
- A **box-select destroy** (drag a rectangle on the ground) clears a region quickly — important for cleanup and for recovering from grief.

### 3.5 Touch / mobile

Reuses the existing `MovementPad` + tap idiom. Build Mode on mobile:

- Tap a piece button, then tap the ground/structure to place at the highlighted cell in front of the avatar (no free cursor; the target cell is always "just ahead," which is good enough for the grid).
- A floating **Rotate** and **Destroy** button replace keyboard shortcuts.

Mobile building is intentionally lower-precision; desktop is the primary build surface (consistent with the room-objects toolbar today).

---

## 4. How it works under the hood (conceptual model)

### 4.1 Build pieces are a new persisted entity (sibling of RoomObject)

We introduce a `BuildPiece` entity rather than overloading `RoomObject`, because build pieces are **structural and grid-quantized** (cell coordinates, level, rotation enum) and **collidable**, whereas `RoomObject`s are free-pose, scalable, grabbable, non-colliding manipulatives. They share almost all of the *plumbing*, though:

- **Persistence:** a new Mongoose model + repository methods mirroring `roomObject*` (see [`repository.ts`](../../../../../apps/api/src/repository.ts) and [`models/mongoose.ts`](../../../../../apps/api/src/models/mongoose.ts)).
- **Realtime:** a new `room.build.*` discriminated-union message family mirroring `room.object.*`, carried on the same LiveKit data channel via [`realtime.ts`](../../../../../apps/web/lib/realtime.ts). Placement/removal are **reliable** messages; the optimistic local apply + server-authoritative echo pattern is copied verbatim from `useRoomObjects`.
- **REST:** `GET/POST/DELETE /v1/rooms/:roomId/build-pieces` plus a bulk `GET` for initial load, mirroring the room-objects routes.

A `BuildPiece` is compact:

```
BuildPiece {
  id, roomId,
  kind: "wall" | "floor" | "ramp",
  cell: { ix: int, iz: int },     // integer grid coordinates
  level: int,                      // height level (0 = ground)
  edge?: "n" | "e" | "s" | "w",    // walls only: which cell edge
  rotation: 0 | 90 | 180 | 270,    // ramps: climb direction; floors: ignored
  materialId: string,              // small fixed palette in v1
  createdByUserId, createdAt
}
```

Integer cell/level coordinates (not floats) make placement **idempotent and conflict-free**: two people placing "the wall on the north edge of cell (3,5) at level 1" resolve to the same identity, so we can dedupe and last-write-wins without drift. World-space geometry is *derived* from `cell/level/edge/rotation` at render and collision time.

### 4.2 Derived geometry

A pure function `buildPieceToGeometry(piece, grid)` turns a piece into:

- a **render transform** (position, rotation, the right mesh: slab / wedge), and
- one or more **colliders**:
  - **Wall** → a `WallPlane`-shaped segment (start/end/height/thickness) with a **base elevation** = `level * levelHeight`. (We extend `WallPlane` reasoning to carry a base `y`; see §6.)
  - **Floor** → an **axis-aligned box** with a top face at `topY = level*levelHeight + floorThickness`, used by the ground-height query.
  - **Ramp** → an **inclined quad** with a low edge at level *N* and high edge at level *N+1*, plus a back/underside barrier collider.

Because v1 pieces are grid-snapped and 90°-rotated, **every collider is axis-aligned in world space**, which is exactly what the existing resolver and a simple ground-height query can handle efficiently.

### 4.3 The two engine queries

All of "walls block, floors/ramps carry you" reduces to two pure functions the movement loop calls each frame:

1. **`resolveWallCollisions(old, new, walls)`** — *already exists.* We extend it (or wrap it) so user wall colliders and ramp-back barriers are included, and so a wall only blocks when the avatar's **standing height overlaps the wall's vertical span** `[baseY, baseY+height]` (so you can walk on a floor *over* a lower wall, and under a raised walkway). Today walls are infinitely tall in the resolver because movement has no height; we make the check height-aware.

2. **`groundHeightAt(x, z, pieces, manifest)`** — *new.* Returns the **walkable surface height** the avatar should stand at for a given XZ, considering:
   - the base manifest floor/tiers (`floorYFromZ`),
   - the top faces of floor boxes whose footprint contains (x,z),
   - the interpolated top of any ramp whose footprint contains (x,z),
   - **step logic:** the avatar snaps up to a surface only if it's within `stepUpMax` (≈0.6 m) of current height; higher surfaces are treated as walls (you bump into the side). Surfaces below current footing make you **descend** (instant in v1, or a quick fall with the optional gravity in §6.4).

The movement loop becomes: compute candidate XZ → resolve wall collisions (height-aware) → set `y = groundHeightAt(x, z, …)`. That's the whole feature, kinematically.

---

## 5. Where this plugs into the current architecture

| Concern | Today | With world building |
|---|---|---|
| Render scene | `RoomView3D.tsx` renders floor, tiers, `WallMesh` per `manifest.walls`, `RoomObjectsLayer` | + a `BuildLayer` rendering build-piece meshes + the ghost/grid overlay |
| Movement | `useAvatarMovement.ts` rAF loop: XZ + `floorYFromZ` + `resolveWallCollisions` | + height-aware wall resolve + `groundHeightAt` for `y` |
| Collision/floor math | `room-engine/src/index.ts` | + `buildPieceToGeometry`, `groundHeightAt`, height-aware wall resolve (engine is the right home: pure, shared, tested) |
| Persisted state | `RoomObject` model/repo/routes; `DynamicWallAnchor` | + `BuildPiece` model/repo/routes (clone of room-objects) |
| Realtime | `room.object.*`, `room.board.*` over LiveKit data channel | + `room.build.*` family |
| Client state | `useRoomObjects`, `useDynamicWallAnchors` | + `useBuildPieces` (clone of `useRoomObjects`) |
| Feature gating | `getRoomTypeFeatureFlags` + `CLIENT_TUNING` + `config.tuning.enableFreeForAll*` | + `building` flag in each layer |
| 2D view | `RoomView2D.tsx` projects avatars/anchors | + build pieces as top-down footprints |

Crucially, **no change to the persisted room manifest.** Build pieces are a separate layer that the *client* merges with `manifest.walls`/tiers at runtime for collision and rendering. This keeps the room template clean, keeps "reset the room" trivial (delete build pieces, manifest untouched), and avoids manifest-versioning headaches.

---

## 6. The hard part: verticality in a 2.5D engine

This is the section to read twice. Everything else is a known pattern; this is the actual engineering.

### 6.1 What "2.5D" means here today

In [`useAvatarMovement.ts`](../../../../../apps/web/lib/useAvatarMovement.ts), each frame:

```
rawNext = clampPositionToBounds(manifest, current + moveDir * speed * dt)   // y := floorYFromZ(z)
resolved = resolveWallCollisions(current, rawNext, manifest.walls)          // XZ only
nextPosition = { x: resolved.x, y: rawNext.y, z: resolved.z }
```

`y` is never integrated; it's a lookup from `z`. Walls have `height` but it's **unused by movement** (only used for rendering and for wall-object line-of-sight). There is no jump, no gravity, no "on top of."

### 6.2 The minimal upgrade: surface-follow, not physics

We do **not** add a physics engine. We add **surface following**:

- The avatar always stands exactly on the highest *supported* walkable surface under it (`groundHeightAt`).
- "Supported" gates on `stepUpMax`: you can walk **up** a lip ≤ ~0.6 m for free (so floor slabs and the foot of a ramp are walk-on-able), but a full wall-height step reads as a barrier, not a staircase.
- Walking off an edge **descends** to the next surface. v1 default: **snap down immediately** (cheap, predictable, slightly "floaty"). Optional polish (§6.4): a short eased fall so stepping off a tower looks like a drop, not a teleport.

This gives correct, legible behavior for floors and ramps with a few dozen lines of pure math and zero new dependencies.

### 6.3 Why grid-snapped + 90° rotation matters for collision

The existing `resolveWallCollisions` classifies each wall as "along X" or "along Z" by dominant span and resolves per-axis (with a special radial clamp for the FFA circular perimeter). It is **not** a general oriented-box resolver — a 45° user wall would collide as if axis-aligned and feel wrong.

**v1 sidesteps this entirely** by constraining build walls to cell edges with 90° rotation → every build wall is axis-aligned in world space → the existing resolver handles them as-is (we just feed it the union of `manifest.walls` + build walls, filtered by height span). This is the single most important scoping decision in the plan: **it makes "walls are impassable" almost free.** Arbitrary angles become a real project (general capsule-vs-OBB) and are explicitly deferred (§1.3, §8).

### 6.4 Optional: light gravity for "fall off the tower"

If snap-down feels bad in playtest, add a tiny vertical integrator *only when the avatar is above its ground height*:

```
if (current.y > groundHeightAt(x,z) + epsilon) vy -= g*dt; y += vy*dt;  // clamp to ground
else { vy = 0; y = groundHeightAt(x,z); }
```

This is still not "jumping" (no upward impulse), just graceful descent. It's isolated enough to ship behind a constant and tune. Adding an actual **jump** later (spacebar → upward `vy`) becomes a one-line follow-up once this exists — and unlocks parkour (see §8).

### 6.5 Camera interaction

The third-person camera (`useThirdPersonCamera.ts`) orbits the avatar. Built walls can clip the camera or hide the avatar behind a wall. v1: accept minor clipping (same as today's room walls in tight spaces) and raise the camera pivot with the avatar's `y`. A camera-collision pass (pull the camera in when a build wall is between it and the avatar) is a known follow-up, not a v1 blocker.

---

## 7. Gotchas & unexpected consequences

These are the things that will bite if not designed for. Most have cheap mitigations; a couple are genuinely subtle.

### 7.1 Trapping people / griefing by enclosure
**Risk:** Someone walls another avatar into a 1×1 box, or walls off the hub exits, or builds a roof over the spawn. Because walls are truly impassable, a trapped user has no recourse except… destroying the walls.
**Mitigations:**
- **Anyone can destroy anything** (the core escape hatch — a trapped user can always tear down the wall on them).
- **No-build zones** (see 7.2): spawns, hub exits/halls, and the four static boards can't be blocked.
- **A "Reset my area / Clear all builds" affordance** (room-level, any participant) and a per-piece cap so a single actor can't blanket the map.
- **Self-unstick:** if an avatar is ever detected fully enclosed with no walkable exit (rare), offer a "return to spawn" button (we already have spawn-selection logic in `selectSpawnPoint`).

### 7.2 No-build zones (must-haves)
Building must be forbidden in/over:
- **Spawn points** (`manifest.spawnPoints`) + a small radius — never trap a joiner.
- **Hub exits & halls** (the FFA perimeter gaps and the four 6 m halls) — never sever the room into disconnected islands. The FFA geometry already special-cases these arcs in `resolveWallCollisions`; the no-build mask reuses the same exit-arc math.
- **The four static boards** (`ffa-adj-*-anchor`) and any dynamic boards — don't let builds occlude shared screens.
- Optionally a **central hub keep-out** so the social core stays open.
These are expressed as a `isBuildAllowedAt(cell, level)` predicate in the engine, shared by client (ghost turns red) and server (authoritative reject).

### 7.3 "Who can destroy" tension
FFA norm is "anyone." But anyone-destroys means anyone can also nuke a build someone spent 10 minutes on. v1 ships **anyone-can-destroy** (matches AI objects / boards and gives the anti-grief escape hatch), with creator attribution on hover. We design the permission as a **room setting** (`buildDestroyPolicy: anyone | owner-or-teacher`) so it's one enum to flip, not a rewrite, if playtests want protection.

### 7.4 Collision resolver assumptions
`resolveWallCollisions` resolves axis-by-axis and has a **special radial clamp keyed on wall ids starting `ffa-perim-`**. Two consequences:
- Build walls must **not** use that id prefix (they'd accidentally trigger the radial clamp). Namespace them `build:` .
- Per-axis resolution can let an avatar squeeze through the exact corner where two build walls meet at 90°. The existing engine already lives with this for room corners; with thickness 0.2 m and radius 0.4 m it's minor. If it shows up, a corner-overlap nudge is a localized fix.

### 7.5 Height-aware walls change existing behavior
Making walls block only within `[baseY, baseY+height]` is required for floors-over-walls, but the **existing room walls are full-height** and movement currently ignores height entirely. We must make room walls' effective span `[0, height]` and ensure the avatar's standing height (`y + ~0.9 m torso`) is what we test, so nothing about ground-level navigation changes. This needs a focused regression test against the existing FFA/classroom collision behavior.

### 7.6 Ground-height query cost & determinism
`groundHeightAt` is O(pieces) per frame. At a few hundred pieces × 60 fps it's fine, but:
- Build a **uniform-grid spatial index** keyed by cell so the query is O(1) (only check pieces in the avatar's cell and neighbors). Cheap because everything is already grid-quantized.
- The query must be **deterministic and identical on every client** (no per-client tie-breaks), or two clients will disagree on whether you're standing on a floor. Quantized integer coordinates make this automatic.

### 7.7 Spawn & respawn onto/into builds
A late joiner might spawn where someone has since built a floor or wall. Resolve spawn `y` through `groundHeightAt` (stand on top if there's a floor) and nudge XZ out of any wall via the resolver. Don't spawn *inside* a sealed box — prefer an unbuilt spawn point (we already iterate spawn candidates in `selectSpawnPoint`).

### 7.8 2D view parity
`RoomView2D.tsx` is a real, supported view. Build pieces need a top-down footprint representation (walls as lines, floors as squares, ramps as arrows) or the 2D players are blind to structures. Movement is shared, so a 2D player *will* still collide with walls and ride floors — they just won't see them unless we draw them. This is scoped work, not optional.

### 7.9 Networking burst on fast building
Drag-to-paint a wall run = many placements/second. Mitigate: client-side rate-limit placement to ~10/s, **coalesce** drag placements into a single `room.build.batch.v1` upsert, and keep per-piece messages reliable. Initial room load uses the bulk REST fetch, not a replay of every message.

### 7.10 Persistence volume & lifecycle
Hundreds of tiny docs per room. Index by `roomId`; bulk-load on join; cap per room (e.g., 1,000 pieces). Define lifecycle: do builds persist forever, or get reaped like AI objects (there's a `retention-reaper` precedent)? v1: persist with the room, add a manual "Clear all builds," and a config'd optional TTL.

### 7.11 Interaction with world skins, AI objects, and boards
- **World skins** repaint floors/walls; build pieces have their own materials and should read fine over any skin, but the ghost's green/red must stay legible on busy skins (use emissive outline, not just tint).
- **AI objects / room objects** don't collide today and still won't — they can clip into build walls. Acceptable for v1 (objects are decorative); note it.
- **Dynamic boards** are placed on `manifest.walls` only; building doesn't add board-able surfaces in v1 (boards-on-build-walls is an expansion).

### 7.12 The "infinite staircase to the sky" / out-of-bounds
Cap **max build level** (e.g., 6 levels ≈ 18 m, under the 8–12 m wall height… so cap at a sensible 3–4 levels or raise the skybox). Clamp builds to `manifest.bounds`. Without a height cap, people will build to the ceiling and beyond and the camera/lighting will look broken.

---

## 8. Expansion ideas (after v1)

Ordered roughly by leverage. Several are novel for an in-browser social-3D product; none are required.

**Build-system depth**
1. **Free-angle & micro-grid pieces** — unlock arbitrary rotation + a finer 0.5 m grid once a general circle-vs-OBB resolver lands. Turns "blocky forts" into real architecture.
2. **More piece kit** — half-walls, windows/doorways (walls with a passable gap), pyramids/roofs, pillars, fences, stairs (pre-stepped ramps), cones. Each is just another `buildPieceToGeometry` + collider.
3. **Prefabs / blueprints** — select a cluster of pieces, save it as a named **stamp**, and re-place the whole thing in one click. Community prefabs could ride the existing world-skin asset/catalog pipeline (`packages/world-skins`).
4. **Paint & materials** — per-face textures/colors reusing the world-skin material override stack (`WorldSkinMaterialOverrideSchema`). "Decorate mode."
5. **Health & harvesting economy (Fortnite-classic)** — pieces have HP and a build cost; you gather "materials" from nodes around the map; destruction takes time/hits. Converts building from sandbox to game loop.

**Movement & play**
6. **Jump + parkour** — once §6.4's vertical integrator exists, add a jump impulse. Instantly unlocks **obstacle courses / parkour maps**, which build pieces are perfect for. Tie difficulty into the existing low-gravity skin multiplier (`walkSpeedMultiplier` / Mars skin) for moon-jump courses.
7. **Jump pads / bounce / launch pieces & gravity zones** — special pieces that set vertical velocity or local gravity. Reuses the skin gravity hooks already in the engine.
8. **Moving platforms / elevators & doors** — pieces that animate on a timer or trigger; the first "logic" piece.

**Logic & game modes (the big swing)**
9. **Trigger blocks (visual scripting-lite)** — buttons, pressure plates, zones → emit events; doors/platforms/teleporters → consume them. Lets participants build **escape rooms, mazes with switches, and minigames** with zero code. This is the path from "build a fort" to "build a game," and it's genuinely novel in this product space.
10. **Built-in game modes layered on builds** — King-of-the-Hill on the tallest floor, capture-the-flag with built bases, "the floor is lava" (destructible/disappearing floors), timed build-battles (two teams race to build/destroy). Most of these need only a scoring overlay on top of the build + movement systems.
11. **AI-assisted building** — describe a structure ("a small castle with four towers and a gate") and have the AI emit a `BuildPiece` layout, reusing the FFA AI-object prompt→spec pipeline (`apps/api/src/ai-objects`). "Procedural world prompt." Pairs beautifully with prefabs.

**Persistence & sharing**
12. **Named saves / versioned worlds** — snapshot a room's build, branch it, restore it (the manifest-version machinery is a template). "Worlds" you can revisit.
13. **Shareable build links / spectator snapshots** — export a build as a viewable/forkable link, like sharing a doc. Drives virality.
14. **Per-region ownership / plots** — claimable build plots so collaborative servers don't devolve into overwrite wars (an alternative to global anyone-destroys).

---

## 9. Recommended v1 cut (what actually ships first)

To de-risk, ship the smallest thing that proves the hard part works:

**Milestone A — "Walls that block" (proves collision plumbing):**
Wall piece only, ground level only, place + destroy, persisted + realtime, no-build zones, caps. *No verticality* — walls are full-height barriers. This reuses the existing resolver almost untouched and validates the whole `BuildPiece` stack end-to-end.

**Milestone B — "Floors you can stand on" (proves verticality):**
Add floor piece + the `groundHeightAt` query + height-aware walls + step-up. This is the real engine work; do it once walls are proven.

**Milestone C — "Ramps" (completes the kit):**
Add ramp piece + inclined ground-height interpolation. Then polish: ghost UX, drag-paint, 2D footprints, optional eased fall.

Each milestone is independently demoable and testable. See the companion [`IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`](./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md) for the phased build, contracts, and files-to-touch.

---

## 10. Open questions (carried into IMPL)

1. **Grid/level sizes** — 2 m cell and 3 m level are proposed defaults; confirm against avatar scale and the FFA hub dimensions during prototyping.
2. **Snap-down vs eased fall** for stepping off ledges — ship snap-down, revisit after playtest (§6.4).
3. **Destroy policy default** — anyone (proposed) vs owner-or-teacher; ship anyone, keep the enum (§7.3).
4. **Persistence lifecycle** — permanent vs TTL-reaped; ship permanent + manual clear (§7.10).
5. **Camera collision** against build walls — defer or include a basic pull-in? (Proposed: defer.)
6. **Max pieces / max level** exact numbers — pick conservative caps, expose as config.
