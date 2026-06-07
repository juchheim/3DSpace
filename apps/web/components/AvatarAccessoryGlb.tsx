"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { AvatarAccessoryCatalogEntry } from "@3dspace/contracts";
import {
  Euler,
  Group,
  Matrix4,
  Quaternion,
  Vector3,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type SkinnedMesh
} from "three";

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
 * Bone-attached accessory GLB. Each frame, copies the target bone's world matrix
 * (with catalog offset) onto an R3F-managed group so the prop follows animation
 * and is not dropped by React reconciliation on the avatar primitive.
 */
export function AvatarAccessoryGlb({ entry, bone }: AvatarAccessoryGlbProps) {
  const { scene } = useGLTF(entry.glbUrl);
  const mountRef = useRef<Group>(null);
  const offsetMatrix = useMemo(() => new Matrix4(), []);
  const worldMatrix = useMemo(() => new Matrix4(), []);
  const localPosition = useMemo(() => new Vector3(), []);
  const localQuaternion = useMemo(() => new Quaternion(), []);
  const localScale = useMemo(() => new Vector3(), []);

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

  useFrame(() => {
    const mount = mountRef.current;
    if (!mount) return;

    bone.updateWorldMatrix(true, false);
    localPosition.set(px * boneSpaceScale, offsetY, pz * boneSpaceScale);
    localQuaternion.setFromEuler(new Euler(rx, ry, rz));
    localScale.set(mountScale, mountScale, mountScale);
    offsetMatrix.compose(localPosition, localQuaternion, localScale);
    worldMatrix.multiplyMatrices(bone.matrixWorld, offsetMatrix);
    mount.matrix.copy(worldMatrix);
  });

  return (
    <group ref={mountRef} matrixAutoUpdate={false} frustumCulled={false}>
      <primitive object={model} />
    </group>
  );
};
