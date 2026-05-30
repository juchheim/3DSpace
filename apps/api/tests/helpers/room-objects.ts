import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { expect } from "vitest";
import { loadConfig } from "../../src/config";
import { putDevStoredObject } from "../../src/services/storage.js";
import type { TestApp } from "./app";
import { authHeaders } from "./app";

export function roomObjectsConfig(env: Record<string, string> = {}) {
  return loadConfig({ NODE_ENV: "test", ENABLE_ROOM_OBJECTS: "true", ...env } as NodeJS.ProcessEnv);
}

export async function enableRoomObjects(
  app: TestApp,
  roomId: string,
  teacherId: string,
  overrides: Record<string, unknown> = {}
) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      settings: {
        roomObjects: {
          enabled: true,
          maxActive: 8,
          customUploadsEnabled: false,
          maxUploadSizeBytes: 15 * 1024 * 1024,
          defaultTouchPolicy: "teacher-only",
          ...overrides
        }
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(0, 8 + data.length);
  return chunk;
}

export function createPng(width: number, height: number) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]);
}

export async function createTinyGlb(options: { triangleCount?: number; texturePng?: Buffer } = {}) {
  const triangleCount = options.triangleCount ?? 1;
  const document = new Document();
  const buffer = document.createBuffer("geometry");
  const positions = new Float32Array(triangleCount * 9);
  const uvs = options.texturePng ? new Float32Array(triangleCount * 6) : undefined;

  for (let index = 0; index < triangleCount; index += 1) {
    const positionOffset = index * 9;
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], positionOffset);
    if (uvs) {
      uvs.set([0, 0, 1, 0, 0, 1], index * 6);
    }
  }

  const primitive = document.createPrimitive().setAttribute(
    "POSITION",
    document.createAccessor("positions", buffer).setType(Accessor.Type.VEC3).setArray(positions)
  );

  if (uvs && options.texturePng) {
    primitive.setAttribute(
      "TEXCOORD_0",
      document.createAccessor("uvs", buffer).setType(Accessor.Type.VEC2).setArray(uvs)
    );
    const texture = document.createTexture("albedo").setImage(new Uint8Array(options.texturePng)).setMimeType("image/png");
    const material = document.createMaterial("material").setBaseColorTexture(texture);
    primitive.setMaterial(material);
  }

  const mesh = document.createMesh("mesh").addPrimitive(primitive);
  const node = document.createNode("node").setMesh(mesh);
  document.createScene("scene").addChild(node);

  return Buffer.from(await new NodeIO().writeBinary(document));
}

export function rewriteGlbJson(glb: Buffer, mutate: (json: Record<string, unknown>) => void) {
  const chunks: Array<{ type: number; data: Buffer }> = [];
  let offset = 12;
  while (offset + 8 <= glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    chunks.push({ type, data: Buffer.from(glb.subarray(start, end)) });
    offset = end;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  if (!jsonChunk) throw new Error("GLB JSON chunk missing");
  const json = JSON.parse(jsonChunk.data.toString("utf8").replace(/\u0000+$/g, "")) as Record<string, unknown>;
  mutate(json);
  const jsonData = Buffer.from(JSON.stringify(json), "utf8");
  const padding = (4 - (jsonData.length % 4)) % 4;
  jsonChunk.data = Buffer.concat([jsonData, Buffer.alloc(padding, 0x20)]);

  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

export async function uploadToSignedTarget(input: { storageKey: string; contentType: string }, body: Buffer) {
  putDevStoredObject({
    storageKey: input.storageKey,
    body,
    contentType: input.contentType
  });
}

export async function createCustomRoomObjectTemplate(
  app: TestApp,
  input: {
    roomId: string;
    teacherId: string;
    glb: Buffer;
    thumbnail?: Buffer;
    displayName?: string;
    description?: string;
  }
) {
  const assetUpload = await app.inject({
    method: "POST",
    url: `/v1/rooms/${input.roomId}/room-objects/uploads`,
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      kind: "asset",
      fileName: "sample.glb",
      contentType: "model/gltf-binary"
    }
  });
  expect(assetUpload.statusCode).toBe(200);
  await uploadToSignedTarget(
    { storageKey: assetUpload.json().storageKey, contentType: "model/gltf-binary" },
    input.glb
  );

  const thumbnailUpload = await app.inject({
    method: "POST",
    url: `/v1/rooms/${input.roomId}/room-objects/uploads`,
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      kind: "thumbnail",
      fileName: "thumb.png",
      contentType: "image/png"
    }
  });
  expect(thumbnailUpload.statusCode).toBe(200);
  await uploadToSignedTarget(
    { storageKey: thumbnailUpload.json().storageKey, contentType: "image/png" },
    input.thumbnail ?? createPng(64, 64)
  );

  const createTemplate = await app.inject({
    method: "POST",
    url: "/v1/room-objects/templates",
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      roomId: input.roomId,
      assetStorageKey: assetUpload.json().storageKey,
      thumbnailStorageKey: thumbnailUpload.json().storageKey,
      displayName: input.displayName ?? "Custom lab model",
      category: "custom",
      description: input.description ?? "Teacher-uploaded GLB.",
      license: "CC-BY",
      attribution: "Uploaded by teacher"
    }
  });

  return {
    response: createTemplate,
    assetStorageKey: assetUpload.json().storageKey as string,
    thumbnailStorageKey: thumbnailUpload.json().storageKey as string
  };
}

export async function postRoomObjectRealtime(
  app: TestApp,
  roomId: string,
  userId: string,
  payload: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/room-objects/realtime`,
    headers: authHeaders(userId, userId.startsWith("student") ? "Avery" : "Ms. Rivera"),
    payload
  });
}

