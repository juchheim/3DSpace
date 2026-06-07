# Azure Vanguard Recolor Assets

- `azure-vanguard-albedo-neutral.jpg`
  - Generated from `/avatars/azure-vanguard.glb` base-color texture with `node scripts/generate-avatar-recolor-assets.mjs --albedo-only`.
  - Purpose: neutral grayscale albedo for hue-faithful runtime recolor.
- `azure-vanguard-zone-mask.png`
  - Generated from `/avatars/azure-vanguard.glb` UVs, dominant-bone regions, and sampled base-color hints with `node scripts/generate-avatar-recolor-assets.mjs --zone-mask`.
  - Purpose: stable zone ids `0-23` aligned to `TEXCOORD_0`.
- `azure-vanguard-uv-reference.jpg`
  - Generated with `node scripts/generate-avatar-recolor-assets.mjs --uv-reference --output apps/web/public/avatars/azure-vanguard-uv-reference.jpg`.
  - Purpose: dev harness inset and mask QA reference.

# IXR Female Recolor Assets

- Source GLB: `GLBs/IXR-female-20k/Meshy_AI_Azure_Vanguard_biped_Meshy_AI_Meshy_Merged_Animations.glb`
- Shipped runtime GLB: `/avatars/ixr-female-20k.glb` (PNG textures re-encoded to JPEG via `scripts/optimize-lp-glb.mjs`)
- `ixr-female-20k-albedo-neutral.jpg` — neutral albedo for recolor shader
- `ixr-female-20k-zone-mask.png` — per-body zone mask (do not reuse Azure Vanguard mask)
- `ixr-female-20k-uv-reference.jpg` — dev/QA UV layout reference
- `*-zone-mask.png` — **must stay PNG** (exact zone IDs 0–23 in the R channel; JPEG corrupts them)
