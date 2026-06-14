"use client";

import { useCallback, useRef, useState } from "react";
import type { PlacedChair } from "./usePlacedChairs";
import { chairWithGroundY, findNearestPodium, podiumStandPose } from "./usePlacedChairs";

export type UseStandingReturn = {
  /** True while locked in at a podium. */
  engaged: boolean;
  /** Non-null while engaged — feeds `lockedPosition` in useAvatarMovement. */
  standLockedPosition: { x: number; y: number; z: number } | null;
  /** Yaw override while engaged (radians). */
  standYaw: number | null;
  /** Podium the avatar is currently next to (within 1.5 m) or engaged at. */
  nearestPodium: PlacedChair | null;
  /** Short E-key tap: engage (if near a podium) or leave (if engaged). */
  tryInteract: () => void;
};

export function useStanding({
  assets,
  getAvatarPosition,
  resolveGroundY
}: {
  assets: PlacedChair[];
  getAvatarPosition: () => { x: number; y: number; z: number } | null;
  resolveGroundY?: (x: number, z: number) => number;
}): UseStandingReturn {
  const [engagedId, setEngagedId] = useState<string | null>(null);
  const [standLockedPosition, setStandLockedPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [standYaw, setStandYaw] = useState<number | null>(null);
  const engagedIdRef = useRef(engagedId);
  engagedIdRef.current = engagedId;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;

  const pos = getAvatarPosition();
  let nearestPodium: PlacedChair | null = null;
  if (pos) {
    nearestPodium = engagedId
      ? assets.find((a) => a.id === engagedId) ?? null
      : findNearestPodium(pos, assets, 1.5);
  }

  const tryInteract = useCallback(() => {
    if (engagedIdRef.current) {
      setEngagedId(null);
      setStandLockedPosition(null);
      setStandYaw(null);
      return;
    }
    const here = getAvatarPosition();
    const podium = here ? findNearestPodium(here, assetsRef.current, 1.5) : null;
    if (!podium) return;
    const grounded = resolveGroundY ? chairWithGroundY(podium, resolveGroundY) : podium;
    const { position, rotationY } = podiumStandPose(grounded);
    setEngagedId(podium.id);
    setStandLockedPosition(position);
    setStandYaw(rotationY);
  }, [getAvatarPosition, resolveGroundY]);

  return {
    engaged: engagedId !== null,
    standLockedPosition,
    standYaw,
    nearestPodium,
    tryInteract
  };
}
