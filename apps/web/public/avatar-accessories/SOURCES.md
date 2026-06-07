# Avatar accessory assets

## `bowler-hat.glb`

- Classic bowler hat for the Azure Vanguard avatar **head** slot.
- **Origin:** `GLBs/bowler-hat.glb` (textures optimized by
  `scripts/optimize-lp-glb.mjs`: base color PNG → JPEG q85).
- **Format:** glTF 2.0 binary, ~3k triangles, ~3.4 MB. Single static mesh
  (`Mesh1.0`), no skeleton; mesh centered on origin (~0.04 m tall).
- **Attach:** parented to the `Head` bone; catalog `localPosition` offsets the
  brim above the scalp (tune in `/dev/avatar-accessories` during Phase 3).
- **License:** committed copy is for 3DSpace avatar accessory use only; confirm
  source asset terms before adding more catalog entries.

## `red-boxing-glove.glb`

- Red boxing glove for the Azure Vanguard avatar **hands** slot (equips on both
  hands).
- **Origin:** `GLBs/red-boxing-glove.glb` (textures optimized to JPEG q85).
- **Format:** glTF 2.0 binary, ~3k triangles, ~0.6 MB. Single static mesh
  authored for the **right** hand; the left hand uses the same asset mirrored
  on the X axis via catalog `mirrorPaired`.
- **Attach:** parented to `RightHand` and `LeftHand` bones; tune offsets in the
  avatar editor fit panel if needed.
- **License:** committed copy is for 3DSpace avatar accessory use only.
