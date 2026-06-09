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
- **Format:** glTF 2.0 binary, ~2 MB. Native height 1.2 m; scaled to 0.72 m at
  render time. Shade is translucent with warm emissive bleed from the bulb.

## `floor.glb` / `ramp.glb`

- See `BuildPieceMesh.tsx` for native dimensions and scaling.
