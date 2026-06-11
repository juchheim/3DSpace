"use client";

import { useCallback, useState } from "react";
import { isSittableWorldAsset } from "./worldAssetCatalog";

export type PlacedChair = {
  id: string;
  /** Catalog slug, e.g. "folding-chair". */
  slug: string;
  /** World-space position of the asset centre (Y = walkable ground). */
  position: { x: number; y: number; z: number };
  /** Y-axis rotation in radians. For sittable chairs, the seat faces (sin(yaw), 0, cos(yaw)). */
  yaw: number;
  /** Instance render scale (catalog base × placement variance). */
  scale?: number;
};

/** Euclidean distance on the XZ plane between two XZ points. */
function distanceXZ(
  a: { x: number; z: number },
  b: { x: number; z: number }
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function chairWithGroundY(
  chair: PlacedChair,
  groundY: (x: number, z: number) => number
): PlacedChair {
  const y = groundY(chair.position.x, chair.position.z);
  if (Math.abs(y - chair.position.y) < 1e-6) return chair;
  return { ...chair, position: { ...chair.position, y } };
}

/** World-space seat pose for an avatar sitting in `chair`. */
export function chairSeatPose(chair: PlacedChair): {
  position: { x: number; y: number; z: number };
  rotationY: number;
} {
  // Chair front faces (sin(yaw), 0, cos(yaw)). The seated avatar faces the same
  // direction (legs toward the front, back against the backrest). Nudge forward
  // from the GLB origin so hips sit on the seat pan, not through the backrest.
  const forwardX = Math.sin(chair.yaw);
  const forwardZ = Math.cos(chair.yaw);
  const forwardOffset = 0.42;
  return {
    position: {
      x: chair.position.x + forwardX * forwardOffset,
      y: chair.position.y,
      z: chair.position.z + forwardZ * forwardOffset
    },
    rotationY: chair.yaw
  };
}

/** Returns the nearest chair within `radius` metres of `avatarPos`, or null. */
export function findNearestChair(
  avatarPos: { x: number; z: number },
  chairs: PlacedChair[],
  radius = 1.5
): PlacedChair | null {
  let best: PlacedChair | null = null;
  let bestDist = radius;
  for (const chair of chairs) {
    if (!isSittableWorldAsset(chair.slug)) continue;
    const d = distanceXZ(avatarPos, chair.position);
    if (d < bestDist) {
      best = chair;
      bestDist = d;
    }
  }
  return best;
}

export function usePlacedChairs() {
  const [chairs, setChairs] = useState<PlacedChair[]>([]);

  const placeChair = useCallback(
    (slug: string, position: { x: number; y: number; z: number }, yaw: number) => {
      const id = `chair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setChairs((prev) => [...prev, { id, slug, position, yaw }]);
    },
    []
  );

  const removeChair = useCallback((id: string) => {
    setChairs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { chairs, placeChair, removeChair };
}
