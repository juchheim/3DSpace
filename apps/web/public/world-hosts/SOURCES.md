# World Host avatar assets

## `lp.glb`

- Textured LP robot — the **only** World Host avatar.
- **Origin:** `GLBs/lp.glb` (Meshy export, textures optimized by
  `scripts/optimize-lp-glb.mjs`: base color PNG → JPEG q85, normal kept as PNG).
- **Format:** glTF 2.0 binary, ~9.6k triangles, ~6.8 MB. Model is centered on
  the origin (feet at y ≈ -0.956); `LpHostAvatar` passes `nativeGroundY`.
- **License:** follow Meshy AI terms for the source export; committed copy is for
  3DSpace World Host use only.
