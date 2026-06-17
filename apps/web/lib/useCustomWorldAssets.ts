"use client";

/**
 * Per-user custom-GLB library. Uploads are private to the signed-in user and
 * reusable in any room. Placement denormalizes the render info onto each
 * placement (see usePlacedWorldAssets), so the library itself is only needed by
 * the owner — other participants render from the placement payload.
 */

import { useCallback, useEffect, useState } from "react";
import type { CustomWorldAsset, WorldAssetObjectRole, WorldAssetPlacementKind } from "@3dspace/contracts";
import { createCustomAsset, createCustomAssetUpload, deleteCustomAsset, listCustomAssets } from "./api";
import type { ApiIdentity } from "./identity";
import { prepareFloorTextureFile } from "./imageFloorTexture";

const MAX_GLB_BYTES = 25 * 1024 * 1024;

export type UploadCustomAssetInput = {
  glb: File;
  thumbnail: File;
  displayName: string;
  placement: WorldAssetPlacementKind;
  /** Optional interactive behaviour for object uploads (chair / podium). */
  objectRole?: WorldAssetObjectRole;
};

async function putBlob(target: { url: string; method: "PUT"; headers: Record<string, string> }, body: Blob) {
  const response = await fetch(target.url, { method: target.method, headers: target.headers, body });
  if (!response.ok) throw new Error("Upload failed — please try again.");
}

export function useCustomWorldAssets(input: { identity: ApiIdentity; enabled?: boolean }) {
  const enabled = input.enabled ?? true;
  const [assets, setAssets] = useState<CustomWorldAsset[]>([]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setAssets(await listCustomAssets(input.identity));
    } catch {
      // Non-fatal: keep current state.
    }
  }, [enabled, input.identity]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const upload = useCallback(
    async (req: UploadCustomAssetInput): Promise<CustomWorldAsset> => {
      if (!req.glb.name.toLowerCase().endsWith(".glb")) throw new Error("Choose a .glb file.");
      if (req.glb.size > MAX_GLB_BYTES) throw new Error("That model is over 25 MB — please use a smaller .glb.");

      // Downscale + re-encode the thumbnail so the library stays light.
      const thumb = await prepareFloorTextureFile(req.thumbnail);

      const targets = await createCustomAssetUpload(input.identity, {
        glbFileName: req.glb.name,
        glbContentType: "model/gltf-binary",
        thumbnailFileName: thumb.fileName,
        thumbnailContentType: thumb.contentType
      });

      await Promise.all([
        putBlob(targets.glb.upload, req.glb),
        putBlob(targets.thumbnail.upload, thumb.blob)
      ]);

      const asset = await createCustomAsset(input.identity, {
        displayName: req.displayName,
        glbStorageKey: targets.glb.storageKey,
        glbUrl: targets.glb.url,
        thumbnailStorageKey: targets.thumbnail.storageKey,
        thumbnailUrl: targets.thumbnail.url,
        placement: req.placement,
        ...(req.objectRole ? { objectRole: req.objectRole } : {})
      });

      setAssets((prev) => [...prev, asset]);
      return asset;
    },
    [input.identity]
  );

  const remove = useCallback(
    async (assetId: string) => {
      const previous = assets;
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      try {
        await deleteCustomAsset(input.identity, assetId);
      } catch {
        setAssets(previous); // Roll back on failure.
      }
    },
    [assets, input.identity]
  );

  return { assets, upload, remove, refresh };
}
