"use client";

import { useEffect, useState } from "react";
import { BUILD_LEVEL_HEIGHT } from "@3dspace/room-engine";
import { avatarStandingLevel } from "./buildPlacement";

/**
 * Fraction of a level past the half-level midpoint that the avatar must travel
 * before the build level switches. Without this, transient Y noise near a
 * boundary (physics jitter, a ramp, the apex of a jump) flips the placement
 * plane a whole `BUILD_LEVEL_HEIGHT` and makes the ghost jump to a far cell.
 */
const LEVEL_HYSTERESIS = 0.18;

/**
 * The avatar's build level with hysteresis, so the placement plane (and thus the
 * cursor→cell mapping) doesn't flicker between levels when the avatar's Y hovers
 * near a level boundary. Large changes (teleport / return-to-spawn) snap
 * immediately; only adjacent-level transitions are damped.
 */
export function useStablePlacementLevel(avatarY: number): number {
  const [level, setLevel] = useState(() => avatarStandingLevel(avatarY));
  useEffect(() => {
    setLevel((prev) => {
      const target = avatarStandingLevel(avatarY);
      if (target === prev) return prev;
      // Snap on big jumps; only damp single-level changes.
      if (Math.abs(target - prev) >= 2) return target;
      const raw = avatarY / BUILD_LEVEL_HEIGHT;
      const midpoint = prev + (target > prev ? 0.5 : -0.5);
      const cleared =
        target > prev ? raw >= midpoint + LEVEL_HYSTERESIS : raw <= midpoint - LEVEL_HYSTERESIS;
      return cleared ? target : prev;
    });
  }, [avatarY]);
  return level;
}
