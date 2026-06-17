# Planning Doc — World Builder Lighting System

Source request: add a **user-friendly but technically deep lighting system** to
the World Builder as a new **Lighting** tab. Multiple light types, easily
placeable and configurable (exact position, intensity, direction, color, …),
with an intuitive toolset and a UI that matches the Verse room HUD with lobby
influence. Quality and UX are the priority.

Branch target: `feature/world-building` (active building branch).
Effort estimate: ~6–9 working days across 8 phases (see
`IMPL_WORLD_BUILDER_LIGHTING.md`).
Feature flag: `ENABLE_WORLD_BUILDER_LIGHTING` / `NEXT_PUBLIC_ENABLE_WORLD_BUILDER_LIGHTING` (default off).

---

## 1. One-line pitch

Promote lighting from a single fixed lamp piece to a first-class, fully
configurable, multi-user layer: place **Point / Spot / Soft-Panel** lights and
tune every parameter with an in-world gizmo, and shape the whole room with a
global **Sun & Sky / Environment** panel (directional sun, hemisphere/ambient
fill, HDRI image-based lighting, fog, filmic exposure).

---

## 2. Where lighting lives today (what we're building on / replacing)

| Concern | Today | File |
| --- | --- | --- |
| Per-cell lamp piece | `light` `BuildPieceKind` — a lamp GLB with a fixed warm `pointLight` (`distance=10, decay=2, color #ffe8c8`) | `apps/web/components/LampGlbMesh.tsx`, `BuildPieceMesh.tsx` |
| Light budget | nearest-N to camera, `BUILD_MAX_ACTIVE_LIGHTS = 8` | `apps/web/components/BuildLayer.tsx` (`useNearestLightPieceIds`), `packages/room-engine/src/build.ts` |
| Real-light classification | `BUILD_REAL_LIGHT_KINDS = ["light"]`, `isBuildRealLightKind()` | `packages/room-engine/src/build.ts` |
| Global scene lighting | ambient + directional (+ optional hemisphere + fog), driven by the active World Skin's `WorldSkinLightingPreset`; falls back to `DEFAULT_LIGHTING` | `apps/web/components/RoomView3D.tsx` (`SceneAtmosphere`), `worldSkins/SkinLayer.tsx`, `worldSkins/types.ts` (`LightingPreset`) |
| Renderer | `<Canvas>` with `dpr` by quality tier, `antialias`, **no shadows, no tone mapping** | `apps/web/components/RoomView3D.tsx` (~L562) |
| Escape-room logic lights | separate `LogicPiece` "light" consumer (on/off via channel bus) | `apps/web/components/LogicLayer.tsx`, `LogicPieceMesh.tsx` |

**Key gaps the grid `light` piece can't fill:** it's locked to a cell center,
fixed color/intensity/range, omnidirectional only, no aiming, no per-light
config. The new system keeps the lamp piece (it's a nice prop) but adds a
free-position, fully-parameterised lighting layer beside it.

**Architectural anchor (memory invariant):** *"Room manifest is static per room
type; build pieces and dynamic wall anchors are separate persisted layers merged
at runtime."* Lights follow the exact same pattern — a new persisted layer,
server-authoritative, broadcast over realtime, merged into the scene at runtime.
The closest existing analog (free position + yaw, persisted, optimistic +
realtime) is **`PlacedWorldAsset`** (`usePlacedWorldAssets.ts`,
`routes/world-assets.ts`); we mirror it.

---

## 3. Lighting methods — research & selection

### 3.1 The real-time light toolbox (Three.js r0.184)

| Light | What it is | Shadows | Relative cost | Verdict |
| --- | --- | --- | --- | --- |
| `AmbientLight` | flat global fill, no direction | none | ~free | **Use** (environment) |
| `HemisphereLight` | sky-color/ground-color gradient ambient | none | ~free | **Use** (environment) |
| `DirectionalLight` | parallel "sun" rays | 1 ortho shadow pass | low | **Use** (the Sun; primary shadow caster) |
| `SpotLight` | aimed cone (angle + penumbra) | 1 perspective shadow pass | moderate | **Use** (placeable) |
| `PointLight` | omnidirectional bulb | cube map = **6 passes** | moderate–high | **Use** (placeable) |
| `RectAreaLight` | uniform emission across a rectangle (windows, panels, strip) | **none** (native) | **highest** shader cost; PBR-only | **Use sparingly** (placeable "Soft Panel", capped ≤2) |
| Image-based lighting (HDRI env map) | global ambient + reflections from an equirectangular HDR | n/a | cheap once loaded | **Use** (environment, drei `<Environment>`) |
| Fog | depth/atmosphere cue | n/a | ~free | **Use** (environment) |
| Filmic tone mapping + exposure | renderer-level response curve (ACES/AgX) | n/a | ~free | **Use** (environment; biggest realism lever) |
| Baked lightmaps / light probes | offline GI baking | n/a | runtime-cheap, author-expensive | **Out of scope v1** (can't be edited live) |
| Volumetric / god-rays / bloom | screen-space postprocessing | n/a | adds a post pass | **Out of scope v1** (needs `@react-three/postprocessing`, not installed) |

Research confirmations (Three.js docs + drei source, 2026):
- `RectAreaLight` **only** lights `MeshStandardMaterial` / `MeshPhysicalMaterial`,
  has **no shadow support**, and requires a one-time
  `RectAreaLightUniformsLib.init()`. Our build pieces and floors all use
  `meshStandardMaterial`, so area lights are compatible. It is the most
  expensive light → hard cap of 2 active, with an honest "doesn't cast shadows"
  note in the UI.
- drei `<Environment>` HDRI **presets** (`apartment, city, dawn, forest, lobby,
  night, park, studio, sunset, warehouse`) are CDN-hosted and *not for
  production* → we **self-host** a small curated HDR set under
  `apps/web/public/lighting/hdri/` and load via `files=`.
- Cost ranking (authoritative): ambient/hemisphere ≈ free < directional < spot <
  point (6× shadow passes) < rect-area. This directly drives our budget tiers.

### 3.2 What we expose to users (the curated set)

We deliberately translate engine primitives into **three placeable light
"fixtures"** + **one global environment**, named for intent rather than for the
Three.js class:

**Placeable lights (`RoomLight` entities, free position):**

1. **Point — "Bulb"** → `THREE.PointLight`. Omnidirectional practical light.
   Params: position, color, intensity, range (`distance`), falloff (`decay`),
   cast shadows (optional), on/off, name.
2. **Spot — "Spotlight"** → `THREE.SpotLight`. Aimed cone. Params: position +
   **aim target** (→ direction), color, intensity, range, falloff, **cone
   angle**, **penumbra** (edge softness), cast shadows (optional), on/off, name.
3. **Soft Panel — "Area"** → `THREE.RectAreaLight`. Soft, physically-plausible
   panel/window/strip light. Params: position + orientation (aim), color,
   intensity, **width**, **height**, on/off, name. (No shadows; capped at 2.)

**Global environment (`RoomEnvironment`, one per room):**

4. **Sun** → `THREE.DirectionalLight`. Params: azimuth + elevation (a sun dial),
   color, intensity, cast shadows (the room's primary shadow caster).
5. **Sky & Ambient** → `HemisphereLight` (sky color, ground color, intensity) +
   `AmbientLight` (color, intensity) for base fill.
6. **Image-based lighting** → drei `<Environment>` with a self-hosted HDRI
   preset + `environmentIntensity`, optionally used as the visible background.
7. **Fog** → color, near, far.
8. **Exposure / tone mapping** → renderer `toneMapping` (`None` to preserve
   today's look, `ACESFilmic`, `AgX`, `Neutral`) + `toneMappingExposure` slider.

> **Why this set is "the best methods":** it is the standard professional
> real-time lighting kit — key/fill/rim achievable via Sun (directional) +
> Soft Panel (area) + Spot; practicals via Bulb/Spot; global ambience via
> Hemisphere + IBL; mood via fog + filmic exposure — chosen to maximise visual
> quality within a browser WebGL light/shadow budget that must run for many
> simultaneous participants.

### 3.3 Explicitly deferred (documented, not built in v1)

- Baked GI / lightmaps, light probes (offline pipeline).
- Bloom / volumetric god-rays / SSAO (requires postprocessing dependency).
- Animated lights (flicker, pulse, color cycling) — natural follow-up via the
  existing logic channel bus.
- Gobo/cookie textures on spotlights; IES profiles.

---

## 4. Architecture & data model

Two new layers, both **server-authoritative + realtime**, gated by the feature
flag. No room-manifest changes.

### 4.1 `RoomLight` — placeable lights (mirrors `PlacedWorldAsset`)

New contract in `packages/contracts/src/` (foundation or a new `lighting.ts`
module, exported from the barrel):

```ts
RoomLightTypeSchema = z.enum(["point", "spot", "area"]);

RoomLightSchema = z.object({
  id: z.string(),
  roomId: z.string(),
  type: RoomLightTypeSchema,
  name: z.string().max(60).optional(),
  enabled: z.boolean().default(true),

  // World transform
  position: Vec3Schema,                 // exact x/y/z (metres)
  // Spot/Area aim. Spot: target point. Area: orientation also derivable from target.
  target: Vec3Schema.optional(),
  // Area orientation when not using target (Euler radians).
  rotation: Vec3Schema.optional(),

  // Shared
  color: z.string().regex(HEX),         // "#rrggbb"
  intensity: z.number().min(0).max(LIGHT_MAX_INTENSITY),
  castShadow: z.boolean().default(false),

  // Point/Spot
  distance: z.number().min(0).max(LIGHT_MAX_DISTANCE).optional(), // 0 = infinite
  decay: z.number().min(0).max(4).optional(),                      // physical = 2

  // Spot
  angleDeg: z.number().min(1).max(90).optional(),                  // cone half-angle
  penumbra: z.number().min(0).max(1).optional(),

  // Area
  width: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),
  height: z.number().positive().max(LIGHT_MAX_AREA_SIZE).optional(),

  createdByUserId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).superRefine(/* type-conditional required fields, see IMPL */);
```

- **REST** (`apps/api/src/routes/room-lights.ts`):
  - `GET    /v1/rooms/:roomId/lights` → list
  - `POST   /v1/rooms/:roomId/lights` → create
  - `PATCH  /v1/rooms/:roomId/lights/:lightId` → partial update (move/aim/config)
  - `DELETE /v1/rooms/:roomId/lights/:lightId`
  - Caps: `ROOM_LIGHT_MAX_PER_ROOM` (e.g. 64), validation via shared zod.
  - `requireRoomAccess` + (FFA/verse) open editing; classroom-flavoured rooms
    gate editing behind teacher controls (see §7).
- **Realtime** (LiveKit data channel, discriminated union):
  `room.light.upsert.v1` (full light) and `room.light.remove.v1` (`lightId`).
  *PATCH is the key difference vs. world-assets* (which is create/delete only):
  lights are continuously edited, so upsert carries the whole light each time.
- **Repository:** memory + Mongoose `room_lights` collection keyed by
  `{roomId, id}` (same uniqueness rule as build pieces). Methods:
  `listRoomLights`, `createRoomLight`, `updateRoomLight`, `deleteRoomLight`,
  cascade-delete on room delete.
- **Web hook:** `apps/web/lib/useRoomLights.ts` — optimistic create/update/delete,
  realtime ingest, 30s refresh (copy `usePlacedWorldAssets` structure). Adds a
  **debounced PATCH** path: while the gizmo is being dragged we update local
  state + broadcast a lightweight realtime upsert every ~80 ms, and only persist
  to the API on drag-end (`commit`) to avoid Mongo write storms.

### 4.2 `RoomEnvironment` — global scene lighting (one per room)

A singleton config stored on **`room.settings.lighting`** (extend
`RoomSettingsSchema`), so it lives with the room and reuses room-settings
plumbing. Shape:

```ts
RoomEnvironmentSchema = z.object({
  enabled: z.boolean().default(false),        // false → keep WorldSkin/default behavior
  preset: z.string().optional(),              // named mood applied last write

  sun: z.object({
    enabled: z.boolean(),
    azimuthDeg: z.number(),                    // 0..360 compass
    elevationDeg: z.number(),                  // -10..90
    color: HexSchema,
    intensity: z.number().min(0).max(4),
    castShadow: z.boolean(),
  }),
  sky: z.object({
    hemisphere: z.boolean(),
    skyColor: HexSchema,
    groundColor: HexSchema,
    hemisphereIntensity: z.number().min(0).max(3),
    ambientColor: HexSchema,
    ambientIntensity: z.number().min(0).max(3),
  }),
  ibl: z.object({
    preset: z.enum(["none","studio","sunset","dawn","night","warehouse","park","apartment"]).default("none"),
    intensity: z.number().min(0).max(3).default(1),
    asBackground: z.boolean().default(false),
  }),
  fog: z.object({ enabled: z.boolean(), color: HexSchema, near: z.number(), far: z.number() }),
  exposure: z.object({
    toneMapping: z.enum(["none","aces","agx","neutral"]).default("none"),
    exposure: z.number().min(0).max(3).default(1),
  }),
});
```

- **Realtime:** reuse the room-settings update path, or a dedicated
  `room.lighting.environment.v1` message for low-latency live slider feedback
  (recommended; mirrors how other live edits broadcast). Persist on commit.
- **Render precedence:** `RoomEnvironment` (when `enabled`) **overrides** the
  WorldSkin `activeLighting`, which overrides `DEFAULT_LIGHTING`. When
  `enabled === false` the current behaviour is byte-for-byte unchanged
  (backward-compatible default).

### 4.3 Why two layers instead of one

- Placeable lights are *many, per-instance, free-position* → an entity
  collection (like assets/build pieces).
- Environment is *one, room-scoped, global* → a settings singleton (like other
  room settings). Splitting them keeps each model simple and lets the
  environment fall back cleanly to the skin/default when untouched.

---

## 5. Rendering & performance strategy

### 5.1 Renderer upgrades (in `RoomView3D` `<Canvas>`), all flag-gated

1. **Shadows.** Enable `shadows` (PCFSoft) on the Canvas, but only when the
   quality tier is `medium`/`high` **and** the room has shadow-casting lights.
   On `low` tier shadows are forced off.
2. **Tone mapping + exposure.** Set `gl.toneMapping` / `gl.toneMappingExposure`
   from `RoomEnvironment.exposure` in `onCreated` + an effect. **Default is
   `none` (`NoToneMapping`)** so existing rooms look identical; ACES/AgX/Neutral
   are explicit opt-ins. (This is the single most important "looks pro" lever,
   but it changes every material's response — so it must be opt-in, not a silent
   global migration.)
3. **RectAreaLight init.** Call `RectAreaLightUniformsLib.init()` once (module
   side-effect in the lights layer) so area lights render.

### 5.2 Active-light budget (extends the existing nearest-N pattern)

Generalise `useNearestLightPieceIds` (currently in `BuildLayer.tsx`) into a
shared selector used by both build-piece lamps and `RoomLight`s so the **total**
real-time light count respects one budget. Per-tier caps:

| Tier | Max active real lights | Max shadow casters | Area lights | Soft shadows | Shadow map |
| --- | --- | --- | --- | --- | --- |
| low | 4 | 0 | disabled | no | — |
| medium | 8 | 1 (sun) | ≤1 | no | 1024 |
| high | 12 | 2–3 (sun + nearest) | ≤2 | yes (`<SoftShadows>`) | 2048 |

- "Active" = nearest-N to the camera (existing technique), unioning lamp pieces
  + room lights. Lights beyond the budget render only their helper/glow billboard
  (no actual light object) so the scene stays cheap but lights remain findable.
- Shadow casters are a separate, smaller nearest-N subset (the sun always wins a
  slot). `decay = 2` and a sane `distance` bound each light's influence.
- Hard caps in contracts (`ROOM_LIGHT_MAX_PER_ROOM`, area-light count) prevent
  pathological rooms.

### 5.3 Live-edit performance

- Gizmo drag → optimistic local transform + throttled realtime upsert (~80 ms);
  **DB write only on drag-end.** Mirrors the build-placement rate-limit ethos
  (`BUILD_PLACEMENT_RATE_LIMIT_MS`).
- Slider edits in the environment panel are local-immediate, realtime-throttled,
  DB-committed on pointer-up.

---

## 6. UI / UX — the Lighting tab

Adheres to the **Verse room HUD** (the `build-dock` `--bd-*` deep-glass token
system, themed to the active verse hue via `--hud-blu`/`--hud-acc`) with **lobby
influence** (blue micro-labels, rounded glass tiles, calm spacing) — exactly the
language `BuildControls.tsx` already speaks. The Lighting tab is a new
`BuildCategory` alongside Build / Objects / Scenes / Uploads.

### 6.1 Tab anatomy (top → bottom)

```
┌ World Builder ─────────────────────────────── pieces · undo · erase · clear ┐
│ [ Build ] [ Objects ] [ Scenes ] [ Uploads ] [ ✦ Lighting ]                 │
├──────────────────────────────────────────────────────────────────────────── │
│  ADD LIGHT      ◖Bulb◗   ◖Spotlight◗   ◖Soft Panel◗      (click → place)     │
│                                                                              │
│  LIGHTS IN ROOM            6 / 8 active near you                             │
│   ⦿ Stage key (spot)            ●on  ⌖select  ✕                              │
│   ⦿ Window fill (panel)         ●on  ⌖select  ✕                              │
│   ⦿ Lantern (bulb)              ○off ⌖select  ✕                              │
│   …                                                                          │
│                                                                              │
│  ▸ SELECTED LIGHT  ─ "Stage key"  [spot]                                     │
│     Position   X[ 4.0 ] Y[ 3.2 ] Z[-1.5 ]   ⤺ drag in world                 │
│     Aim        point at ▣  (drag aim handle)                                 │
│     Color      ▣ #ffd9a0      Intensity ──●────  2.4                         │
│     Range ──●── 14   Falloff ──●── 2.0                                       │
│     Cone ──●── 32°   Softness ──●── 0.4                                      │
│     ☑ Cast shadows      ◉ On / Off      ⎘ Duplicate   🗑 Delete              │
│                                                                              │
│  ▸ SUN & SKY / ENVIRONMENT   (collapsible)                                   │
│     Sun  ☼dial(azimuth/elevation)  Color ▣  Intensity ──●──  ☑ Shadows      │
│     Sky  Sky▣ Ground▣ Hemi ──●──   Ambient ▣ ──●──                          │
│     Image light  [ Studio ▾ ]  Intensity ──●──  ☐ Use as background         │
│     Fog  ☐  Color▣  Near[ ] Far[ ]                                          │
│     Look  Tone [ Filmic ▾ ]  Exposure ──●── 1.0                             │
│     Presets  [Studio] [Warm interior] [Night] [Stage] [Overcast]            │
└──────────────────────────────────────────────────────────────────────────── ┘
```

### 6.2 Placement (intuitive toolset)

- Click a fixture tile (**Bulb / Spotlight / Soft Panel**) → enter placement mode
  (reuse the existing placement-controller pattern; disable other interaction
  layers via the established `interactionDisabled` / `wb-placement-active`
  guards so the ray hits a placement plane, not props).
- Click in the world → drop the light at the hit point (raycast to the nearest
  surface; default Y slightly above the surface). Spot/Area auto-aim straight
  down at the surface; the user re-aims afterward. A live preview shows the bulb
  glyph + range sphere (point), cone (spot), or rect outline (area).
- Newly placed light is auto-selected and its inspector opens.

### 6.3 In-world manipulation (exact position & direction)

- **Move:** drei `<PivotControls>` (or `<TransformControls>` in translate mode)
  mounted on the selected light → drag to move; the inspector's X/Y/Z fields and
  the gizmo stay in sync (typing a value moves the gizmo; dragging updates the
  fields). This satisfies "alter exact position."
- **Aim (spot/area):** a second draggable **aim handle** (a small sphere at
  `target`) → drag to point the cone/panel; or "Point at" + click a surface.
  Numeric azimuth/elevation also available for precision.
- **Helpers:** drei `useHelper` with `PointLightHelper` / `SpotLightHelper` /
  `RectAreaLightHelper` while a light is selected; always-on dim **billboard
  glyph** at each light (color-tinted) so lights are findable even when off or
  out of the active budget. Selection ring + range/cone preview while editing.
- **Keyboard:** arrows nudge position, `Q`/`E` rotate aim, `[`/`]` intensity,
  `Del` delete, `Esc` deselect — all gated by `isKeyboardOwnedTarget`.

### 6.4 Inspector controls (per type)

| Control | Point | Spot | Area | Notes |
| --- | --- | --- | --- | --- |
| Position X/Y/Z | ✓ | ✓ | ✓ | numeric + gizmo |
| Aim / target | — | ✓ | ✓ | aim handle / "point at" |
| Color | ✓ | ✓ | ✓ | swatch → native color input, verse-tinted ring |
| Intensity | ✓ | ✓ | ✓ | slider + numeric |
| Range (distance) | ✓ | ✓ | — | 0 = infinite |
| Falloff (decay) | ✓ | ✓ | — | default 2 (physical) |
| Cone angle | — | ✓ | — | 1–90° |
| Softness (penumbra) | — | ✓ | — | 0–1 |
| Width / Height | — | — | ✓ | metres |
| Cast shadows | ✓ | ✓ | — (disabled, with note) | budget-capped |
| On / Off, Name, Duplicate, Delete | ✓ | ✓ | ✓ | |

### 6.5 Environment panel

- **Sun dial:** a compact circular azimuth control + elevation slider (or an XY
  pad) that sets the directional light's direction; live shadow direction
  updates. Quick chips: *Morning / Noon / Golden hour / Night*.
- **Sky & ambient:** sky/ground color swatches + intensity; ambient color +
  intensity. These are the cheap base fill.
- **Image light (IBL):** dropdown of self-hosted HDRI presets + intensity +
  "use as background." Adds realistic reflections/ambience instantly.
- **Fog:** toggle + color + near/far.
- **Look:** tone-mapping selector (None / Filmic (ACES) / AgX / Neutral) +
  exposure slider. A small "Resets to skin default" affordance.
- **Presets:** one-click moods that write a coherent environment (and may seed a
  couple of starter lights), e.g. *Studio, Warm interior, Night, Stage,
  Overcast*. Presets are pure config → instantly shareable/persisted.

### 6.6 Empty / discoverability states

- Empty tab: "Add your first light — pick Bulb, Spotlight, or Soft Panel, then
  click in the world." Coachmark reused from the build-dock tip pattern.
- Budget hint: "Showing the 8 lights nearest you — others still glow but don't
  cast light at this quality." Links to the quality setting.

### 6.7 2D view parity

`RoomView2D` shows each light as a small color-tinted icon at its X/Z with a
faint range ring (point/spot) or rect (area), so the 2D analog remains faithful
(consistent with the "required 2D analog" project rule). No editing in 2D v1.

---

## 7. Permissions, flags, room-type behaviour

- **Feature flag:** `ENABLE_WORLD_BUILDER_LIGHTING` (API) +
  `NEXT_PUBLIC_ENABLE_WORLD_BUILDER_LIGHTING` (web), default **off**. The
  Lighting tab and routes only appear/work when enabled, gated alongside the
  existing building env checks (`buildingEnvEnabled()` style).
- **Who can edit:** mirror build-piece permissions. In FFA/verse rooms (open
  building) anyone may add/move/remove lights and edit the environment. In
  classroom-flavoured rooms, gate behind the existing teacher controls
  (`peoplePanelTeacherControls`) — same posture as board/whiteboard grants.
- **Server authority:** all writes validated by shared zod + `requireRoomAccess`;
  caps enforced server-side.

---

## 8. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Tone mapping changes the look of **every** existing room | `RoomEnvironment.enabled=false` by default → identical to today; tone mapping defaults to `none`; ACES/AgX are explicit opt-ins per room. |
| Real-time lights are expensive; WebGL has a hard light/uniform ceiling | Shared nearest-N active budget (extends today's `BUILD_MAX_ACTIVE_LIGHTS=8`), per-tier caps, hard per-room cap, out-of-budget lights render glyph-only. |
| Shadows tank low-end devices | Shadows off on `low` tier; capped shadow casters; map size by tier; sun is the single guaranteed caster. |
| RectAreaLight: no shadows, PBR-only, most expensive | Cap at 2; UI states "no shadows"; our materials are all `meshStandardMaterial` (compatible). |
| Live gizmo/slider edits spam Mongo + the data channel | Optimistic local + throttled realtime (~80 ms) + **DB write only on commit/drag-end**. |
| Placement ray / gizmo fights other interaction layers | Active only in the Lighting tab; reuse `interactionDisabled` + `body.wb-placement-active` passthrough guards already proven for build placement. |
| HDRI presets break in prod (CDN) | Self-host a curated HDR set under `public/lighting/hdri/`; load via `files=`, never the CDN `preset=`. |
| Mixing build-piece lamps and room lights double-counts the budget | One shared selector budgets both; lamp piece keeps its current behaviour when lighting feature is off. |
| Confusing two "light" concepts (lamp piece vs. light entity) | Lamp piece = a *prop that emits a fixed glow*; Lighting tab = *real configurable lights*. Copy + a one-time tip clarify; lamp piece stays under the Build tab. |

---

## 9. Acceptance criteria

1. With the flag on, a **Lighting** tab appears in the World Builder, styled to
   the Verse HUD / lobby aesthetic, with Add-Light tiles, a lights list, a
   per-light inspector, and an Environment panel.
2. A user can place **Point / Spot / Soft-Panel** lights, see them light the
   room in real time, and move them with an in-world gizmo and/or exact numeric
   X/Y/Z.
3. The user can edit color, intensity, range, falloff, cone angle, softness,
   width/height, aim/direction, shadow casting, and on/off per light — and
   changes are visible immediately.
4. Lights are **persisted** and **shared**: a second participant sees additions,
   moves, edits, and deletions live; they survive refresh.
5. The Environment panel changes the sun direction/color/intensity, sky/ambient,
   HDRI image light, fog, and filmic exposure — and these persist per room.
6. With the flag **off**, behaviour and visuals are byte-for-byte unchanged
   (no shadows, no tone mapping, no Lighting tab, no new routes).
7. Performance: a room with the per-tier light budget holds frame rate on the
   `medium` tier; out-of-budget lights degrade gracefully to glyph-only.
8. `npm run typecheck` (contracts/api/web), the web vitest suites, and a new
   Playwright lighting spec pass; the required 2D analog renders light icons.

---

## 10. Implementation outline

See `IMPL_WORLD_BUILDER_LIGHTING.md` for the phased, file-by-file plan:

0. **Foundations & renderer prep** — flag, RectArea init, tone-mapping/shadow
   scaffolding (no-op default), shared light-budget selector.
1. **Contracts** — `RoomLight*` + `RoomEnvironment` schemas, realtime union,
   caps, OpenAPI regen, env flags.
2. **API** — repository (memory + Mongoose `room_lights`), routes (list/create/
   patch/delete + environment on room settings), realtime, caps, tests.
3. **Web data** — `useRoomLights` hook (optimistic + realtime + debounced
   commit), environment state/hook, `api.ts` clients, RoomClient realtime
   dispatch wiring.
4. **Render layer** — `RoomLightsLayer` (light objects + helpers + glyphs +
   budgeting), environment override in `SceneAtmosphere`, renderer
   shadow/tone-mapping wiring, `<Environment>` IBL.
5. **Lighting tab UI** — new `BuildCategory`, Add-Light palette, lights list,
   per-light inspector; CSS in the `build-dock` token system.
6. **Placement + gizmo** — `LightPlacementController` and selection/gizmo
   manipulation (`PivotControls` + aim handle), keyboard.
7. **Environment editor + presets** — sun dial, sky/ambient, IBL, fog, exposure,
   mood presets; 2D icons; AI World Host corpus update.
8. **Validation** — typecheck, vitest, Playwright, perf pass, docs/memory.
