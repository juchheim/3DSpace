import type { BuildPiece, RoomManifest } from "@3dspace/contracts";

import {
  BUILD_STEP_UP_MAX,
  buildPieceColliders,
  type FloorTop,
  type RampSurface,
  worldToCell
} from "./build.js";

const HEIGHT_EPSILON = 1e-6;

/** Walk = step-up cap; snap/teleport = highest walkable surface at (x,z). */
export type GroundHeightMode = "walk" | "snap" | "teleport";

export type GroundHeightContext = {
  manifest: RoomManifest;
  index: BuildSurfaceIndex;
  getBaseY: (z: number) => number;
};

type HeightCandidate = { y: number; id: string };

function cellKey(ix: number, iz: number) {
  return `${ix},${iz}`;
}

function pointInFootprint(x: number, z: number, rect: { minX: number; maxX: number; minZ: number; maxZ: number }) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

function pickDeterministicMax(candidates: HeightCandidate[]): number {
  if (candidates.length === 0) return 0;
  const maxY = Math.max(...candidates.map((c) => c.y));
  const tied = candidates
    .filter((c) => Math.abs(c.y - maxY) <= HEIGHT_EPSILON)
    .sort((a, b) => a.id.localeCompare(b.id));
  return tied[tied.length - 1]!.y;
}

/** Linear walkable height on a ramp footprint; null when (x,z) is outside the ramp cell. */
export function rampHeightAt(ramp: RampSurface, x: number, z: number): number | null {
  if (!pointInFootprint(x, z, ramp)) return null;

  if (ramp.climbAxis === "z") {
    const span = ramp.maxZ - ramp.minZ;
    if (span <= 0) return ramp.lowY;
    const t =
      ramp.climbSign === 1 ? (z - ramp.minZ) / span : (ramp.maxZ - z) / span;
    return ramp.lowY + Math.min(1, Math.max(0, t)) * (ramp.highY - ramp.lowY);
  }

  const span = ramp.maxX - ramp.minX;
  if (span <= 0) return ramp.lowY;
  const t = ramp.climbSign === 1 ? (x - ramp.minX) / span : (ramp.maxX - x) / span;
  return ramp.lowY + Math.min(1, Math.max(0, t)) * (ramp.highY - ramp.lowY);
}

type CellSurfaces = {
  floors: FloorTop[];
  ramps: RampSurface[];
};

export class BuildSurfaceIndex {
  private readonly cells = new Map<string, CellSurfaces>();

  static fromPieces(pieces: BuildPiece[]): BuildSurfaceIndex {
    const index = new BuildSurfaceIndex();
    for (const piece of pieces) {
      const colliders = buildPieceColliders(piece);
      if (colliders.floorTop) {
        index.addFloor(piece.cell.ix, piece.cell.iz, colliders.floorTop);
      }
      if (colliders.ramp) {
        index.addRamp(piece.cell.ix, piece.cell.iz, colliders.ramp);
      }
    }
    return index;
  }

  addFloor(ix: number, iz: number, floor: FloorTop) {
    const cell = this.cell(ix, iz);
    cell.floors.push(floor);
    cell.floors.sort((a, b) => a.id.localeCompare(b.id));
  }

  addRamp(ix: number, iz: number, ramp: RampSurface) {
    const cell = this.cell(ix, iz);
    cell.ramps.push(ramp);
    cell.ramps.sort((a, b) => a.id.localeCompare(b.id));
  }

  private cell(ix: number, iz: number): CellSurfaces {
    const key = cellKey(ix, iz);
    let surfaces = this.cells.get(key);
    if (!surfaces) {
      surfaces = { floors: [], ramps: [] };
      this.cells.set(key, surfaces);
    }
    return surfaces;
  }

  /** Floors and ramps in the avatar cell plus eight neighbors (O(1) cell lookup). */
  nearbySurfaces(x: number, z: number): CellSurfaces {
    const { ix, iz } = worldToCell(x, z);
    const floors: FloorTop[] = [];
    const ramps: RampSurface[] = [];
    for (let dix = -1; dix <= 1; dix += 1) {
      for (let diz = -1; diz <= 1; diz += 1) {
        const cell = this.cells.get(cellKey(ix + dix, iz + diz));
        if (!cell) continue;
        floors.push(...cell.floors);
        ramps.push(...cell.ramps);
      }
    }
    floors.sort((a, b) => a.id.localeCompare(b.id));
    ramps.sort((a, b) => a.id.localeCompare(b.id));
    return { floors, ramps };
  }
}

export function buildGroundHeightContext(
  manifest: RoomManifest,
  pieces: BuildPiece[],
  getBaseY: (z: number) => number
): GroundHeightContext {
  return {
    manifest,
    index: BuildSurfaceIndex.fromPieces(pieces),
    getBaseY
  };
}

function collectHeightCandidates(x: number, z: number, ctx: GroundHeightContext): HeightCandidate[] {
  const base = ctx.getBaseY(z);
  const { floors, ramps } = ctx.index.nearbySurfaces(x, z);

  const candidates: HeightCandidate[] = [{ y: base, id: "terrain" }];

  for (const floor of floors) {
    if (pointInFootprint(x, z, floor)) {
      candidates.push({ y: floor.topY, id: floor.id });
    }
  }
  for (const ramp of ramps) {
    const rampY = rampHeightAt(ramp, x, z);
    if (rampY !== null) {
      candidates.push({ y: rampY, id: ramp.id });
    }
  }

  return candidates;
}

/** Highest walkable surface at (x,z); used for teleports and post-load snap. */
export function groundHeightAtSurface(x: number, z: number, ctx: GroundHeightContext): number {
  const candidates = collectHeightCandidates(x, z, ctx);
  return pickDeterministicMax(candidates);
}

/**
 * Walkable surface height at (x,z) with step-up / descend rules.
 * Identical on all clients when inputs match (integer cells, sorted tie-breaks).
 */
export function groundHeightAt(
  x: number,
  z: number,
  ctx: GroundHeightContext,
  currentY: number,
  mode: GroundHeightMode = "walk"
): number {
  if (mode === "snap" || mode === "teleport") {
    return groundHeightAtSurface(x, z, ctx);
  }

  const candidates = collectHeightCandidates(x, z, ctx);
  const base = candidates[0]!.y;

  const stepLimit = currentY + BUILD_STEP_UP_MAX;
  const reachable = candidates.filter((c) => c.y <= stepLimit + HEIGHT_EPSILON);
  if (reachable.length > 0) {
    return pickDeterministicMax(reachable);
  }

  const descend = candidates.filter((c) => c.y <= currentY + HEIGHT_EPSILON);
  if (descend.length > 0) {
    return pickDeterministicMax(descend);
  }

  return base;
}
