import type { RoomManifest } from "@3dspace/contracts";

/** Keep in sync with `build.ts` / `index.ts` FFA layout constants. */
const BUILD_CELL_SIZE = 2.0;
export const FFA_MAIN_RADIUS = 23;
export const FFA_HALL_LENGTH = 6;
export const FFA_HALL_WIDTH = 4;
export const FFA_EXIT_HALF_ARC = FFA_HALL_WIDTH / FFA_MAIN_RADIUS / 2;
export const FFA_STATIC_BOARD_WIDTH = 6;
export const FFA_WALL_THICKNESS = 0.3;
export const SPAWN_OCCUPIED_RADIUS = 0.9;

export const BUILD_SPAWN_KEEP_OUT_RADIUS = SPAWN_OCCUPIED_RADIUS + BUILD_CELL_SIZE;

const CARDINAL_EXIT_ANGLES = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2] as const;

export type AxisAlignedRect = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

export type FreeForAllBuildMask = {
  halls: AxisAlignedRect[];
  boardZones: AxisAlignedRect[];
};

export function isFreeForAllManifest(manifest: RoomManifest) {
  return manifest.walls.some((wall) => wall.id.startsWith("ffa-perim-"));
}

export function normalizeAngleDiff(angle: number, target: number) {
  return ((angle - target + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

export function isAngleWithinFreeForAllExitArc(angle: number) {
  return CARDINAL_EXIT_ANGLES.some(
    (exitAngle) => Math.abs(normalizeAngleDiff(angle, exitAngle)) <= FFA_EXIT_HALF_ARC
  );
}

function boundingBoxFromPoints(points: { x: number; z: number }[]): AxisAlignedRect {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function freeForAllHallRects(): AxisAlignedRect[] {
  const exits = [
    { angle: 0 },
    { angle: Math.PI / 2 },
    { angle: Math.PI },
    { angle: (3 * Math.PI) / 2 }
  ];
  return exits.map((exit) => {
    const cos = Math.cos(exit.angle);
    const sin = Math.sin(exit.angle);
    const perpCos = -sin;
    const perpSin = cos;
    const halfWidth = FFA_HALL_WIDTH / 2;
    const hallStart = FFA_MAIN_RADIUS;
    const hallEnd = FFA_MAIN_RADIUS + FFA_HALL_LENGTH;
    const corners = [
      { along: hallStart, perp: -halfWidth },
      { along: hallStart, perp: halfWidth },
      { along: hallEnd, perp: -halfWidth },
      { along: hallEnd, perp: halfWidth }
    ].map(({ along, perp }) => ({
      x: along * cos + perp * perpCos,
      z: along * sin + perp * perpSin
    }));
    return boundingBoxFromPoints(corners);
  });
}

function boardKeepOutRect(anchor: RoomManifest["wallAnchors"][number]): AxisAlignedRect {
  const perpX = -anchor.normal.z;
  const perpZ = anchor.normal.x;
  const halfWidth = anchor.width / 2 + BUILD_CELL_SIZE / 2;
  const depth = BUILD_CELL_SIZE;
  const outerX = anchor.position.x;
  const outerZ = anchor.position.z;
  const innerX = anchor.position.x + anchor.normal.x * depth;
  const innerZ = anchor.position.z + anchor.normal.z * depth;
  const corners = [
    { x: outerX + perpX * halfWidth, z: outerZ + perpZ * halfWidth },
    { x: outerX - perpX * halfWidth, z: outerZ - perpZ * halfWidth },
    { x: innerX + perpX * halfWidth, z: innerZ + perpZ * halfWidth },
    { x: innerX - perpX * halfWidth, z: innerZ - perpZ * halfWidth }
  ];
  return boundingBoxFromPoints(corners);
}

export function freeForAllBoardKeepOutRects(manifest: RoomManifest) {
  return manifest.wallAnchors
    .filter((anchor) => /^ffa-adj-.*-anchor$/.test(anchor.id))
    .map((anchor) => boardKeepOutRect(anchor));
}

export function freeForAllBuildMask(manifest: RoomManifest): FreeForAllBuildMask | null {
  if (!isFreeForAllManifest(manifest)) return null;
  return {
    halls: freeForAllHallRects(),
    boardZones: freeForAllBoardKeepOutRects(manifest)
  };
}

export function rectsOverlap(a: AxisAlignedRect, b: AxisAlignedRect) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

export function footprintOverlapsAnyRect(
  footprint: { minX: number; maxX: number; minZ: number; maxZ: number },
  rects: AxisAlignedRect[]
) {
  return rects.some((rect) => rectsOverlap(footprint, rect));
}

export function isPointInFreeForAllExitWedge(x: number, z: number) {
  const radius = Math.hypot(x, z);
  if (radius > FFA_MAIN_RADIUS) return false;
  return isAngleWithinFreeForAllExitArc(Math.atan2(z, x));
}

export function footprintOverlapsSpawnKeepOut(
  manifest: RoomManifest,
  points: { x: number; z: number }[]
) {
  const radiusSquared = BUILD_SPAWN_KEEP_OUT_RADIUS * BUILD_SPAWN_KEEP_OUT_RADIUS;
  return manifest.spawnPoints.some((spawn) =>
    points.some((point) => {
      const dx = point.x - spawn.position.x;
      const dz = point.z - spawn.position.z;
      return dx * dx + dz * dz <= radiusSquared;
    })
  );
}

export function footprintOverlapsExitWedge(points: { x: number; z: number }[]) {
  return points.some((point) => isPointInFreeForAllExitWedge(point.x, point.z));
}

export function cellFootprintFromPoints(points: { x: number; z: number }[]): AxisAlignedRect {
  return boundingBoxFromPoints(points);
}

export function cellFootprintCorners(footprint: AxisAlignedRect) {
  return [
    { x: footprint.minX, z: footprint.minZ },
    { x: footprint.maxX, z: footprint.minZ },
    { x: footprint.maxX, z: footprint.maxZ },
    { x: footprint.minX, z: footprint.maxZ }
  ];
}
