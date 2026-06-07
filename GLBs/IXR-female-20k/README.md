# IXR Female 20k Authoring Notes

- Source export: `Meshy_AI_Azure_Vanguard_biped_Meshy_AI_Meshy_Merged_Animations.glb`
- Skip for runtime: `Meshy_AI_Azure_Vanguard_biped_Character_output.glb` (static mesh only)
- Optimize for web (PNG base color + emissive → JPEG q85 in-place or to `apps/web/public/avatars/`):
  - `node scripts/optimize-lp-glb.mjs GLBs/IXR-female-20k/Meshy_AI_Azure_Vanguard_biped_Meshy_AI_Meshy_Merged_Animations.glb apps/web/public/avatars/ixr-female-20k.glb`
- Recolor assets (zone mask **must stay PNG**; UV reference + albedo are JPEG):
  - `node scripts/generate-avatar-recolor-assets.mjs --input apps/web/public/avatars/ixr-female-20k.glb --zone-mask --output apps/web/public/avatars/ixr-female-20k-zone-mask.png`
  - `node scripts/validate-avatar-zone-mask.mjs apps/web/public/avatars/ixr-female-20k-zone-mask.png`
- Animation clips: `Idle_11`, `Walking`, `Running`
