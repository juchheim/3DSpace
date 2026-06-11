"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { PlacedChair } from "../lib/usePlacedChairs";
import { chairWithGroundY } from "../lib/usePlacedChairs";
import { cloneGlbSceneSolid } from "../lib/cloneGlbScene";
import { WORLD_ASSET_CATALOG, placedWorldAssetRenderScale, worldAssetGlbUrl } from "../lib/worldAssetCatalog";

for (const asset of WORLD_ASSET_CATALOG) {
  useGLTF.preload(asset.glbUrl);
}

function WorldAssetMesh({
  chair,
  resolveGroundY,
  onDelete
}: {
  chair: PlacedChair;
  // currentY = the asset's own stored Y, so walk mode won't snap to a higher floor above it
  resolveGroundY: (x: number, z: number, currentY: number) => number;
  onDelete?: (id: string) => void;
}) {
  const glbUrl = worldAssetGlbUrl(chair.slug);
  const scale = placedWorldAssetRenderScale(chair);
  const { scene } = useGLTF(glbUrl);

  const model = useMemo(() => cloneGlbSceneSolid(scene), [scene]);
  const resolved = chairWithGroundY(chair, (x, z) => resolveGroundY(x, z, chair.position.y));

  return (
    <group
      position={[resolved.position.x, resolved.position.y, resolved.position.z]}
      rotation={[0, resolved.yaw, 0]}
      scale={scale}
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
        <WorldAssetMesh key={chair.id} chair={chair} resolveGroundY={resolveGroundY} {...(onDeleteChair ? { onDelete: onDeleteChair } : {})} />
      ))}
    </>
  );
}
