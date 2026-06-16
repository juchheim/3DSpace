/**
 * Pure placement math for custom (user-uploaded) world assets.
 *
 * The placement classification (floor / wall / ceiling / other) decides how a
 * cursor point on the floor plane maps to a final world transform:
 *  - floor / other → unchanged (free placement, handled by the controller).
 *  - wall → project the cursor onto the nearest wall segment, mount at a fixed
 *    height, and face the wall's inward normal.
 *  - ceiling → keep cursor X/Z, raise to the ceiling, and flip to face down.
 *
 * Kept dependency-free (plain numbers, not THREE) so it unit-tests cleanly.
 */

import type { WorldAssetPlacementKind } from "@3dspace/contracts";

export type XZ = { x: number; z: number };

type WallSegment = {
  start: { x: number; z: number };
  end: { x: number; z: number };
};

/** Default height (m) a wall-mounted custom asset hangs at. */
export const WALL_MOUNT_HEIGHT = 1.6;

/** Project `p` onto segment ab, clamped to the segment, returning the foot + param t. */
function projectOntoSegment(p: XZ, a: { x: number; z: number }, b: { x: number; z: number }) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const lenSq = abx * abx + abz * abz;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / lenSq));
  const fx = a.x + abx * t;
  const fz = a.z + abz * t;
  const dx = p.x - fx;
  const dz = p.z - fz;
  return { x: fx, z: fz, t, distSq: dx * dx + dz * dz };
}

/**
 * Snap a floor cursor point to the nearest wall: returns the contact point on
 * the wall and a yaw that faces the wall's inward normal (toward `interior`).
 * Returns null when there are no walls.
 */
export function nearestWallSnap(
  point: XZ,
  walls: WallSegment[],
  interior: XZ = { x: 0, z: 0 }
): { x: number; z: number; yaw: number } | null {
  let best: { x: number; z: number; segment: WallSegment } | null = null;
  let bestDistSq = Infinity;
  for (const wall of walls) {
    const proj = projectOntoSegment(point, wall.start, wall.end);
    if (proj.distSq < bestDistSq) {
      bestDistSq = proj.distSq;
      best = { x: proj.x, z: proj.z, segment: wall };
    }
  }
  if (!best) return null;

  // Wall direction in XZ; its two perpendiculars are the candidate normals.
  const dx = best.segment.end.x - best.segment.start.x;
  const dz = best.segment.end.z - best.segment.start.z;
  let nx = -dz;
  let nz = dx;
  const len = Math.hypot(nx, nz) || 1;
  nx /= len;
  nz /= len;
  // Flip so the normal points toward the room interior (where avatars stand).
  if ((interior.x - best.x) * nx + (interior.z - best.z) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  // Asset front faces (sin(yaw), cos(yaw)); align it with the inward normal.
  const yaw = Math.atan2(nx, nz);
  return { x: best.x, z: best.z, yaw };
}

/** Ceiling height to mount at, from the room manifest dimensions. */
export function ceilingMountHeight(dimensions: { height: number }): number {
  return dimensions.height;
}

/** True when a placement kind needs surface snapping rather than free floor placement. */
export function placementSnapsToSurface(kind: WorldAssetPlacementKind): boolean {
  return kind === "wall" || kind === "ceiling";
}

/** Extra X-axis rotation (radians) applied to the model so ceiling items hang facing down. */
export function placementPitch(kind: WorldAssetPlacementKind): number {
  return kind === "ceiling" ? Math.PI : 0;
}

/**
 * Resolve the final placement transform for a cursor floor point, given the
 * classification. `groundY` supplies the walkable floor height for floor/other.
 */
export function resolveCustomPlacement(
  kind: WorldAssetPlacementKind,
  cursor: XZ,
  ctx: {
    walls: WallSegment[];
    dimensions: { height: number };
    groundY: (x: number, z: number) => number;
    interior?: XZ;
  }
): { position: { x: number; y: number; z: number }; yaw: number } | null {
  if (kind === "wall") {
    const snap = nearestWallSnap(cursor, ctx.walls, ctx.interior);
    if (!snap) return null;
    return { position: { x: snap.x, y: WALL_MOUNT_HEIGHT, z: snap.z }, yaw: snap.yaw };
  }
  if (kind === "ceiling") {
    return {
      position: { x: cursor.x, y: ceilingMountHeight(ctx.dimensions), z: cursor.z },
      yaw: 0
    };
  }
  // floor / other: rest on the walkable ground.
  return {
    position: { x: cursor.x, y: ctx.groundY(cursor.x, cursor.z), z: cursor.z },
    yaw: 0
  };
}
