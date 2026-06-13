# World Host avatar assets

## `lp.glb`

- Textured LP robot — World Host avatar for **non-verse** rooms (FFA, escape, classroom).
- **Origin:** `GLBs/lp.glb` (Meshy export, textures optimized by
  `scripts/optimize-lp-glb.mjs`: base color PNG → JPEG q85, normal kept as PNG).
- **Format:** glTF 2.0 binary, ~9.6k triangles, ~6.8 MB. Model is centered on
  the origin (feet at y ≈ -0.956); `LpHostAvatar` passes `nativeGroundY`.
- **License:** follow Meshy AI terms for the source export; committed copy is for
  3DSpace World Host use only.

## `robot-simple.glb`

- Simple floating-head robot — World Host avatar for **verse** rooms only.
- **Origin:** `GLBs/robot-simple-raw.glb` → `GLBs/robot-simple.glb` via
  `scripts/prepare-robot-simple-glb.mjs` (head reposition/scale, baked cyan glow
  eyes, looping `LookAround` clip). Shipped copy copied to this folder.
- **Format:** glTF 2.0 binary, ~3.1 MB, feet at Y = 0, native height 4.0 m.
  `RobotSimpleHostAvatar` plays the baked `LookAround` animation via
  `GlbHostAvatar` `idleAnimation`.
