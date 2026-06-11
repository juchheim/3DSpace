// Prepare heart-beating.glb for the Room Objects catalog:
//   - Base-color JPEG → re-encoded at q85
//
// Run:  node scripts/prepare-heart-catalog-glb.mjs [in.glb] [out.glb]
// Default: GLBs/heart-beating.glb → apps/web/public/room-objects/assets/heart.glb

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune } from "@gltf-transform/functions";
import sharp from "sharp";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/heart-beating.glb");
const DEFAULT_OUT = resolve(__dirname, "../apps/web/public/room-objects/assets/heart.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(process.argv[3] ?? DEFAULT_OUT);

async function main() {
  await mkdir(dirname(OUT_PATH), { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const beforeBytes = (await readFile(IN_PATH)).byteLength;
  const doc = await io.read(IN_PATH);
  const root = doc.getRoot();

  let saved = 0;
  for (const texture of root.listTextures()) {
    const src = texture.getImage();
    if (!src || src.byteLength === 0) continue;
    const before = src.byteLength;
    const mime = texture.getMimeType() ?? "";
    if (mime.includes("jpeg") || mime.includes("jpg") || mime.includes("png")) {
      const jpeg = await sharp(Buffer.from(src)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
      if (jpeg.byteLength < before) {
        texture.setImage(jpeg);
        texture.setMimeType("image/jpeg");
        saved += before - jpeg.byteLength;
        console.log(
          `  ${texture.getName()}: ${(before / 1024 / 1024).toFixed(2)} MB → ${(jpeg.byteLength / 1024 / 1024).toFixed(2)} MB`
        );
      }
    }
  }

  await doc.transform(prune());
  await io.write(OUT_PATH, doc);
  const afterBytes = (await readFile(OUT_PATH)).byteLength;

  console.log(`Wrote ${OUT_PATH}`);
  console.log(
    `GLB total: ${(beforeBytes / 1024 / 1024).toFixed(2)} MB → ${(afterBytes / 1024 / 1024).toFixed(2)} MB (−${(((beforeBytes - afterBytes) / beforeBytes) * 100).toFixed(1)}%)`
  );
  console.log(`fileSizeBytes: ${afterBytes}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
