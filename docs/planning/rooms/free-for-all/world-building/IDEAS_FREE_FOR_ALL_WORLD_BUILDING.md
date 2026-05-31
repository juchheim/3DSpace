# Ideas — Improving & Expanding World Building (Free-for-All)

Parent plan: [`./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md`](./PLAN_FREE_FOR_ALL_WORLD_BUILDING.md) (see its §8 for the original short expansion list)
Parent impl: [`./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md`](./IMPL_FREE_FOR_ALL_WORLD_BUILDING.md)
Shipped expansion: [`./PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md`](./PLAN_FREE_FOR_ALL_BOARDS_ON_BUILD_WALLS.md)
Competitive context: [`../FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](../FRAME_FEATURE_PARITY_GAP_ANALYSIS.md)
Escape-room roadmap (→ §6.1): [`./ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md`](./ROADMAP_ESCAPE_ROOMS_TO_TRIGGER_BLOCKS.md)
Last updated: 2026-05-31

---

## 0. How to read this doc

This is a **brainstorm + roadmap**, not a committed plan. It does two jobs the original PLAN §8 bullet list did not:

1. **Improve** — harden and polish the *shipped* v1 (`wall` / `floor` / `ramp`), so it feels good before we pile on scope.
2. **Expand** — grow the vocabulary, the construction tools, and the play layer, in waves that each reuse the existing architecture.

Every idea is tagged so you can triage fast:

- **Effort:** `S` (hours–1 day) · `M` (a few days) · `L` (1–2 weeks) · `XL` (a real project)
- **Impact:** `low` / `med` / `high` (player-facing leverage)
- **Builds on:** the existing symbols it extends, so nobody re-invents plumbing
- **New?** whether it's genuinely new here or a fleshed-out version of a PLAN §8 bullet

The load-bearing architectural facts that make most of this cheap (confirmed in code):

- A build piece is **pure data** (`BuildPiece`: `kind/cell/level/edge/rotation/materialId`) with a **deterministic slot id**; all geometry is *derived* by `buildPieceColliders(piece)` in [`packages/room-engine/src/build.ts`](../../../../../packages/room-engine/src/build.ts). New piece *behavior* = a new branch in that one pure function.
- Movement is **surface-following, not physics**: `resolveWallCollisionsV2` (height-aware walls) + `groundHeightAt` (walkable `y`) in [`packages/room-engine/src/ground-height.ts`](../../../../../packages/room-engine/src/ground-height.ts), fed via refs in [`apps/web/lib/useAvatarMovement.ts`](../../../../../apps/web/lib/useAvatarMovement.ts). `groundHeightAt` already uses a cell-keyed `BuildSurfaceIndex` and already supports a `"teleport"` mode; eased-fall scaffolding (`BUILD_ENABLE_EASED_FALL`, `BUILD_FALL_GRAVITY`) exists but is **off**.
- Persistence/realtime/REST mirror the room-objects stack: `useBuildPieces`, `room.build.*` messages, `/v1/rooms/:roomId/build-pieces`. A new piece kind that fits the existing schema needs **zero** new persistence.
- Placement validity is one shared predicate `isBuildAllowedAt(manifest, piece)` used by client ghost *and* server. New no-build rules go in one place.

So the rule of thumb: **a new piece that is grid-snapped, axis-aligned, and either "blocks" or "carries"** is almost free. Anything that needs *free angles*, *per-frame state*, or *cross-piece logic* is where the real cost lives — flagged below.

---

## 1. Where v1 stands today (grounded recap)

Shipped (per [`.cursor/memory.md`](../../../../../.cursor/memory.md) and the IMPL validation checklist):

- Piece kit: `wall` (impassable, height-aware), `floor` (walkable top), `ramp` (walkable 45° wedge, no barriers).
- Place / destroy / clear-all, persisted + realtime, optimistic + server echo.
- No-build zones (spawn / hall / exit / board fronts) + per-room/per-user caps.
- Verticality via `groundHeightAt` + `resolveWallCollisionsV2`; observers render remote `y` from broadcast (no client disagreement).
- Boards-on-build-walls (multi-cell board runs via `mergeAdjacentBuildWallSegments`).
- 2D footprint rendering; render is per-piece `BuildPieceMesh`.

Known soft spots called out in the plan but not yet addressed: per-axis **corner squeeze** (§7.4), **camera clipping** through build walls (§6.5), **no undo**, **no instancing** for render, build authoring is **3D-only** and **desktop-first**.

---

## 2. Improve what shipped (do some of this before expanding)

These raise the floor on the current kit. Several are cheap and disproportionately improve "feel."

### 2.1 Instanced rendering for build meshes — `S`–`M`, impact: med · New
Today `BuildLayer` renders one `BuildPieceMesh` (mesh + `Edges`) per piece. At the 1,000-piece cap that's 1,000+ draw calls. Group pieces by `(kind, materialId)` into `InstancedMesh` batches; keep a thin per-piece interactive proxy only for the destroy/hover raycast (or raycast the instanced mesh and read `instanceId`). Walls/floors are uniform boxes — ideal for instancing; ramps share one `BufferGeometry`.
- **Builds on:** `BuildPieceMesh`, `buildPieceColliders`. **Risk:** hover/destroy highlight needs per-instance color; ghost stays a normal mesh.

### 2.2 Camera collision against build walls — `M`, impact: med · New (was deferred §6.5)
`useThirdPersonCamera` already follows avatar `y`, but a built wall between camera and avatar hides the avatar. Add a pull-in: raycast camera→pivot against `collectCollisionWalls(...)` and shorten the boom on a hit. Reuses the exact wall set movement already computes.
- **Builds on:** `collectCollisionWalls`, `useThirdPersonCamera`. **Risk:** jitter near thin walls — clamp min boom + smooth.

### 2.3 Corner-squeeze nudge — `S`, impact: low · New (was §7.4)
Per-axis resolution lets an avatar slip the exact 90° corner where two build walls meet. Add a localized corner-overlap nudge in `resolveWallCollisionsV2` when both axes report a near-touch. Low priority unless playtests show it.

### 2.4 Undo / redo + soft-delete destroy — `M`, impact: high · New
The single biggest confidence and anti-grief win. Keep a **per-user local action stack** (place/destroy/batch). `Ctrl/Cmd-Z` re-issues the inverse op optimistically (destroy → re-place same deterministic id; place → destroy). Because ids are deterministic and "anyone can destroy," undo is just "issue the opposite request." Pair with a short **server-side soft-delete grace** (tombstone a destroyed piece for ~10s) so an accidental nuke of someone's build is recoverable, not gone.
- **Builds on:** `useBuildPieces.actions`, deterministic `buildPieceStableId`. **Risk:** undo of a slot another user re-took → conflict; resolve as "undo no-ops if slot changed owner."

### 2.5 Build onboarding & discoverability — `S`, impact: med · New
First time Build Mode opens: a one-card coachmark ("1 Wall · 2 Floor · 3 Ramp · 4 Destroy · R rotate · drag to paint"). Empty-room hint. Most users won't find drag-paint or rotate without it.
- **Builds on:** `BuildControls`, `useBuildMode`.

### 2.6 Turn on eased fall, then add jump — `S` then `M`, impact: med · Refines PLAN §6.4
The descent integrator is already coded behind `BUILD_ENABLE_EASED_FALL=false`. Flip it on behind a constant/flag and tune `BUILD_FALL_GRAVITY` so stepping off a tower reads as a drop, not a teleport. **Jump** is then a one-line upward `vy` impulse on spacebar — and it unlocks the entire play layer in §5/§6 (parkour). Ship eased-fall first (pure polish), gate jump behind a flag because it changes movement feel everywhere.
- **Builds on:** `useAvatarMovement`, `groundHeightAt("walk")`, existing fall constants. **Risk:** jump interacts with height-aware walls — test you can't clip onto a ledge mid-jump unless intended.

### 2.7 Ghost & snapping legibility — `S`, impact: med · Refines PLAN §7.11
Ghost already uses green/red `Edges`. Add: a snap "tick" sound/flash on cell change, a faint **projected footprint** on the target cell, and ensure the emissive outline survives a future "skins in FFA" flip (currently FFA skins are off). Show the rejection **reason** from `isBuildAllowedAt` as a tiny tooltip ("spawn keep-out", "level cap").
- **Builds on:** `BuildPlacementController`, `isBuildAllowedAt` reasons.

### 2.8 2D-view build authoring — `M`, impact: med · New (rendering exists; placement doesn't)
2D already *draws* footprints, but you can't *place* from 2D. Add a top-down placement mode: tap a cell to place the selected piece at the avatar's current level. Important for the "required 2D analog" product promise — 2D users are currently second-class builders.
- **Builds on:** `RoomView2D`, `useBuildPieces.actions`, `worldToCell`.

### 2.9 Mobile build parity — `M`, impact: med · Refines PLAN §3.5
Place-ahead targeting via `MovementPad` facing, floating rotate/destroy buttons, larger tap targets. Make mobile a usable (if lower-precision) build surface.

### 2.10 Telemetry + lightweight moderation — `S`, impact: med · Refines IMPL Phase 10
Log build/destroy/clear to `routes/room-events.ts` (already planned). Add a per-user "recent build activity" view so a teacher/owner can spot a griefer and use clear-all or a future region wipe. Cheap, and a prerequisite for trusting bigger sandboxes.

---

## 3. Expand the piece kit (more building vocabulary)

Each is "another branch in `buildPieceColliders` + a mesh in `BuildPieceMesh` + a schema enum value." Grouped by how much engine work they need.

### 3.1 Free additions — fit existing collider/surface model exactly — `S`–`M` each, impact: high (collectively)
- **Half-wall / railing** (1 m tall): a `wall` collider with reduced `height`; reads as cover/fence, walkable over from a raised floor. New?: yes.
- **Window / doorway wall** (passable gap): a wall with a hole — model as **two stacked colliders** (lintel above, sill below) leaving a passable mid-band, or a `passable`-tagged variant the height-aware resolver already understands. Directly enables real rooms you can walk into. New?: §8 bullet, fleshed out.
- **Pillar / post**: a thin full-height box collider at a cell *corner* (new canonical slot: corner instead of edge). Structural + decorative.
- **Fence / low barrier**: half-wall variant on edges; cosmetic + soft boundary.
- **Pyramid / roof / gable**: a non-walkable visual cap that sits on top of a level; collider optional (decorative) or a sloped non-walkable surface. Closes off towers so builds look finished.
- **Stairs (pre-stepped ramp)**: visually a staircase, but its `groundHeightAt` is the *same linear interpolation as a ramp* — zero new movement math, nicer aesthetics. New?: §8 bullet, fleshed out.
- **Diagonal/corner ramp** (climbs along a cell diagonal): needs a 2-axis interpolation in `rampHeightAt` but stays grid-snapped; medium.

All of these reuse: deterministic slot ids (extend `flatSlotId`/edge ids, add a corner id family), `isBuildAllowedAt`, persistence, realtime — untouched.

### 3.2 Glass / window walls (block movement, not sight) — `S`, impact: med · New
The `glass` material already renders transparent. A `glass` wall is just a normal wall collider with a transparent material — instant "windows" and greenhouses. Optional follow-up: a *passable* glass pane (decoration only) for water tank / display cases.
- **Builds on:** existing `BuildPieceMaterial` palette, wall collider.

### 3.3 Light & emissive pieces — `S`–`M`, impact: med · New
The `neon` material is emissive but adds no actual light. Add **placeable light pieces** (torch, lamp, glow-cube) that drop a real (budgeted) point/spot light. Cap the number of dynamic lights hard (perf) — e.g., nearest-N to camera. Huge for mood + making interiors usable at night/in dark skins.
- **Builds on:** scene lighting, `buildMaterials`. **Risk:** light count is a perf cliff — enforce a strict cap and falloff.

### 3.4 Per-face paint & materials ("Decorate mode") — `M`, impact: med · PLAN §8 #4
Let users repaint a placed piece's material without destroy/replace. v1: per-*piece* recolor (mutate `materialId` via a `room.build.upsert.v1`). Per-*face* textures are a bigger lift that should reuse the world-skin material override stack (`WorldSkinMaterialOverrideSchema`) once FFA skins land.
- **Builds on:** `useBuildPieces.actions` (upsert existing id), `buildMaterials`.

### 3.5 Decorative props bridge to Room Objects — `S`, impact: med · New
We already have free-pose `RoomObject`s (non-colliding manipulatives) and AI 3D objects. A "props" tab in `BuildControls` that places **grid-snapped, optionally-colliding** decorative props (plants, crates, banners) gives builders furniture without inventing a new system — it's `RoomObject` placement with build-grid snapping. Bridges the two sandboxes.
- **Builds on:** `useRoomObjects`, build grid snapping. **Risk:** decide collide vs not per prop.

### 3.6 Sub-level micro-grid terracing — `L`, impact: med · PLAN §8 (deferred)
0.5 m vertical steps for gentler terrain. This breaks the load-bearing `cell == level == wall height` invariant and complicates ramp connection + the surface query, so it's a real project. Defer until there's demand for landscaping.

### 3.7 Free-angle / arbitrary rotation — `XL`, impact: high · PLAN §8 #1 (the big geometry lift)
The headline limitation. Needs a **general capsule-vs-OBB resolver** to replace the axis-aligned-only `resolveWallCollisionsV2`, plus a non-grid identity scheme. Turns "blocky forts" into real architecture, but it's the single largest item here. Curved walls/arcs ride on the same resolver. Keep as a north-star, not a near-term.

---

## 4. Construction power tools (UX leverage, not new geometry)

These multiply what builders can do with the *existing* kit. Highest ratio of delight-to-effort after §2.

### 4.1 Prefabs / blueprints / stamps — `M`–`L`, impact: high · PLAN §8 #3
Select a cluster of pieces → save as a named **stamp** → re-place the whole thing in one click (rotated/offset). Internally a stamp is a relative `BuildPiece[]` list; placement = translate cells + re-derive ids + `placeBatch`. Ship with a few built-in stamps (a 3×3 room, a tower, a staircase). This is the biggest force-multiplier in the whole doc.
- **Builds on:** `placeBatch`, deterministic ids, batch realtime. **Risk:** overlap on stamp drop → skip-on-conflict (already how batch works).

### 4.2 Multi-select move / rotate / duplicate — `M`, impact: high · New
Today you can only place and destroy — not *edit*. A box-select (the destroy box-select already exists) that then lets you **move/rotate/duplicate** the selection. Move = destroy old ids + place new ids in one batch. This is the difference between "place-once" and "iterate."
- **Builds on:** box-select destroy, `placeBatch` + batch destroy.

### 4.3 Symmetry / mirror mode — `S`–`M`, impact: med · New
Toggle a mirror axis (or radial symmetry around the FFA hub center) so each placement also places its reflection(s). Trivial math on cell coords; makes symmetric arenas/buildings effortless. Pairs beautifully with the circular FFA arena.
- **Builds on:** `BuildPlacementController`, `cellToWorldCenter`.

### 4.4 Alignment guides & measuring — `S`, impact: low–med · New
While dragging, show the run length ("4 cells / 8 m") and snap-extend lines from existing pieces. Cheap legibility for precise builders.

### 4.5 Starter templates / "instant rooms" — `S`, impact: med · New
A menu of pre-built layouts (maze, obstacle course shell, amphitheater, stage) a user can stamp into the arena to skip the blank-page problem. Just curated stamps (§4.1) shipped as JSON.

---

## 5. Movement & interactive pieces (turn builds into playgrounds)

These need the **jump/eased-fall** work in §2.6 first, then small per-piece behaviors. They convert a static sandbox into something you *play in*.

### 5.1 Jump pads / launchers / bounce — `M`, impact: high · PLAN §8 #7
A floor variant that sets upward `vy` on contact. Reuses the vertical integrator from §2.6 and the existing skin gravity hooks. Instant fun; foundation for parkour.
- **Builds on:** eased-fall integrator, `groundHeightAt` contact detection.

### 5.2 Moving platforms / elevators / doors — `L`, impact: high · PLAN §8 #8
The first **stateful** piece: animates on a timer or trigger. Movement must sample the platform's *current* `y` (the surface index becomes time-varying). This is where "derive geometry from static data each frame" stops being enough — needs a per-frame transform for animated pieces. Big but high-value; gateway to logic (§6).
- **Builds on:** `BuildSurfaceIndex` (make it time-aware), realtime clock sync. **Risk:** netcode — animate deterministically from a shared clock, don't broadcast per-frame.

### 5.3 Ladders / climbable walls — `M`, impact: med · New
A wall variant where vertical input climbs instead of being blocked. Special-case in movement: when facing a `climbable` wall and pressing up, raise `y` along it. Avoids needing full free-fall physics for verticality without ramps.

### 5.4 Teleporter pads (paired) — `M`, impact: med · PLAN §8 #9 (logic-lite)
Two pads with a shared link id; stepping on one snaps you to the other (`groundHeightAt("teleport")` already exists). Enables mazes, hubs, escape-room flow. First taste of "linked" pieces.
- **Builds on:** `"teleport"` ground mode, link-id on the piece.

### 5.5 Low-friction / conveyor / hazard floors — `S`–`M`, impact: med · New
Floor variants that modify `walkSpeedMultiplier` (ice), apply a constant push (conveyor), or trigger respawn (lava/kill volume). All are small reads in the movement loop keyed off the floor's `materialId`/kind. "The floor is lava" mode (PLAN §8 #10) falls out of the hazard floor.
- **Builds on:** `walkSpeedMultiplier` refs, `selectSpawnPoint` for respawn.

### 5.6 Checkpoints / spawn pads — `S`, impact: med · New
A piece that sets your respawn point — required infrastructure for parkour/courses. Reuses spawn logic.

---

## 6. No-code logic & game modes (the big swing)

This is the path from "build a fort" to "build a game," and it maps directly onto **Frame parity gap #7** (proximity-trigger/button authoring) and **#4** (collaborative editing). Genuinely differentiating for an in-browser social-3D product.

### 6.1 Trigger blocks — visual-scripting-lite — `XL`, impact: high · PLAN §8 #9
**Emitters** (button, pressure plate, proximity zone, timer) → emit events; **consumers** (door, moving platform, teleporter, light, spawner) → react. Wire them by a shared channel id (no node graph needed in v1 — just "this button toggles channel A; this door listens to channel A"). Lets participants build escape rooms, switch-mazes, and minigames with zero code. Depends on §5.2 (stateful pieces) existing first.
- **Builds on:** stateful pieces, realtime event bus (reuse LiveKit data channel). **Risk:** determinism + anti-grief (a button anyone can spam) — scope carefully; this is a multi-milestone effort.

### 6.2 Built-in game modes layered on builds — `L` each, impact: high · PLAN §8 #10
Mostly a **scoring/UI overlay** on top of the build + movement systems:
- **King-of-the-Hill** (highest occupied floor), **races/parkour** (checkpoints + timer from §5.6), **floor-is-lava** (hazard floors from §5.5), **build battles** (timed, two teams build/destroy), **capture-the-flag** (built bases). Each is a thin game-state layer, not new building tech.
- **Builds on:** §5 pieces, room-events for scoring, realtime.

### 6.3 Scoreboard / timer pieces — `M`, impact: med · New
Placeable in-world scoreboards and countdown timers that read game-mode state — makes §6.2 legible without external HUD.

---

## 7. AI-assisted building (Frame parity #14, #5)

### 7.1 Prompt → structure ("procedural world prompt") — `L`, impact: high · PLAN §8 #11
"A small castle with four towers and a gate" → the AI emits a `BuildPiece[]` layout placed via `placeBatch`. Reuses the **existing FFA AI-object prompt→spec pipeline** (`apps/api/src/ai-objects`) — swap the output schema from object-spec to build-piece-list, validate with `isBuildAllowedAt`, drop in via batch. Pairs perfectly with prefabs (§4.1: AI generates a stamp you can then tweak).
- **Builds on:** `ai-objects` pipeline, `placeBatch`, `isBuildAllowedAt` (validate every emitted piece). **Risk:** AI emits invalid/colliding pieces — server validation already rejects them; surface a "placed N of M" result.

### 7.2 AI autocomplete / repair — `M`, impact: med · New
"Finish this wall," "add a roof to this room," "make it symmetric," "clean up floaters." Smaller, more controllable prompts scoped to a selection. Great onboarding bridge for non-builders.

---

## 8. Persistence, sharing & ownership

### 8.1 Named saves / versioned worlds — `L`, impact: high · PLAN §8 #12
Snapshot a room's full `BuildPiece` set as a named version; branch and restore. The manifest-version machinery is a template. "Worlds you can revisit" — and the safety net that makes destructive experimentation (and clear-all) non-scary.
- **Builds on:** bulk list/create, room-delete cascade patterns.

### 8.2 Shareable / forkable build links + template gallery — `L`, impact: high · PLAN §8 #13
Export a build as a viewable/forkable link or a published template. Someone forks it into their own FFA room. Drives virality and seeds the starter-templates menu (§4.5). Builds on §8.1 snapshots.

### 8.3 Per-region plots / claim ownership — `L`, impact: med · PLAN §8 #14
Claimable build plots so collaborative servers don't devolve into overwrite/destroy wars — an opt-in alternative to global anyone-destroys. Implemented as a region mask layered on `isBuildAllowedAt` + `assertCanDestroy`. The cleaner long-term anti-grief answer than caps alone.
- **Builds on:** `isBuildAllowedAt`, `assertCanDestroy`, room settings (`buildDestroyPolicy` already an enum).

### 8.4 Build history & attribution timeline — `S`–`M`, impact: low–med · New
Pieces already store `createdByUserId`/`createdAt`. Surface a hover/inspect "built by X" and a room timeline of build/destroy events (from telemetry §2.10). Social accountability + a debugging aid.

---

## 9. Economy & depth (optional game loop)

### 9.1 Health + harvesting (Fortnite-classic) — `XL`, impact: med · PLAN §8 #5
Pieces get HP and a build cost; you gather "materials" from nodes; destruction takes time/hits. Converts the sandbox into a *game loop*. High effort, niche for an education-leaning product — keep last unless a clear game-mode demand appears. Note it interacts with the "anyone destroys instantly" anti-grief escape hatch, so design carefully.

### 9.2 Build budgets — `S`, impact: low–med · New
A softer cousin: per-user piece *budget* shown in the HUD (we already enforce `BUILD_MAX_PIECES_PER_USER`), with optional "reclaim by destroying." Makes the existing cap legible instead of a surprise rejection.

---

## 10. Recommended sequencing

Each wave is independently shippable and demoable. Rationale: harden first, then leverage existing pieces, then add play, then logic/AI/sharing.

**Wave 0 — Make v1 feel finished (mostly `S`):**
2.1 instancing · 2.4 undo+soft-delete · 2.5 onboarding · 2.6 eased-fall · 2.7 ghost legibility · 2.10 telemetry. *Highest ratio of polish to effort; reduces grief and support pain before scaling scope.*

**Wave 1 — Construction leverage (`M`–`L`):**
4.1 prefabs/stamps · 4.2 multi-select edit · 4.3 symmetry · 3.1 free piece additions (half-wall, window, stairs, pillar) · 3.2 glass · 3.3 lights. *Multiplies what the existing kit can express; no new movement risk.*

**Wave 2 — Play layer (`M`–`L`):**
2.6 jump (finish) · 5.1 jump pads · 5.5 hazard/ice floors · 5.6 checkpoints · 5.4 teleporters · 6.2 first game mode (races/parkour). *Turns builds into something you play; each piece is a small movement read.*

**Wave 3 — Logic & generation (`L`–`XL`):**
5.2 moving platforms (stateful) · 6.1 trigger blocks · 7.1 AI prompt→structure · 8.1 versioned saves · 8.2 forkable links. *The differentiators; each depends on Wave 0–2 foundations.*

**North stars (revisit when demanded):** 3.7 free-angle geometry · 8.3 plots · 9.1 HP/harvesting.

---

## 11. Mapping to Frame parity gaps

From [`../FRAME_FEATURE_PARITY_GAP_ANALYSIS.md`](../FRAME_FEATURE_PARITY_GAP_ANALYSIS.md):

| Frame gap | Closed/advanced by |
|---|---|
| #4 Real-time collaborative in-room editing | §2.4 undo, §4.1–4.3 power tools, §6.1 logic (collaborative authoring depth) |
| #5 Drag-and-drop no-code builder w/ broad primitives | §3 expanded kit, §4 power tools, §3.5 props bridge |
| #6 Asset-type breadth in one editor | §3.3 lights, §3.4 paint, §3.5 props |
| #7 Proximity-trigger/button interactivity authoring | §6.1 trigger blocks (the direct answer) |
| #14 Built-in image/skybox generation (AI authoring) | §7.1 prompt→structure, §7.2 AI autocomplete |
| #16 AI NPCs | §6.1 spawners + a future NPC consumer piece |

World building is plausibly the **fastest no-code-authoring parity win** because the engine, persistence, and realtime are already in place.

---

## 12. Open questions

1. **Stateful pieces (§5.2/§6.1)** are the architectural fork: do we keep "geometry derived from static data" and special-case animated/logic pieces, or generalize the surface index to be time-aware up front? (Recommend: special-case first, generalize when a third stateful piece appears.)
2. **Jump on/off (§2.6):** global movement-feel change. Flag per-room, or always-on once tuned? (Recommend: flag, default on after playtest.)
3. **Anti-grief model:** do we invest in plots (§8.3) or lean on undo + soft-delete + telemetry (§2.4/§2.10)? (Recommend: the latter first — far cheaper.)
4. **Education framing:** which of these are "FFA toys" vs things worth gating into classroom/workforce rooms later (guided builds, parkour as a lesson)? The `building` feature flag already makes that a per-room-type switch.
5. **Render budget:** instancing (§2.1) + light caps (§3.3) define how ambitious a single room can get — set a target (pieces × lights × participants) before Wave 1.
