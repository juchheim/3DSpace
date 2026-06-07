"use client";

import { useEffect, useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import { Bone, Group, type Mesh, type MeshStandardMaterial, type Object3D } from "three";

function isMesh(object: Object3D): object is Mesh {
  return (object as Mesh).isMesh === true;
}

export function findBone(root: Object3D, name: string): Bone | undefined {
  let found: Bone | undefined;
  root.traverse((object) => {
    if ((object as Bone).isBone && object.name === name) {
      found = object as Bone;
    }
  });
  return found;
}

export type AvatarAccessoryGlbProps = {
  entry: AvatarAccessoryCatalogEntry;
  bone: Bone;
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

  useLayoutEffect(() => {
    const mount = new Group();
    mount.position.set(px, py + (groundY ? -groundY : 0), pz);
    mount.rotation.set(rx, ry, rz);
    mount.scale.setScalar(scale);
    mount.add(model);
    bone.add(mount);
    return () => {
      bone.remove(mount);
      mount.remove(model);
    };
  }, [bone, model, px, py, pz, rx, ry, rz, scale, groundY]);

  return null;
}
