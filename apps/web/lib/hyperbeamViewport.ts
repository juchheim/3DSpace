/** Hyperbeam free-tier default max browser area (1280×720). */
export const HYPERBEAM_MAX_VIEWPORT_AREA = 1280 * 720;

function toMultipleOf4(value: number) {
  return Math.max(4, Math.floor(value / 4) * 4);
}

/** Clamp a viewport to Hyperbeam's max pixel area, preserving aspect ratio. */
export function clampHyperbeamViewport(
  width: number,
  height: number,
  maxArea = HYPERBEAM_MAX_VIEWPORT_AREA
): { width: number; height: number } {
  const area = width * height;
  if (area <= maxArea) {
    return { width: toMultipleOf4(width), height: toMultipleOf4(height) };
  }
  const scale = Math.sqrt(maxArea / area);
  return { width: toMultipleOf4(width * scale), height: toMultipleOf4(height * scale) };
}

/** Pick the largest viewport that fits `maxArea` for a display aspect ratio. */
export function optimalHyperbeamViewportForAspect(
  aspectRatio: number,
  maxArea = HYPERBEAM_MAX_VIEWPORT_AREA
): { width: number; height: number } {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    return { width: 1280, height: 720 };
  }
  const height = Math.sqrt(maxArea / aspectRatio);
  const width = height * aspectRatio;
  return clampHyperbeamViewport(width, height);
}
