import type {
  CreateWorldSkinUploadRequestSchema,
  CreateWorldSkinUploadResponseSchema,
  WorldSkinAssetFileName,
  WorldSkinBuiltinSlug,
  WorldSkinUploaderStatus
} from "@3dspace/contracts";
import type { z } from "zod";
import { API_URL } from "./config";

const PASSWORD_HEADER = "x-world-skin-uploader-password";
const SESSION_KEY = "worldSkinUploaderPassword";

export type WorldSkinUploadRequest = z.infer<typeof CreateWorldSkinUploadRequestSchema>;
export type WorldSkinUploadResponse = z.infer<typeof CreateWorldSkinUploadResponseSchema>;

export class WorldSkinUploaderError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number
  ) {
    super(message);
    this.name = "WorldSkinUploaderError";
  }
}

export function getStoredUploaderPassword() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem(SESSION_KEY) ?? "";
}

export function setStoredUploaderPassword(password: string) {
  sessionStorage.setItem(SESSION_KEY, password);
}

export function clearStoredUploaderPassword() {
  sessionStorage.removeItem(SESSION_KEY);
}

async function uploaderFetch<T>(
  path: string,
  password: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const headers: Record<string, string> = {
    [PASSWORD_HEADER]: password
  };
  if (init?.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const requestInit: RequestInit = {
    method: init?.method ?? "GET",
    headers
  };
  if (init?.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  const response = await fetch(`${API_URL}${path}`, requestInit);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new WorldSkinUploaderError(
      typeof payload.message === "string" ? payload.message : response.statusText,
      response.status
    );
  }
  return response.json() as Promise<T>;
}

export async function verifyWorldSkinUploaderPassword(password: string) {
  const response = await fetch(`${API_URL}/v1/world-skin-uploader/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new WorldSkinUploaderError(
      typeof payload.message === "string" ? payload.message : response.statusText,
      response.status
    );
  }
  setStoredUploaderPassword(password);
  return true;
}

export function fetchWorldSkinUploaderStatus(input: {
  password: string;
  slug: WorldSkinBuiltinSlug;
  version: number;
}) {
  const params = new URLSearchParams({
    slug: input.slug,
    version: String(input.version)
  });
  return uploaderFetch<WorldSkinUploaderStatus>(
    `/v1/world-skin-uploader/status?${params.toString()}`,
    input.password
  );
}

export function createWorldSkinUploadTarget(
  password: string,
  body: WorldSkinUploadRequest
) {
  return uploaderFetch<WorldSkinUploadResponse>("/v1/world-skin-uploader/uploads", password, {
    method: "POST",
    body
  });
}

export async function uploadWorldSkinFile(input: {
  password: string;
  slug: WorldSkinBuiltinSlug;
  version: number;
  fileName: WorldSkinAssetFileName;
  file: File;
}) {
  const contentType =
    input.fileName === "ambient.ogg"
      ? "audio/ogg"
      : input.fileName === "thumbnail.png"
        ? "image/png"
        : "image/webp";
  const target = await createWorldSkinUploadTarget(input.password, {
    slug: input.slug,
    version: input.version,
    fileName: input.fileName,
    contentType
  });
  const response = await fetch(target.upload.url, {
    method: target.upload.method,
    headers: target.upload.headers,
    body: input.file
  });
  if (!response.ok) {
    throw new WorldSkinUploaderError(`Upload failed with ${response.status}`, response.status);
  }
  return target;
}

export const WORLD_SKIN_SLUG_OPTIONS: { slug: WorldSkinBuiltinSlug; label: string }[] = [
  { slug: "mars-surface", label: "Mars Surface" },
  { slug: "cell-interior", label: "Cell Interior" },
  { slug: "roman-forum", label: "Roman Forum" },
  { slug: "rainforest-canopy", label: "Rainforest Canopy" },
  { slug: "art-studio", label: "Art Studio" }
];

export const WORLD_SKIN_UPLOAD_FILE_ORDER: WorldSkinAssetFileName[] = [
  "thumbnail.png",
  "panorama.webp",
  "floor.webp",
  "map2d.webp",
  "ambient.ogg"
];

export function worldSkinUploadAccept(fileName: WorldSkinAssetFileName): string {
  if (fileName === "ambient.ogg") return "audio/ogg,.ogg";
  if (fileName === "thumbnail.png") return "image/png,.png";
  return "image/webp,.webp";
}

export const WORLD_SKIN_FILE_SPECS: Record<
  WorldSkinAssetFileName,
  { label: string; required: boolean; hint: string }
> = {
  "thumbnail.png": {
    label: "Environment thumbnail",
    required: false,
    hint: "PNG for the environment picker — stored at world-skins/thumbnails/<slug>.png"
  },
  "panorama.webp": {
    label: "Wall panorama",
    required: true,
    hint: "8192 × 1024 WebP — one unwrap for all walls"
  },
  "floor.webp": {
    label: "Floor",
    required: true,
    hint: "2048 × 2048 seamless WebP"
  },
  "map2d.webp": {
    label: "2D map",
    required: false,
    hint: "2048 × 2048 WebP (optional)"
  },
  "ambient.ogg": {
    label: "Ambient audio",
    required: false,
    hint: "Ogg Vorbis loop (optional)"
  }
};
