"use client";

import { useCallback, useState } from "react";
import type { BuildPieceMaterial, BuildPieceRotation } from "@3dspace/contracts";

export type BuildTool = "wall" | "floor" | "ramp" | "destroy";

export function useBuildMode() {
  const [enabled, setEnabled] = useState(false);
  const [tool, setToolState] = useState<BuildTool>("wall");
  const [materialId, setMaterialId] = useState<BuildPieceMaterial>("stone");
  const [rotation, setRotation] = useState<BuildPieceRotation>(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [rampRotationOverride, setRampRotationOverride] = useState(false);

  const setTool = useCallback((next: BuildTool) => {
    setToolState(next);
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
