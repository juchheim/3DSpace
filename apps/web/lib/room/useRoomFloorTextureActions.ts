"use client";

import { useCallback, useRef } from "react";
import type { BuildFloorTexturePreset } from "../buildFloorTexturePresets";
import { createBuildFloorTextureUpload } from "../api";
import { prepareFloorTextureFile } from "../imageFloorTexture";
import type { ApiIdentity } from "../identity";
import type { FloorTextureSelection } from "../useBuildMode";

type UseRoomFloorTextureActionsInput = {
  identity: ApiIdentity;
  roomId: string;
  setFloorTexture(selection: FloorTextureSelection): void;
};

export function useRoomFloorTextureActions({
  identity,
  roomId,
  setFloorTexture
}: UseRoomFloorTextureActionsInput) {
  const floorPresetUploadCacheRef = useRef<Map<string, FloorTextureSelection>>(new Map());

  const uploadFloorTextureFile = useCallback(
    async (file: File): Promise<FloorTextureSelection> => {
      const prepared = await prepareFloorTextureFile(file);
      const { storageKey, textureUrl, upload } = await createBuildFloorTextureUpload(
        identity,
        roomId,
        {
          fileName: prepared.fileName,
          contentType: prepared.contentType
        }
      );
      const response = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: prepared.blob
      });
      if (!response.ok) throw new Error("Floor image upload failed.");
      const selection = {
        storageKey,
        url: textureUrl,
        fileName: prepared.fileName
      };
      setFloorTexture(selection);
      return selection;
    },
    [identity, roomId, setFloorTexture]
  );

  const handleUploadFloorTexture = useCallback(
    async (file: File) => {
      await uploadFloorTextureFile(file);
    },
    [uploadFloorTextureFile]
  );

  const handleSelectFloorTexturePreset = useCallback(
    async (preset: BuildFloorTexturePreset) => {
      const cached = floorPresetUploadCacheRef.current.get(preset.slug);
      if (cached) {
        setFloorTexture(cached);
        return;
      }
      const response = await fetch(preset.url);
      if (!response.ok) throw new Error("Could not load floor preset.");
      const blob = await response.blob();
      const file = new File([blob], preset.fileName, {
        type: blob.type || "image/png"
      });
      const selection = await uploadFloorTextureFile(file);
      const cachedSelection = { ...selection, presetSlug: preset.slug };
      floorPresetUploadCacheRef.current.set(preset.slug, cachedSelection);
      setFloorTexture(cachedSelection);
    },
    [setFloorTexture, uploadFloorTextureFile]
  );

  return {
    uploadFloorTextureFile,
    handleUploadFloorTexture,
    handleSelectFloorTexturePreset
  };
}
