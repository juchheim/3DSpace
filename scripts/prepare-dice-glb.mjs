// Prepare dice.glb for the Room Objects catalog:
//   - strip the authoring Light/Camera nodes, keep only the die mesh
//   - re-encode the base-color texture as JPEG q85 when smaller
//
// Run:  node scripts/prepare-dice-glb.mjs [in.glb] [out.glb]
// Default: GLBs/dice.glb → apps/web/public/room-objects/assets/dice.glb

import { readFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/dice.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/room-objects/assets/dice.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  // Drop authoring helpers (Blender export ships Light + Camera nodes).
  for (const node of root.listNodes()) {
    if (!node.getMesh() && node.listChildren().length === 0) {
      node.dispose();
    }
  }

  for (const texture of root.listTextures()) {
    const src = texture.getImage();
    if (!src || src.byteLength === 0) continue;
    const jpeg = await sharp(Buffer.from(src)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    if (jpeg.byteLength < src.byteLength) {
      texture.setImage(jpeg);
      texture.setMimeType("image/jpeg");
      console.log(`  ${texture.getName()}: ${(src.byteLength / 1024).toFixed(1)} KB → ${(jpeg.byteLength / 1024).toFixed(1)} KB (JPEG q85)`);
    } else {
      console.log(`  ${texture.getName()}: kept original (${(src.byteLength / 1024).toFixed(1)} KB)`);
    }
  }

  await doc.transform(prune());
  await io.write(OUT_PATH, doc);
  const afterBytes = (await readFile(OUT_PATH)).byteLength;
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`GLB total: ${(beforeBytes / 1024).toFixed(1)} KB → ${(afterBytes / 1024).toFixed(1)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
