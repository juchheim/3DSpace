# World Host avatar assets

## `sprocket-bot.glb`

- A high-definition stylized steampunk robot used as a selectable World Host
  avatar (the second option alongside the procedural retro robot).
- **Origin:** procedurally generated — not a third-party download. Built from
  three.js geometry generators and exported with `@gltf-transform/core` by
  [`scripts/build-sprocket-bot-glb.mjs`](../../../../scripts/build-sprocket-bot-glb.mjs).
  Regenerate with `npm run build:host-glb`; render a preview with
  `npm run render:host-glb`.
- **Format:** glTF 2.0 binary, ~171k triangles, ~4.8 MB (dense smooth geometry,
  ~545 baked parts merged into 25 solid material primitives, plus two separate
  `eyeIris_*` nodes the avatar darts around for a lifelike gaze). The only texture is
  a single embedded ~1536×400 PNG for the "SPROCKET-BOT" pennant (rasterized from
  SVG via `sharp`). Embedded (no external URI), within the 2048 px texture limit,
  and uses no glTF extensions, so it still passes the custom room-object upload
  validator and can be imported as an object. Guarded by
  `apps/api/tests/world-hosts/sprocket-bot-glb.test.ts`.
- **License:** CC0-1.0 (3DSpace original).
