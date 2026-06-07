# Azure Vanguard Authoring Notes

- Source runtime rig: `apps/web/public/avatars/azure-vanguard.glb`
- Base-color texture can be extracted with:
  - `node scripts/generate-avatar-recolor-assets.mjs --extract-base-color GLBs/azure-vanguard/base-color-source.jpg`
- UV reference can be regenerated with:
  - `node scripts/generate-avatar-recolor-assets.mjs --uv-reference --output GLBs/azure-vanguard/uv-reference.png`
- Shipped recolor assets are generated into `apps/web/public/avatars/`:
  - `azure-vanguard-albedo-neutral.jpg`
  - `azure-vanguard-zone-mask.png`
  - `azure-vanguard-uv-reference.png`
