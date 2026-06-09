"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { SkeletonUtils } from "three-stdlib";
import type { Group } from "three";
import type { PlacedChair } from "../lib/usePlacedChairs";
import { chairWithGroundY } from "../lib/usePlacedChairs";

const CHAIR_GLB_URL = "/objects/folding-chair.glb";

useGLTF.preload(CHAIR_GLB_URL);

function ChairMesh({
  chair,
  resolveGroundY,
  onDelete
}: {
  chair: PlacedChair;
  // currentY = the chair's own stored Y, so walk mode won't snap to a higher floor above it
  resolveGroundY: (x: number, z: number, currentY: number) => number;
  onDelete?: (id: string) => void;
}) {
  const { scene } = useGLTF(CHAIR_GLB_URL);

  // Clone so each instance is independent (material refs etc. stay separate)
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const resolved = chairWithGroundY(chair, (x, z) => resolveGroundY(x, z, chair.position.y));

  return (
    <group
      position={[resolved.position.x, resolved.position.y, resolved.position.z]}
      rotation={[0, resolved.yaw, 0]}
      {...(onDelete ? { onClick: (e) => { e.stopPropagation(); onDelete(chair.id); } } : {})}
    >
      <primitive object={model} />
    </group>
  );
}

export function PlacedChairsLayer({
  chairs,
  resolveGroundY,
  onDeleteChair
}: {
  chairs: PlacedChair[];
  resolveGroundY: (x: number, z: number, currentY: number) => number;
  onDeleteChair?: (id: string) => void;
}) {
  if (chairs.length === 0) return null;
  return (
    <>
      {chairs.map((chair) => (
        <ChairMesh key={chair.id} chair={chair} resolveGroundY={resolveGroundY} {...(onDeleteChair ? { onDelete: onDeleteChair } : {})} />
      ))}
    </>
  );
}
