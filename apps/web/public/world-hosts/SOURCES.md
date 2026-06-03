# World Host avatar assets

## `sprocket-bot.glb`

- A high-definition stylized steampunk robot used as a selectable World Host
  avatar (the second option alongside the procedural retro robot).
- **Origin:** procedurally generated — not a third-party download. Built from
  three.js geometry generators and exported with `@gltf-transform/core` by
  [`scripts/build-sprocket-bot-glb.mjs`](../../../../scripts/build-sprocket-bot-glb.mjs).
  Regenerate with `npm run build:host-glb`; render a preview with
  `npm run render:host-glb`.
- **Format:** glTF 2.0 binary, ~64k triangles, ~1.8 MB. Texture-free (PBR
  metallic-roughness + emissive only) and uses no glTF extensions, so it also
  passes the custom room-object upload validator and can be imported as an
  object. Guarded by `apps/api/tests/world-hosts/sprocket-bot-glb.test.ts`.
- **License:** CC0-1.0 (3DSpace original).
