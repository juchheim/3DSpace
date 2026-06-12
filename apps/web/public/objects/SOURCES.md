# World Builder object GLBs

## `wall.glb`

- Detailed wall segment for the World Builder **Wall** tool.
- **Origin:** `GLBs/wall.glb`
- **Format:** glTF 2.0 binary, ~3.6 MB. Native footprint ~2.39 × 2.0 × 0.70 m; scaled to
  `BUILD_CELL_SIZE` × `BUILD_WALL_HEIGHT` at render time.

## `wall-simple.glb`

- Plain wall segment for the World Builder **Simple Wall** tool.
- **Origin:** `GLBs/wall-simple.glb` (base color re-encoded to JPEG q85 via
  `scripts/optimize-lp-glb.mjs`).
- **Format:** glTF 2.0 binary, ~1.1 MB. Native footprint ~2.01 × 2.0 × 0.26 m; same engine
  collision as `wall.glb`.

## `lamp.glb`

- Table lamp for the World Builder **Light** tool (shortcut `7`).
- **Origin:** `GLBs/lamp.glb` (textures re-encoded to JPEG q85; mesh split into
  `LampBase` + `LampShade` via `scripts/prepare-lamp-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.5 MB. Native height 1.2 m; scaled to 1.8 m at
  render time. Shade is translucent with warm emissive bleed from the bulb.

## `table-6-walnut.glb`

- Walnut conference table for the World Builder **Objects** palette.
- **Origin:** `GLBs/table-6-walnut.glb` (base color re-encoded to JPEG q85 via
  `scripts/prepare-table-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.8 MB. Native height 1.0 m; scaled to 0.8 m (80 cm) at
  render time (`scale: 0.8` in `worldAssetCatalog.ts`). No sit interaction.

## `table-round-walnut.glb`

- Round walnut table for the World Builder **Objects** palette.
- **Origin:** `GLBs/table-round-walnut.glb` (base color re-encoded to JPEG q85 via
  `scripts/prepare-table-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.7 MB. Native height 0.8 m. No sit interaction.

## `chair-walnut.glb`

- Walnut side chair for the World Builder **Objects** palette. Avatars can sit with E.
- **Origin:** `GLBs/chair-walnut.glb` (base color re-encoded to JPEG q85 via
  `scripts/prepare-table-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.6 MB. Native height 1.0 m; scaled to 0.8 m at render time
  (`scale: 0.8` in `worldAssetCatalog.ts`). Sittable.

## `school-desk-chair2.glb`

- Student desk-chair combo for the World Builder **Objects** palette. Avatars can sit with E.
- **Origin:** `GLBs/school-desk-chair4.glb` (textures re-encoded via `scripts/prepare-table-glb.mjs`;
  unused duplicate texture slots pruned).
- **Format:** glTF 2.0 binary, ~1.0 MB (~13.6k tris). Native height 0.8 m. Sittable.

## `folding-chair.glb`

- Folding chair for the World Builder **Objects** palette. Avatars can sit with E.
- **Origin:** `GLBs/folding-chair.glb`
- **Format:** glTF 2.0 binary. Sittable (`sittable: true` in `worldAssetCatalog.ts`).

## `tree.glb`

- Deciduous tree for the World Builder **Objects** palette.
- **Origin:** `GLBs/tree.glb` (all PNG textures, including the normal map, re-encoded to JPEG q85 via
  `scripts/prepare-tree-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.76 MB (~3k tris). Native footprint ~1.8 × 3.0 × 1.85 m.
- **Placement:** each instance samples a render scale in ±15% (`scaleVariance: 0.15` in
  `worldAssetCatalog.ts`); the chosen scale is persisted on the placed world asset so every
  participant sees the same tree size.

## `tree-in-a-pot.glb`

- Potted tree for the World Builder **Objects** palette.
- **Origin:** `GLBs/tree-in-a-pot.glb` (base color re-encoded to JPEG q85 via
  `scripts/prepare-tree-in-a-pot-glb.mjs`).
- **Format:** glTF 2.0 binary, ~0.45 MB (~3k tris). Native footprint ~1.7 × 3.0 × 1.8 m.
- **Placement:** ±15% per-instance scale variance (`scaleVariance: 0.15`), same as `tree.glb`.

## `floor.glb` / `ramp.glb`

- See `BuildPieceMesh.tsx` for native dimensions and scaling.
