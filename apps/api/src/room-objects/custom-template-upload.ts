import { NodeIO } from "@gltf-transform/core";
import {
  EXTMeshoptCompression,
  KHRDracoMeshCompression,
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureTransform
} from "@gltf-transform/extensions";
import { imageSize } from "image-size";
import { MeshoptDecoder } from "meshoptimizer";
import { HttpError, roomObjectTemplateInvalid, roomObjectUploadRejected, roomObjectUploadTooLarge } from "../errors.js";

const ALLOWED_GLB_EXTENSIONS = new Set([
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_materials_unlit",
  "KHR_texture_transform",
  "KHR_mesh_quantization"
]);
const ROOM_OBJECT_MAX_TRIANGLES = 200_000;
const ROOM_OBJECT_MAX_TEXTURE_DIMENSION = 2048;
const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
const GLB_TRIANGLES_MODE = 4;
const GLB_TRIANGLE_STRIP_MODE = 5;
const GLB_TRIANGLE_FAN_MODE = 6;

type GlbJson = {
  asset?: { version?: string };
  buffers?: Array<{ uri?: string }>;
  images?: Array<{ uri?: string }>;
  extensionsUsed?: string[];
  extensionsRequired?: string[];
};

let decoderModulePromise: Promise<unknown> | null = null;

export type CustomRoomObjectAssetValidation = {
  fileSizeBytes: number;
  triangleCount: number;
};

function ensureGlbJson(bytes: Buffer): GlbJson {
  if (bytes.byteLength < 20) {
    throw roomObjectTemplateInvalid("Uploaded .glb is too small to be a valid glTF binary.", { reason: "invalid_glb_header" });
  }

  const magic = bytes.readUInt32LE(0);
  const version = bytes.readUInt32LE(4);
  if (magic !== GLB_MAGIC || version !== 2) {
    throw roomObjectTemplateInvalid("Uploaded file is not a valid glTF 2.0 binary (.glb).", { reason: "invalid_glb_header" });
  }

  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > bytes.byteLength) {
      throw roomObjectTemplateInvalid("Uploaded .glb contains a malformed chunk table.", { reason: "invalid_glb_chunk" });
    }
    if (chunkType === GLB_JSON_CHUNK_TYPE) {
      const jsonText = bytes.subarray(chunkStart, chunkEnd).toString("utf8").replace(/\u0000+$/g, "");
      try {
        return JSON.parse(jsonText) as GlbJson;
      } catch {
        throw roomObjectTemplateInvalid("Uploaded .glb contains invalid JSON metadata.", { reason: "invalid_glb_json" });
      }
    }
    offset = chunkEnd;
  }

  throw roomObjectTemplateInvalid("Uploaded .glb is missing its JSON metadata chunk.", { reason: "missing_glb_json_chunk" });
}

function rejectExternalUris(kind: "buffers" | "images", values: Array<{ uri?: string }> | undefined) {
  const invalid = (values ?? [])
    .map((entry) => entry.uri)
    .find((uri) => typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:"));
  if (invalid) {
    throw roomObjectUploadRejected("Custom room objects cannot reference external files.", {
      reason: "external_uri",
      field: kind,
      uri: invalid
    });
  }
}

function rejectDisallowedExtensions(json: GlbJson) {
  const disallowed = [...new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])])].filter(
    (name) => !ALLOWED_GLB_EXTENSIONS.has(name)
  );
  if (disallowed.length > 0) {
    throw roomObjectUploadRejected("Uploaded .glb uses unsupported glTF extensions.", {
      reason: "disallowed_extension",
      extensions: disallowed
    });
  }
}

async function createNodeIo() {
  if (!decoderModulePromise) {
    decoderModulePromise = import("draco3dgltf").then((module) => module.createDecoderModule({}));
  }
  await MeshoptDecoder.ready;
  const dracoDecoder = await decoderModulePromise;
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMaterialsUnlit, KHRTextureTransform, KHRMeshQuantization])
    .registerDependencies({
      "draco3d.decoder": dracoDecoder,
      "meshopt.decoder": MeshoptDecoder
    });
}

function countPrimitiveTriangles(indexCount: number, mode: number) {
  if (mode === GLB_TRIANGLES_MODE) return Math.floor(indexCount / 3);
  if (mode === GLB_TRIANGLE_STRIP_MODE || mode === GLB_TRIANGLE_FAN_MODE) return Math.max(0, indexCount - 2);
  throw roomObjectUploadRejected("Uploaded .glb must use triangle-based primitives only.", {
    reason: "unsupported_primitive_mode",
    mode
  });
}

function countDocumentTriangles(document: Awaited<ReturnType<NodeIO["readBinary"]>>) {
  return document.getRoot().listMeshes().reduce((total, mesh) => {
    return total + mesh.listPrimitives().reduce((meshTotal, primitive) => {
      const positionAccessor = primitive.getAttribute("POSITION");
      if (!positionAccessor) {
        throw roomObjectTemplateInvalid("Uploaded .glb is missing POSITION data for one or more meshes.", {
          reason: "missing_position_accessor"
        });
      }
      const indexCount = primitive.getIndices()?.getCount() ?? positionAccessor.getCount();
      return meshTotal + countPrimitiveTriangles(indexCount, primitive.getMode());
    }, 0);
  }, 0);
}

function triangleBudgetLabel(maxTriangles: number) {
  return `${Math.round(maxTriangles / 1_000)}k`;
}

function validateEmbeddedTextureSizes(document: Awaited<ReturnType<NodeIO["readBinary"]>>) {
  for (const texture of document.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    const dimensions = imageSize(Buffer.from(image));
    if (!dimensions.width || !dimensions.height) {
      throw roomObjectTemplateInvalid("Uploaded .glb contains a texture with unreadable dimensions.", {
        reason: "invalid_texture"
      });
    }
    if (dimensions.width > ROOM_OBJECT_MAX_TEXTURE_DIMENSION || dimensions.height > ROOM_OBJECT_MAX_TEXTURE_DIMENSION) {
      throw roomObjectUploadRejected("Uploaded .glb contains a texture larger than 2048 x 2048.", {
        reason: "texture_too_large",
        width: dimensions.width,
        height: dimensions.height
      });
    }
  }
}

export async function validateCustomRoomObjectAsset(input: {
  bytes: Buffer;
  maxUploadSizeBytes: number;
}): Promise<CustomRoomObjectAssetValidation> {
  const fileSizeBytes = input.bytes.byteLength;
  if (fileSizeBytes > input.maxUploadSizeBytes) {
    throw roomObjectUploadTooLarge({
      maxUploadSizeBytes: input.maxUploadSizeBytes,
      fileSizeBytes
    });
  }

  const json = ensureGlbJson(input.bytes);
  rejectDisallowedExtensions(json);
  rejectExternalUris("buffers", json.buffers);
  rejectExternalUris("images", json.images);

  try {
    const document = await (await createNodeIo()).readBinary(new Uint8Array(input.bytes));
    const triangleCount = countDocumentTriangles(document);
    if (triangleCount > ROOM_OBJECT_MAX_TRIANGLES) {
      throw roomObjectUploadRejected(
        `Uploaded .glb has ${triangleCount.toLocaleString()} triangles, which exceeds the ${triangleBudgetLabel(ROOM_OBJECT_MAX_TRIANGLES)} triangle budget.`,
        {
        reason: "triangle_budget_exceeded",
        triangleCount,
        maxTriangleCount: ROOM_OBJECT_MAX_TRIANGLES
        }
      );
    }
    validateEmbeddedTextureSizes(document);
    return { fileSizeBytes, triangleCount };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw roomObjectTemplateInvalid("Uploaded .glb could not be parsed.", {
      reason: "parse_failed",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export function validateCustomRoomObjectThumbnail(input: {
  bytes: Buffer;
  contentType: string;
}) {
  if (input.contentType !== "image/png") {
    throw roomObjectUploadRejected("Room object thumbnails must be uploaded as PNG files.", {
      reason: "thumbnail_content_type",
      contentType: input.contentType
    });
  }
  const dimensions = imageSize(input.bytes);
  if (!dimensions.width || !dimensions.height) {
    throw roomObjectTemplateInvalid("Uploaded thumbnail PNG could not be read.", {
      reason: "invalid_thumbnail_png"
    });
  }
}

export function buildRoomObjectTemplateSlug(displayName: string, explicitSlug?: string) {
  const base = (explicitSlug ?? displayName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return (base || "room-object").slice(0, 64);
}
