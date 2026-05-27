import { NodeIO } from "@gltf-transform/core";
import {
  EXTMeshoptCompression,
  KHRDracoMeshCompression,
  KHRMaterialsUnlit,
  KHRMeshQuantization,
  KHRTextureTransform
} from "@gltf-transform/extensions";
import { dedup, draco, simplify, weld, textureCompress } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import type { CustomRoomObjectAssetValidation } from "../room-objects/custom-template-upload.js";
import { validateCustomRoomObjectAsset } from "../room-objects/custom-template-upload.js";

const ROOM_OBJECT_MAX_TRIANGLES = 200_000;
const MAX_TEXTURE_DIM = 2048;

let decoderModulePromise: Promise<unknown> | null = null;

async function createNodeIo() {
  if (!decoderModulePromise) {
    decoderModulePromise = import("draco3dgltf").then((m) => m.createDecoderModule({}));
  }
  await MeshoptDecoder.ready;
  const dracoDecoder = await decoderModulePromise;
  const dracoEncoder = await import("draco3dgltf").then((m) => (m as unknown as { createEncoderModule: (opts?: Record<string, unknown>) => Promise<unknown> }).createEncoderModule({}));
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompression, EXTMeshoptCompression, KHRMaterialsUnlit, KHRTextureTransform, KHRMeshQuantization])
    .registerDependencies({
      "draco3d.decoder": dracoDecoder,
      "draco3d.encoder": dracoEncoder,
      "meshopt.decoder": MeshoptDecoder,
      "meshopt.encoder": MeshoptEncoder,
      "meshopt.simplifier": MeshoptSimplifier
    });
}

export type RepairResult = {
  bytes: Buffer;
  appliedSteps: string[];
};

export async function repairAiObjectGlb(input: {
  bytes: Buffer;
  polycountTarget?: number;
  maxUploadSizeBytes: number;
}): Promise<RepairResult> {
  const { bytes, polycountTarget = ROOM_OBJECT_MAX_TRIANGLES, maxUploadSizeBytes } = input;

  // Try validation without repair first
  try {
    await validateCustomRoomObjectAsset({ bytes, maxUploadSizeBytes });
    return { bytes, appliedSteps: [] };
  } catch {
    // fall through to repair
  }

  const appliedSteps: string[] = [];
  const io = await createNodeIo();
  let document = await io.readBinary(new Uint8Array(bytes));

  // Step 1: weld + simplify to triangle budget
  const targetRatio = Math.min(ROOM_OBJECT_MAX_TRIANGLES, polycountTarget * 1.2) / ROOM_OBJECT_MAX_TRIANGLES;
  await document.transform(
    weld(),
    dedup(),
    simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, targetRatio), error: 0.01 })
  );
  appliedSteps.push("simplify");

  // Step 2: texture downscale
  await document.transform(textureCompress({ resize: [MAX_TEXTURE_DIM, MAX_TEXTURE_DIM] }));
  appliedSteps.push("textureResize");

  let repaired = Buffer.from(await io.writeBinary(document));
  try {
    await validateCustomRoomObjectAsset({ bytes: repaired, maxUploadSizeBytes });
    return { bytes: repaired, appliedSteps };
  } catch {
    // Step 3: Draco compression
    await document.transform(draco());
    appliedSteps.push("draco");
    repaired = Buffer.from(await io.writeBinary(document));
  }

  // Final validation — let errors propagate to caller
  await validateCustomRoomObjectAsset({ bytes: repaired, maxUploadSizeBytes });
  return { bytes: repaired, appliedSteps };
}

export async function validateWithRepair(input: {
  bytes: Buffer;
  polycountTarget?: number;
  maxUploadSizeBytes: number;
}): Promise<{ bytes: Buffer; validation: CustomRoomObjectAssetValidation; appliedSteps: string[] }> {
  const { bytes: repairedBytes, appliedSteps } = await repairAiObjectGlb(input);
  const validation = await validateCustomRoomObjectAsset({
    bytes: repairedBytes,
    maxUploadSizeBytes: input.maxUploadSizeBytes
  });
  return { bytes: repairedBytes, validation, appliedSteps };
}
