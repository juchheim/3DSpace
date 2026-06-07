# Azure Vanguard Recolor Assets

- `azure-vanguard-albedo-neutral.jpg`
  - Generated from `/avatars/azure-vanguard.glb` base-color texture with `node scripts/generate-avatar-recolor-assets.mjs --albedo-only`.
  - Purpose: neutral grayscale albedo for hue-faithful runtime recolor.
- `azure-vanguard-zone-mask.png`
  - Generated from `/avatars/azure-vanguard.glb` UVs, dominant-bone regions, and sampled base-color hints with `node scripts/generate-avatar-recolor-assets.mjs --zone-mask`.
  - Purpose: stable zone ids `0-23` aligned to `TEXCOORD_0`.
- `azure-vanguard-uv-reference.png`
  - Generated with `node scripts/generate-avatar-recolor-assets.mjs --uv-reference --output apps/web/public/avatars/azure-vanguard-uv-reference.png`.
  - Purpose: dev harness inset and mask QA reference.
