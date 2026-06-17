# Implementation Doc — World Builder Lighting System

Companion to `PLAN_WORLD_BUILDER_LIGHTING.md`. This is the phased, file-by-file
build plan. Each phase is independently shippable behind the flag and ends with
a typecheck. The design of record (light-type selection, data model, budget,
UX) lives in the PLAN; this doc is the "how/where."

Conventions followed (from the repo):
- New persisted layer mirrors **`PlacedWorldAsset`** end-to-end (contracts →
  repo → route → realtime union → web hook → render layer).
- Feature flags pair API + web (`ENABLE_*` / `NEXT_PUBLIC_ENABLE_*`, default off),
  documented in `.env.example`.
- UI reuses the `build-dock` `--bd-*` token system (Verse HUD + lobby look).
- Always-on 2D analog parity (`RoomView2D`).
- Server-authoritative validation via shared zod + `requireRoomAccess`.

Legend: 🆕 new file · ✏️ edit existing · 🧪 test.

---

## Phase 0 — Foundations & renderer prep (no-op when flag off)

Goal: land the scaffolding that later phases plug into, with zero visual change
when the flag is off.

1. ✏️ `.env.example` (root + `apps/api` + `apps/web`): add
   `ENABLE_WORLD_BUILDER_LIGHTING` / `NEXT_PUBLIC_ENABLE_WORLD_BUILDER_LIGHTING`
   (default `false`). ✏️ `playwright.config.ts` env passthrough.
2. ✏️ `apps/api/src/config.ts`: add `enableWorldBuilderLighting` (+ later tuning
   knobs: `roomLightMaxPerRoom`, etc.).
3. ✏️ `apps/web/lib/config.ts` (`CLIENT_TUNING`): add
   `enableWorldBuilderLighting`.
4. 🆕 `packages/room-engine/src/lighting-budget.ts`: a shared, framework-free
   selector `selectActiveLights(items, cameraPos, maxActive)` and constants
   `LIGHTING_BUDGET = { low, medium, high }` (active count, shadow casters,
   area cap, shadow map size, soft shadows). Refactor `BuildLayer`'s
   `useNearestLightPieceIds` to consume this so lamps + room lights share one
   budget. Export from `packages/room-engine/src/index.ts`.
5. 🆕 `apps/web/lib/lightingRenderer.ts`: helpers to (a) resolve
   `THREE.ToneMapping` from the `"none"|"aces"|"agx"|"neutral"` enum, (b) one-time
   `RectAreaLightUniformsLib.init()` (idempotent module guard). No call sites yet.
6. ✏️ `apps/web/components/RoomView3D.tsx` `<Canvas>`: thread a `lightingEnabled`
   prop; when true and tier ≥ medium, set `shadows` (PCFSoft). Tone mapping +
   exposure applied in an `onCreated`/effect from env config (Phase 4 supplies
   the value; here it defaults to `NoToneMapping`, exposure 1 → unchanged look).

Typecheck all three packages. Visual diff: none (flag off).

---

## Phase 1 — Contracts

Files: `packages/contracts/src/` (new `lighting.ts`, re-exported from
`index.ts`), `packages/contracts/openapi/`.

1. 🆕 `packages/contracts/src/lighting.ts`:
   - `RoomLightTypeSchema = z.enum(["point","spot","area"])`.
   - Constants: `ROOM_LIGHT_MAX_PER_ROOM = 64`, `ROOM_LIGHT_MAX_AREA = 2`,
     `LIGHT_MAX_INTENSITY`, `LIGHT_MAX_DISTANCE`, `LIGHT_MAX_AREA_SIZE`.
   - `RoomLightSchema` (see PLAN §4.1) with `.superRefine`:
     - `spot` requires `target`, `angleDeg`; `point`/`spot` may set
       `distance`/`decay`; `area` requires `width`/`height` and **rejects**
       `castShadow` (force false) / `distance` / `decay` / `angleDeg`.
   - `CreateRoomLightRequestSchema`, `UpdateRoomLightRequestSchema` (deep-partial
     of editable fields), and response schemas (`Create/List/Update/Delete`),
     each carrying `realtimeMessages` like the world-asset responses.
   - Realtime: `RoomLightUpsertMessageSchema`
     (`type: "room.light.upsert.v1"`, `roomId`, `light`, `sentAt`, `senderId`)
     and `RoomLightRemoveMessageSchema` (`"room.light.remove.v1"`, `lightId`);
     `RoomLightRealtimeMessageSchema` discriminated union.
   - `RoomEnvironmentSchema` (PLAN §4.2) + default factory
     `defaultRoomEnvironment()` (`enabled:false`, tone `none`).
   - `RoomLightingEnvironmentMessageSchema`
     (`type: "room.lighting.environment.v1"`, `roomId`, `environment`, …).
   - Types exported: `RoomLight`, `RoomLightType`, `RoomEnvironment`,
     `RoomLightRealtimeMessage`, etc.
2. ✏️ `packages/contracts/src/room.ts` (or wherever `RoomSettingsSchema` lives):
   add optional `lighting: RoomEnvironmentSchema.optional()` to room settings.
3. ✏️ `packages/contracts/src/index.ts`: `export * from "./lighting.js"` (barrel)
   and add the new realtime messages to the global room realtime union if one
   exists; add API error codes if needed (`room-light-cap`, `light-not-found`).
4. ✏️ OpenAPI: add the four `/v1/rooms/:roomId/lights` paths + schemas; regen
   `openapi.json` per the repo's generation step.
5. 🧪 `packages/contracts/tests/lighting.test.ts`: schema happy-path + refinement
   rejections (area+shadow, spot without target, intensity/size caps, hex color).

Typecheck contracts.

---

## Phase 2 — API (repository, routes, realtime, caps)

Mirror `routes/world-assets.ts` + repository `*WorldAsset*` methods.

1. ✏️ `apps/api/src/repository.ts` (interface) + memory impl:
   `listRoomLights(roomId)`, `createRoomLight(input)`, `updateRoomLight(roomId,
   lightId, patch)`, `deleteRoomLight(roomId, lightId)`, plus cascade in room
   delete. Key by `{roomId, id}`. Enforce `ROOM_LIGHT_MAX_PER_ROOM` and
   area-light cap on create.
   - Environment: `getRoomEnvironment`/`setRoomEnvironment` (store on the room's
     settings doc) — or reuse the existing room-settings update method.
2. ✏️ `apps/api/src/models/mongoose.ts`: `roomLightSchema` + model
   `room_lights`; add to `Models`; indexes `{roomId, id}` unique + `{roomId}`.
   Persist environment in the room settings subdocument.
3. 🆕 `apps/api/src/routes/room-lights.ts`: `registerRoomLightRoutes(app, ctx)`
   with GET/POST/PATCH/DELETE (+ a PATCH/PUT for environment on
   `/v1/rooms/:roomId/lighting/environment`). Each guarded by `requireUser` +
   `requireRoomAccess`, flag-gated (`assertLightingAvailable(config)` →
   503/404 when off), classroom teacher-gate where applicable. Build realtime
   upsert/remove/environment messages (copy `buildUpsertMessage` shape).
4. ✏️ `apps/api/src/routes/register-routes.ts` (or wherever world-assets is
   registered): register the new routes when the flag is on.
5. 🧪 `apps/api/tests/routes/room-lights.test.ts`: CRUD, caps (per-room +
   area), validation rejects, realtime message payloads, cascade on room delete,
   flag-off → unavailable.

Typecheck + run API vitest.

---

## Phase 3 — Web data layer

1. 🆕 `apps/web/lib/useRoomLights.ts` (copy `usePlacedWorldAssets.ts` structure):
   - State `lightsById`; `refresh()` (30s + focus), optimistic `createLight`,
     `deleteLight`.
   - `updateLight(id, patch, { commit })`: update local state immediately;
     broadcast throttled `room.light.upsert.v1` (~80 ms) during a drag; call the
     PATCH API only when `commit` (drag-end / pointer-up). Replace temp ids on
     create like the assets hook does.
   - `handleRealtimeMessage` for upsert/remove (ignore self-sender echoes if
     needed). Returns `{ lights, createLight, updateLight, deleteLight,
     handleRealtimeMessage }`.
2. 🆕 `apps/web/lib/useRoomEnvironment.ts`: load/edit the per-room environment
   (local-immediate, throttled realtime, commit-on-pointer-up); merges with
   WorldSkin `activeLighting` precedence rules (PLAN §4.2).
3. ✏️ `apps/web/lib/api.ts`: clients `listRoomLights`, `createRoomLight`,
   `updateRoomLight`, `deleteRoomLight`, `getRoomEnvironment`,
   `setRoomEnvironment`.
4. ✏️ `apps/web/components/RoomClient.tsx`:
   - Instantiate `useRoomLights` + `useRoomEnvironment` (flag-gated), with
     `publish`.
   - Add their `handleRealtimeMessage` to the realtime dispatch chain (alongside
     `worldAssetsRealtimeHandlerRef`, ~L1157) and the message router.
   - Hold selection state (`selectedLightId`) and the active `BuildCategory`.

Typecheck web.

---

## Phase 4 — Render layer + renderer wiring

1. 🆕 `apps/web/components/RoomLightsLayer.tsx`:
   - Props: `lights`, `selectedId`, `interactive`, `quality`, callbacks
     (`onSelect`, `onTransform`, `onTransformCommit`).
   - Budget: use `selectActiveLights` (Phase 0) keyed on camera position; render
     real `<pointLight>` / `<spotLight>` / `<rectAreaLight>` only for active +
     enabled lights; render a dim **billboard glyph** (`<Html>` or sprite) for
     all lights so they're findable. Spot uses an explicit `target` object;
     area uses `lookAt(target)` / rotation.
   - Shadow casters: separate smaller nearest-N subset; set `castShadow`,
     `shadow.mapSize`, `shadow.bias`, `shadow.camera` near/far by tier.
   - Selected light: drei `useHelper` (`PointLightHelper`/`SpotLightHelper`/
     `RectAreaLightHelper`) + range/cone/rect preview.
2. 🆕 `apps/web/components/LightGlyph.tsx`: the always-on findable marker
   (color-tinted icon billboard; click → select).
3. ✏️ `apps/web/components/RoomView3D.tsx`:
   - Render `<RoomLightsLayer>` inside the Canvas (flag-gated).
   - `SceneAtmosphere`: when `RoomEnvironment.enabled`, **override**
     `activeLighting` — sun (directional from azimuth/elevation), hemisphere +
     ambient, fog, and mount drei `<Environment>` with the self-hosted HDRI
     (`files=`, `environmentIntensity`, optional background). Falls back to skin
     → `DEFAULT_LIGHTING` when disabled.
   - Apply tone mapping + exposure from env (`gl.toneMapping`,
     `gl.toneMappingExposure`) via effect.
   - Enable Canvas `shadows` when env/lights need them and tier ≥ medium; add
     `<SoftShadows>` on high.
   - Set `interactionDisabled` on object/board layers when the Lighting tab is in
     placement/selection mode (reuse the existing pattern at ~L602).
4. 🆕 `apps/web/lib/sunDirection.ts`: azimuth/elevation° → directional light
   position/direction vector (pure, unit-tested).
5. 🆕 self-hosted HDRIs under `apps/web/public/lighting/hdri/` (curated subset:
   studio, sunset, dawn, night, warehouse, park, apartment) + a `SOURCES.md`
   (license/attribution), 1k `.hdr`. (Asset task; can stub with 1–2 first.)
6. 🧪 `apps/web/tests/lightingBudget.test.ts`, `sunDirection.test.ts`.

Typecheck web. Manual: place lights via a dev harness or temporary button to
sanity-check rendering before the UI lands.

---

## Phase 5 — Lighting tab UI (palette, list, inspector)

All in the `build-dock` design system.

1. ✏️ `apps/web/components/BuildControls.tsx`:
   - Extend `BuildCategory` with `"lighting"`; add `{ id: "lighting", label:
     "Lighting" }` to `CATEGORIES`; add a `tab-lighting` glyph (a sun/spark icon)
     to `Glyph`.
   - New props (flag-gated, optional): `lights`, `selectedLightId`,
     `roomEnvironment`, and callbacks `onAddLight(type)`, `onSelectLight(id)`,
     `onUpdateLight(id, patch, commit)`, `onDeleteLight(id)`,
     `onDuplicateLight(id)`, `onUpdateEnvironment(patch, commit)`.
   - Render the Lighting body (PLAN §6.1) when `category === "lighting"`:
     **Add Light** tiles (Bulb/Spot/Soft Panel), **Lights in room** list (on/off
     toggle, select, delete, budget counter), **Selected light** inspector.
2. 🆕 `apps/web/components/lighting/LightInspector.tsx`: the per-type control
   panel (numeric X/Y/Z, color swatch → `<input type=color>`, sliders for
   intensity/range/decay/angle/penumbra/width/height, shadow toggle, on/off,
   name, duplicate, delete). Type-conditional fields per PLAN §6.4. Emits
   `onUpdateLight(id, patch, commit)` (commit on pointer-up / blur).
3. ✏️ `apps/web/app/globals.css`: add `.build-dock__lighting*`,
   `.light-inspector*`, `.light-list*` rules reusing `--bd-*` tokens (deep glass,
   blue micro-labels, rounded tiles, verse-tinted active states) — match the
   existing Image Floor / Uploads panels.
4. ✏️ `apps/web/components/RoomClient.tsx`: pass the new props into
   `<BuildControls>` (~L2994) and wire selection ↔ inspector.

Typecheck web.

---

## Phase 6 — Placement + in-world gizmo manipulation

1. 🆕 `apps/web/components/LightPlacementController.tsx`: mirror
   `AssetPlacementController` — pending light type, raycast to surface/plane,
   ghost preview (bulb glyph + range sphere / cone / rect), click → `createLight`
   at the hit (auto-select). Honour `wb-placement-active` body class + intercept
   plane (reuse `useStablePlacementLevel`, `assetInterceptPlaneY`).
2. ✏️ `apps/web/components/RoomLightsLayer.tsx`: mount **`<PivotControls>`**
   (translate) on the selected light → `onTransform` (live) + `onTransformCommit`
   (drag-end). Add a draggable **aim handle** (small sphere at `target`) for
   spot/area; dragging updates `target`. Sync with inspector numeric fields
   (two-way).
3. ✏️ `apps/web/components/RoomView3D.tsx`: render `<LightPlacementController>`
   when a light type is pending (flag-gated), like the asset/build controllers.
4. ✏️ keyboard handling in `RoomClient.tsx`: arrows nudge selected light, `Q`/`E`
   rotate aim, `[`/`]` intensity, `Del` delete, `Esc` deselect — all behind
   `isKeyboardOwnedTarget` and only when the Lighting tab is active.

Typecheck web. Manual UX pass: place, move, aim, recolor, delete; verify second
browser sees updates live.

---

## Phase 7 — Environment editor, presets, 2D parity, AI corpus

1. 🆕 `apps/web/components/lighting/EnvironmentPanel.tsx`: sun dial
   (azimuth/elevation) + chips (Morning/Noon/Golden hour/Night), sky/ground/
   ambient swatches + intensities, IBL preset dropdown + intensity + "as
   background", fog toggle/color/near/far, tone-mapping selector + exposure
   slider, and **mood presets** (Studio / Warm interior / Night / Stage /
   Overcast). Emits `onUpdateEnvironment(patch, commit)`.
2. 🆕 `apps/web/lib/lightingPresets.ts`: named environment presets (pure config)
   + optional starter-light scatter; pure + unit-tested.
3. ✏️ `apps/web/components/RoomView2D.tsx`: draw a small color-tinted icon per
   light at X/Z with a faint range ring (point/spot) or rect (area) — required
   2D analog parity. Use `useRoomLights` data via context/props.
4. ✏️ `apps/api/src/ai-host/corpus/world-building-guide.md` + `prompts.ts`: add a
   "Lighting" section (tabs now Build/Objects/Scenes/Uploads/Lighting; how to add
   and tune lights and the environment) so the AI World Host can guide users.
   ✏️ `apps/api/tests/ai-host/prompts.test.ts` if it asserts tab text.
5. ✏️ Coachmark/tips copy in `BuildControls.tsx` for the Lighting tab.

Typecheck web + api.

---

## Phase 8 — Validation, perf, docs

1. 🧪 `apps/web/test/world-builder-lighting.spec.ts` (Playwright, flag on): open
   the Lighting tab, add a spot light, edit intensity/color, confirm it persists
   on reload and is visible to a second context; toggle environment exposure.
2. Perf pass: verify per-tier budget caps (low 4 / med 8 / high 12), shadow
   caster caps, area-light cap; confirm out-of-budget lights render glyph-only;
   confirm flag-off path is unchanged (no shadows / no tone mapping).
3. Run: `npm run typecheck` (contracts/api/web), `npm run build -w @3dspace/web`,
   API + web vitest, the new Playwright spec.
4. ✏️ `.cursor/memory.md` (dated entry) + this folder's `README.md` status →
   "implemented (Phases n)".

---

## File touch summary

**Contracts:** 🆕 `src/lighting.ts` · ✏️ `src/room.ts` (settings) · ✏️ `src/index.ts` · ✏️ OpenAPI · 🧪 `tests/lighting.test.ts`.

**API:** ✏️ `config.ts` · ✏️ `repository.ts` (+ memory) · ✏️ `models/mongoose.ts` · 🆕 `routes/room-lights.ts` · ✏️ `routes/register-routes.ts` · ✏️ `ai-host/corpus/world-building-guide.md` + `prompts.ts` · 🧪 `tests/routes/room-lights.test.ts`.

**Room-engine:** 🆕 `src/lighting-budget.ts` · ✏️ `src/index.ts` · (refactor `BuildLayer` budget to consume it).

**Web:** 🆕 `lib/useRoomLights.ts`, `lib/useRoomEnvironment.ts`, `lib/lightingRenderer.ts`, `lib/sunDirection.ts`, `lib/lightingPresets.ts` · ✏️ `lib/api.ts`, `lib/config.ts` · 🆕 `components/RoomLightsLayer.tsx`, `components/LightGlyph.tsx`, `components/LightPlacementController.tsx`, `components/lighting/LightInspector.tsx`, `components/lighting/EnvironmentPanel.tsx` · ✏️ `components/BuildControls.tsx`, `components/RoomView3D.tsx`, `components/RoomView2D.tsx`, `components/BuildLayer.tsx`, `components/RoomClient.tsx` · ✏️ `app/globals.css` · 🆕 `public/lighting/hdri/*` · 🧪 `tests/lightingBudget.test.ts`, `tests/sunDirection.test.ts`, `test/world-builder-lighting.spec.ts`.

**Config:** ✏️ `.env.example` (×3), `playwright.config.ts`.

---

## Sequencing & dependencies

```
P0 (flag + budget + renderer scaffolding)
 └─ P1 (contracts) ─ P2 (API) ─ P3 (web data)
                                   └─ P4 (render) ─ P5 (tab UI) ─ P6 (gizmo)
                                                                    └─ P7 (env + presets + 2D + AI)
                                                                         └─ P8 (validation)
```

P1→P2→P3→P4 are the critical path; P5/P6 can begin against P3 with a stubbed
render layer. Each phase ends green on typecheck so the flag-off product is
never broken.
