import type { BuildPiece } from "@3dspace/contracts";
import { DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS, type ImageFloorTextureSpanCells } from "@3dspace/contracts";
import { BUILD_CELL_SIZE } from "@3dspace/room-engine";

/**
 * Continuous image-floor regions.
 *
 * Image-floor tiles that touch edge-to-edge (4-connected), sit on the same level, share the
 * same texture and the same textureSpanCells form one continuous floor. The uploaded image
 * covers a fixed span×span cell canvas anchored at the region's min corner — extend the floor
 * to reveal more at a constant scale. The grouping is deterministic (sorted piece ids).
 */
export type ImageFloorRegion = {
  /** Stable region id: the lexicographically smallest piece id in the region. */
  regionId: string;
  textureStorageKey: string | undefined;
  /** How many build cells wide/tall one image covers (from the placed pieces). */
  textureSpanCells: ImageFloorTextureSpanCells;
  level: number;
  /** World-space bounding rect of the connected region. */
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  pieceIds: string[];
};

export { DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS, IMAGE_FLOOR_TEXTURE_SPAN_OPTIONS } from "@3dspace/contracts";

function groupKey(piece: BuildPiece) {
  const span = piece.textureSpanCells ?? DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS;
  return `${piece.level}\u0000${piece.textureStorageKey ?? ""}\u0000${span}`;
}

function cellKey(ix: number, iz: number) {
  return `${ix},${iz}`;
}

function spanForPiece(piece: BuildPiece): ImageFloorTextureSpanCells {
  return piece.textureSpanCells ?? DEFAULT_IMAGE_FLOOR_TEXTURE_SPAN_CELLS;
}

/** Map of piece id → its connected region (only image-floor pieces appear). */
export function computeImageFloorRegions(pieces: BuildPiece[]): Map<string, ImageFloorRegion> {
  const imageFloors = pieces
    .filter((piece) => piece.kind === "image-floor")
    .sort((a, b) => a.id.localeCompare(b.id));

  const byGroup = new Map<string, Map<string, BuildPiece>>();
  for (const piece of imageFloors) {
    const key = groupKey(piece);
    let cells = byGroup.get(key);
    if (!cells) {
      cells = new Map();
      byGroup.set(key, cells);
    }
    cells.set(cellKey(piece.cell.ix, piece.cell.iz), piece);
  }

  const result = new Map<string, ImageFloorRegion>();
  for (const cells of byGroup.values()) {
    const visited = new Set<string>();
    for (const [startKey, startPiece] of cells) {
      if (visited.has(startKey)) continue;
      const members: BuildPiece[] = [];
      const queue = [startKey];
      visited.add(startKey);
      while (queue.length > 0) {
        const key = queue.pop()!;
        const piece = cells.get(key)!;
        members.push(piece);
        const { ix, iz } = piece.cell;
        for (const [nx, nz] of [
          [ix + 1, iz],
          [ix - 1, iz],
          [ix, iz + 1],
          [ix, iz - 1]
        ] as const) {
          const neighborKey = cellKey(nx, nz);
          if (cells.has(neighborKey) && !visited.has(neighborKey)) {
            visited.add(neighborKey);
            queue.push(neighborKey);
          }
        }
      }

      const pieceIds = members.map((piece) => piece.id).sort();
      const minIx = Math.min(...members.map((piece) => piece.cell.ix));
      const maxIx = Math.max(...members.map((piece) => piece.cell.ix));
      const minIz = Math.min(...members.map((piece) => piece.cell.iz));
      const maxIz = Math.max(...members.map((piece) => piece.cell.iz));
      const region: ImageFloorRegion = {
        regionId: pieceIds[0]!,
        textureStorageKey: startPiece.textureStorageKey,
        textureSpanCells: spanForPiece(startPiece),
        level: startPiece.level,
        minX: minIx * BUILD_CELL_SIZE,
        maxX: (maxIx + 1) * BUILD_CELL_SIZE,
        minZ: minIz * BUILD_CELL_SIZE,
        maxZ: (maxIz + 1) * BUILD_CELL_SIZE,
        pieceIds
      };
      for (const id of pieceIds) {
        result.set(id, region);
      }
    }
  }
  return result;
}

/**
 * UV for a world point on an image floor. The image spans textureSpanCells build cells from
 * the connected region's min corner. Upright for an avatar looking toward -Z.
 */
export function imageFloorUvAt(region: ImageFloorRegion, worldX: number, worldZ: number) {
  const span = region.textureSpanCells * BUILD_CELL_SIZE;
  return {
    u: (worldX - region.minX) / span,
    v: 1 - (worldZ - region.minZ) / span
  };
}
