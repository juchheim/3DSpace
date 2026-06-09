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

## `floor.glb` / `ramp.glb`

- See `BuildPieceMesh.tsx` for native dimensions and scaling.
