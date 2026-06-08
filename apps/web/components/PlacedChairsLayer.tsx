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
  resolveGroundY
}: {
  chair: PlacedChair;
  resolveGroundY: (x: number, z: number) => number;
}) {
  const { scene } = useGLTF(CHAIR_GLB_URL);

  // Clone so each instance is independent (material refs etc. stay separate)
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const resolved = chairWithGroundY(chair, resolveGroundY);

  return (
    <group
      position={[resolved.position.x, resolved.position.y, resolved.position.z]}
      rotation={[0, resolved.yaw, 0]}
    >
      <primitive object={model} />
    </group>
  );
}

export function PlacedChairsLayer({
  chairs,
  resolveGroundY
}: {
  chairs: PlacedChair[];
  resolveGroundY: (x: number, z: number) => number;
}) {
  if (chairs.length === 0) return null;
  return (
    <>
      {chairs.map((chair) => (
        <ChairMesh key={chair.id} chair={chair} resolveGroundY={resolveGroundY} />
      ))}
    </>
  );
}
