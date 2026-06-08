"use client";

import { useCallback, useState } from "react";

export type PlacedChair = {
  id: string;
  /** World-space position of the chair centre (Y = 0, on the floor). */
  position: { x: number; y: number; z: number };
  /** Y-axis rotation of the chair in radians. The chair's "front" faces in the
   *  direction (sin(yaw), 0, cos(yaw)). The avatar sits facing away — i.e. yaw + π. */
  yaw: number;
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

/** World-space seat pose for an avatar sitting in `chair`. */
export function chairSeatPose(chair: PlacedChair): {
  position: { x: number; y: number; z: number };
  rotationY: number;
} {
  // Chair front faces (sin(yaw), 0, cos(yaw)). The seated avatar looks away from the
  // front (back against the chair back). Shift slightly toward the backrest so the
  // hips land over the seat pan rather than the GLB origin at floor center.
  const forwardX = Math.sin(chair.yaw);
  const forwardZ = Math.cos(chair.yaw);
  const backOffset = 0.14;
  return {
    position: {
      x: chair.position.x - forwardX * backOffset,
      y: chair.position.y,
      z: chair.position.z - forwardZ * backOffset
    },
    rotationY: chair.yaw + Math.PI
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
    (position: { x: number; y: number; z: number }, yaw: number) => {
      const id = `chair-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setChairs((prev) => [...prev, { id, position, yaw }]);
    },
    []
  );

  const removeChair = useCallback((id: string) => {
    setChairs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return { chairs, placeChair, removeChair };
}
