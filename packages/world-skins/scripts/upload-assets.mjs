#!/usr/bin/env node
/**
 * Upload world skin asset files to R2 via the API's WorldSkinUploader endpoint.
 *
 * Required env vars:
 *   API_URL              — API base URL, e.g. https://your-api.vercel.app
 *   UPLOADER_PASSWORD    — value of WORLD_SKIN_UPLOADER_PASSWORD on the API
 *
 * Optional env vars:
 *   SKIN_SLUG            — only upload for this slug (default: all configured below)
 *
 * Usage:
 *   API_URL=https://your-api.vercel.app \
 *   UPLOADER_PASSWORD=secret \
 *   node packages/world-skins/scripts/upload-assets.mjs
 *
 * Asset files live in docs/planning/new-features/ for now.
 * Add a row to UPLOADS for each additional skin asset as files are created.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL      = (process.env.API_URL ?? "").replace(/\/$/, "");
const PASSWORD     = process.env.UPLOADER_PASSWORD ?? "";
const ONLY_SLUG    = process.env.SKIN_SLUG ?? "";

if (!API_URL || !PASSWORD) {
  console.error("Error: API_URL and UPLOADER_PASSWORD must be set.");
  console.error("  API_URL=https://your-api.vercel.app UPLOADER_PASSWORD=secret node upload-assets.mjs");
  process.exit(1);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DOCS = resolve(ROOT, "docs/planning/new-features");

/**
 * Each entry maps to one PUT to R2.
 * localPath — absolute path to the source file on this machine.
 * contentType — MIME type to use for the upload.
 */
const UPLOADS = [
  // ── Mars Surface ──────────────────────────────────────────────────────────
  {
    slug:        "mars-surface",
    version:     1,
    fileName:    "panorama.webp",
    contentType: "image/webp",
    localPath:   resolve(DOCS, "panorama.webp"),
  },
  {
    slug:        "mars-surface",
    version:     1,
    fileName:    "floor.webp",
    contentType: "image/webp",
    localPath:   resolve(DOCS, "floor.webp"),
  },
  // Add more skins here as asset files are created, e.g.:
  // { slug: "cell-interior", version: 1, fileName: "panorama.webp", contentType: "image/webp", localPath: resolve(DOCS, "cell-interior-panorama.webp") },
];

async function uploadOne(item) {
  if (!existsSync(item.localPath)) {
    console.warn(`  SKIP  ${item.slug}/v${item.version}/${item.fileName} — file not found: ${item.localPath}`);
    return;
  }

  // 1. Request a presigned upload target
  const createRes = await fetch(`${API_URL}/v1/world-skin-uploader/uploads`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-world-skin-uploader-password": PASSWORD,
    },
    body: JSON.stringify({
      slug:        item.slug,
      version:     item.version,
      fileName:    item.fileName,
      contentType: item.contentType,
    }),
  });

  if (!createRes.ok) {
    const text = await createRes.text().catch(() => createRes.statusText);
    throw new Error(`Create upload failed (${createRes.status}): ${text}`);
  }

  const { upload } = await createRes.json();

  // 2. PUT the file to the presigned URL
  const fileBuffer = readFileSync(item.localPath);
  const putRes = await fetch(upload.url, {
    method:  upload.method,
    headers: upload.headers,
    body:    fileBuffer,
    // node-fetch / native fetch: pass buffer directly
    duplex:  "half",
  });

  if (!putRes.ok) {
    const text = await putRes.text().catch(() => putRes.statusText);
    throw new Error(`PUT failed (${putRes.status}): ${text}`);
  }
}

const targets = ONLY_SLUG
  ? UPLOADS.filter((u) => u.slug === ONLY_SLUG)
  : UPLOADS;

if (targets.length === 0) {
  console.error(`No uploads configured for slug "${ONLY_SLUG}".`);
  process.exit(1);
}

console.log(`Uploading ${targets.length} file(s) to ${API_URL} …\n`);

for (const item of targets) {
  const label = `${item.slug}/v${item.version}/${item.fileName}`;
  process.stdout.write(`  → ${label} … `);
  try {
    await uploadOne(item);
    console.log("✓");
  } catch (err) {
    console.log(`✗\n     ${err.message}`);
  }
}

console.log("\nDone.");
