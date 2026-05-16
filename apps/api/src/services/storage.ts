import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { AppConfig } from "../config.js";
import { storageConfigured } from "../config.js";

export function storageKeyFor(input: { roomId: string; wallAnchorId: string; fileName: string }) {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 120);
  return `rooms/${input.roomId}/anchors/${input.wallAnchorId}/${Date.now()}-${safeName}`;
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
      url: `${config.apiPublicUrl}/dev-upload/${encodeURIComponent(input.storageKey)}`,
      method: "PUT" as const,
      headers: {
        "content-type": input.contentType
      }
    };
  }

  const endpoint = config.objectStorage.endpoint!;
  const bucket = config.objectStorage.bucket!;
  const accessKeyId = config.objectStorage.accessKeyId!;
  const secretAccessKey = config.objectStorage.secretAccessKey!;
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
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
      url: `${config.apiPublicUrl}/dev-download/${encodeURIComponent(input.storageKey)}`,
      method: "GET" as const,
      headers: {},
      expiresInSeconds
    };
  }

  if (config.objectStorage.publicBaseUrl) {
    return {
      url: `${config.objectStorage.publicBaseUrl.replace(/\/$/, "")}/${input.storageKey}`,
      method: "GET" as const,
      headers: {},
      expiresInSeconds
    };
  }

  const endpoint = config.objectStorage.endpoint!;
  const bucket = config.objectStorage.bucket!;
  const accessKeyId = config.objectStorage.accessKeyId!;
  const secretAccessKey = config.objectStorage.secretAccessKey!;
  const client = new S3Client({
    region: "auto",
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  });
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
