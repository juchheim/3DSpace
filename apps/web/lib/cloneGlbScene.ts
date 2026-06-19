import { SkeletonUtils } from "three-stdlib";
import type { Group, Material, Mesh, Object3D } from "three";

function withClonedMaterials(mesh: Mesh): Material[] {
  const { material } = mesh;
  if (!material) return [];
  const source = Array.isArray(material) ? material : [material];
  const cloned = source.map((m) => m.clone());
  mesh.material = cloned.length === 1 ? cloned[0]! : cloned;
  return cloned;
}

function applyMaterialOpacity(materials: Material[], opacity: number) {
  const ghost = opacity < 1;
  for (const mat of materials) {
    mat.transparent = ghost;
    mat.opacity = opacity;
    mat.depthWrite = !ghost;
  }
}

/** Deep-clone a GLB scene with independent, fully opaque materials.
 *  Placed solid assets (world assets, custom uploads) both cast and receive
 *  shadows so lights are visibly blocked by furniture. */
export function cloneGlbSceneSolid(scene: Object3D): Group {
  const model = SkeletonUtils.clone(scene) as Group;
  model.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    applyMaterialOpacity(withClonedMaterials(mesh), 1);
  });
  return model;
}

/** Deep-clone a GLB scene for placement preview without mutating the cached loader scene. */
export function cloneGlbSceneGhost(scene: Object3D, opacity = 0.55): Group {
  const model = SkeletonUtils.clone(scene) as Group;
  model.traverse((obj) => {
    if (!(obj as Mesh).isMesh) return;
    applyMaterialOpacity(withClonedMaterials(obj as Mesh), opacity);
  });
  return model;
}
