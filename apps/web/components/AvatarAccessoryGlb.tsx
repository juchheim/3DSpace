"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import { Group, type Mesh, type MeshStandardMaterial, type Object3D, type SkinnedMesh } from "three";

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
 * Bone-attached accessory GLB. Parents an imperatively mounted group on the
 * target skeleton bone so the prop follows idle/walk/run clips automatically.
 */
export function AvatarAccessoryGlb({ entry, bone }: AvatarAccessoryGlbProps) {
  const { scene } = useGLTF(entry.glbUrl);

  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if (!isMesh(object)) return;
      object.castShadow = true;
      const material = object.material as MeshStandardMaterial;
      object.material = material.clone();
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

  useLayoutEffect(() => {
    const mount = new Group();
    mount.frustumCulled = false;
    mount.position.set(px * boneSpaceScale, py * boneSpaceScale + (groundY ? -groundY * boneSpaceScale : 0), pz * boneSpaceScale);
    mount.rotation.set(rx, ry, rz);
    mount.scale.setScalar(scale * boneSpaceScale);
    mount.add(model);
    bone.add(mount);
    return () => {
      bone.remove(mount);
      mount.remove(model);
    };
  }, [bone, model, px, py, pz, rx, ry, rz, scale, groundY, boneSpaceScale]);

  return null;
}
