"use client";

import { useCallback, useRef, useState } from "react";
import type { PlacedChair } from "./usePlacedChairs";
import { findNearestChair } from "./usePlacedChairs";

/** Sitting animation phase.
 *  - "none"        : standing normally
 *  - "sitting"     : one-shot sit-down clip playing (≈ 0.63 s)
 *  - "seated"      : seated idle playing; movement locked
 *  - "standing"    : one-shot stand-from-sit clip playing (≈ 1.03 s)
 */
export type SittingPhase = "none" | "sitting" | "seated" | "standing";

export type UseSittingReturn = {
  sittingPhase: SittingPhase;
  /** Non-null while seated or transitioning — feeds `lockedPosition` in useAvatarMovement. */
  seatLockedPosition: { x: number; y: number; z: number } | null;
  /** Yaw override while seated (radians). Applied to the avatar when sitting begins. */
  seatYaw: number | null;
  /** Chair the avatar is currently next to (within 1.5 m) or seated in. */
  nearestChair: PlacedChair | null;
  /** Call on short E-key tap to sit (if near a chair) or stand (if already seated). */
  tryInteract: () => void;
  /** BlockyAvatar calls this when a one-shot sit/stand clip finishes. */
  onAnimationFinished: () => void;
};

const SIT_ANIM_DURATION_MS = 650;
const STAND_ANIM_DURATION_MS = 1050;

export function useSitting({
  chairs,
  getAvatarPosition,
}: {
  chairs: PlacedChair[];
  getAvatarPosition: () => { x: number; y: number; z: number } | null;
}): UseSittingReturn {
  const [phase, setPhase] = useState<SittingPhase>("none");
  const [seatChairId, setSeatChairId] = useState<string | null>(null);
  const [seatLockedPosition, setSeatLockedPosition] = useState<{ x: number; y: number; z: number } | null>(null);
  const [seatYaw, setSeatYaw] = useState<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Fallback timer handle in case the animation-finished callback isn't fired
  const phaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chairsRef = useRef(chairs);
  chairsRef.current = chairs;

  function clearPhaseTimer() {
    if (phaseTimerRef.current !== null) {
      clearTimeout(phaseTimerRef.current);
      phaseTimerRef.current = null;
    }
  }

  const pos = getAvatarPosition();
  // Recompute every render — getAvatarPosition is a stable ref callback, so memoizing
  // on it would freeze proximity until chairs change even while the avatar moves.
  let nearestChair: PlacedChair | null = null;
  if (pos) {
    if (seatChairId) {
      nearestChair = chairs.find((c) => c.id === seatChairId) ?? null;
    } else {
      nearestChair = findNearestChair(pos, chairs, 1.5);
    }
  }

  const tryInteract = useCallback(() => {
    const currentPhase = phaseRef.current;
    if (currentPhase === "seated" || currentPhase === "sitting") {
      // Begin standing
      clearPhaseTimer();
      setPhase("standing");
      phaseTimerRef.current = setTimeout(() => {
        setPhase("none");
        setSeatChairId(null);
        setSeatLockedPosition(null);
        setSeatYaw(null);
        phaseTimerRef.current = null;
      }, STAND_ANIM_DURATION_MS);
    } else if (currentPhase === "none") {
      const pos = getAvatarPosition();
      const chair = pos ? findNearestChair(pos, chairsRef.current, 1.5) : null;
      if (!chair) return;

      // Compute seat position: directly at the chair's centre (the animation
      // handles the backward movement visually within the clip).
      const seat = { x: chair.position.x, y: chair.position.y, z: chair.position.z };
      // Avatar faces the same direction the chair faces (i.e. away from the front).
      const avatarYaw = chair.yaw + Math.PI;

      clearPhaseTimer();
      setSeatChairId(chair.id);
      setSeatLockedPosition(seat);
      setSeatYaw(avatarYaw);
      setPhase("sitting");

      phaseTimerRef.current = setTimeout(() => {
        setPhase("seated");
        phaseTimerRef.current = null;
      }, SIT_ANIM_DURATION_MS);
    }
  }, [getAvatarPosition]);

  // Called by BlockyAvatar when the one-shot clip finishes (may arrive slightly
  // earlier or later than the timer; whichever wins, the other is a no-op).
  const onAnimationFinished = useCallback(() => {
    if (phase === "sitting") {
      clearPhaseTimer();
      setPhase("seated");
    } else if (phase === "standing") {
      clearPhaseTimer();
      setPhase("none");
      setSeatChairId(null);
      setSeatLockedPosition(null);
      setSeatYaw(null);
    }
  }, [phase]);

  return {
    sittingPhase: phase,
    seatLockedPosition,
    seatYaw,
    nearestChair,
    tryInteract,
    onAnimationFinished,
  };
}
