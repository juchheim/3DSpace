import type { Material, Mesh, Object3D } from "three";

/**
 * Gentle vertex-shader wind sway for foliage world assets (catalog flag
 * `windSway`). The GLB bakes the wind data into TEXCOORD_0:
 *   uv.x — per-blade phase (0..1), so blades don't sway in lockstep
 *   uv.y — bend weight (0 at the root → 1 at the tip), so roots stay planted
 *
 * All swaying materials share one time uniform; PlacedChairsLayer advances it
 * once per frame. Materials are per-instance clones (cloneGlbSceneSolid), so
 * patching them here never touches the cached loader scene.
 */
export const windTimeUniform = { value: 0 };

const WIND_VERTEX_CHUNK = /* glsl */ `
{
  float windPhase = uv.x * 6.28318;
  float windWeight = uv.y;
  // Slow gust envelope over two layered sways — mild, not a storm.
  float gust = 0.7 + 0.3 * sin(uWindTime * 0.43 + windPhase * 0.7);
  float swayX = sin(uWindTime * 1.7 + windPhase) * 0.05 + sin(uWindTime * 3.1 + windPhase * 1.7) * 0.018;
  float swayZ = cos(uWindTime * 1.3 + windPhase * 1.3) * 0.038;
  transformed.x += swayX * gust * windWeight;
  transformed.z += swayZ * gust * windWeight;
  // Blades arc rather than shear: dip slightly as they lean.
  transformed.y -= (abs(swayX) + abs(swayZ)) * 0.3 * gust * windWeight;
}`;

function patchMaterial(material: Material) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTimeUniform;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${WIND_VERTEX_CHUNK}`);
  };
  // All wind materials compile to the same program — share it.
  material.customProgramCacheKey = () => "wind-sway";
  material.needsUpdate = true;
}

/** Patch every mesh material in `model` with the wind sway. */
export function applyWindSway(model: Object3D) {
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat) patchMaterial(mat);
    }
  });
}
