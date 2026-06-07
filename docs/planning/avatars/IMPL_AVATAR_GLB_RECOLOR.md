# Implementation — GLB Avatar Recolor

Plan: [`./PLAN_AVATAR_GLB_RECOLOR.md`](./PLAN_AVATAR_GLB_RECOLOR.md)  
Branch target: `feature/avatar-glb-recolor`  
Last updated: 2026-06-07 (passthrough-until-first-save)

---

## Status / Scope

- **Avatar rig:** Azure Vanguard (`/avatars/azure-vanguard.glb`), skinned mesh `char1`, 24-bone skeleton.
- **Appearance schema:** `AvatarAppearanceSchema` unchanged (23 hex keys).
- **Realtime envelope:** optional `customized: boolean` on `avatar.appearance.v1` (see plan §5.3).
- **Rendering:** neutral albedo + UV zone mask + luminance shader — **only when customization is active**.
- **Passthrough:** never-saved users (`avatar.appearance === null`) keep original baked GLB JPEG.
- **Flag:** `NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR` (default `false`).

**Out of scope:** accessory recolor, new keys on `AvatarAppearance`, 2D map tint, user texture uploads.

---

## Codebase context (2026-06-07)

| Area | Location |
| --- | --- |
| Avatar render (ignores appearance today) | `apps/web/components/BlockyAvatar.tsx` — `appearance: _appearance` |
| Zone labels for editor | `apps/web/lib/avatarMaterials.ts` — `ZONE_LABELS`, `ZONE_GROUPS` |
| Appearance hook | `apps/web/lib/useAvatarAppearance.ts` |
| Live preview | `apps/web/components/RoomClient.tsx` — `effectiveGetAppearance` |
| Appearance broadcast | `RoomClient.tsx` — `avatar.appearance.v1` |
| Editor panel | `apps/web/components/AvatarEditorPanel.tsx` |
| Accessory attach (unchanged) | `apps/web/components/AvatarAccessoryLayer.tsx` |
| Material clone pattern | `apps/web/components/GlbHostAvatar.tsx` — clone materials on load |
| GLB optimize script | `scripts/optimize-lp-glb.mjs` |
| Dev harness pattern | `apps/web/app/dev/avatar-accessories/page.tsx` |
| Contracts | `packages/contracts/src/index.ts` — `AvatarAppearanceSchema` |

### GLB facts (inspected)

| Property | Value |
| --- | --- |
| Meshes | 1 (`char1`, skinned) |
| Materials | 1 (`Material_1`, JPEG base color) |
| Vertices | 3,635 |
| Triangles | 3,144 |
| UV range | Wraps outside 0–1 (texture atlas — mask must match atlas layout) |

---

## Phase 0 — Recolor assets + generation scripts

**Goal:** Neutral albedo and zone mask exist under `public/avatars/` with validation tooling.

### New files

| File | Purpose |
| --- | --- |
| `scripts/generate-avatar-recolor-assets.mjs` | Desaturate albedo; dump UV reference PNG |
| `scripts/validate-avatar-zone-mask.mjs` | Assert mask IDs 0–23; coverage report |
| `GLBs/azure-vanguard/README.md` | Authoring notes, source file names |
| `GLBs/azure-vanguard/azure-vanguard-zone-mask.psd` (optional) | Layered mask source |
| `apps/web/public/avatars/azure-vanguard-albedo-neutral.jpg` | Shipped neutral albedo |
| `apps/web/public/avatars/azure-vanguard-zone-mask.png` | Shipped zone mask |
| `apps/web/public/avatars/RECOLOR_SOURCES.md` | Provenance + zone color key for mask paint |

### Steps

1. **Extract base color from GLB**

   ```bash
   node scripts/generate-avatar-recolor-assets.mjs \
     --input apps/web/public/avatars/azure-vanguard.glb \
     --extract-base-color GLBs/azure-vanguard/base-color-source.jpg
   ```

2. **Generate neutral albedo**

   ```bash
   node scripts/generate-avatar-recolor-assets.mjs --albedo-only \
     --input GLBs/azure-vanguard/base-color-source.jpg \
     --output apps/web/public/avatars/azure-vanguard-albedo-neutral.jpg
   ```

   Implementation notes for script:
   - Use `sharp` with custom matrix or `greyscale({ palette: 'rec709' })` equivalent.
   - Preserve original dimensions exactly.
   - Output JPEG q85 (match existing avatar texture policy).

3. **Dump UV reference** (for mask painting)

   ```bash
   node scripts/generate-avatar-recolor-assets.mjs --uv-reference \
     --output GLBs/azure-vanguard/uv-reference.png
   ```

   Render each triangle into a 2D canvas using `TEXCOORD_0` (handle UV wraps by using raw UV, not normalized 0–1 viewport).

4. **Author zone mask** (manual — see plan §4.2)
   - Paint in Blender UV editor or Krita using `avatarZoneRegistry` gray values (`zoneId / 255`).
   - Start with coarse fills; refine seams in Phase 5 harness.

5. **Validate mask**

   ```bash
   node scripts/validate-avatar-zone-mask.mjs \
     apps/web/public/avatars/azure-vanguard-zone-mask.png
   ```

   Exit non-zero if any required zone ID is missing.

### Checkpoint

- [ ] Neutral albedo visually matches original shading (folds visible, no color).
- [ ] Mask validates; all IDs 1–23 present.
- [ ] `RECOLOR_SOURCES.md` committed.

---

## Phase 1 — Zone registry + appearance uniforms

**Goal:** Typed mapping from `AvatarAppearance` → GPU uniform array.

### New files

- `apps/web/lib/avatarZoneRegistry.ts`
- `apps/web/tests/avatar-zone-registry.test.ts`

### `avatarZoneRegistry.ts` API

```typescript
export const AVATAR_ZONE_COUNT = 24; // index 0 = passthrough

export type AvatarZoneId = 0 | 1 | 2 | /* ... */ 23;

export const AVATAR_ZONE_BY_KEY: Record<keyof AvatarAppearance, AvatarZoneId>;

export const AVATAR_ZONE_KEY_BY_ID: Record<AvatarZoneId, keyof AvatarAppearance | null>;

/** Linear RGB 0–1, length 24; index 0 = unused black */
export function appearanceToZoneColorArray(appearance: AvatarAppearance): Float32Array;

/** sRGB hex → linear RGB vec3 */
export function hexToLinearRgb(hex: string): [number, number, number];

/** Case-normalized compare of all 23 keys to DEFAULT_APPEARANCE */
export function appearanceEqualsDefault(appearance: AvatarAppearance): boolean;
```

### `avatarRecolorGate.ts` API (new)

```typescript
export type AvatarRecolorGateInput = {
  flagEnabled: boolean;
  /** Local: session.avatarAppearance != null. Remote: message.customized === true */
  appearanceCustomized: boolean;
  /** Local only: editor open with dirty draft */
  editorPreviewActive?: boolean;
  /** Legacy realtime messages without customized field */
  customizedFieldPresent?: boolean;
  appearance: AvatarAppearance;
};

/** Whether to apply neutral albedo + mask shader (see plan §5.3) */
export function shouldApplyAvatarRecolor(input: AvatarRecolorGateInput): boolean;
```

Gate logic:

```typescript
export function shouldApplyAvatarRecolor(input: AvatarRecolorGateInput): boolean {
  if (!input.flagEnabled) return false;
  if (input.editorPreviewActive) return true;
  if (input.appearanceCustomized) return true;
  // Legacy clients: recolor only when appearance differs from defaults
  if (input.customizedFieldPresent === false) return false;
  if (input.customizedFieldPresent === undefined) {
    return !appearanceEqualsDefault(input.appearance);
  }
  return false;
}
```

### Steps

1. Define the ID table exactly as in `PLAN_AVATAR_GLB_RECOLOR.md` §3.3.
2. `appearanceToZoneColorArray`:
   - Allocate `Float32Array(24 * 3)`.
   - For each `(key, id)` in `AVATAR_ZONE_BY_KEY`, write linear RGB at `id * 3`.
   - Index `0` stays `0,0,0` (unused; shader skips zone 0).
3. Implement `appearanceEqualsDefault` — normalize hex to lowercase `#rrggbb` before compare.
4. Implement `shouldApplyAvatarRecolor` in `avatarRecolorGate.ts`.
5. Unit tests:
   - All 23 keys map to unique IDs 1–23.
   - `#ff0000` on `shirtFront` ends up at index `8 * 3` with correct linear values.
   - Round-trip: every ID 1–23 has a key.
   - `shouldApplyAvatarRecolor`: flag off → false; flag on + never saved → false; flag on + customized → true; flag on + dirty preview → true; legacy non-default appearance → true.

### Checkpoint

```bash
npm run test -- apps/web/tests/avatar-zone-registry.test.ts
```

---

## Phase 2 — Recolor shader module

**Goal:** Reusable `onBeforeCompile` patch applied to cloned `MeshStandardMaterial`.

### New files

- `apps/web/lib/avatarRecolorShader.ts`
- `apps/web/tests/avatar-recolor-shader.test.ts`

### API

```typescript
export type AvatarRecolorTextures = {
  neutralAlbedo: Texture;
  zoneMask: Texture;
};

export function applyAvatarRecolorShader(
  material: MeshStandardMaterial,
  textures: AvatarRecolorTextures
): void;

export function updateAvatarRecolorColors(
  material: MeshStandardMaterial,
  appearance: AvatarAppearance
): void;
```

### Implementation steps

1. **Load shared textures once** (module-level cache):

   ```typescript
   const NEUTRAL_URL = "/avatars/azure-vanguard-albedo-neutral.jpg";
   const MASK_URL = "/avatars/azure-vanguard-zone-mask.png";
   ```

   Configure:
   - `neutralAlbedo`: `SRGBColorSpace`, anisotropy per project default.
   - `zoneMask`: `NoColorSpace` (data texture), `NearestFilter`, `ClampToEdgeWrapping`.

2. **`applyAvatarRecolorShader`**
   - Set `material.map = neutralAlbedo`.
   - Guard with `material.userData.avatarRecolorPatched` to avoid double patch.
   - `material.onBeforeCompile = (shader) => { ... }`:
     - Add uniforms: `zoneMask`, `zoneColors` (`vec3[24]`), `tintStrength` (`float`, default `1.0`).
     - Inject into fragment shader after `#include <map_fragment>`:

       ```glsl
       #ifdef USE_MAP
         float zoneId = texture2D(zoneMask, vMapUv).r * 255.0;
         int zone = int(zoneId + 0.5);
         if (zone > 0 && zone < 24) {
           vec3 tint = zoneColors[zone];
           float luma = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
           diffuseColor.rgb = mix(diffuseColor.rgb, tint * luma, tintStrength);
         }
       #endif
       ```

     - Store `shader.uniforms` refs on `material.userData` for updates.
   - Call `material.needsUpdate = true` once after patch.

3. **`updateAvatarRecolorColors`**
   - Read `material.userData.recolorUniforms.zoneColors`.
   - `uniform.value.set(appearanceToZoneColorArray(appearance))`.

4. **Unit tests**
   - Patch is idempotent (second call does not duplicate GLSL).
   - `updateAvatarRecolorColors` writes expected array length 72.

### Checkpoint

```bash
npm run test -- apps/web/tests/avatar-recolor-shader.test.ts
npm run typecheck -w @3dspace/web
```

---

## Phase 3 — Passthrough gate, realtime, and `BlockyAvatar` integration

**Goal:** Recolor applies only when customization is active; never-saved users keep baked GLB.

### Modified files

- `packages/contracts/src/index.ts` — `customized` on message schema
- `apps/web/lib/useAvatarAppearance.ts` — track `customized` per participant
- `apps/web/components/RoomClient.tsx` — publish/subscribe `customized`; pass gate inputs
- `apps/web/components/RoomView3D.tsx` — pass `appearanceCustomized` + `editorPreviewActive` to avatar
- `apps/web/components/BlockyAvatar.tsx`
- `apps/web/lib/config.ts` — `CLIENT_TUNING.enableAvatarGlbRecolor`

### Step 3a — Contracts + appearance state

1. Extend message schema (envelope only):

   ```typescript
   export const AvatarAppearanceMessageSchema = z.object({
     type:          z.literal("avatar.appearance.v1"),
     participantId: z.string(),
     appearance:    AvatarAppearanceSchema,
     customized:    z.boolean().optional(),
   });
   ```

2. `useAvatarAppearance.ts` — parallel map:

   ```typescript
   type CustomizedMap = Map<string, boolean>;
   // receiveAppearance(id, appearance, customized?)
   // getAppearanceCustomized(id) → boolean
   ```

   - Default `false` when participant unknown.
   - On `receiveAppearance`, store `customized ?? !appearanceEqualsDefault(appearance)` for legacy messages.

3. `RoomClient.tsx` publish sites (connect, new-peer re-broadcast, on save):

   ```typescript
   realtime.publish({
     type: "avatar.appearance.v1",
     participantId: session.participantId,
     appearance: localAppearanceRef.current,
     customized: session.avatarAppearance != null, // true after first save
   });
   ```

   After successful `patchAvatarAppearance`, subsequent publishes use `customized: true`.

4. `effectiveGetAppearance` unchanged. Add:

   ```typescript
   function effectiveGetAppearanceCustomized(id: string): boolean {
     if (id === localParticipantId) return session?.avatarAppearance != null;
     return getAppearanceCustomized(id);
   }
   const editorPreviewActive =
     id === localParticipantId && avatarEditorOpen && localDraftAppearance !== null && editorDirty;
   ```

   (`editorDirty` — reuse `useAvatarEditor` dirty flag surfaced via `AvatarEditorPanel` callback, or compare draft to saved.)

### Step 3b — Config flag

```typescript
enableAvatarGlbRecolor: process.env.NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR === "true",
```

Document in `apps/web/.env.example`.

### Step 3c — `BlockyAvatar` / `AvatarModel`

New props:

```typescript
export type BlockyAvatarProps = {
  // ...existing
  appearance: AvatarAppearance;
  appearanceCustomized: boolean;
  editorPreviewActive?: boolean;
};
```

**On model clone** (after `SkeletonUtils.clone`):

```typescript
const recolorActive = shouldApplyAvatarRecolor({
  flagEnabled: CLIENT_TUNING.enableAvatarGlbRecolor,
  appearanceCustomized,
  editorPreviewActive: editorPreviewActive ?? false,
  appearance,
});

model.traverse((obj) => {
  if (!isSkinnedMesh(obj)) return;
  const sourceMat = obj.material as MeshStandardMaterial;
  const mat = sourceMat.clone();
  obj.material = mat;

  if (!recolorActive) {
    // Passthrough: keep baked JPEG from GLB — no shader patch
    return;
  }

  applyAvatarRecolorShader(mat, getAvatarRecolorTextures());
  updateAvatarRecolorColors(mat, appearance);
});
```

**Re-evaluate when gate inputs change** — `useEffect([appearance, appearanceCustomized, editorPreviewActive])`:

- If `recolorActive` flips `false → true`: apply shader + colors on cloned materials.
- If `true → false`: restore original `material.map` from GLB cache; remove `onBeforeCompile` patch (or re-clone mesh from GLTF cache — simpler to keep `bakedMaterial` ref from initial load).
- If stays `true`: `updateAvatarRecolorColors` only.

Store `bakedMaterialMap` on first load for passthrough restore.

**`BlockyAvatar`** — rename `_appearance` → `appearance`; pass gate props from `RoomView3D`.

### Step 3d — When flag off

Retain today's behavior (baked GLB JPEG, appearance ignored). `shouldApplyAvatarRecolor` returns false immediately.

### Checkpoint

- [ ] Flag `true`, never-saved user: avatar **matches pre-feature baked GLB** (side-by-side screenshot).
- [ ] Flag `true`, open editor, change shirt (unsaved): local preview shows recolor.
- [ ] Close editor without save (never-saved): reverts to baked GLB.
- [ ] First `PATCH` save: recolor persists after reload.
- [ ] Remote peer: never-saved user baked; saved user recolored (`customized: true` on wire).
- [ ] Flag `false`: unchanged baked look for everyone.
- [ ] Two browser tabs with saved custom colors: no cross-bleed.

```bash
npm run typecheck -w @3dspace/web
```

---

## Phase 4 — Dev harness `/dev/avatar-recolor`

**Goal:** Fast mask + tint iteration without joining a room.

### New files

- `apps/web/app/dev/avatar-recolor/page.tsx`
- `apps/web/components/avatarRecolor/AvatarRecolorHarness.tsx` (optional split)

### Features

| Control | Behavior |
| --- | --- |
| Zone picker grid | All 23 keys; reuses `ZONE_GROUPS` / `ZONE_LABELS` |
| Overlay toggles | Show zone mask on mesh / show UV reference inset |
| Albedo toggle | Neutral vs original baked (debug) |
| `tintStrength` slider | 0–1 for shader tuning |
| Export JSON | Copy current `AvatarAppearance` for test fixtures |
| Animation | Idle / walk / run clip switch |

### Steps

1. Copy structure from `/dev/avatar-accessories` page (Canvas + OrbitControls + Azure Vanguard).
2. Force `enableAvatarGlbRecolor` on in harness (ignore env flag).
3. Add mask overlay mode: second UV pass with `zoneMask` as `map` + false-color fragment for debugging.

### Checkpoint

- [ ] Harness loads without room session.
- [ ] Changing `shirtFront` to `#ff0000` is visibly red on torso UV islands.

---

## Phase 5 — Mask refinement + visual QA

**Goal:** Production-quality zone boundaries.

### Process

1. Run harness overlay; list seam problems (collar/shirt, hair/face, shoe sole).
2. Edit `azure-vanguard-zone-mask.png`; re-validate script.
3. Sign off against plan §6.1 checklist.
4. Capture **before/after screenshots** stored in `docs/planning/avatars/screenshots/recolor/` (optional).

### Common fixes

| Artifact | Fix |
| --- | --- |
| Color bleed across UV seam | Extend mask paint 1–2 texels across seam on both islands |
| Face tinted when hair changes | Expand mask `0` passthrough for eyes/lips; tighten hair IDs |
| Sleeves wrong zone | Paint arm UV islands to ID 14 (`sleeve`) explicitly |

### Checkpoint

- [ ] All items in `PLAN_AVATAR_GLB_RECOLOR.md` §6.1 checked.

---

## Phase 6 — Automated tests + Playwright

**Goal:** Prevent regressions on registry, shader, and editor path.

### New files

- `apps/web/tests/avatar-recolor-shader.test.ts` (if not done in Phase 2)
- `apps/web/test/avatar-recolor.spec.ts`
- `apps/web/playwright.config.ts` — enable recolor flag for spec

### Playwright flow

1. Set `NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR=true` in test env.
2. **Passthrough:** join as fresh user (no saved appearance) — canvas matches baseline baked-avatar screenshot.
3. Open editor, set `shirtFront` to `#ff0000` (do not save) — canvas shows red tint vs baseline.
4. Close editor without save — canvas matches baseline again.
5. Save appearance — canvas shows red tint; reload room — still recolored.
6. Second browser tab sees saved user's recolor; never-saved peer stays baked.

### Unit coverage

| Test | Asserts |
| --- | --- |
| `avatar-zone-registry.test.ts` | 23 unique IDs, linear color conversion |
| `avatar-recolor-gate.test.ts` | `shouldApplyAvatarRecolor` truth table (plan §5.3) |
| `avatar-recolor-shader.test.ts` | Patch idempotency, uniform array length |

### Checkpoint

```bash
npm run test -- apps/web/tests/avatar-zone-registry.test.ts apps/web/tests/avatar-recolor-gate.test.ts apps/web/tests/avatar-recolor-shader.test.ts
npx playwright test apps/web/test/avatar-recolor.spec.ts
```

---

## Phase 7 — Docs, flag rollout, status

**Goal:** Ship behind flag; document enable path.

### Modified files

- `docs/planning/avatars/AVATAR_GLB_RECOLOR_STATUS.md` — phase table
- `docs/planning/avatars/AVATAR_STATUS.md` — add “GLB recolor” section
- `docs/planning/avatars/README.md` — index row
- `.env.example`, `apps/web/.env.example` — flag docs
- `.cursor/memory.md` — index entry

### Rollout checklist

- [ ] Flag documented (default `false`)
- [ ] `RECOLOR_SOURCES.md` + mask validation in CI optional job
- [ ] Staging: flag `true`, visual sign-off with 2+ users
- [ ] Production: flag `true` after sign-off

---

## Files-to-touch summary

| Phase | New | Modified |
| --- | --- | --- |
| 0 | scripts ×2, neutral JPG, mask PNG, `RECOLOR_SOURCES.md`, `GLBs/azure-vanguard/*` | — |
| 1 | `avatarZoneRegistry.ts`, `avatarRecolorGate.ts`, unit tests | — |
| 2 | `avatarRecolorShader.ts`, unit test | — |
| 3 | — | `BlockyAvatar.tsx`, `RoomView3D.tsx`, `RoomClient.tsx`, `useAvatarAppearance.ts`, `packages/contracts`, `config.ts`, `.env.example` |
| 4 | `/dev/avatar-recolor` page, harness component | — |
| 5 | optional screenshots | mask PNG |
| 6 | Playwright spec | `playwright.config.ts` |
| 7 | `AVATAR_GLB_RECOLOR_STATUS.md` | `README.md`, `AVATAR_STATUS.md`, memory |

---

## Validation commands

```bash
# Asset pipeline
node scripts/generate-avatar-recolor-assets.mjs --albedo-only
node scripts/validate-avatar-zone-mask.mjs apps/web/public/avatars/azure-vanguard-zone-mask.png

# Types + unit
npm run typecheck -w @3dspace/web
npm run test -- apps/web/tests/avatar-zone-registry.test.ts
npm run test -- apps/web/tests/avatar-recolor-gate.test.ts
npm run test -- apps/web/tests/avatar-recolor-shader.test.ts

# E2E (flag on)
NEXT_PUBLIC_ENABLE_AVATAR_GLB_RECOLOR=true npx playwright test apps/web/test/avatar-recolor.spec.ts
```

---

## Resolved implementation decisions

| Question | Decision |
| --- | --- |
| Replace GLB internal texture? | Only when recolor active — runtime override to neutral JPEG; passthrough keeps baked map |
| Default look before customization | **Passthrough until first save** — `avatar.appearance === null` → baked GLB |
| Editor unsaved preview | Local `editorPreviewActive` forces recolor while draft is dirty |
| Remote passthrough signal | `customized: boolean` on `avatar.appearance.v1`; legacy fallback via `appearanceEqualsDefault` |
| Mask filtering | `NearestFilter` always |
| Passthrough zones (shader) | Mask `0` — eyes, teeth, details |
| Per-instance materials | Clone on `SkeletonUtils.clone` traverse |
| Appearance updates | Uniform push only when recolor active |
| Gate toggle | Re-apply or restore baked `material.map` when `shouldApplyAvatarRecolor` flips |
| Three.js upgrade risk | Single module owns `onBeforeCompile` strings |
| CI mask validation | Optional script in `npm run validate:avatar-recolor` |

---

## Dependency graph

```text
Phase 0 (assets)
    ↓
Phase 1 (registry) ──→ Phase 2 (shader)
                            ↓
                       Phase 3 (BlockyAvatar)
                            ↓
                       Phase 4 (harness) → Phase 5 (mask QA)
                            ↓
                       Phase 6 (tests) → Phase 7 (rollout)
```

Phases 1 and 2 can proceed in parallel once Phase 0 neutral albedo exists (mask required before Phase 5 only).
