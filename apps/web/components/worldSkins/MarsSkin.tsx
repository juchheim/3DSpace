// Phase 0: Mars Surface skin descriptor + scene-level atmosphere helpers.
// The MARS_SKIN descriptor is used directly by SkinHarness; the JSX helpers
// (MarsAtmosphere, marsWallMaterial) are consumed by SkinLayer in Phase 5.
// No production code paths are touched here — this file is Phase 0 harness-only.

import type { SkinDescriptor } from "./types";

export const MARS_SKIN: SkinDescriptor = {
  slug: "mars-surface",
  label: "Mars Surface",
  description:
    "Ochre regolith walls, pale dust sky, low-gravity walk speed, and wind ambient loop.",
  wallMaterials: {
    "wall-front":    { colorHex: "#b06030", roughness: 0.92 },
    "wall-left":     { colorHex: "#a85c2c", roughness: 0.92 },
    "wall-right":    { colorHex: "#a85c2c", roughness: 0.92 },
    "wall-back-lo":  { colorHex: "#9a5028", roughness: 0.90 },
    "wall-back-li":  { colorHex: "#a0582c", roughness: 0.90 },
    "wall-back-c":   { colorHex: "#9e5028", roughness: 0.90 },
    "wall-back-ri":  { colorHex: "#a0582c", roughness: 0.90 },
    "wall-back-ro":  { colorHex: "#9a5028", roughness: 0.90 },
  },
  floor:  { colorHex: "#9a5020", roughness: 0.96 },
  tiers:  { colorHex: "#ae6030", roughness: 0.94 },
  lighting: {
    backgroundColor:      "#a86a48",
    ambientColor:         "#d4906a",
    ambientIntensity:     0.75,
    directionalColor:     "#ffd4b0",
    directionalIntensity: 0.28,
    directionalPosition:  [4, 9, 3],
    fogColor: "#b87050",
    fogNear:  18,
    fogFar:   55,
    hemisphereSkyColor:    "#e8b078",
    hemisphereGroundColor: "#8a4818",
    hemisphereIntensity:   1.0,
  },
  ambient: {
    url: "/world-skins/mars-surface/v1/ambient.ogg",
    defaultGain: 0.15,
  },
  walkSpeedMultiplier: 0.38,
  avatarScale: 1.0,
};

// ── Scene-level atmosphere helpers (Phase 5 SkinLayer will use these) ────────

/** Renders Mars sky/fog/lighting into the R3F scene. Drop inside a <Canvas>. */
export function MarsAtmosphere() {
  const l = MARS_SKIN.lighting;
  return (
    <>
      <color attach="background" args={[l.backgroundColor]} />
      {l.fogColor !== undefined && (
        <fog attach="fog" args={[l.fogColor, l.fogNear ?? 18, l.fogFar ?? 55]} />
      )}
      {l.hemisphereSkyColor ? (
        <hemisphereLight
          args={[
            l.hemisphereSkyColor,
            l.hemisphereGroundColor ?? "#8a4818",
            l.hemisphereIntensity ?? 1,
          ]}
        />
      ) : (
        <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
      )}
      <directionalLight
        color={l.directionalColor}
        intensity={l.directionalIntensity}
        position={l.directionalPosition}
      />
    </>
  );
}

/** Returns meshStandardMaterial props for a given wall.id under the Mars skin. */
export function marsWallMaterialProps(wallId: string): { color: string; roughness: number } {
  const mat = MARS_SKIN.wallMaterials[wallId] ?? MARS_SKIN.wallMaterials["wall-front"]!;
  return { color: mat.colorHex ?? "#b06030", roughness: mat.roughness ?? 0.90 };
}
