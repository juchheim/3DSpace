# Implementation Plan — World Skins, Phase A (Texture + Atmosphere)

Source concept: [`CONCEPT_WORLD_SKINS_PHASE_A.md`](./CONCEPT_WORLD_SKINS_PHASE_A.md).
Source idea: `LEARNING_FEATURE_IDEAS.md` § Big idea #3 — World Skins.
Branch target: `mvp-plus-one` (or a feature branch off it).
Effort estimate: ~4–5 weeks one engineer + 2D content sourcing in parallel.

## Status / Scope

**Status:** Planned. Not started.

Phase-by-phase implementation of the curated five-skin launch (**Mars Surface**, **Cell Interior**, **Roman Forum**, **Rainforest Canopy**, **Art Studio**) as **texture + atmosphere packs** — no glTF decorative props in Phase A. The skin contract is designed so Phase A+ can add `props[]` and `gltf` keys later without touching the geometry, anchors, or any classroom tool.

Geometry invariant ([CONCEPT §1.3](./CONCEPT_WORLD_SKINS_PHASE_A.md)): skin overrides may swap **materials, floor, sky, lighting, ambient audio, 2D map textures, walk speed, avatar scale** only. `bounds`, `spawnPoints`, `wallAnchors`, `projection` are untouched.

**In scope (Phase A):**

- New `RoomManifestSkin` catalog entity (server-owned, builtin-seeded; same pattern as `RoomObjectTemplate`).
- Five launch skins as catalog rows + R2-hosted texture/audio packs.
- Per-room `room.settings.skinId` + optional `room.settings.skinLocked`.
- Classroom actions: `set-room-skin`, `lock-room-skin`, `set-room-skin-day-night` (Forum only).
- Reliable realtime message `room.skin.v1` for live crossfade sync.
- `SkinLayer` in web client: wall/floor material swap, sky/fog/lighting preset, ambient audio loop, 2D map texture, crossfade.
- Code-only affordances: Mars walk-speed multiplier (~0.38×), Cell avatar/nameplate scale (~0.6×), Roman day/night lighting preset toggle.
- Teacher HUD `EnvironmentCard` (picker, calm/default, lock, ambient slider).
- Student banner ("Environment: …").
- Asset proxy route `GET /v1/world-skin-assets/*` reusing the room-object asset proxy pattern.
- Feature flag `ENABLE_WORLD_SKINS` / `NEXT_PUBLIC_ENABLE_WORLD_SKINS`, default `false`.

**Out of scope (deferred to Phase A+ / B / C):**

- glTF decorative props (rover, columns, organelles, canopy platforms, easels).
- District / partner skin authoring UI.
- Skin-specific interactive `RoomObject` templates.
- Per-lesson-step `skinId` (open question 2 in concept; deferred to A.1).
- Per-class default skin (open question 8; defer to B).
- Real-time ambient over LiveKit (Phase A uses CDN/static loop).

## Feature flag

- `ENABLE_WORLD_SKINS` (API) + `NEXT_PUBLIC_ENABLE_WORLD_SKINS` (web).
- Default: `false`. Flip after Phase 9 ships.
- When flag is off:
  - `GET /v1/world-skins` returns 404.
  - The three new classroom actions return 404 from `processClassroomAction` (same pattern as `toggle-pods`).
  - `RoomClient` ignores `room.settings.skinId` and renders default theater (skin overlay layer not mounted).
  - `RoomSettings.skinId` may be persisted but is inert.

---

## Phase 0 — Pilot skin authoring & dev harness

**Goal:** Prove the texture/atmosphere model works end-to-end on **one skin** in a dev-only harness before wiring up server/state. Mirrors RoomObject Phase 0 (hero authoring).

**Pilot pick:** **Mars Surface** — strongest demo affordance for texture-only delivery (walls, floor, sky, fog, wind audio, walk speed) and reuses CC/NASA imagery.

**Files to add:**

- `apps/web/components/worldSkins/types.ts` — `SkinDescriptor` (in-memory, not yet from server) with `wallMaterials: Record<wallId, MaterialDescriptor>`, `floor`, `lighting`, `sky`, `ambient`, `walkSpeedMultiplier`, `avatarScale`.
- `apps/web/components/worldSkins/MarsSkin.tsx` — pure component that takes `wall.id` and returns a themed `<meshStandardMaterial color | map>`; supplies `<color attach="background">`, `<fog>`, lights.
- `apps/web/components/worldSkins/SkinHarness.tsx` + matching CSS module — dev harness showing the default theater on the left, Mars on the right, A↔B toggle, walk-speed slider, ambient slider.
- `apps/web/app/dev/world-skin-hero/page.tsx` — dev-only route gated by `process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_WORLD_SKIN_DEV === "true"` (mirrors `dev/room-object-hero`).
- `packages/world-skins/` (new workspace, sibling to `packages/room-objects/`):
  - `package.json` (`"name": "@3dspace/world-skins"`, no exports beyond `catalog/`).
  - `catalog/hero-draft.json` — pilot skin draft (Mars), keys point to local `apps/web/public/world-skins/mars-surface/v1/...` for harness; will be re-keyed to R2 in Phase 2.
  - `tsconfig.json`, `scripts/render-skin-thumbnail.mjs` (dependency-free PNG generator → `apps/web/public/world-skins/thumbnails/mars-surface.png`, 800×500).
- `apps/web/public/world-skins/mars-surface/v1/` — production art uses **one** [`panorama.webp` at 8192×1024](./WORLD_SKIN_PANORAMA_SPEC.md) + `floor.webp` (2048×2048). Phase 0 may stay **color-only** in `hero-draft.json` until textures land; do **not** author eight per-wall files.
- `apps/web/public/world-skins/thumbnails/mars-surface.png` — catalog thumbnail.

**Quality gate (do not exit Phase 0 until):**

- Walls/floor look credibly "Martian" in 3D; main board text on `anchor-board` reads at WCAG AA contrast over the wall texture.
- Wind ambient loops without click; gain caps at ~15% (P3 in concept).
- Walk speed multiplier works in the harness (Mars + reset to 1×).
- When textures are added: `panorama.webp` is **8192×1024** per [panorama spec](./WORLD_SKIN_PANORAMA_SPEC.md); record compressed size in QA (≤3 MB is a stretch goal for this resolution).
- Sign-off recorded as a one-line addendum to `CONCEPT_WORLD_SKINS_PHASE_A.md` "open questions" with the chosen pilot.

**Checkpoint:**

- `npm --workspace @3dspace/web run typecheck` passes.
- Visit `http://localhost:3000/dev/world-skin-hero`; toggle A/B works; no console errors.
- No production code paths touched; no API contract changes.

---

## Phase 1 — Contracts

**Goal:** Schemas for skin catalog, room setting, classroom actions, and realtime message. No behavior yet.

**Files to change:**

- `packages/contracts/src/index.ts`:

  1. New schemas (placed near `RoomObjectsSettingsSchema`):

     ```ts
     export const WorldSkinSlugSchema = z.string().min(2).max(64);

     export const WorldSkinLightingPresetSchema = z.object({
       ambientColor: z.string(),          // hex
       ambientIntensity: z.number().min(0).max(4).default(0.82),
       directionalColor: z.string(),
       directionalIntensity: z.number().min(0).max(4).default(1.4),
       directionalPosition: z.tuple([z.number(), z.number(), z.number()]).default([4, 8, 6]),
       hemisphereSkyColor: z.string().optional(),
       hemisphereGroundColor: z.string().optional(),
       hemisphereIntensity: z.number().min(0).max(4).optional(),
       fogColor: z.string().optional(),
       fogNear: z.number().nonnegative().optional(),
       fogFar: z.number().nonnegative().optional(),
       backgroundColor: z.string().optional(),
       exposure: z.number().min(0).max(4).optional()
     });

     export const WorldSkinMaterialOverrideSchema = z.object({
       colorHex: z.string().optional(),
       textureStorageKey: z.string().optional(),
       roughness: z.number().min(0).max(1).optional(),
       metalness: z.number().min(0).max(1).optional(),
       repeat: z.tuple([z.number().positive(), z.number().positive()]).optional()
     });

     export const WorldSkinPanoramaWallSchema = z.object({ ... });  // 8192×1024 unwrap — see WORLD_SKIN_PANORAMA_SPEC.md

     export const WorldSkinOverridesSchema = z.object({
       panoramaWall: WorldSkinPanoramaWallSchema.optional(),           // production path
       walls: z.record(WorldSkinMaterialOverrideSchema).default({}),   // Phase 0 color-only / legacy
       floor: WorldSkinMaterialOverrideSchema.optional(),
       tiers: WorldSkinMaterialOverrideSchema.optional(),
       lighting: WorldSkinLightingPresetSchema,
       lightingNight: WorldSkinLightingPresetSchema.optional(),         // forum only
       sky: z.object({
         kind: z.enum(["color", "panorama"]).default("color"),
         storageKey: z.string().optional()                              // panorama only
       }).optional(),
       walkSpeedMultiplier: z.number().positive().max(2).optional(),
       avatarScale: z.number().positive().max(2).optional(),
       map2dStorageKey: z.string().optional(),
       boardDarkenOpacity: z.number().min(0).max(1).optional(),
       ambient: z.object({
         storageKey: z.string(),
         defaultGain: z.number().min(0).max(1).default(0.15),
         minGrade: z.string().optional()
       }).optional(),
       props: z.array(z.unknown()).default([])                          // Phase A+; empty in A
     });

     export const WorldSkinSchema = z.object({
       id: z.string(),
       slug: WorldSkinSlugSchema,
       label: z.string().min(1),
       description: z.string().max(500),
       gradeBands: z.array(z.string()).default([]),
       subjects: z.array(z.string()).default([]),
       baseManifestId: z.string().default("default-theater"),
       version: z.number().int().positive(),
       overrides: WorldSkinOverridesSchema,
       thumbnailStorageKey: z.string(),
       standardsCrosswalkUrl: z.string().optional(),
       licenseAttribution: z.array(z.object({
         assetId: z.string(),
         notice: z.string()
       })).default([]),
       review: z.object({
         reviewedAt: z.string(),
         reviewer: z.string(),
         notes: z.string().optional()
       }).optional(),
       source: z.enum(["builtin", "district"]).default("builtin"),
       createdAt: z.string(),
       updatedAt: z.string()
     });
     export type WorldSkin = z.infer<typeof WorldSkinSchema>;

     export const ListWorldSkinsResponseSchema = z.object({
       skins: z.array(WorldSkinSchema)
     });

     export const WorldSkinDayNightModeSchema = z.enum(["day", "night"]);
     ```

  2. Extend `RoomSettingsSchema` (alongside `pods` and `roomObjects`):

     ```ts
     worldSkins: z.object({
       enabled: z.boolean().default(true),
       skinId: z.string().nullable().default(null),
       skinDayNightMode: WorldSkinDayNightModeSchema.default("day"),
       skinLocked: z.boolean().default(false),
       ambientGainOverride: z.number().min(0).max(1).nullable().default(null)
     }).default({
       enabled: true,
       skinId: null,
       skinDayNightMode: "day",
       skinLocked: false,
       ambientGainOverride: null
     })
     ```

     The room-level `enabled` (default `true`) lets a teacher fully disable the feature for a single room even when the env flag is on; the env flag is the master gate.

  3. Three classroom actions (placed near `toggle-pods`):

     ```ts
     export const ClassroomSetRoomSkinActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("set-room-skin"),
       skinId: z.string().nullable()
     });
     export const ClassroomLockRoomSkinActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("lock-room-skin"),
       locked: z.boolean()
     });
     export const ClassroomSetRoomSkinDayNightActionSchema = ClassroomActionBaseSchema.extend({
       type: z.literal("set-room-skin-day-night"),
       mode: WorldSkinDayNightModeSchema
     });
     ```

     Add all three to the `ClassroomActionSchema` discriminated union.

  4. Realtime message:

     ```ts
     export const RoomSkinMessageSchema = z.object({
       type: z.literal("room.skin.v1"),
       skinId: z.string().nullable(),
       version: z.number().int().positive().optional(),
       dayNight: WorldSkinDayNightModeSchema.default("day"),
       crossfadeMs: z.number().int().min(0).max(5000).default(1000)
     });
     export type RoomSkinMessage = z.infer<typeof RoomSkinMessageSchema>;
     ```

  5. Export type aliases (`WorldSkin`, `WorldSkinOverrides`, `RoomSkinMessage`, etc.).

  6. OpenAPI registry: add `GET /v1/world-skins` → `ListWorldSkinsResponseSchema`, `GET /v1/world-skins/:slug` → `WorldSkinSchema`, `GET /v1/world-skin-assets/*` (raw bytes — register as `description` only, same pattern as `/v1/room-object-assets/*`).

- `packages/contracts/openapi/openapi.json` — regenerated; verify new entries appear.

**Checkpoint:**

- `npm run typecheck -w @3dspace/contracts` passes.
- Existing contracts tests still pass.
- `apps/api` / `apps/web` typecheck fails only in known places (no skin handlers / no SkinLayer yet).

**If you already finished Phase 1:** no rework. **`panoramaWall`** is an optional additive field on `WorldSkinOverridesSchema` (see [`WORLD_SKIN_PANORAMA_SPEC.md`](./WORLD_SKIN_PANORAMA_SPEC.md) and `WorldSkinPanoramaWallSchema` in `packages/contracts/src/index.ts`). Phase 0 `hero-draft.json` color-only `walls` still validates.

---

## Phase 2 — Catalog package, R2 layout, builtin seed

**Goal:** Five-skin catalog source-of-truth lives in `packages/world-skins/`; API seeds it on startup. R2 keys are agreed. No client wiring yet.

**Files to add / change:**

- `packages/world-skins/` workspace (created in Phase 0; finalized here):
  - `package.json` — workspace name `@3dspace/world-skins`.
  - `catalog/builtin.json` — array of five `WorldSkin` rows (slugs: `mars-surface`, `cell-interior`, `roman-forum`, `rainforest-canopy`, `art-studio`). All `storageKey`s point at the R2 prefix `world-skins/<slug>/v1/...`; `props: []` for every entry.
  - `catalog/hero-draft.json` (from Phase 0) is retained for the harness route and **not** consumed by the API.
  - `tsconfig.json` (mirrors `packages/room-objects`).
  - `scripts/render-skin-thumbnail.mjs` (Phase 0) extended to render the remaining four thumbnails into `apps/web/public/world-skins/thumbnails/<slug>.png`.
  - `tests/builtin-catalog.test.ts` — Zod-parse every entry of `builtin.json` against `WorldSkinSchema`; assert all five expected slugs are present; assert `props.length === 0` for every Phase A entry; assert each entry has **`overrides.panoramaWall`** (8192×1024 + default slices from `WORLD_SKIN_PANORAMA_SLICES_DEFAULT`), `floor`, `lighting`, `ambient`.

- `apps/api/src/world-skins/builtin-catalog.ts` (mirror `room-objects/builtin-catalog.ts`):
  - `resolveBuiltinCatalogPath()` checks bundled `dist/world-skins/catalog/builtin.json` then falls back to monorepo source.
  - `loadBuiltinWorldSkinCatalog(): WorldSkin[]` — parses with `WorldSkinSchema`.
  - `seedBuiltinWorldSkins(repository: Repository)` — `upsertBuiltinWorldSkins(skins)` on repository.

- `apps/api/scripts/copy-builtin-catalog.mjs` — extend to also copy `packages/world-skins/catalog/builtin.json` to `dist/world-skins/catalog/builtin.json`. (Or add a second small script invoked from `apps/api/package.json`'s `build` script.)

- `apps/api/src/repository.ts` and `apps/api/src/models/mongoose.ts`:
  - New `WorldSkin` collection (Mongoose) + in-memory mirror. Index on `slug` (unique) and `source`.
  - `upsertBuiltinWorldSkins(skins): Promise<void>` — match by `slug`, replace if `source === "builtin"`, set `updatedAt`.
  - `listWorldSkins(): Promise<WorldSkin[]>` — return all `source: "builtin"` rows ordered by `slug`.
  - `getWorldSkin(slug: string): Promise<WorldSkin | undefined>`.

- `apps/api/src/app.ts`:
  - In the bootstrap block where `seedBuiltinRoomObjectTemplates(repository)` is called (line ~2240), also `await seedBuiltinWorldSkins(repository)` — guard so it doesn't run when `ENABLE_WORLD_SKINS=false` (skip seed entirely, like `ENABLE_ROOM_OBJECTS` pattern if applicable).

- **R2 layout (operator note in IMPL — not code):**
  - Prefix: `world-skins/<slug>/<version>/...`.
  - **Required:** [`panorama.webp` (8192×1024)](./WORLD_SKIN_PANORAMA_SPEC.md), `floor.webp` (2048×2048). Optional: `sky.webp`, `map2d.webp`, `ambient.ogg`, `thumbnail.png`. **Do not** upload per-wall `wall-<id>.webp` for production skins.
  - Upload via `wrangler r2 object put` from the artist's delivered folder; not a code path in Phase A.

**Checkpoint:**

- `npm --workspace @3dspace/world-skins run test` passes (catalog Zod parse).
- `npm --workspace @3dspace/api run typecheck` passes.
- `npm run test -- apps/api/tests/api.test.ts -t "world skin"` (Phase 3 will add the API tests; this phase is structural only).

---

## Phase 3 — API: catalog endpoints, asset proxy, classroom actions, room settings

**Goal:** Skin catalog is readable; teachers can persist a default skin and dispatch the three classroom actions; signed asset URLs work.

**Files to change:**

- `apps/api/src/services/storage.ts`:

  1. Add `worldSkinAssetPath(storageKey: string)` mirroring `roomObjectAssetPath`.
  2. Add `worldSkinAssetUrl(config, storageKey)` returning `${apiPublicUrl}/v1/world-skin-assets/${path}`.
  3. No new uploader in Phase A (builtin assets only; uploads land in Phase B district authoring).

- `apps/api/src/config.ts`:

  ```ts
  enableWorldSkins: envBoolean(raw, "ENABLE_WORLD_SKINS", false),
  ```

- `apps/api/src/app.ts`:

  1. **GET `/v1/world-skins`** (auth required; flag-gated):
     - Returns `ListWorldSkinsResponseSchema.parse({ skins })` with `thumbnailStorageKey` rewritten to `worldSkinAssetUrl(config, key)`.
     - When flag off → 404 `world-skins-disabled`.
  2. **GET `/v1/world-skins/:slug`** (auth required; flag-gated):
     - Returns `WorldSkinSchema.parse(skin)` with **all** asset storage keys rewritten to absolute URLs via `worldSkinAssetUrl` (walls map values, floor, tiers, sky, ambient, map2d, thumbnail).
     - 404 when slug not found.
  3. **GET `/v1/world-skin-assets/*`** — mirror the `/v1/room-object-assets/*` route at line ~2376:
     - Authenticated; flag-gated.
     - Decode path, `readStoredObject(config, { storageKey })`; reply with the bytes and content-type from `contentTypeForStorageKey`; cache headers `cache-control: public, max-age=31536000, immutable` (skin asset paths are versioned).
  4. **Room create / update**:
     - In `roomSettings(config)` (line 211), add the `worldSkins` block:

       ```ts
       worldSkins: {
         enabled: true,
         skinId: null,
         skinDayNightMode: "day" as const,
         skinLocked: false,
         ambientGainOverride: null
       }
       ```

     - `PATCH /v1/rooms/:roomId` already passes a generic settings object through; verify the `worldSkins` sub-object is included in the allowed-key list and validated through `RoomSettingsSchema.partial()`.
  5. **Classroom actions** in `processClassroomAction`:
     - Add a flag check near line 1647:

       ```ts
       if ((input.action.type === "set-room-skin" || input.action.type === "lock-room-skin" || input.action.type === "set-room-skin-day-night") && !input.worldSkinsEnabled) {
         throw notFound("World skins are disabled");
       }
       ```

       Plumb `worldSkinsEnabled` from `config.tuning.enableWorldSkins` at the same call sites where `lessonsEnabled` and `breakoutPodsEnabled` are passed.
     - **`set-room-skin`** handler (mirrors `toggle-pods`):
       - `requireTeacher(actor)`.
       - `roomSettings.worldSkins.skinLocked` is **not** an actor-side block (the teacher can still switch); document this.
       - Validate `action.skinId === null || skinExists(action.skinId)`. 404 when slug unknown.
       - Side effect: **persist** `room.settings.worldSkins.skinId = action.skinId` via `repository.updateRoom`.
       - Emit a `RoomSkinMessage` (`type: "room.skin.v1"`) into the `realtimeMessages` outbox returned by the action handler — mirror the `realtimeMessages: [...]` plumbing used by RoomObject mutations (e.g. `apps/api/src/app.ts:3265+`).
     - **`lock-room-skin`** handler:
       - `requireTeacher`.
       - Persist `room.settings.worldSkins.skinLocked = action.locked`. No realtime message (clients re-read settings).
     - **`set-room-skin-day-night`** handler:
       - `requireTeacher`.
       - 422 unless `room.settings.worldSkins.skinId === "roman-forum"` (open question 6: keep it tight in v1).
       - Persist `room.settings.worldSkins.skinDayNightMode`.
       - Emit `room.skin.v1` with the updated `dayNight`.

- `apps/api/tests/api.test.ts`:
  - New describe block: `"world skins"`.
  - `seeds builtin catalog on app start` — count is 5; all slugs present.
  - `GET /v1/world-skins` returns five skins with absolute thumbnail URLs.
  - `GET /v1/world-skins/mars-surface` returns absolute URLs for wall/floor/ambient keys.
  - `GET /v1/world-skin-assets/...` returns bytes for a seeded asset (dev storage path); 404 for unknown key.
  - Teacher `set-room-skin { skinId: "mars-surface" }` → 200, room settings persisted, `realtimeMessages` contains a `room.skin.v1` entry; student attempt → 403.
  - Teacher `set-room-skin { skinId: "not-a-real-skin" }` → 404.
  - Teacher `set-room-skin-day-night { mode: "night" }` while `skinId !== "roman-forum"` → 422.
  - Teacher `lock-room-skin { locked: true }` → 200, persisted, no realtime message asserted.
  - With `ENABLE_WORLD_SKINS=false`: GET routes 404, action types 404.

**Checkpoint:**

- `npm run typecheck -w @3dspace/api` passes.
- `npm run test -- apps/api/tests/api.test.ts -t "world skin"` passes.
- Existing classroom-state tests still pass.

---

## Phase 4 — Web: skin context + API client wiring

**Goal:** Web client can fetch the catalog and a specific skin, and exposes a `useWorldSkin()` hook that the 3D/2D layers will consume. No rendering changes yet.

**Files to add / change:**

- `apps/web/lib/api.ts`:

  ```ts
  export async function listWorldSkins(identity: ApiIdentity) {
    return apiFetch<{ skins: WorldSkin[] }>(`/v1/world-skins`, { identity });
  }
  export async function fetchWorldSkin(slug: string, identity: ApiIdentity) {
    return apiFetch<WorldSkin>(`/v1/world-skins/${slug}`, { identity });
  }
  ```

  Add `WorldSkin` to the type imports from `@3dspace/contracts`.

- `apps/web/lib/config.ts`:

  ```ts
  enableWorldSkins: process.env.NEXT_PUBLIC_ENABLE_WORLD_SKINS === "true",
  ```

- `apps/web/lib/useWorldSkinCatalog.ts` (new) — mirrors `useRoomObjectTemplates`:
  - Module-level cache keyed by `userId`.
  - `useWorldSkinCatalog(identity)` returns `{ skins, refresh, loading, error }`.
  - 30s soft refresh; abort on identity change.

- `apps/web/lib/useWorldSkin.ts` (new) — the active-skin runtime hook:
  - Inputs: `{ identity, skinId, dayNightMode }`.
  - Behavior:
    1. When `skinId === null` → return `{ skin: null, ready: true, fadeMs: 0 }`.
    2. Otherwise fetch via `fetchWorldSkin(skinId)` (LRU per-skin cache; 1h TTL).
    3. Preload critical textures (`overrides.panoramaWall.storageKey`, `floor.textureStorageKey`) via `new Image()` + `<link rel="preload">` to warm the browser cache before applying (one wall image + floor).
    4. Expose `ready: boolean` (false until at least walls + floor are decoded) so `SkinLayer` can hold off the swap until the minimum-viable set is loaded ([CONCEPT §8.7](./CONCEPT_WORLD_SKINS_PHASE_A.md)).
    5. Expose `fadeMs` so the caller can run crossfade timing.
  - On error (network / 404 asset): return `{ skin: null, ready: true, fadeMs: 0, error }` so the renderer falls back to default theater.

- `apps/web/components/RoomClient.tsx`:
  - Wire `const skinId = session?.room.settings.worldSkins?.skinId ?? null;`
  - `const dayNightMode = session?.room.settings.worldSkins?.skinDayNightMode ?? "day";`
  - `const activeSkin = useWorldSkin({ identity, skinId, dayNightMode });` (only when `CLIENT_TUNING.enableWorldSkins`).
  - Subscribe to `room.skin.v1` messages on the realtime client. When received: update local `skinId` / `dayNightMode` overrides (the persisted room settings will follow on next session refresh, but the realtime message lets students react instantly). Re-call `useWorldSkin` via a `targetSkinId` state.
  - Expose `window.__debug.worldSkin = activeSkin;` (dev only) so manual QA can verify hydration before Phase 5 ships rendering.

- `apps/web/lib/realtime.ts`:
  - Add `room.skin.v1` to the reliable-message router. Add the `RoomSkinMessage` discriminant to the inbound dispatcher.

**Checkpoint:**

- `npm --workspace @3dspace/web run typecheck` passes.
- Manual: with the flag on and a teacher PATCH-ing `room.settings.worldSkins.skinId = "mars-surface"`, `window.__debug.worldSkin` shows the hydrated skin with absolute URLs.
- No visual change yet (Phase 5 wires the renderer).

---

## Phase 5 — 3D rendering: `SkinLayer`, wall/floor materials, lighting, sky, ambient

**Goal:** Active skin actually changes the room visually in 3D; default theater renders identically when `skinId === null`. Crossfade timing exists but visual blend may be a hard cut on slow Chromebooks (acceptable).

**Files to change:**

- `apps/web/components/RoomView3D.tsx`:

  1. Add a `skin?: SkinRuntime | null` prop. `SkinRuntime` is the lightweight runtime view of the resolved `WorldSkin` (typed in `lib/useWorldSkin.ts`): material lookup function `materialForWall(wallId)`, `materialForFloor()`, `lightingPreset`, `backgroundColor`, `fog`, `avatarScale`, `walkSpeedMultiplier`, `ambient`.
  2. Replace fixed scene lighting (`<ambientLight intensity={0.82} />`, `<directionalLight position={[4, 8, 6]} intensity={1.4} />`, `<color attach="background" args={["#16231d"]} />`) with values driven by `skin?.lightingPreset` and fall back to existing defaults when `skin === null`.
  3. `WallMesh` (line ~907): accept the resolved material descriptor as a prop or look it up from a `WorldSkinContext` (preferred — avoids drilling). Default behavior unchanged when no skin context; with a skin, swap `meshStandardMaterial` `color` / `map` accordingly. When `overrides.panoramaWall` is set, load **one** `TextureLoader` image and set per-mesh UVs from `slices[wall.id]` (`u0`, `u1`, `v1`; `v0` = 0). Texture loading via `useLoader(TextureLoader, url)` from `three`. Keep the existing camera-distance opacity fade.
  4. `RoomGeometry` floor plane (line ~826): same treatment for `meshStandardMaterial color="#d8c99f"`.
  5. `TierMesh` tier colors (line ~845–854): if `skin?.materialForTier()`, override per tier.
  6. Add an **optional board-darken pass**: behind each anchor mesh, render a subtle dark quad (`<mesh>` + `<meshBasicMaterial transparent opacity={skin?.boardDarkenOpacity ?? 0}>`) sized to the anchor rect. This addresses the readability concern ([CONCEPT §3.5](./CONCEPT_WORLD_SKINS_PHASE_A.md)) for busy wall textures without requiring artist work.

- `apps/web/components/worldSkins/SkinLayer.tsx` (new):

  - Context provider `WorldSkinContext` consumed by `WallMesh` / `RoomGeometry` floor / `TierMesh`.
  - Inputs: the resolved skin from `useWorldSkin`.
  - Texture cache: one memoized panorama `Three.Texture` per skin (with `colorSpace = SRGBColorSpace`, `ClampToEdgeWrapping` on U/V for the unwrap strip, `anisotropy = max(8, gl.capabilities.getMaxAnisotropy())`). Per-wall meshes clone or share that texture with mesh-specific UV offset/scale from `panoramaWall.slices`.
  - Crossfade plumbing: when `skinId` changes, hold the **previous** material descriptor for `fadeMs` and blend opacity from 1 → 0 on the old layer while 0 → 1 on the new. For Phase A, the blend uses two overlapping wall pass-throughs (acceptable cost — ten walls, ten extra meshes during the ~1s fade). Reduced-motion path: skip the blend, hard-cut.

- `apps/web/components/worldSkins/ambientPlayer.ts` (new) — non-React audio loop helper:
  - `startAmbient({ url, gain })` returns `{ stop, setGain }`.
  - Uses a single `HTMLAudioElement` per page with `loop = true`; routed through the shared `AudioContext` if available, else direct.
  - `stopAmbient()` fades to zero over 400 ms.

- `apps/web/components/RoomClient.tsx`:

  1. Mount `<SkinLayer skin={activeSkin.skin}>` around `<RoomView3D />` / `<RoomView2D />` (sibling so 2D consumes the same context).
  2. Drive `ambientPlayer` from `activeSkin.skin.overrides.ambient`. Ambient gain = `room.settings.worldSkins.ambientGainOverride ?? skin.overrides.ambient.defaultGain`.
  3. Pause ambient while `media.microphoneEnabled` is true **and** local participant role is teacher (avoid teacher voice fighting ambient). Resume when mic mutes.

**Checkpoint:**

- Manual: with `skinId = "mars-surface"` persisted and `ENABLE_WORLD_SKINS=true`, the room shows Mars walls + floor + sky color + warm directional light + wind ambient.
- Manual: setting `skinId = null` (calm/default) restores the original gray-green theater. No regression in board readability on default.
- Manual: switching `skinId = "cell-interior"` runs a crossfade (~1 s) with no scene flash.
- `npm --workspace @3dspace/web run typecheck` passes.

---

## Phase 6 — 2D parity: themed floor map + banner

**Goal:** `RoomView2D` honors the active skin via a themed floor texture and an environment label. Anchors / participant dots untouched.

**Files to change:**

- `apps/web/components/RoomView2D.tsx`:

  1. Consume `WorldSkinContext` from `SkinLayer`.
  2. Render the themed floor map: when `skin?.overrides.map2dStorageKey`, render an `<image>` element scaled to the same `viewBox` used by `projectPositionTo2D` (room bounds in percent). Below participant dots and anchor rectangles; above the default neutral background. Default (no skin) keeps the existing schematic.
  3. Render an `<text>` environment label `Environment: <skin.label>` at the bottom-right corner of the SVG (dismissible UX lives on `RoomClient`, not here).
  4. Apply `skin?.overrides.boardDarkenOpacity` as a subtle darker rectangle behind each `projectAnchorRectTo2D` rect so board cards stay legible.

- `apps/web/components/RoomClient.tsx`:
  - Add a slim banner above the canvas (3D and 2D) when `activeSkin.skin && !bannerDismissed`. Local `useState` for `bannerDismissed` (per-session memory, not persisted).
  - When the skin changes mid-session, reset `bannerDismissed = false` so students see the new label briefly.

- `apps/web/app/globals.css`:
  - `.world-skin-banner` — slim translucent strip, `var(--hud-tx-m)`-colored text, dismiss × button.
  - `.world-skin-board-darken` — for the 2D anchor backing rect.

**Checkpoint:**

- Manual: in 2D mode, switching to Mars overlays the Mars terrain map; banner reads "Environment: Mars Surface"; anchor rects sit above the texture; participant dots unchanged.
- Manual: switching back to default removes overlay; banner disappears.

---

## Phase 7 — Code-only affordances: walk speed, avatar scale, day/night

**Goal:** Mars slow walk, Cell avatar scale, Roman day/night work — all without new assets.

**Files to change:**

- `apps/web/lib/useAvatarMovement.ts`:

  1. New input field: `walkSpeedMultiplier?: number`.
  2. Where the per-frame movement integrator currently multiplies the keyboard/touch vector by `MOVE_SPEED` (or equivalent constant — locate the exact line during implementation; it's inside the `useEffect`/`requestAnimationFrame` body of `useAvatarMovement`), multiply additionally by `input.walkSpeedMultiplier ?? 1`.
  3. Edge case: do **not** apply the multiplier to programmatic `moveTo3DPoint` teleports (e.g. "Go to my pod"); a slow Mars-walk feel for a teleport is wrong UX.

- `apps/web/components/RoomClient.tsx`:
  - Pass `walkSpeedMultiplier: activeSkin.skin?.overrides.walkSpeedMultiplier ?? 1` to `useAvatarMovement`.

- `apps/web/components/BlockyAvatar.tsx`:
  - Already accepts a single avatar root `<group scale={...}>`. Add an optional `avatarScale?: number` prop and apply it on the outer group. Default `1`. Confirm nameplate `distanceFactor` still reads (Drei `Html`); the existing scale handling on the parent group propagates to the nameplate naturally — but if nameplates become unreadable at small scale, multiply the `distanceFactor` by `1 / avatarScale` so the nameplate stays the same visual size on screen.

- `apps/web/components/RoomView3D.tsx`:
  - Pass `avatarScale={activeSkin?.avatarScale ?? 1}` to each `<BlockyAvatar>`.
  - Add a one-time tooltip (small `HudCard` toast) when the local participant first enters a skin with `walkSpeedMultiplier !== 1`: `"Lower gravity — you move slower."` Dismiss after 6 s or on first key press. Owned by `RoomClient`.

- `apps/web/lib/realtime.ts`:
  - When `room.skin.v1` arrives with a new `dayNight`, update the local override; `useWorldSkin` will re-resolve `lighting` vs `lightingNight` accordingly.

- `apps/web/components/worldSkins/SkinLayer.tsx`:
  - When `skin.overrides.lightingNight` exists and `dayNightMode === "night"`, swap the lighting preset on the same crossfade timeline used for skin changes.

**Checkpoint:**

- Manual: with Mars active, hold W; avatar movement is visibly slower. Switch to default; speed returns to 1×.
- Manual: with Cell active, avatars + nameplates look "small" relative to walls; nameplates remain readable.
- Manual: with Forum active, teacher dispatches `set-room-skin-day-night { mode: "night" }`; lighting fades to warm low-light, boards remain readable.

---

## Phase 8 — Teacher HUD + student tooltip

**Goal:** Teachers can pick, lock, and tune skins from the HUD; students see a clear environment label.

**Files to add / change:**

- `apps/web/components/EnvironmentCard.tsx` (new) — teacher HUD card:

  - Title: **Environment**.
  - Current skin label + thumbnail. "Change…" button opens a modal `EnvironmentPicker`.
  - Toggle **Lock environment** (binds to `lock-room-skin`).
  - Slider **Ambient** 0–100% (binds to `room.settings.worldSkins.ambientGainOverride` via `PATCH /v1/rooms/:roomId`).
  - When current skin is Roman Forum: a `<select>` `Day | Night` bound to `set-room-skin-day-night`.
  - "Calm / default" button (dispatches `set-room-skin { skinId: null }`).
  - Hidden entirely when `!CLIENT_TUNING.enableWorldSkins` or `!session?.room.settings.worldSkins?.enabled`.

- `apps/web/components/EnvironmentPicker.tsx` (new) — modal:

  - Grid of skin cards: thumbnail, label, grade-band chips, one-line description.
  - "Default theater" tile pinned to top-left.
  - Click → confirm (preview hover shows the description; selection commits via `set-room-skin`).
  - Loading + error states fed by `useWorldSkinCatalog`.

- `apps/web/components/RoomClient.tsx`:

  - Mount `<EnvironmentCard>` in the teacher HUD column where `LessonRunControls` / `GroupsPanel` live.
  - Plumb `classroom.runAction` for the three new action types.
  - The student-side banner (Phase 6) is the student-facing UI — students do **not** see a picker.

- `apps/web/components/AnchorPanel.tsx` (read-only check):

  - Verify the panel does **not** import any skin material; anchor creation flows must stay decoupled from skins.

- `apps/web/app/globals.css`:

  - `.environment-card` and `.environment-picker` styles consistent with existing HudCards.
  - `.environment-picker__grid` — 2-column on narrow viewports, 3-column on wide.

**Checkpoint:**

- Manual: teacher opens **Environment** card; picks Mars → all clients crossfade to Mars; picks Calm/default → restore.
- Manual: teacher locks environment; the picker UI shows a "locked" badge but the teacher can still change skins (per concept: lock is about students not interfering — Phase A has no student picker, so the lock is forward-compat for B; document this).
- Manual: ambient slider works without restarting the loop.

---

## Phase 9 — Polish, e2e, env templates, rollout

**Goal:** Ship-ready. Tests pass, docs updated, flag flipped in staging.

**Files to change:**

- `apps/web/.env.example` — add `NEXT_PUBLIC_ENABLE_WORLD_SKINS=false`.
- `apps/api/.env.example` — add `ENABLE_WORLD_SKINS=false`.
- `.env.example` — same.
- `playwright.config.ts` — extend web/api dev commands with `ENABLE_WORLD_SKINS=true NEXT_PUBLIC_ENABLE_WORLD_SKINS=true` for e2e.
- `apps/web/test/world-skins.spec.ts` (new) — focused suite:
  - Seed a class + room with `room.settings.worldSkins.skinId = "mars-surface"`.
  - Teacher tab: confirm Mars walls/floor render; switch to `cell-interior`; confirm crossfade; lock; switch back to default.
  - Student tab: confirm banner reads "Environment: Mars Surface"; confirm avatar walk speed feels different (assert via `window.__debug.worldSkin.skin.overrides.walkSpeedMultiplier`).
  - Forum day/night toggle.
  - With `ENABLE_WORLD_SKINS=false`: catalog 404; classroom action types 404; no banner; default theater visible.
- `apps/web/test/mvp.spec.ts` — quick smoke that the existing "three-step lesson" e2e still passes when a non-default skin is active.
- `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` — add a **World Skins (Phase A)** section linking to CONCEPT/IMPL and the staging rollout date.
- `docs/planning/new-features/README.md` — add IMPL link under "Big-idea concept docs" so the index stays current.
- `.cursor/memory.md` — append a Bug Fixes / observations entry summarizing the ship and listing the five live skin slugs.
- `docs/planning/new-features/WORLD_SKIN_DEMO_SCRIPT.md` (new, optional) — companion to `ROOM_OBJECT_DEMO_SCRIPT.md`; 90-second pitch flow per [CONCEPT §11.1](./CONCEPT_WORLD_SKINS_PHASE_A.md).

**Validation evidence (fill in):**

- [ ] `npm run typecheck` — pass
- [ ] `npm test` — pass
- [ ] `npm run test -- apps/api/tests/api.test.ts -t "world skin"` — pass
- [ ] `npm --workspace @3dspace/world-skins run test` — pass
- [ ] `npm run test:e2e -- --grep "world skins"` — pass
- [ ] Manual: 90-second demo (default → Mars → Cell → Forum + day/night → Calm) recorded in a PR clip
- [ ] Manual: full `LessonRun` with one mid-run skin switch, no classroom-state drift
- [ ] Manual: Chromebook QA (Intel N4020-class) — five skins each load to first themed paint <5 s on Fast 3G throttle off
- [ ] Manual: iPad Safari QA — five skins; texture memory does not OOM after 10 switches
- [ ] Manual: per-skin pack size ≤3 MB confirmed via `wrangler r2 object list` totals

**Rollout:**

1. Merge to `mvp-plus-one` with flag off.
2. Operator: upload the five v1 asset packs to R2 (`world-skins/<slug>/v1/...`).
3. Flip `ENABLE_WORLD_SKINS=true` + `NEXT_PUBLIC_ENABLE_WORLD_SKINS=true` in staging only.
4. Internal teacher runs a five-skin tour; QA notes in PR.
5. Flip in production with `room.settings.worldSkins.skinId` defaulting to `null` per room (no surprise atmosphere change for existing rooms).
6. After a week of opt-in usage and demo wins, optionally raise `room.settings.worldSkins.enabled` default to `true` (already true; no change) and consider seeding `skinId = "default-theater"` (i.e. `null`) into the room-create template explicitly so the UI surfaces the picker on day one.

---

## Files-to-touch summary

| Area | File | Phase |
| --- | --- | --- |
| Dev harness | `apps/web/components/worldSkins/{types,MarsSkin,SkinHarness}.tsx`, `apps/web/app/dev/world-skin-hero/page.tsx` | 0 |
| Pilot asset pack | `apps/web/public/world-skins/mars-surface/v1/...`, `apps/web/public/world-skins/thumbnails/mars-surface.png` | 0 |
| World skins package | `packages/world-skins/` (workspace, catalog, thumbnail script, tests) | 0, 2 |
| Contracts | `packages/contracts/src/index.ts` | 1 |
| OpenAPI | `packages/contracts/openapi/openapi.json` (regenerated) | 1 |
| API builtin seed | `apps/api/src/world-skins/builtin-catalog.ts` | 2 |
| Catalog copy script | `apps/api/scripts/copy-builtin-catalog.mjs` (or sibling script) | 2 |
| API repository | `apps/api/src/repository.ts`, `apps/api/src/models/mongoose.ts` | 2 |
| API routes & actions | `apps/api/src/app.ts` | 3 |
| API storage helper | `apps/api/src/services/storage.ts` | 3 |
| API config | `apps/api/src/config.ts` | 3 |
| API tests | `apps/api/tests/api.test.ts` | 3 |
| Web API client | `apps/web/lib/api.ts` | 4 |
| Web config | `apps/web/lib/config.ts` | 4 |
| Web hooks | `apps/web/lib/useWorldSkinCatalog.ts`, `apps/web/lib/useWorldSkin.ts` | 4 |
| Web realtime | `apps/web/lib/realtime.ts` | 4, 7 |
| Web 3D | `apps/web/components/RoomView3D.tsx` | 5, 7 |
| SkinLayer | `apps/web/components/worldSkins/SkinLayer.tsx`, `apps/web/components/worldSkins/ambientPlayer.ts` | 5, 7 |
| Web 2D | `apps/web/components/RoomView2D.tsx` | 6 |
| Avatar | `apps/web/components/BlockyAvatar.tsx` | 7 |
| Movement | `apps/web/lib/useAvatarMovement.ts` | 7 |
| Teacher HUD | `apps/web/components/EnvironmentCard.tsx`, `apps/web/components/EnvironmentPicker.tsx` | 8 |
| Room wiring | `apps/web/components/RoomClient.tsx` | 4, 5, 6, 7, 8 |
| Styling | `apps/web/app/globals.css` | 6, 8 |
| Env templates | `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` | 9 |
| Playwright | `playwright.config.ts`, `apps/web/test/world-skins.spec.ts` | 9 |
| Docs | `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md`, `docs/planning/new-features/README.md`, `.cursor/memory.md`, optional `WORLD_SKIN_DEMO_SCRIPT.md` | 9 |

---

## IMPL-resolved open questions

These resolve open questions in [CONCEPT §17](./CONCEPT_WORLD_SKINS_PHASE_A.md). Decisions made here become law for Phase A; later phases may revisit.

| # | Concept question | Phase A decision | Rationale |
| --- | --- | --- | --- |
| 1 | Live switch: action vs PATCH vs both? | **Both.** PATCH for room defaults (pre-class); `set-room-skin` classroom action for live switches with realtime sync. | Mirrors how `room.settings.pods.enabled` (PATCH) coexists with `toggle-pods` (action). |
| 2 | Per-lesson-step `skinId`? | **Defer to A.1.** | Adds lesson schema surface; reuse manual switch via teacher HUD for demo. |
| 3 | Ambient: CDN vs LiveKit track? | **CDN/static `<audio>` loop**, fetched via authenticated `GET /v1/world-skin-assets/*`. | No new LiveKit track topology; simpler privacy story. |
| 4 | Texture sourcing? | **Mixed**: NASA/CC0 for Mars and Cell, commissioned illustration for Forum/Rainforest/Studio. | Cheapest path to district-credible art. |
| 5 | Cell avatar scale: scope? | **Visual scale only.** Collision bounds, spatial-audio positions, click-to-move stay in manifest coordinates. | Avoids retesting every classroom tool. |
| 6 | Forum night mode: default? | **Default `day`** per room; teacher toggles at runtime; not remembered across sessions. | Predictable starting state; toggle is cheap. |
| 7 | Capsule integration? | **Out of Phase A.** When Time Capsule ships, it will store `skinId` at seal time. | Time Capsule isn't on the active roadmap. |
| 8 | Per-class default skin? | **Room-level only in Phase A.** | Class-level config touches more entities; defer to Phase B (district authoring). |
| 9 | A+ prop priority? | **Mars rover** (single-mesh, central, highest sales impact). | Picked at IMPL time, not concept time. |

---

## Risks during implementation

- **Wall texture seams** — back wall is five collinear meshes but one **panorama** strip ([`WORLD_SKIN_PANORAMA_SPEC.md`](./WORLD_SKIN_PANORAMA_SPEC.md)). **Mitigation:** paint segments 2–6 continuously in the master 8192×1024 file; engine slices UVs — no per-wall files. QA each skin with a wide-angle screenshot of the back wall.
- **Board readability** — busy wall textures fail WCAG contrast behind notes/polls. **Mitigation:** `boardDarkenOpacity` (Phase 5, board-darken pass). QA every skin with at least one `note` and one `poll` on the main board before sign-off.
- **Anchor face-on-the-skin** — `WallMesh` already fades opacity by camera distance ([`apps/web/components/RoomView3D.tsx:906–932`](../../apps/web/components/RoomView3D.tsx)); the new material lookup must preserve the per-frame `useFrame` opacity update. Keep the existing `MeshStandardMaterial` instance and just swap `color` / `map` properties.
- **Texture memory on iPad Safari** — five skins × one panorama each is manageable; avoid loading eight separate wall textures per skin. **Mitigation:** `SkinLayer` holds one panorama texture per active skin; explicit `texture.dispose()` on skin change after the crossfade.
- **Ambient autoplay** — Chrome blocks audio until user gesture. **Mitigation:** ambient `play()` first happens on the same teacher click that selects the skin (gesture-bound); for students, ambient first plays on their next click anywhere in the room (debounced).
- **Crossfade jank during a `LessonRun` step** — `useFrame` work + texture decode can drop frames. **Mitigation:** Phase 5's crossfade is opt-in; on `prefers-reduced-motion` or while a `private-check` step is open, hard-cut.
- **Lesson `private-check` step UX** — teachers should avoid switching skins during a check. **Mitigation:** the EnvironmentCard "Change…" button shows a subtle warning when `classroom.state?.privateChecks.some(c => c.status === "open")`. Phase A does not block the action; it only warns.
- **Stale `WorldSkin` after artist re-uploads** — if a teacher loads the same `skinId` after a `version` bump, browsers may serve cached textures. **Mitigation:** asset cache headers use the versioned path (`world-skins/<slug>/v1/...`); bumping to `v2` invalidates by URL. The `WorldSkin.version` field surfaces in error reports.
- **Mongo schema migration** — `room.settings.worldSkins` is a new sub-document. Existing rooms read it via `parseRoomSettings` (Phase 1 default block); on next save, Mongoose persists. **No data migration script needed.**

---

## Acceptance gate (mirrors [CONCEPT §13.1](./CONCEPT_WORLD_SKINS_PHASE_A.md))

Phase A is complete when **all** of these are true:

- [ ] All five skins (`mars-surface`, `cell-interior`, `roman-forum`, `rainforest-canopy`, `art-studio`) render in 3D and 2D with no anchor/spawn/bounds regression.
- [ ] Teacher can set `skinId` at room creation and live via `set-room-skin`; persisted via PATCH.
- [ ] Lesson run completes with at least one mid-run skin switch; no classroom-state version corruption (test in `world-skins.spec.ts`).
- [ ] Wall objects (note, poll, image, link, timer, live share) work on every skin (readability QA per skin).
- [ ] Calm/default restore works in one action.
- [ ] Roman Forum day/night swaps lighting preset without layout shift.
- [ ] Mars walk-speed multiplier applies locally; Cell avatar scale applies; spatial audio positions unchanged.
- [ ] Ambient audio plays per skin; teacher can mute via the ambient slider.
- [ ] Catalog validates with `props: []` and no `gltf` keys; client does not require a prop loader for ship.
- [ ] Per-skin texture+audio pack ≤3 MB compressed on wire (documented per skin in the PR).
- [ ] Feature flag off by default; server enforces flag on catalog APIs and action types.
- [ ] Review log recorded per skin slug before production catalog enable.

Phase A+ (decorative glTF props) is **explicitly out of this implementation plan**. The schema and loader hooks land in Phase 1 / 5 so A+ is purely additive when 3D assets arrive.
