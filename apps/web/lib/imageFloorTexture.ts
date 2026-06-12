import { API_URL } from "./config";

/** Largest dimension we keep on an uploaded floor image (GPU + bandwidth budget). */
export const FLOOR_TEXTURE_MAX_DIMENSION = 1600;

/**
 * Stable public URL for an image-floor texture. Matches the server's
 * `roomObjectAssetUrl` (generic stored-object route), so every client in the room
 * can render a piece's texture from just its `textureStorageKey` — no expiring
 * presigned downloads.
 */
export function imageFloorTextureUrl(storageKey: string) {
  const path = storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${API_URL}/v1/room-object-assets/${path}`;
}

export type PreparedFloorTexture = {
  blob: Blob;
  fileName: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
};

function replaceExtension(fileName: string, extension: string) {
  const base = fileName.replace(/\.[a-zA-Z0-9]+$/, "");
  return `${base || "floor-texture"}.${extension}`;
}

/**
 * Downscale + re-encode a user image for use as a floor texture. Keeps large photos from
 * shipping multi-MB originals to every client; falls back to the original file when the
 * image already fits or canvas processing is unavailable.
 */
export async function prepareFloorTextureFile(file: File): Promise<PreparedFloorTexture> {
  const passthroughType =
    file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp"
      ? (file.type as PreparedFloorTexture["contentType"])
      : null;

  try {
    const bitmap = await createImageBitmap(file);
    const largest = Math.max(bitmap.width, bitmap.height);
    const needsResize = largest > FLOOR_TEXTURE_MAX_DIMENSION;
    if (!needsResize && passthroughType) {
      bitmap.close();
      return { blob: file, fileName: file.name, contentType: passthroughType };
    }

    const scale = needsResize ? FLOOR_TEXTURE_MAX_DIMENSION / largest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas-2d-unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85)
    );
    if (!blob) throw new Error("encode-failed");
    return { blob, fileName: replaceExtension(file.name, "webp"), contentType: "image/webp" };
  } catch {
    if (passthroughType) {
      return { blob: file, fileName: file.name, contentType: passthroughType };
    }
    throw new Error("Please choose a PNG, JPEG or WebP image.");
  }
}
