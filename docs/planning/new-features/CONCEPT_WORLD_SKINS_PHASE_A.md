# Concept — World Skins, Phase A (Curated Launch Library)

Source: `LEARNING_FEATURE_IDEAS.md` § Big idea #3 — World Skins (Virtual Field Trips inside the classroom).  
Phase in scope: **Phase A only** (curated launch library of five skins). Phases B–D are summarized at the end for orientation; they are not part of this document’s delivery commitment.  
Last updated: 2026-05-22 (Phase A asset model: texture + atmosphere; 3D mesh props deferred to A+).  
Status: **Concept** — product/design truth document. Implementation planning (`PLAN_*`, `IMPL_*`) follows after this doc is accepted.

---

## One-line pitch

The classroom **theater stays the same** — same seats, same boards, same lesson-run, same teacher controls — but the room’s **look, light, sound, and decorative world** swap to a curated educational environment so class can happen on Mars, inside a cell, in the Roman Forum, under a rainforest canopy, or in an art critique gallery without leaving the product or breaking any existing tool.

---

## 1. What World Skins is (and is not)

### 1.1 What it is

World Skins is a **visual and atmospheric reskin** of the existing 3DSpace classroom. It is not a new game mode, not a new room layout, and not a separate product. Teachers and students keep:

- The same `RoomManifest` geometry: bounds, spawn points, wall planes, five wall anchors, tiered seating, hall-pass holding zone (if enabled).
- The same classroom tools: wall objects, lesson runs, private checks, groups/pods, whisper, help queue, focus, board access, room objects (when enabled).
- The same realtime stack: LiveKit spatial audio, avatar movement, data channels.
- The same 2D analog: top-down map derived from the same manifest projection.

What changes is **presentation**:

| Layer | Default theater | With a skin |
| --- | --- | --- |
| Materials & textures | Neutral lecture hall | Themed surfaces (regolith, marble, organelle membranes, canopy leaves, gallery plaster) |
| Lighting & sky | Indoor ambient | Themed sun/sky/fog (Mars dusk, forum noon, cell bioluminescence, etc.) |
| Ambient audio | None or minimal | Low-gain loop (wind, birds, crowd murmur, studio hush) mixed under voice |
| Decorative props (Phase A+) | None | Optional glTF landmarks when a 3D asset pipeline exists — **not required for Phase A ship** |
| Movement feel (optional) | 1× walk speed | Per-skin multiplier (e.g. Mars 0.38×) — code-only |
| 2D map art | Schematic theater | Themed floor plan overlay (same coordinates) |

The pedagogical claim is **place-based context without place-based logistics**: a “field trip” every week with no bus, permission slip, or exclusion of students who cannot travel.

### 1.2 What it is not (Phase A)

- **Not** a new room builder or editable geometry.
- **Not** VR; browser-first, Chromebook-class hardware.
- **Not** procedural or user-generated worlds; every skin is curated, reviewed, and versioned.
- **Not** skin-specific physics beyond a single optional walk-speed multiplier.
- **Not** skin-specific interactive props (that is Phase C, tied to `RoomObject` when ready).
- **Not** a marketplace or district-authored skins (Phase B).
- **Not** a replacement for Labster, Gizmos, or full simulations — skins set **context**; manipulatives and checks still teach the concept.

### 1.3 The core design invariant

> **Geometry is sacred; appearance is swappable.**

All Phase A skins share **identical** `bounds`, `spawnPoints`, `wallAnchors` (positions, sizes, `accepts` policies), and `projection` math. Visual overrides must never move an anchor, shrink a board below readable size, or block spawn collision. This invariant is what lets World Skins ship without retesting every classroom feature per skin.

---

## 2. Why this exists

### 2.1 The problem today

3DSpace already wins on **synchronous instructional structure**: lesson steps, boards, checks, spatial presence. What it does not yet win on in a first demo is **immediate emotional and curricular recognition**. A principal watching a default gray theater sees “fancy Zoom.” A principal watching thirty blocky avatars on Mars while a lesson-run advances through a private check sees “this is why we bought 3D.”

The product’s 3D axis is currently spent mostly on **where you sit**. World Skins spends it on **where you are learning** — without sacrificing the seat map, boards, or teacher workflow.

### 2.2 Why Phase A is the right slice

Phase A optimizes for three outcomes at once:

1. **District demo conversion** — a 90-second live switch (theater → Mars → cell) that no incumbent videoconference can replicate in-browser with a full class connected.
2. **Teacher familiarity** — no new entities to author; pick a skin from a list (room default or per-lesson).
3. **Engineering safety** — material/lighting/texture overrides only (props optional in A+); zero anchor migration.

Later phases add authoring, signature interactives, and partner packs. Phase A proves the **skin contract** and ships five high-quality exemplars.

### 2.3 Strategic fit in the roadmap

`LEARNING_FEATURE_IDEAS.md` Sequence A (district sales) recommends World Skins Phase A first because it opens procurement conversations; Universal Access and hall pass follow as sign-off and operational bullets. World Skins does not depend on AI co-pilot, time capsules, or captions. It **does** benefit from lesson runs (skin per step), exit tickets (recap still works on Mars), and room objects (optional props in art studio) but does not require them.

---

## 3. Product principles (Phase A)

These principles resolve tradeoffs when design and engineering disagree.

| # | Principle | Implication |
| --- | --- | --- |
| P1 | **Teaching beats spectacle** | Skins must be switchable to a calm/default look in one action; lesson steps may lock skin during assessments. |
| P2 | **Never break the theater contract** | If a skin cannot meet anchor/spawn/bounds parity, it does not ship. |
| P3 | **Voice is king** | Ambient loops stay low; spatial teacher voice unchanged; no skin-owned voice chat. |
| P4 | **Chromebook-real** | Phase A texture packs target ≤3 MB compressed per skin; progressive load; lobby pre-cache when possible. (≤8 MB budget applies when glTF props ship in A+.) |
| P5 | **2D is not second-class** | Every skin has a themed 2D map; students on low-end devices still get the field-trip frame. |
| P6 | **Curated only** | No district uploads in Phase A; cultural and licensing review before catalog add. |
| P7 | **Accessible by default** | Each skin ships a high-contrast variant (materials + UI tokens), not an afterthought. |
| P8 | **Honest about what changed** | Banner: “Environment: Mars Surface” so sealed capsules / async review are not confused with live skin. |
| P9 | **Textures before meshes** | Phase A is a **2D art + atmosphere pack** on existing geometry; glTF props are an additive layer (A+), not a blocker for the five-skin launch. |

---

## 3.5 Phase A asset model — texture & atmosphere first (no 3D mesh pipeline)

Phase A ships the **full skin experience** the product promises (five environments, live switch, lesson-run safe, 2D parity, district demo) **without** a 3D artist delivering glTF models. Decorative landmarks described in the brainstorm (rover, organelle meshes, columns, canopy platforms) move to **Phase A+** when assets exist. The skin **contract** is designed so `props[]` can be added later without changing room geometry or teacher workflow.

### What Phase A includes (no glTF required)

| Layer | Delivery | Asset type |
| --- | --- | --- |
| **Walls** | **One** unwrap image (`panorama.webp`, **8192×1024**) sliced per `wall.id` in the engine | WebP in R2 |
| **Floor / tiers** | Themed floor surfaces on existing tier meshes | WebP |
| **Sky / backdrop** | Fog color, sun/ambient light presets, optional **panorama image** (one 2D file) | JSON + optional image |
| **Lighting mood** | Per-skin preset (day/night for Forum = preset swap) | Catalog JSON only |
| **Ambient audio** | Loop under spatial voice | Ogg/mp3 in R2 |
| **2D analog** | Themed top-down map | WebP |
| **Code-only affordances** | Mars `walkSpeedMultiplier`; Cell `avatarScale`; Forum day/night | Catalog JSON only |
| **High-contrast** | Alternate texture set and/or stronger lighting tokens | WebP + JSON |
| **Board readability** | Optional procedural darken quads behind anchors (engine-generated, not licensed art) | No artist |

### What Phase A+ adds (when 3D assets exist)

| Layer | Examples | Notes |
| --- | --- | --- |
| **Decorative props** | Mars rover, cell organelle landmarks, forum columns, rainforest platforms | Instanced glTF at fixed manifest coordinates; non-colliding |
| **Larger packs** | Per-skin budget may grow toward ≤8 MB with models | Same R2 prefix; optional `props[]` in catalog |

### Per-skin Phase A vs A+ (at a glance)

| Skin | Phase A (ship without 3D meshes) | Phase A+ (optional later) |
| --- | --- | --- |
| **Mars** | Ochre walls, dusty floor, pale sky/fog, wind audio, slow walk | Center rover mesh |
| **Cell** | Membrane wall textures, cytoplasm floor, bioluminescent lighting, avatar scale metaphor, soft audio | Walkable organelle props |
| **Roman Forum** | Marble wall textures, warm sun + night lighting, crowd audio, web-link lesson template | Column / monument meshes |
| **Rainforest** | Layered wall murals (canopy on upper segments), dark forest floor, bird audio, 2D layer labels | Elevated platform meshes |
| **Art Studio** | Gallery wall/floor textures, quiet ambient, wall-object-first critique flow | Pedestal / easel meshes |

### Content pipeline (Phase A)

- **Authoritative wall art spec:** [`WORLD_SKIN_PANORAMA_SPEC.md`](./WORLD_SKIN_PANORAMA_SPEC.md) — **8192×1024** `panorama.webp`, horizon at **640 px** from bottom, unwrap order left → back arc → right → front; companion **`floor.webp` 2048×2048**.
- **Source of truth:** `packages/world-skins/catalog/builtin.json` — `overrides.panoramaWall` (storage key + UV slices), floor key, sky/lighting preset, audio key, 2D map key, tuning numbers. Optional empty `props: []`. Per-wall `walls` map remains for Phase 0 color-only harnesses.
- **Binaries:** Cloudflare R2 under `world-skins/<slug>/<version>/` — **`panorama.webp` + `floor.webp`** (+ optional sky/map2d/audio). Budget target **≤3 MB** where feasible; the 8192-wide panorama may exceed that alone — document actuals per skin in QA.
- **Who makes art:** 2D illustrator, stock/CC textures (NASA Mars imagery, etc.), or engineer-sourced placeholders for pilot — **not** a 3D modeling contractor.
- **Per room:** still only `room.settings.skinId` in Mongo — not a copy of assets per classroom.
- **Services:** unchanged — existing API, R2, Mongo, web client (see prior architecture discussion).

### Marketing / demo honesty

- Say **“immersive environments”** and **“virtual field trip”** — accurate for texture + atmosphere.
- Do **not** promise **“walk up to the rover”** or **“explore 3D landmarks”** until A+ ships.
- Demo script (§11.1) uses wall/floor/sky change, audio, and Mars slow-walk — not prop inspection.

### Engineering implication

`SkinLayer` load order for Phase A: placeholder theater → **one wall texture** (UV-sliced per mesh) + floor → sky/fog/lighting → 2D map → ambient audio. **Skip** glTF prop injection until `overrides.props` is non-empty. Schema and API should treat `props` and `gltfUrls` as **optional** from day one so A+ is additive.

---

## 4. Users and goals

### 4.1 Personas

| Persona | Goal with World Skins |
| --- | --- |
| **Teacher** | Set atmosphere aligned to today’s unit; switch mid-lesson for “act two”; avoid reconfiguring boards or re-teaching the HUD. |
| **Student** | Feel immersed in the topic; navigate and participate exactly as in default room; not distracted by unloadable assets or motion sickness. |
| **Instructional coach / dept lead** | Point to standards crosswalks bundled with each skin; justify tool to curriculum committees. |
| **District admin / procurement** | See equity story (virtual field trip for all), consolidation story (fewer point tools), and a live demo that differentiates from Zoom/Meet. |
| **2D artist / content sourcing** | Deliver texture/audio/2D map packs (and optional panorama) that validate against schema and budget; glTF props are a separate A+ engagement. |

### 4.2 Jobs to be done

- **Before class:** “Make this room feel like our space unit for the next month.”
- **During class:** “We’re moving from lecture to gallery walk — switch the room to Art Studio without ending the lesson run.”
- **During assessment:** “Freeze the environment to default/calm so private checks aren’t competing with dust storms.”
- **In a sales demo:** “Show Mars and cell interior in under two minutes with 30 connected clients.”
- **After class (with recap/capsule):** “Students remember we were ‘on Mars’ when they review boards” — skin id may be stored on session metadata for context (optional Phase A nice-to-have).

---

## 5. Phase A scope — the five launch skins

Each skin is a first-class catalog entry with: human label, slug, grade-band tags, subject tags, short teacher-facing blurb, standards crosswalk (PDF for sales kit), default ambient level, optional `walkSpeedMultiplier`, high-contrast variant id, and a **first lesson** template (existing `LessonRun` step kinds only).

### 5.1 Mars Surface

| Attribute | Detail |
| --- | --- |
| **Subject anchor** | Earth & space science (grades 5–12) |
| **Mood** | Open, desolate, awe; ochre regolith, pale sky, long shadows |
| **Phase A affordances** | Ochre wall textures, regolith floor, pale sky/fog, wind ambient, walk speed ~0.38× |
| **Phase A+ affordances** | Static **rover** landmark at room center (decorative glTF) |
| **Board behavior** | Unchanged; wall objects read as “holographic panels” against rock backdrop |
| **2D analog** | Top-down Mars terrain texture; seat dots unchanged (rover icon optional in A+) |
| **Pedagogical hooks** | Orbit vs rotation discussions standing “on” the surface; compare Earth/Mars gravity via movement feel; exit ticket: “What would you need to survive one day here?” |
| **Sensory notes** | Low-frequency wind loop; avoid strobing or rapid light flicker (vestibular) |

### 5.2 Cell Interior

| Attribute | Detail |
| --- | --- |
| **Subject anchor** | Biology (grades 6–12) |
| **Mood** | Vast interior space; semi-transparent membranes; organelles as architecture |
| **Phase A affordances** | Membrane-style wall textures, cytoplasm floor tint, bioluminescent lighting (pulse off in reduced-motion), avatars/nameplates **rescaled** (~0.6×) for metaphor — **schematic, not to scale** |
| **Phase A+ affordances** | Landmarks: mitochondria, ribosomes, nucleus as walkable decorative props; 2D map organelle nodes aligned to prop positions |
| **Board behavior** | Anchors appear as “membrane-embedded” panels; teacher can pin diagrams of organelle functions on existing anchors |
| **2D analog** | Schematic cell diagram floor plan; zones labeled (cytoplasm path; organelle labels on map in A) |
| **Pedagogical hooks** | “Tour the factory” group-work step with pods; private check on function of one organelle; **do not** claim medical diagnostic accuracy — scale is metaphorical |
| **Sensory notes** | Soft pulsing bioluminescent lights; reduced-motion mode disables pulse |

### 5.3 Roman Forum

| Attribute | Detail |
| --- | --- |
| **Subject anchor** | Ancient history / civics (grades 6–12) |
| **Mood** | Sunlit stone, columns, open plaza; optional **day/night** toggle (teacher, classroom action) |
| **Phase A affordances** | Marble wall textures, stone floor, warm sun lighting + **day/night** preset toggle, crowd/wind ambient; first-lesson template with **web-link** cards (no meshes required) |
| **Phase A+ affordances** | Column meshes along walls; monument plaque props matching 2D map positions |
| **Board behavior** | Main board as “rostrum”; side rails as inscription walls |
| **2D analog** | Forum floor plan with labeled monument **positions** (text labels; props optional in A+) |
| **Pedagogical hooks** | Gallery walk: students present at side anchors; group-work as “senate clusters”; sensitivity: curated, cited sources only; no sacred-site cosplay |
| **Sensory notes** | Light crowd/wind ambient; night mode dims sun, adds torch-like point lights (still readable boards) |

### 5.4 Rainforest Canopy

| Attribute | Detail |
| --- | --- |
| **Subject anchor** | Earth science / ecology (grades 3–8) |
| **Mood** | Layered vertical space: forest floor, understory, canopy platforms (visual tiers, same seat map) |
| **Phase A affordances** | Layered **wall** murals (canopy foliage on upper wall segments, darker forest floor texture), bird/insect ambient; tier **seats unchanged** — vertical story told by walls + 2D labels |
| **Phase A+ affordances** | Elevated platform meshes at tier heights (visual only) |
| **Board behavior** | Teacher uses main board for ecosystem diagrams; resource rails for species cards |
| **2D analog** | Cross-section sidebar labels (emergent layer, canopy, understory, floor) |
| **Pedagogical hooks** | “You are researchers at different layers” — assign tiers to groups; compare biodiversity prompts |
| **Sensory notes** | Ambient gain capped lower than Mars (younger grades); high-contrast variant reduces leafy visual noise behind text |

### 5.5 Art Studio + Critique Gallery

| Attribute | Detail |
| --- | --- |
| **Subject anchor** | Visual arts (all grades) |
| **Mood** | North-light studio; side walls as **gallery rails**; warm neutral floor |
| **Phase A affordances** | Neutral gallery wall textures, warm studio floor, minimal ambient; walls primed for **student work as wall objects**; perimeter gallery walk is movement + copy, not meshes |
| **Phase A+ affordances** | Easel / pedestal decorative props; optional `RoomObject` sculpture on floor |
| **Board behavior** | Main board for demo/reference; left/right rails default to `image.file` / `note` friendly |
| **Integration** | Pairs naturally with existing wall media and, when enabled, student uploads |
| **2D analog** | Studio plan with “gallery” edges highlighted |
| **Pedagogical hooks** | `student-share` lesson step + critique gallery skin; private check: “One strength, one suggestion” |
| **Sensory notes** | Minimal ambient (studio hush); avoid loud loops during critique |

### 5.6 Skin comparison matrix

| Skin | Grades | Walk speed | Day/night | Strongest lesson steps |
| --- | --- | --- | --- | --- |
| Mars | 5–12 | 0.38× | No | instruction, private-check, exit-ticket |
| Cell | 6–12 | 1× (scale metaphor) | No | group-work, instruction |
| Roman Forum | 6–12 | 1× | Yes | student-share, group-work |
| Rainforest | 3–8 | 1× | No | group-work, instruction |
| Art Studio | K–12 | 1× | No | student-share, focus-board |

---

## 6. Experience design

### 6.1 Teacher — room creation and defaults

- When creating a room (or editing room settings), teacher sees **Environment** dropdown: `Default theater` + five skins (thumbnails + one-line blurb + grade tags).
- Selection persists as `room.settings.skinId` (nullable = default).
- Copy: “Seating and boards stay in the same places. Only the world around them changes.”
- District admins (future) may restrict which slugs appear per tenant; Phase A uses global catalog behind feature flag.

### 6.2 Teacher — live session controls

| Control | Behavior |
| --- | --- |
| **Environment card** (teacher HUD) | Shows current skin; “Change environment…” opens picker |
| **Apply skin** | `set-room-skin` classroom action (or PATCH room settings if pre-class only — product choice: **both**: settings for default, action for live switch) |
| **Crossfade** | ~1 s blend: fade ambient, swap materials/sky/floor (and props when A+), restore audio; no full scene reload |
| **Calm / default** | One tap returns to default theater (same as pre-skin) |
| **Lock environment** | Toggle: while locked, students cannot suggest skin changes; lesson-run may auto-lock during `private-check` steps (configurable, default on for checks) |
| **Per-step skin (lesson run)** | Optional advanced: step payload `skinId` applied on step enter (Phase A: **room-level default + manual live switch**; per-step is stretch if cheap via existing lesson advance hooks) |

### 6.3 Student experience

- On join: room loads default skin from settings; assets stream with progress (“Loading Mars…”) without blocking LiveKit connect.
- Students see a slim banner: `Environment: Rainforest Canopy` (dismissible once per session).
- Movement, boards, checks, emotes, whisper, pods — **identical** controls.
- Walk-speed change on Mars is explained once per session tooltip: “Lower gravity — you move slower.”
- Cell interior scale change applies to avatars/nameplates only; collision bounds unchanged.

### 6.4 Mid-lesson skin switch

Canonical demo flow:

1. Lesson running on default theater — instruction on main board.
2. Teacher advances or manually picks **Mars Surface** → crossfade → continues lecture.
3. Teacher runs private check (skin locked or calm toggle available).
4. Teacher switches to **Cell Interior** for next unit segment — lesson run state, wall objects, groups **unchanged**.
5. End lesson → exit ticket / recap unchanged.

**Success criterion:** no `ClassroomState` version corruption, no lost wall objects, no desynced avatar positions.

### 6.5 2D analog parity

- `RoomView2D` consumes the same `skinId` and renders themed floor texture + prop icons at projected coordinates.
- Anchor rectangles unchanged; wall object cards unchanged.
- High-contrast variant swaps 2D texture tokens as well as 3D materials.

### 6.6 What students must never see

- Asset load failures as a hard error — fallback to default theater with teacher-only toast.
- Other students’ accommodation settings (unchanged from Universal Access future work).
- Licensing attribution clutter in the main view — attribution lives in About panel / marketing PDF.

---

## 7. Integration with the existing platform

World Skins is a **horizontal layer**. Below is every major subsystem and the Phase A decision.

| Subsystem | Integration |
| --- | --- |
| **`RoomManifest`** | Unchanged schema version per skin; skins reference `baseManifestId` (the standard theater). |
| **`RoomSettings`** | Add `skinId: string \| null` and optional `skinLocked: boolean`. |
| **Wall objects** | Fully supported; placement clamps use manifest anchors — skin must not alter anchor rects. |
| **`LessonRun`** | Runs identically; optional future step payload for skin; Phase A manual switch is enough for demo. |
| **Private checks / exit ticket** | Unchanged; recommend calm/default during high-stakes checks. |
| **Groups / breakout pods** | Pod floors draw on skin floor material; group positions unchanged. |
| **Whisper** | Unchanged; whisper ring renders on skin floor. |
| **Spatial audio** | Teacher voice unchanged; ambient is separate loop, not spatialized chatter. |
| **Avatar appearance / reactions** | Unchanged; sprites readable on all backgrounds (test contrast per skin). |
| **Room objects** | Allowed; decorative props must not occupy grab slots reserved for lesson manipulatives without teacher intent. |
| **Hall pass / quiet corner** | Zones are manifest regions — skin visuals tint those regions but do not move them. |
| **Time capsule (future)** | Capsule should store `skinId` at seal time for accurate ghost visit atmosphere. |
| **Feature flags** | `ENABLE_WORLD_SKINS` / `NEXT_PUBLIC_ENABLE_WORLD_SKINS`, default off. |

### 7.1 Overlap with RoomObject (Alternate A)

Phase A does **not** require skin-baked glTF props. Art Studio and other skins work through **wall objects** and textures alone. **Phase A+** may add static decorative props in the skin pack (rover, columns, organelles). **Phase C** may add skin-specific **interactive** `RoomObject` templates (rotatable mitochondrion, etc.) — separate from A+ decoration.

### 7.2 Overlap with World Skins vs “field trip pin map” (removed small idea)

The brainstorm once listed a 2D pin map; World Skins supersedes that for Phase A by making the **whole room** the field trip, not a map widget.

---

## 8. Technical concept

### 8.1 Entity: `RoomManifestSkin`

Server-owned catalog document (Mongo collection or static JSON seeded at deploy):

```ts
RoomManifestSkin = {
  id: string;
  slug: "mars-surface" | "cell-interior" | "roman-forum" | "rainforest-canopy" | "art-studio";
  label: string;
  description: string;
  gradeBands: string[];       // e.g. ["5-8", "9-12"]
  subjects: string[];
  baseManifestId: string;     // points at canonical theater manifest id
  version: number;            // bump when assets change
  overrides: {
    materials?: Record<wallId, MaterialOverride>;
    floor?: MaterialOverride;
    lighting?: LightingPreset;
    skybox?: string;          // asset key
    ambientAudioKey?: string;
    props?: DecorativeProp[]; // Phase A+: optional; empty in Phase A
    avatarScale?: number;     // cell interior only
    walkSpeedMultiplier?: number;
  };
  assets: {
    textures: Record<string, string>;  // storageKey per wall id, floor, sky, map2d
    audio?: string;                    // ambient loop storageKey
    gltf?: Record<string, string>;     // Phase A+ only; prop slug → storageKey
  };
  accessibility: {
    highContrastVariantSlug: string;
  };
  standardsCrosswalkUrl: string; // PDF in marketing kit / CDN
  licenseAttribution: { assetId: string; notice: string }[];
  review: { reviewedAt: string; reviewer: string; notes?: string };
}
```

Client hydrates: `GET /v1/world-skins` (catalog) + `GET /v1/world-skins/:slug` (detail + signed asset URLs).

### 8.2 Runtime application

1. `RoomClient` reads `room.settings.skinId` on join.
2. `SkinLayer` (new) wraps `RoomView3D` / `RoomView2D` theming:
   - Subscribe to skin asset manifest.
   - Progressive load: placeholder gray theater → swap wall/floor materials → sky/fog/lighting → 2D map → start ambient → inject props **if** `overrides.props` non-empty (A+).
3. On `set-room-skin` action or settings change:
   - Reliable `room.skin.v1` message: `{ skinId, version, crossfadeMs: 1000 }`.
   - All clients run same crossfade timeline.
4. Movement: `useAvatarMovement` reads `walkSpeedMultiplier` from active skin context.

### 8.3 Rendering rules (3D)

- **Walls/floor:** replace materials on existing meshes; do not rebuild room geometry from glTF.
- **Props (A+ only):** instanced glTF at fixed `(x,y,z)` in manifest coordinates; no collision in v1. Phase A ships with zero props.
- **Lighting:** preset per skin (ambient + directional + optional hemisphere); must keep wall object text contrast ≥ WCAG AA on boards in high-contrast variant.
- **Sky:** Drei sky or background texture; indoor skins may use ceiling dome.
- **Camera:** no skin-specific camera rails; third-person follow unchanged.

### 8.4 Asset delivery

- Pack stored in R2 under `world-skins/<slug>/<version>/` (Phase A: `.webp` / `.ktx2` + `.ogg` only).
- Signed URLs via existing upload/download service pattern (same as room-object assets proxy).
- CDN cache headers aggressive; **lobby pre-warm** optional: when teacher opens class list, prefetch default room skin pack.
- **Budget (Phase A):** target **≤3 MB** compressed per skin (textures + one ambient loop). **Budget (A+):** up to **≤8 MB** when glTF props are added.

### 8.5 Ambient audio

- Loop streamed from CDN or low-priority LiveKit track (product choice: **CDN loop in Phase A** for simplicity).
- Gain cap ~15% of voice bus; teacher “Ambient” slider in Environment card (0–100%, default per skin).
- Mute ambient when teacher mutes “room atmosphere” or enables calm/default skin.

### 8.6 Classroom actions (new)

```ts
set-room-skin: { skinId: string | null }   // null = default theater
lock-room-skin: { locked: boolean }
set-room-skin-day-night?: { mode: "day" | "night" }  // roman-forum only
```

Teacher-only; versioned via existing `ClassroomState` optimistic locking.

### 8.7 Failure modes

| Failure | Behavior |
| --- | --- |
| Asset 404 / timeout | Fall back to default theater; teacher toast “Environment unavailable — using default room” |
| Partial load | Show progress; do not apply skin until minimum viable (**walls + floor** textures loaded) |
| WebGL context loss | Reapply active skin from cached manifest on restore |
| Student on 2D only | Themed map still applies; 3D props not required in any phase for participation |

---

## 9. Accessibility and inclusion

- **High-contrast variant** per skin: separate material tokens + 2D texture; not just “invert colors.”
- **Reduced motion:** respect `prefers-reduced-motion` and future `UserAccommodationsProfile` — disable crossfade (cut), disable cell pulse, disable day/night animated transition.
- **Cognitive load:** banner + teacher lock during checks; “calm skin” is always one tap away.
- **ELL / literacy:** Skins do not replace captions (deferred STT); wall notes and lesson instructions still support future TTS from Universal Access.
- **Photosensitivity:** no rapid strobing; dust storm is slow parallax only.

---

## 10. Privacy, safety, licensing, cultural review

| Topic | Phase A policy |
| --- | --- |
| **Student data** | Skins do not collect new PII; `skinId` on room/session is not sensitive. |
| **Licensing** | CC0 / partner-licensed / commissioned assets only; `licenseAttribution` in manifest. |
| **Historical representation** | Roman Forum uses scholarly sources; monuments are architectural, not costume role-play of living cultures. |
| **Sacred / sensitive sites** | No real-world sacred sites as skins in v1; review log per skin before catalog. |
| **Biological accuracy** | Cell skin labeled “schematic, not to scale” in teacher blurb. |
| **Distraction** | Teacher lock + calm default; lesson-run check steps suggest lock. |

---

## 11. District and curriculum narrative

### 11.1 Procurement story (90-second demo script)

1. Default theater — “This is your classroom.”
2. Start lesson-run step — wall note + poll unchanged.
3. Switch to **Mars Surface** — walls/floor turn ochre; ambient wind; movement slows.
4. Switch to **Cell Interior** — membrane walls; avatars scale; “We’re inside the cell now.”
5. Show **exit ticket** or private check still submitting.
6. One sentence: “Same product, same data, same compliance — different world.”

### 11.2 Equity and funding

- Virtual field trip removes cost-per-student bus fees and permission barriers.
- Title I / ESSER framing: access for all, not enrichment for some.
- Consolidation: science context + live class + formative checks in one seat license.

### 11.3 Standards crosswalks

Each skin ships a **one-page PDF** (marketing kit, not in-app blocker): NGSS / CCSS / sample state standards mappings and 2–3 example lesson objectives. Sales reps use these in RFP appendices; teachers use optional “First lesson” template in-app.

### 11.4 Packaging (commercial, not engineering)

Skins may be sold as: base license includes all five; future grade-band packs; subject packs. Phase A engineering delivers one flag-gated catalog.

---

## 12. First-lesson templates (pedagogical packaging)

Each skin includes a **importable `LessonRun` draft** (hand-authored JSON, not AI) using only existing step kinds:

| Skin | Template title | Steps (example) |
| --- | --- | --- |
| Mars | “Survive 24 hours on Mars” | instruction → focus-board (note) → private-check → exit-ticket |
| Cell | “Organelle tour” | instruction → group-work → private-check |
| Roman Forum | “Senate debate” | instruction → group-work → student-share |
| Rainforest | “Layer detectives” | instruction → group-work → focus-board (poll) |
| Art Studio | “Critique round” | instruction → student-share → private-check |

Templates are optional imports; they prove the skin does not require new step types.

---

## 13. Acceptance criteria

### 13.1 Phase A complete (texture + atmosphere — no glTF)

- [ ] Teacher can set `skinId` at room creation and change it live via `set-room-skin`.
- [ ] All **five** launch skins render in 3D (**walls, floor, sky/lighting**) and 2D (**themed map**) with no anchor/spawn/bounds regression.
- [ ] A full `LessonRun` completes with **at least one mid-run skin switch** and no classroom state corruption.
- [ ] Wall objects (note, poll, image, link, timer, live share) work on every skin’s anchors (readability QA on main board per skin).
- [ ] Calm/default restore works in one action from any skin.
- [ ] Roman Forum day/night toggle works without relayout (lighting preset only).
- [ ] Mars walk-speed multiplier applies; Cell avatar scale applies; spatial audio positions unchanged.
- [ ] Ambient audio plays per skin; teacher can mute atmosphere; voice remains primary.
- [ ] Catalog validates with `props: []` / no `gltf` keys; client does not require prop loader for ship.

### 13.2 Phase A+ complete (optional — decorative glTF)

- [ ] At least one skin ships with non-empty `props[]`; props load without blocking wall/floor apply.
- [ ] Props are non-colliding; do not occlude boards or spawns.
- [ ] Per-skin pack with props ≤8 MB compressed (document actuals).

### 13.3 Performance (Phase A)

- [ ] First meaningful themed paint &lt;5 s on baseline Chromebook (Intel N4020-class), throttled Fast 3G optional secondary test.
- [ ] Per-skin texture+audio pack ≤3 MB compressed on wire (document actuals per skin in QA sheet).

### 13.4 Accessibility

- [ ] High-contrast variant exists for each of the five skins (textures and/or lighting); board text meets contrast targets on main anchor in QA checklist.
- [ ] Reduced-motion path disables crossfade and cell pulsing.

### 13.5 Sales / content

- [ ] Standards crosswalk PDF exists per skin (five PDFs).
- [ ] First-lesson template importable per skin.
- [ ] Demo script recorded or documented (internal).

### 13.6 Safety

- [ ] Feature flag off by default; server enforces flag on skin catalog APIs and actions.
- [ ] Review log filled for each skin slug before enable in production catalog.

---

## 14. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Asset bloat on school networks | Medium | High | Phase A ≤3 MB texture packs; progressive load; lobby prefetch; placeholder theater |
| Phase A feels “thin” without props | Medium | Medium | Strong wall/floor/sky + audio + 2D map; honest marketing; A+ adds landmarks |
| Visual distraction during instruction | Medium | Medium | Calm skin; lock during checks; teacher training blurb |
| Anchor/spawn drift if artist breaks contract | Low (Phase A) | High | Validator: texture skins must not move anchors; prop positions validated only in A+ |
| Cultural/licensing backlash | Low | High | Curated only; review log; no sacred sites; attribution manifest |
| Teacher confusion (“where did my board go?”) | Medium | Medium | Copy + banner; boards unchanged; demo script |
| Cell scale breaks spatial audio feel | Low | Low | Audio uses manifest positions, not visual scale |
| Safari WebGL memory | Medium | Medium | Reuse textures; Phase A has no prop meshes; test iPad Safari |
| Capsule/async mismatch | Low | Medium | Store `skinId` on seal (follow-up if Time Capsule ships) |

---

## 15. Dependencies and sequencing

| Dependency | Required for Phase A? |
| --- | --- |
| Stable theater `RoomManifest` | Yes — already shipped |
| R2 signed URLs | Yes |
| Lesson runs | No (but demo-strong) |
| Room objects | No |
| Exit ticket / recap | No |
| 2D textures / audio sourcing | **Yes** — five skin packs (illustrator, stock, or NASA/CC placeholders for pilot) |
| 3D artist (glTF props) | **No** for Phase A — **A+ only** |
| Universal Access profile hook | No for Phase A; reduced-motion via CSS/media query |

**Recommended build order (conceptual):**

1. Skin schema + validator + feature flag + default theater fallback (`props` optional).
2. R2 layout + API catalog/asset URLs (texture + audio only).
3. `SkinLayer`: wall/floor materials, lighting/fog, 2D map, ambient — one pilot skin.
4. Remaining four skins (2D art + JSON presets).
5. Classroom actions + HUD + `room.skin.v1` crossfade.
6. Code affordances: Mars walk speed, Cell avatar scale, Forum day/night.
7. QA Chromebook matrix + §13.1 acceptance checklist.
8. Marketing PDFs + demo script + first-lesson templates.
9. **(A+ later)** Prop loader + glTF per skin as assets arrive.

Estimated effort: **4–5 weeks** one engineer + **2D/content sourcing in parallel** (textures, audio, 2D maps, optional panoramas). **A+ props:** +1–2 weeks engineer and 3D artist when ready — additive, not blocking Phase A ship.

---

## 16. Later phases (orientation only)

| Phase | Delivers | Out of prior scope |
| --- | --- | --- |
| **A+ — Decorative props** | glTF landmarks per skin (rover, columns, organelles, platforms) | Requires 3D asset pipeline; optional after A ships |
| **B — Authoring kit** | District JSON manifest + bundle validator + placement UI | Custom skins |
| **C — Skin-specific RoomObjects** | Interactive rover tour, rotatable organelle, etc. | Tied to `RoomObject` |
| **D — Marketplace / partners** | PBS, Smithsonian, NASA packs | Revenue share, partner pipeline |

---

## 17. Open questions (for planning → PLAN doc)

1. **Live switch API:** classroom action only, settings PATCH only, or both?
2. **Per-lesson-step `skinId`:** include in Phase A via lesson advance hook, or defer to A.1?
3. **Ambient:** CDN loop vs LiveKit track — legal/compliance preference for district IT?
4. **Texture sourcing:** illustrator vs CC/stock vs NASA/public-domain for Mars/space skins?
5. **Cell avatar scale:** apply to collision/nametag only — confirm SPED advisors OK with scale metaphor.
6. **Roman night mode:** default day with toggle, or remember last teacher choice per room?
7. **Capsule:** store `skinId` on seal in Phase A if Time Capsule is parallel, or wait?
8. **Class-level skin default:** inherit from room or override per `Class` entity?
9. **A+ prop priority:** which skin gets first glTF landmark when 3D assets exist?

---

## 18. Success metrics (post-launch)

| Metric | What good looks like |
| --- | --- |
| Skin adoption | ≥30% of lesson runs in pilot district use non-default skin at least once |
| Load success | &lt;2% sessions fall back to default due to asset failure |
| Demo conversion | Sales team reports demo → pilot conversion uplift (qualitative first 90 days) |
| Teacher NPS snippet | “Students were more engaged” without “boards were harder to use” |
| Performance | p95 skin load &lt;5 s on district Chromebook sample |

---

## 19. Glossary

| Term | Definition |
| --- | --- |
| **Skin** | A versioned bundle of visual/atmosphere overrides applied to the canonical theater manifest. |
| **Default theater** | The current production room look; `skinId = null`. |
| **Calm skin** | User-facing label for return to default theater. |
| **Texture pack** | Phase A skin delivery: wall/floor/sky textures, 2D map, audio, lighting JSON — no glTF. |
| **Phase A+** | Additive glTF decorative props on top of Phase A texture packs. |
| **Decorative prop** | Non-interactive mesh (A+); no `RoomObject` persistence. |
| **Geometry sacred** | Bounds, spawns, anchors, projection unchanged across skins. |
| **Crossfade** | Time-boxed blend between two skin material states (~1 s). |

---

## 20. Summary

World Skins Phase A turns 3DSpace from a spatial videoclassroom into a **place-based learning stage** without forking the product. The theater’s instructional geometry stays fixed; Mars, a cell, Rome, a rainforest, and an art studio are **curated texture-and-atmosphere packs** (walls, floors, sky/lighting, audio, 2D maps, code-only affordances) that load fast, respect voice and boards, and give districts a demo and standards story Zoom cannot match. **glTF decorative props are Phase A+** — the schema and loader stay ready, but the five-skin launch does not depend on a 3D artist. Authoring kits, interactives, and partner catalogs build on the skin contract proven here.

**Next artifact:** `PLAN_WORLD_SKINS_PHASE_A.md` (file-level design, overlap matrix, test plan) once this concept is accepted.
