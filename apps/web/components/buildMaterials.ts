import type { BuildPieceMaterial } from "@3dspace/contracts";

const BUILD_MATERIAL_PRESETS: Record<
  BuildPieceMaterial,
  { color: string; roughness: number; metalness: number; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number }
> = {
  stone: { color: "#8f8c86", roughness: 0.92, metalness: 0.05 },
  wood: { color: "#9a7038", roughness: 0.88, metalness: 0.02 },
  metal: { color: "#b8c0c8", roughness: 0.35, metalness: 0.88 },
  glass: { color: "#b8dcff", roughness: 0.08, metalness: 0.12, transparent: true, opacity: 0.45 },
  neon: { color: "#00ffd0", roughness: 0.35, metalness: 0.15, emissive: "#00ffd0", emissiveIntensity: 0.75 }
};

export function buildMaterialProps(
  materialId: BuildPieceMaterial,
  options: { ghost?: boolean; valid?: boolean; highlighted?: boolean } = {}
) {
  const preset = BUILD_MATERIAL_PRESETS[materialId];
  const ghost = options.ghost ?? false;
  const valid = options.valid ?? true;
  const highlighted = options.highlighted ?? false;

  if (ghost) {
    return {
      color: valid ? "#6dff9a" : "#ff6b6b",
      roughness: 0.45,
      metalness: 0.05,
      transparent: true,
      opacity: valid ? 0.42 : 0.5,
      emissive: valid ? "#2dffb0" : "#ff4040",
      emissiveIntensity: 0.35,
      depthWrite: false
    };
  }

  if (highlighted) {
    return {
      ...preset,
      emissive: "#ffcc00",
      emissiveIntensity: 0.45
    };
  }

  return preset;
}

export const BUILD_MATERIAL_OPTIONS: BuildPieceMaterial[] = ["stone", "wood", "metal", "glass", "neon"];
