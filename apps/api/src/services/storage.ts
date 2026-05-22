import crypto from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "../config.js";
import { storageConfigured } from "../config.js";

const devStorage = new Map<string, { body: Buffer; contentType: string }>();

function safeStorageName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
}

function createStorageClient(config: AppConfig) {
  return new S3Client({
    region: "auto",
    endpoint: config.objectStorage.endpoint!,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.objectStorage.accessKeyId!,
      secretAccessKey: config.objectStorage.secretAccessKey!
    }
  });
}

export function storageKeyFor(input: { roomId: string; wallAnchorId: string; fileName: string }) {
  const safeName = safeStorageName(input.fileName);
  return `rooms/${input.roomId}/anchors/${input.wallAnchorId}/${Date.now()}-${safeName}`;
}

export function roomObjectStorageKeyFor(input: { classId: string; kind: "assets" | "thumbnails"; fileName: string }) {
  const safeName = safeStorageName(input.fileName);
  return `room-objects/classes/${input.classId}/${input.kind}/${crypto.randomUUID()}-${safeName}`;
}

export async function createUploadTarget(
  config: AppConfig,
  input: {
    storageKey: string;
    contentType: string;
  }
) {
  if (!storageConfigured(config)) {
    return {
      url: `${config.apiPublicUrl}/dev-upload/${roomObjectAssetPath(input.storageKey)}`,
      method: "PUT" as const,
      headers: {
        "content-type": input.contentType
      }
    };
  }

  const bucket = config.objectStorage.bucket!;
  const client = createStorageClient(config);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: input.storageKey,
    ContentType: input.contentType
  });

  return {
    url: await getSignedUrl(client, command, { expiresIn: 60 * 10 }),
    method: "PUT" as const,
    headers: {
      "content-type": input.contentType
    }
  };
}

export async function createDownloadTarget(
  config: AppConfig,
  input: {
    storageKey: string;
  }
) {
  const expiresInSeconds = 60 * 10;

  if (!storageConfigured(config)) {
    return {
      url: `${config.apiPublicUrl}/dev-download/${roomObjectAssetPath(input.storageKey)}`,
      method: "GET" as const,
      headers: {},
      expiresInSeconds
    };
  }

  if (config.objectStorage.publicRead && config.objectStorage.publicBaseUrl) {
    return {
      url: `${config.objectStorage.publicBaseUrl.replace(/\/$/, "")}/${input.storageKey}`,
      method: "GET" as const,
      headers: {},
      expiresInSeconds
    };
  }

  const bucket = config.objectStorage.bucket!;
  const client = createStorageClient(config);
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: input.storageKey
  });

  return {
    url: await getSignedUrl(client, command, { expiresIn: expiresInSeconds }),
    method: "GET" as const,
    headers: {},
    expiresInSeconds
  };
}

export function putDevStoredObject(input: { storageKey: string; body: Buffer; contentType: string }) {
  devStorage.set(input.storageKey, { body: input.body, contentType: input.contentType });
}

export function getDevStoredObject(storageKey: string) {
  return devStorage.get(storageKey);
}

function contentTypeForStorageKey(storageKey: string, fallback?: string) {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith(".glb")) return "model/gltf-binary";
  if (lower.endsWith(".png")) return "image/png";
  return fallback ?? "application/octet-stream";
}

export function roomObjectAssetPath(storageKey: string) {
  return storageKey.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

export function parseRoomObjectAssetStorageKey(raw: string) {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function readStoredObject(
  config: AppConfig,
  input: {
    storageKey: string;
  }
) {
  if (!storageConfigured(config)) {
    const object = devStorage.get(input.storageKey);
    if (!object) return undefined;
    return object;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: config.objectStorage.bucket!,
      Key: input.storageKey
    });
    const response = await createStorageClient(config).send(command);
    if (!response.Body) return undefined;
    const bytes = await response.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType ?? contentTypeForStorageKey(input.storageKey)
    };
  } catch {
    return undefined;
  }
}

export function roomObjectAssetUrl(config: AppConfig, storageKey: string) {
  return `${config.apiPublicUrl}/v1/room-object-assets/${roomObjectAssetPath(storageKey)}`;
}
