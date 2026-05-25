import crypto from "node:crypto";
import type { WorldSkinAssetFileName } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { badRequest, notFound, unauthorized } from "../errors.js";

const UPLOADER_PASSWORD_HEADER = "x-world-skin-uploader-password";

const CONTENT_TYPE_BY_FILE: Record<WorldSkinAssetFileName, string> = {
  "thumbnail.png": "image/png",
  "panorama.webp": "image/webp",
  "floor.webp": "image/webp",
  "dome.webp": "image/webp",
  "map2d.webp": "image/webp",
  "ambient.ogg": "audio/ogg"
};

const REQUIRED_FILES = new Set<WorldSkinAssetFileName>(["panorama.webp", "floor.webp"]);

export function worldSkinUploaderEnabled(config: AppConfig) {
  return Boolean(config.worldSkinUploaderPassword);
}

export function worldSkinStorageKey(input: {
  slug: string;
  version: number;
  fileName: WorldSkinAssetFileName;
}) {
  if (input.fileName === "thumbnail.png") {
    return `world-skins/thumbnails/${input.slug}.png`;
  }
  return `world-skins/${input.slug}/v${input.version}/${input.fileName}`;
}

export function worldSkinAssetPath(storageKey: string) {
  return storageKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function worldSkinAssetUrl(config: AppConfig, storageKey: string) {
  return `${config.apiPublicUrl}/v1/world-skin-assets/${worldSkinAssetPath(storageKey)}`;
}

export function assertWorldSkinUploaderPassword(config: AppConfig, provided: string | undefined) {
  if (!worldSkinUploaderEnabled(config)) {
    throw notFound("World skin uploader is not configured");
  }
  const expected = config.worldSkinUploaderPassword!;
  if (!provided) {
    throw unauthorized("Uploader password required");
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw unauthorized("Invalid uploader password");
  }
}

export function readUploaderPasswordHeader(request: { headers: Record<string, unknown> }) {
  const raw = request.headers[UPLOADER_PASSWORD_HEADER];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

export function assertWorldSkinUploadContentType(
  fileName: WorldSkinAssetFileName,
  contentType: string
) {
  const expected = CONTENT_TYPE_BY_FILE[fileName];
  if (contentType !== expected) {
    throw badRequest(`Expected content type ${expected} for ${fileName}`);
  }
}

export function isRequiredWorldSkinAsset(fileName: WorldSkinAssetFileName) {
  return REQUIRED_FILES.has(fileName);
}

export const WORLD_SKIN_ASSET_FILES: WorldSkinAssetFileName[] = [
  "thumbnail.png",
  "panorama.webp",
  "floor.webp",
  "dome.webp",
  "map2d.webp",
  "ambient.ogg"
];
