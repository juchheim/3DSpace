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
    "wall-front":    { colorHex: "#d8a878", roughness: 0.92 },
    "wall-left":     { colorHex: "#d0a070", roughness: 0.92 },
    "wall-right":    { colorHex: "#d0a070", roughness: 0.92 },
    "wall-back-lo":  { colorHex: "#d0a070", roughness: 0.90 },
    "wall-back-li":  { colorHex: "#d0a070", roughness: 0.90 },
    "wall-back-c":   { colorHex: "#d8a878", roughness: 0.90 },
    "wall-back-ri":  { colorHex: "#d0a070", roughness: 0.90 },
    "wall-back-ro":  { colorHex: "#d0a070", roughness: 0.90 },
  },
  floor:  { colorHex: "#9a5020", roughness: 0.96 },
  tiers:  { colorHex: "#ae6030", roughness: 0.94 },
  lighting: {
    backgroundColor:      "#f0dc88",
    ambientColor:         "#f8f0c8",
    ambientIntensity:     0.9,
    directionalColor:     "#fff8e8",
    directionalIntensity: 0.65,
    directionalPosition:  [4, 10, 4],
    directionalFillColor:     "#fff8e8",
    directionalFillIntensity: 0.55,
    directionalFillPosition:  [0, 10, 14],
    fogColor: "#dcc878",
    fogNear:  22,
    fogFar:   65,
    hemisphereSkyColor:    "#faf0b0",
    hemisphereGroundColor: "#d09050",
    hemisphereIntensity:   2.4,
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
        <>
          <hemisphereLight
            args={[
              l.hemisphereSkyColor,
              l.hemisphereGroundColor ?? "#d09050",
              l.hemisphereIntensity ?? 1,
            ]}
          />
          <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
        </>
      ) : (
        <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
      )}
      <directionalLight
        color={l.directionalColor}
        intensity={l.directionalIntensity}
        position={l.directionalPosition}
      />
      {l.directionalFillIntensity !== undefined && l.directionalFillIntensity > 0 ? (
        <directionalLight
          color={l.directionalFillColor ?? l.directionalColor}
          intensity={l.directionalFillIntensity}
          position={l.directionalFillPosition ?? [0, 10, 14]}
        />
      ) : null}
    </>
  );
}

/** Returns meshStandardMaterial props for a given wall.id under the Mars skin. */
export function marsWallMaterialProps(wallId: string): { color: string; roughness: number } {
  const mat = MARS_SKIN.wallMaterials[wallId] ?? MARS_SKIN.wallMaterials["wall-front"]!;
  return { color: mat.colorHex ?? "#b06030", roughness: mat.roughness ?? 0.90 };
}
