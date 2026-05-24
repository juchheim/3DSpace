import { useEffect, useState } from "react";
import type { QualityLevel } from "@3dspace/contracts";

/** drei Html transform sizing: worldMeters = px * distanceFactor / 400 */
export const WALL_OBJECT_DISTANCE_FACTOR = 8;

const WALL_OBJECT_HTML_BASE_PX_PER_METER = 400;

/**
 * Multiplier for board Html DOM size. The mount is inverse-scaled so world size stays
 * the same while images/text rasterize at higher pixel density (sharper on retina).
 */
export function wallObjectHtmlResolutionScale(quality: QualityLevel = "medium"): number {
  if (typeof window === "undefined") return 2;
  const dpr = window.devicePixelRatio || 1;
  const qualityFloor = quality === "high" ? 2.5 : quality === "medium" ? 2 : 1.75;
  return Math.min(3, Math.max(qualityFloor, dpr));
}

export function wallObjectSurfacePixelSize(
  surfaceWidthMeters: number,
  surfaceHeightMeters: number,
  resolutionScale = 2
) {
  const baseWidthPx = (surfaceWidthMeters * WALL_OBJECT_HTML_BASE_PX_PER_METER) / WALL_OBJECT_DISTANCE_FACTOR;
  const baseHeightPx = (surfaceHeightMeters * WALL_OBJECT_HTML_BASE_PX_PER_METER) / WALL_OBJECT_DISTANCE_FACTOR;
  return {
    widthPx: baseWidthPx * resolutionScale,
    heightPx: baseHeightPx * resolutionScale,
    baseWidthPx,
    baseHeightPx
  };
}

export function useWallObjectHtmlResolutionScale(quality: QualityLevel) {
  const [scale, setScale] = useState(() => wallObjectHtmlResolutionScale(quality));

  useEffect(() => {
    const update = () => setScale(wallObjectHtmlResolutionScale(quality));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [quality]);

  return scale;
}
