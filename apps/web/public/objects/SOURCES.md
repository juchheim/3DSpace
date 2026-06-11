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

## `folding-chair.glb`

- Folding chair for the World Builder **Objects** palette. Avatars can sit with E.
- **Origin:** `GLBs/folding-chair.glb`
- **Format:** glTF 2.0 binary. Sittable (`sittable: true` in `worldAssetCatalog.ts`).

## `floor.glb` / `ramp.glb`

- See `BuildPieceMesh.tsx` for native dimensions and scaling.
