"use client";

import { useCallback, useState } from "react";
import type { BuildPieceMaterial, BuildPieceRotation } from "@3dspace/contracts";

export type BuildTool = "wall" | "floor" | "ramp" | "doorway" | "window" | "light" | "destroy";

export function useBuildMode() {
  const [enabled, setEnabled] = useState(false);
  const [tool, setToolState] = useState<BuildTool>("wall");
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<BuildPieceMaterial>("stone");
  const [rotation, setRotation] = useState<BuildPieceRotation>(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [rampRotationOverride, setRampRotationOverride] = useState(false);

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
    setStatusMessage
  };
}

export type BuildModeController = ReturnType<typeof useBuildMode>;
