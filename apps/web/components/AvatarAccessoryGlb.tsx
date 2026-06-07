"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import { Group, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from "three";

const ACCESSORY_RENDER_ORDER = 50;

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

export function findBone(root: Object3D, name: string): Object3D | undefined {
  let skinned: SkinnedMesh | undefined;
  root.traverse((object) => {
    if ((object as SkinnedMesh).isSkinnedMesh && !skinned) {
      skinned = object as SkinnedMesh;
    }
  });
  if (skinned) {
    const fromSkeleton = skinned.skeleton.bones.find((bone) => bone.name === name);
    if (fromSkeleton) return fromSkeleton;
  }

  let found: Object3D | undefined;
  root.traverse((object) => {
    if (object.name === name && !found) {
      found = object;
    }
  });
  return found;
}

export type AvatarAccessoryGlbProps = {
  entry: AvatarAccessoryCatalogEntry;
  bone: Object3D;
};

/**
 * Parents the accessory on the animated skeleton bone inside the avatar GLB.
 * Must live inside the skinned model hierarchy (bone.add), not as a sibling
 * with a copied world matrix — nested avatar transforms would misplace it.
 */
export function AvatarAccessoryGlb({ entry, bone }: AvatarAccessoryGlbProps) {
  const { scene } = useGLTF(entry.glbUrl);

  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if (!isMesh(object)) return;
      object.castShadow = true;
      object.renderOrder = ACCESSORY_RENDER_ORDER;
      const material = object.material as MeshStandardMaterial;
      const cloned = material.clone();
      cloned.depthWrite = true;
      cloned.polygonOffset = true;
      cloned.polygonOffsetFactor = -2;
      cloned.polygonOffsetUnits = -2;
      object.material = cloned;
    });
    return root;
  }, [scene]);

  useEffect(
    () => () => {
      model.traverse((object) => {
        if (isMesh(object)) (object.material as MeshStandardMaterial).dispose();
      });
    },
    [model]
  );

  const { x: px, y: py, z: pz } = entry.localPosition;
  const { x: rx, y: ry, z: rz } = entry.localRotation;
  const scale = entry.localScale;
  const groundY = entry.nativeGroundY ?? 0;
  const boneSpaceScale = entry.boneSpaceMetersPerUnit ? 1 / entry.boneSpaceMetersPerUnit : 1;
  const offsetY = py * boneSpaceScale + (groundY ? -groundY * boneSpaceScale : 0);
  const mountScale = scale * boneSpaceScale;

  useLayoutEffect(() => {
    const mount = new Group();
    mount.frustumCulled = false;
    mount.position.set(px * boneSpaceScale, offsetY, pz * boneSpaceScale);
    mount.rotation.set(rx, ry, rz);
    mount.scale.setScalar(mountScale);
    mount.add(model);
    bone.add(mount);
    return () => {
      bone.remove(mount);
      mount.remove(model);
    };
  }, [bone, model, px, py, pz, rx, ry, rz, mountScale, offsetY, boneSpaceScale]);

  return null;
}
