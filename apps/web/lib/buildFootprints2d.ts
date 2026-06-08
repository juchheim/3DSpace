import type { BuildPiece, BuildPieceMaterial, BuildPieceCorner, RoomManifest } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  buildCellFootprint,
  buildPieceColliders,
  cornerWorldPoint,
  projectPositionTo2D,
  rampClimbFromRotation
} from "@3dspace/room-engine";

export type MapPoint = { x: number; y: number };

const MATERIAL_STROKE: Record<BuildPieceMaterial, string> = {
  stone: "#6b6860",
  wood: "#7a5528",
  metal: "#8a949c",
  glass: "#5a9fd4",
  neon: "#00b894"
};

export function buildMaterialStroke(materialId: BuildPieceMaterial) {
  return MATERIAL_STROKE[materialId] ?? MATERIAL_STROKE.stone;
}

export function levelFillOpacity(level: number) {
  return Math.min(0.78, 0.28 + level * 0.12);
}

export function projectMapPoint(manifest: RoomManifest, x: number, z: number): MapPoint {
  return projectPositionTo2D(manifest, { x, y: 0, z });
}

export function cellFootprintRect(manifest: RoomManifest, cell: { ix: number; iz: number }) {
  const footprint = buildCellFootprint(cell.ix, cell.iz);
  const tl = projectMapPoint(manifest, footprint.minX, footprint.minZ);
  const br = projectMapPoint(manifest, footprint.maxX, footprint.maxZ);
  return {
    x: Math.min(tl.x, br.x),
    y: Math.min(tl.y, br.y),
    width: Math.abs(br.x - tl.x),
    height: Math.abs(br.y - tl.y)
  };
}

export function floorFootprintRect(manifest: RoomManifest, piece: BuildPiece) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const tl = projectMapPoint(manifest, footprint.minX, footprint.minZ);
  const br = projectMapPoint(manifest, footprint.maxX, footprint.maxZ);
  return {
    x: Math.min(tl.x, br.x),
    y: Math.min(tl.y, br.y),
    width: Math.abs(br.x - tl.x),
    height: Math.abs(br.y - tl.y)
  };
}

export function wallFootprintSegment(manifest: RoomManifest, piece: BuildPiece) {
  const wall = buildPieceColliders(piece).walls[0];
  if (!wall) return null;
  const start = projectMapPoint(manifest, wall.start.x, wall.start.z);
  const end = projectMapPoint(manifest, wall.end.x, wall.end.z);
  return { start, end };
}

/** L-shaped corner marker on the 2D map (two short segments). */
export function wallCornerFootprintSegments(manifest: RoomManifest, piece: BuildPiece) {
  if (piece.kind !== "wall-corner" || !piece.corner) return null;
  const pt = cornerWorldPoint(piece.cell.ix, piece.cell.iz, piece.corner);
  const inset = BUILD_CELL_SIZE * 0.42;
  const center = projectMapPoint(manifest, pt.x, pt.z);
  const arms: Record<BuildPieceCorner, { dx: number; dz: number }> = {
    ne: { dx: -inset, dz: -inset },
    nw: { dx: inset, dz: -inset },
    se: { dx: -inset, dz: inset },
    sw: { dx: inset, dz: inset }
  };
  const arm = arms[piece.corner];
  const end = projectMapPoint(manifest, pt.x + arm.dx, pt.z + arm.dz);
  const orthEnd =
    piece.corner === "ne" || piece.corner === "sw"
      ? projectMapPoint(manifest, pt.x + arm.dx, pt.z)
      : projectMapPoint(manifest, pt.x, pt.z + arm.dz);
  return [
    { start: center, end },
    { start: center, end: orthEnd }
  ];
}

export function rampFootprintArrow(manifest: RoomManifest, piece: BuildPiece) {
  const surface = buildPieceColliders(piece).ramp;
  if (!surface) return null;
  const { climbAxis, climbSign } = rampClimbFromRotation(piece.rotation);
  const centerX = (piece.cell.ix + 0.5) * BUILD_CELL_SIZE;
  const centerZ = (piece.cell.iz + 0.5) * BUILD_CELL_SIZE;
  const inset = BUILD_CELL_SIZE * 0.22;

  let lowX = centerX;
  let lowZ = centerZ;
  let highX = centerX;
  let highZ = centerZ;

  if (climbAxis === "z") {
    if (climbSign === 1) {
      lowZ = surface.minZ + inset;
      highZ = surface.maxZ - inset;
    } else {
      lowZ = surface.maxZ - inset;
      highZ = surface.minZ + inset;
    }
  } else if (climbSign === 1) {
    lowX = surface.minX + inset;
    highX = surface.maxX - inset;
  } else {
    lowX = surface.maxX - inset;
    highX = surface.minX + inset;
  }

  return {
    tail: projectMapPoint(manifest, lowX, lowZ),
    tip: projectMapPoint(manifest, highX, highZ)
  };
}
