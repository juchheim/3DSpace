import type { RoomManifest } from "@3dspace/contracts";

import type { WallCollider } from "./build.js";
import {
  FFA_MAIN_RADIUS,
  isAngleWithinFreeForAllExitArc
} from "./free-for-all-build-mask.js";

export const WALL_AVATAR_RADIUS = 0.4;
export const AVATAR_STAND_HEIGHT = 1.6;

export function manifestWallToCollider(wall: RoomManifest["walls"][number]): WallCollider {
  return {
    ...wall,
    baseY: Math.min(wall.start.y, wall.end.y)
  };
}

export function avatarOverlapsWallVerticalSpan(
  avatarBaseY: number,
  standHeight: number,
  wall: WallCollider
) {
  const avatarTop = avatarBaseY + standHeight;
  const wallTop = wall.baseY + wall.height;
  return avatarBaseY < wallTop && avatarTop > wall.baseY;
}

/**
 * Push `newPos` back so the avatar cannot enter any non-passable wall volume that
 * overlaps the avatar's vertical span `[avatarBaseY, avatarBaseY + standHeight]`.
 */
export function resolveWallCollisionsV2(
  oldPos: { x: number; z: number },
  newPos: { x: number; z: number },
  walls: WallCollider[],
  avatarBaseY: number,
  standHeight: number = AVATAR_STAND_HEIGHT
): { x: number; z: number } {
  let x = newPos.x;
  let z = newPos.z;

  for (const wall of walls) {
    if (wall.passable !== false) continue;
    if (!avatarOverlapsWallVerticalSpan(avatarBaseY, standHeight, wall)) continue;

    const spanX = Math.abs(wall.end.x - wall.start.x);
    const spanZ = Math.abs(wall.end.z - wall.start.z);
    const isAlongX = spanX > spanZ;
    const halfThickness = (wall.thickness ?? 0) / 2;

    if (isAlongX) {
      const wallZ = wall.start.z;
      const minX = Math.min(wall.start.x, wall.end.x) - WALL_AVATAR_RADIUS;
      const maxX = Math.max(wall.start.x, wall.end.x) + WALL_AVATAR_RADIUS;
      const minBlockedZ = wallZ - halfThickness - WALL_AVATAR_RADIUS;
      const maxBlockedZ = wallZ + halfThickness + WALL_AVATAR_RADIUS;
      if (x > minX && x < maxX) {
        if (oldPos.z <= minBlockedZ && z > minBlockedZ) {
          z = minBlockedZ;
        } else if (oldPos.z >= maxBlockedZ && z < maxBlockedZ) {
          z = maxBlockedZ;
        } else if (oldPos.z > minBlockedZ && oldPos.z < maxBlockedZ) {
          z = oldPos.z <= wallZ ? minBlockedZ : maxBlockedZ;
        }
      }
    } else {
      const wallX = wall.start.x;
      const minZ = Math.min(wall.start.z, wall.end.z) - WALL_AVATAR_RADIUS;
      const maxZ = Math.max(wall.start.z, wall.end.z) + WALL_AVATAR_RADIUS;
      const minBlockedX = wallX - halfThickness - WALL_AVATAR_RADIUS;
      const maxBlockedX = wallX + halfThickness + WALL_AVATAR_RADIUS;
      if (z > minZ && z < maxZ) {
        if (oldPos.x <= minBlockedX && x > minBlockedX) {
          x = minBlockedX;
        } else if (oldPos.x >= maxBlockedX && x < maxBlockedX) {
          x = maxBlockedX;
        } else if (oldPos.x > minBlockedX && oldPos.x < maxBlockedX) {
          x = oldPos.x <= wallX ? minBlockedX : maxBlockedX;
        }
      }
    }
  }

  const hasFreeForAllPerimeter = walls.some((wall) => wall.id.startsWith("ffa-perim-"));
  if (hasFreeForAllPerimeter) {
    const oldRadius = Math.hypot(oldPos.x, oldPos.z);
    const newRadius = Math.hypot(x, z);
    const shouldApplyPerimeterClamp =
      oldRadius <= FFA_MAIN_RADIUS + WALL_AVATAR_RADIUS ||
      newRadius <= FFA_MAIN_RADIUS + WALL_AVATAR_RADIUS;
    if (!shouldApplyPerimeterClamp) {
      return { x, z };
    }

    const angle = Math.atan2(z, x);
    const withinExitArc = isAngleWithinFreeForAllExitArc(angle);
    if (!withinExitArc) {
      const maxRadius = FFA_MAIN_RADIUS - WALL_AVATAR_RADIUS;
      const radialDistance = Math.hypot(x, z);
      if (radialDistance > maxRadius && radialDistance > 0) {
        const scale = maxRadius / radialDistance;
        x *= scale;
        z *= scale;
      }
    }
  }

  return { x, z };
}
