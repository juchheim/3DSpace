import type { BuildPiece } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  BUILD_WALL_HEIGHT,
  BUILD_WALL_THICKNESS,
  BUILD_WINDOW_LINTEL_BASE,
  BUILD_WINDOW_SILL_HEIGHT,
  buildCellFootprint
} from "@3dspace/room-engine";

export type OpeningFramePart = {
  position: [number, number, number];
  size: [number, number, number];
};

/** Frame boxes for doorway/window openings on a cell edge. */
export function edgeOpeningFrameParts(piece: BuildPiece): OpeningFramePart[] {
  const edge = piece.edge!;
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const postW = 0.28;
  const depth = BUILD_WALL_THICKNESS;
  const span = BUILD_CELL_SIZE;
  const halfSpan = span / 2;

  if (piece.kind === "doorway") {
    const gapW = span * 0.55;
    const postH = BUILD_WALL_HEIGHT;
    if (edge === "n" || edge === "s") {
      const z = edge === "n" ? footprint.maxZ : footprint.minZ;
      return [
        { position: [centerX - halfSpan + postW / 2, baseY + postH / 2, z], size: [postW, postH, depth] },
        { position: [centerX + halfSpan - postW / 2, baseY + postH / 2, z], size: [postW, postH, depth] },
        { position: [centerX, baseY + BUILD_WALL_HEIGHT - 0.12, z], size: [gapW + postW, 0.24, depth] }
      ];
    }
    const x = edge === "e" ? footprint.maxX : footprint.minX;
    return [
      { position: [x, baseY + postH / 2, centerZ - halfSpan + postW / 2], size: [depth, postH, postW] },
      { position: [x, baseY + postH / 2, centerZ + halfSpan - postW / 2], size: [depth, postH, postW] },
      { position: [x, baseY + BUILD_WALL_HEIGHT - 0.12, centerZ], size: [depth, 0.24, gapW + postW] }
    ];
  }

  if (piece.kind === "window") {
    const sillH = BUILD_WINDOW_SILL_HEIGHT;
    const lintelH = Math.max(BUILD_WALL_HEIGHT - BUILD_WINDOW_LINTEL_BASE, 0.1);
    const glassH = BUILD_WINDOW_LINTEL_BASE - BUILD_WINDOW_SILL_HEIGHT;
    if (edge === "n" || edge === "s") {
      const z = edge === "n" ? footprint.maxZ : footprint.minZ;
      return [
        { position: [centerX, baseY + sillH / 2, z], size: [span, sillH, depth] },
        { position: [centerX, baseY + BUILD_WINDOW_LINTEL_BASE + lintelH / 2, z], size: [span, lintelH, depth] },
        { position: [centerX, baseY + BUILD_WINDOW_SILL_HEIGHT + glassH / 2, z], size: [span * 0.7, glassH, depth * 0.6] }
      ];
    }
    const x = edge === "e" ? footprint.maxX : footprint.minX;
    return [
      { position: [x, baseY + sillH / 2, centerZ], size: [depth, sillH, span] },
      { position: [x, baseY + BUILD_WINDOW_LINTEL_BASE + lintelH / 2, centerZ], size: [depth, lintelH, span] },
      { position: [x, baseY + BUILD_WINDOW_SILL_HEIGHT + glassH / 2, centerZ], size: [depth * 0.6, glassH, span * 0.7] }
    ];
  }

  return [];
}
