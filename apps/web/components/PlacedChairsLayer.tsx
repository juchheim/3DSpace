"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import type { PlacedChair } from "../lib/usePlacedChairs";
import { chairWithGroundY } from "../lib/usePlacedChairs";
import { cloneGlbSceneSolid } from "../lib/cloneGlbScene";
import { applyWindSway, windTimeUniform } from "../lib/windSway";
import {
  WORLD_ASSET_CATALOG,
  placedWorldAssetRenderScale,
  worldAssetBySlug,
  worldAssetGlbUrl
} from "../lib/worldAssetCatalog";
import { placementPitch } from "../lib/worldAssetCustomPlacement";

for (const asset of WORLD_ASSET_CATALOG) {
  useGLTF.preload(asset.glbUrl);
}

/** Advances the shared wind clock while any swaying asset is mounted. */
function WindClock() {
  useFrame((_, delta) => {
    windTimeUniform.value += delta;
  });
  return null;
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
  const custom = chair.custom;
  const glbUrl = custom?.glbUrl ?? worldAssetGlbUrl(chair.slug);
  const scale = custom ? chair.scale ?? 1 : placedWorldAssetRenderScale(chair);
  const windSway = !custom && worldAssetBySlug(chair.slug)?.windSway === true;
  const { scene } = useGLTF(glbUrl);

  const model = useMemo(() => {
    const cloned = cloneGlbSceneSolid(scene);
    if (windSway) applyWindSway(cloned);
    return cloned;
  }, [scene, windSway]);

  // Wall/ceiling assets carry an authoritative Y (mount height / ceiling) and a
  // pitch so they hang correctly — they must not be snapped back to the floor.
  const pinnedToSurface = custom?.placement === "wall" || custom?.placement === "ceiling";
  const resolved = pinnedToSurface
    ? chair
    : chairWithGroundY(chair, (x, z) => resolveGroundY(x, z, chair.position.y));
  const pitch = custom ? placementPitch(custom.placement) : 0;

  return (
    <group
      position={[resolved.position.x, resolved.position.y, resolved.position.z]}
      rotation={[pitch, resolved.yaw, 0]}
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
  const anyWindSway = chairs.some((chair) => worldAssetBySlug(chair.slug)?.windSway === true);
  return (
    <>
      {anyWindSway ? <WindClock /> : null}
      {chairs.map((chair) => (
        <WorldAssetMesh key={chair.id} chair={chair} resolveGroundY={resolveGroundY} {...(onDeleteChair ? { onDelete: onDeleteChair } : {})} />
      ))}
    </>
  );
}
