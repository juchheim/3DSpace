"use client";

import { useCallback, useState } from "react";
import {
  DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS,
  type BuildPieceMaterial,
  type BuildPieceRotation,
  type ImageFloorTextureSpanCells
} from "@3dspace/contracts";

export type BuildTool =
  | "wall"
  | "simple-wall"
  | "floor"
  | "image-floor"
  | "ramp"
  | "doorway"
  | "window"
  | "light"
  | "mirror"
  | "arbor-ceiling"
  | "arbor-futuristic-ceiling"
  | "ceiling-futuristic-lighting"
  | "ceiling-futuristic-dark"
  | "destroy";

/** Image selected for the Image Floor tool (uploaded or reused from the room). */
export type FloorTextureSelection = {
  storageKey: string;
  url: string;
  fileName?: string;
  /** Built-in preset slug, when this texture came from a catalog preset. */
  presetSlug?: string;
  /** Span used by existing floor pieces with this texture, if known. */
  spanCells?: ImageFloorTextureSpanCells;
};

export function useBuildMode() {
  const [enabled, setEnabled] = useState(false);
  const [tool, setToolState] = useState<BuildTool>("wall");
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<BuildPieceMaterial>("stone");
  const [rotation, setRotation] = useState<BuildPieceRotation>(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [rampRotationOverride, setRampRotationOverride] = useState(false);
  const [floorTexture, setFloorTexture] = useState<FloorTextureSelection | null>(null);
  const [floorTextureSpanCells, setFloorTextureSpanCells] = useState<ImageFloorTextureSpanCells>(
    DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS
  );

  const setTool = useCallback((next: BuildTool) => {
    setToolState(next);
    setSelectedStampId(null);
    setRampRotationOverride(false);
  }, []);

  const selectStamp = useCallback((stampId: string | null) => {
    setSelectedStampId(stampId);
    setRampRotationOverride(false);
  }, []);

  const rotate = useCallback(() => {
    setRotation((current) => (((current + 90) % 360) as BuildPieceRotation));
    if (tool === "ramp") {
      setRampRotationOverride(true);
    }
  }, [tool]);

  const toggle = useCallback(() => {
    setEnabled((current) => !current);
    setStatusMessage("");
    setRampRotationOverride(false);
  }, []);

  const applyFloorTexture = useCallback((selection: FloorTextureSelection | null) => {
    setFloorTexture(selection);
    if (selection?.spanCells) {
      setFloorTextureSpanCells(selection.spanCells);
    }
  }, []);

  return {
    enabled,
    setEnabled,
    tool,
    setTool,
    selectedStampId,
    selectStamp,
    materialId,
    setMaterialId,
    rotation,
    rotate,
    rampRotationOverride,
    toggle,
    statusMessage,
    setStatusMessage,
    floorTexture,
    setFloorTexture: applyFloorTexture,
    floorTextureSpanCells,
    setFloorTextureSpanCells
  };
}

export type BuildModeController = ReturnType<typeof useBuildMode>;
