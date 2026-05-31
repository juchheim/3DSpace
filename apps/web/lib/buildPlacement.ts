import type {
  BuildPiece,
  BuildPieceEdge,
  BuildPieceKind,
  BuildPieceMaterial,
  BuildPieceRotation,
  RoomManifest
} from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_LEVEL_HEIGHT,
  BUILD_MAX_LEVEL,
  BUILD_MAX_PIECES_PER_ROOM,
  BUILD_MAX_PIECES_PER_USER,
  BUILD_PLACEMENT_RATE_LIMIT_MS,
  BUILD_STEP_UP_MAX,
  buildPieceStableId,
  isBuildAllowedAt,
  levelToY,
  worldToCell
} from "@3dspace/room-engine";

export type BuildPlacementTarget = {
  kind: BuildPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge;
  rotation: BuildPieceRotation;
  materialId: BuildPieceMaterial;
};

function clampLevel(level: number) {
  return Math.min(Math.max(level, 0), BUILD_MAX_LEVEL);
}

/**
 * The build level the avatar is standing at, from its feet `y`.
 * Floor thickness (0.3) is well under half a level, so rounding lands on the right level:
 * ground → 0, on a level-1 floor (y≈2.3) → 1, etc. Used as the placement level when the
 * cursor falls on empty ground (so a floor/ramp/wall extends at the level you're on,
 * instead of dropping to level 0).
 */
export function avatarStandingLevel(avatarY: number) {
  return clampLevel(Math.round(avatarY / BUILD_LEVEL_HEIGHT));
}

export function nearestWallEdge(x: number, z: number, ix: number, iz: number): BuildPieceEdge {
  const centerX = (ix + 0.5) * BUILD_CELL_SIZE;
  const centerZ = (iz + 0.5) * BUILD_CELL_SIZE;
  const dx = x - centerX;
  const dz = z - centerZ;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? "e" : "w";
  }
  return dz >= 0 ? "n" : "s";
}

/**
 * Auto-align a wall's edge to a neighbouring wall so a row stays a straight run.
 *
 * `nearestWallEdge` picks the cell side nearest the cursor, which flips between orientations
 * near cell corners — so two walls meant to be collinear can land on perpendicular edges, and a
 * board placed on the result looks "perpendicular". When the cell next to a run already holds a
 * collinear wall, snap to that edge instead. A horizontal run (n/s) extends along x (left/right
 * neighbours); a vertical run (e/w) extends along z (front/back neighbours). Standalone walls and
 * ambiguous corners (two different runs meet) keep the cursor edge, so corners stay buildable.
 */
export function alignWallEdgeToNeighbors(
  cell: { ix: number; iz: number },
  level: number,
  cursorEdge: BuildPieceEdge,
  piecesById: Record<string, BuildPiece>
): BuildPieceEdge {
  const { ix, iz } = cell;
  const hasWall = (cix: number, ciz: number, edge: BuildPieceEdge) =>
    Boolean(piecesById[buildPieceStableId({ kind: "wall", cell: { ix: cix, iz: ciz }, level, edge })]);

  const suggestions = new Set<BuildPieceEdge>();
  for (const edge of ["n", "s"] as const) {
    if (hasWall(ix - 1, iz, edge) || hasWall(ix + 1, iz, edge)) suggestions.add(edge);
  }
  for (const edge of ["e", "w"] as const) {
    if (hasWall(ix, iz - 1, edge) || hasWall(ix, iz + 1, edge)) suggestions.add(edge);
  }

  if (suggestions.has(cursorEdge)) return cursorEdge;
  if (suggestions.size === 1) return [...suggestions][0]!;
  return cursorEdge;
}

export function inferPlacementLevel(hitY: number, surfacePiece?: BuildPiece | null, baseLevel = 0) {
  if (surfacePiece?.kind === "floor") {
    // Hitting a floor's top face means "extend at this level," not "stack above."
    // To build a second story you walk up a ramp to that level and place from there.
    return clampLevel(surfacePiece.level);
  }
  if (surfacePiece?.kind === "ramp") {
    return clampLevel(surfacePiece.level + 1);
  }
  if (hitY >= BUILD_LEVEL_HEIGHT * 0.75) {
    return clampLevel(Math.floor((hitY + 0.01) / BUILD_LEVEL_HEIGHT));
  }
  // Cursor on empty ground: extend at the level the avatar is standing on, not level 0.
  return clampLevel(baseLevel);
}

export function wallLevelFromSurface(hitY: number, surfacePiece?: BuildPiece | null, baseLevel = 0) {
  if (surfacePiece?.kind === "floor") {
    return surfacePiece.level;
  }
  if (surfacePiece?.kind === "ramp") {
    return surfacePiece.level;
  }
  if (hitY >= BUILD_FLOOR_THICKNESS) {
    return clampLevel(Math.floor((hitY + 0.01) / BUILD_LEVEL_HEIGHT));
  }
  return clampLevel(baseLevel);
}

/** Orient ramp climb toward the hit (high edge at the aimed side of the cell). */
export function inferRampRotationFromHit(hitX: number, hitZ: number, ix: number, iz: number): BuildPieceRotation {
  const centerX = (ix + 0.5) * BUILD_CELL_SIZE;
  const centerZ = (iz + 0.5) * BUILD_CELL_SIZE;
  const dx = hitX - centerX;
  const dz = hitZ - centerZ;
  if (Math.abs(dx) >= Math.abs(dz)) {
    return dx >= 0 ? 90 : 270;
  }
  return dz >= 0 ? 0 : 180;
}

export function rampLevelFromSurface(hitY: number, surfacePiece?: BuildPiece | null, baseLevel = 0) {
  if (surfacePiece?.kind === "floor" || surfacePiece?.kind === "ramp") {
    return clampLevel(surfacePiece.level);
  }
  return wallLevelFromSurface(hitY, surfacePiece, baseLevel);
}

/** Auto-orient from hit unless the user pressed R while the ramp tool is active. */
export function resolveRampRotation(
  hitX: number,
  hitZ: number,
  ix: number,
  iz: number,
  manualRotation: BuildPieceRotation,
  rampRotationOverride: boolean
): BuildPieceRotation {
  return rampRotationOverride
    ? manualRotation
    : inferRampRotationFromHit(hitX, hitZ, ix, iz);
}

export function resolveBuildPlacementTarget(input: {
  tool: BuildPieceKind;
  hitX: number;
  hitY: number;
  hitZ: number;
  rotation: BuildPieceRotation;
  materialId: BuildPieceMaterial;
  surfacePiece?: BuildPiece | null;
  rampRotationOverride?: boolean;
  /** Avatar's standing level — placement level when the cursor falls on empty ground. */
  baseLevel?: number;
  /** Existing (and in-flight) pieces, used to align a wall collinear with an adjacent wall. */
  existingPieces?: Record<string, BuildPiece>;
}): BuildPlacementTarget {
  const cell = worldToCell(input.hitX, input.hitZ);
  const baseLevel = input.baseLevel ?? 0;
  if (input.tool === "wall") {
    const level = wallLevelFromSurface(input.hitY, input.surfacePiece, baseLevel);
    const cursorEdge = nearestWallEdge(input.hitX, input.hitZ, cell.ix, cell.iz);
    return {
      kind: "wall",
      cell,
      level,
      edge: input.existingPieces
        ? alignWallEdgeToNeighbors(cell, level, cursorEdge, input.existingPieces)
        : cursorEdge,
      rotation: input.rotation,
      materialId: input.materialId
    };
  }

  if (input.tool === "ramp") {
    const autoOrient =
      input.surfacePiece?.kind === "floor" || input.surfacePiece?.kind === "ramp";
    return {
      kind: "ramp",
      cell,
      level: rampLevelFromSurface(input.hitY, input.surfacePiece, baseLevel),
      rotation: autoOrient
        ? resolveRampRotation(
            input.hitX,
            input.hitZ,
            cell.ix,
            cell.iz,
            input.rotation,
            input.rampRotationOverride ?? false
          )
        : input.rotation,
      materialId: input.materialId
    };
  }

  return {
    kind: input.tool,
    cell,
    level: inferPlacementLevel(input.hitY, input.surfacePiece, baseLevel),
    rotation: input.rotation,
    materialId: input.materialId
  };
}

export function buildPlacementPreviewPiece(
  roomId: string,
  target: BuildPlacementTarget,
  userId: string
): BuildPiece {
  const stableId = buildPieceStableId({
    kind: target.kind,
    cell: target.cell,
    level: target.level,
    edge: target.edge
  });
  return {
    id: stableId,
    roomId,
    kind: target.kind,
    cell: target.cell,
    level: target.level,
    ...(target.edge ? { edge: target.edge } : {}),
    rotation: target.rotation,
    materialId: target.materialId,
    createdByUserId: userId,
    createdAt: new Date().toISOString()
  };
}

function cellLevelOccupiedBySameKind(
  piecesById: Record<string, BuildPiece>,
  target: BuildPlacementTarget,
  stableId: string
) {
  if (target.kind === "wall") return false;
  for (const existing of Object.values(piecesById)) {
    if (existing.id === stableId) continue;
    if (existing.kind !== target.kind) continue;
    if (
      existing.cell.ix === target.cell.ix &&
      existing.cell.iz === target.cell.iz &&
      existing.level === target.level
    ) {
      return true;
    }
  }
  return false;
}

export function countNewBuildSlots(pieces: BuildPiece[], targets: BuildPlacementTarget[]) {
  const existingIds = new Set(pieces.map((piece) => piece.id));
  let newSlots = 0;
  for (const target of targets) {
    const stableId = buildPieceStableId({
      kind: target.kind,
      cell: target.cell,
      level: target.level,
      edge: target.edge
    });
    if (!existingIds.has(stableId)) {
      newSlots += 1;
    }
  }
  return newSlots;
}

export function buildPlacementStatusMessage(reason: string | undefined): string {
  if (!reason) return "Placement blocked.";
  switch (reason) {
    case "room-cap":
      return "Build piece limit reached for this room";
    case "user-cap":
      return "Build piece limit reached for this user";
    default:
      return `Build placement rejected: ${reason}`;
  }
}

export function checkBuildCapsForPlacements(
  pieces: BuildPiece[],
  userId: string,
  targets: BuildPlacementTarget[]
): { ok: true } | { ok: false; reason: string } {
  const newSlots = countNewBuildSlots(pieces, targets);
  if (newSlots === 0) return { ok: true };

  if (pieces.length + newSlots > BUILD_MAX_PIECES_PER_ROOM) {
    return { ok: false, reason: "room-cap" };
  }

  const userCount = pieces.filter((piece) => piece.createdByUserId === userId).length;
  if (userCount + newSlots > BUILD_MAX_PIECES_PER_USER) {
    return { ok: false, reason: "user-cap" };
  }

  return { ok: true };
}

export function evaluateBuildPlacement(
  manifest: RoomManifest,
  target: BuildPlacementTarget,
  roomId: string,
  userId: string,
  piecesById: Record<string, BuildPiece> = {}
) {
  const piece = buildPlacementPreviewPiece(roomId, target, userId);
  const allPieces = Object.values(piecesById);
  const capCheck = checkBuildCapsForPlacements(allPieces, userId, [target]);
  if (!capCheck.ok) {
    return {
      piece,
      allowed: false,
      reason: capCheck.reason,
      message: buildPlacementStatusMessage(capCheck.reason)
    };
  }
  const zoneCheck = isBuildAllowedAt(manifest, piece);
  if (!zoneCheck.ok) {
    return {
      piece,
      allowed: false,
      reason: zoneCheck.reason,
      message: buildPlacementStatusMessage(zoneCheck.reason)
    };
  }
  if (cellLevelOccupiedBySameKind(piecesById, target, piece.id)) {
    return {
      piece,
      allowed: false,
      reason: "slot-occupied",
      message: buildPlacementStatusMessage("slot-occupied")
    };
  }
  return {
    piece,
    allowed: true,
    reason: undefined,
    message: undefined
  };
}

/** Highest walkable floor/ramp in a cell reachable from refY (for 2D / place-ahead). */
export function findSurfacePieceAtCell(
  pieces: BuildPiece[],
  cell: { ix: number; iz: number },
  refY: number
): BuildPiece | null {
  const surfaces = pieces.filter(
    (piece) =>
      (piece.kind === "floor" || piece.kind === "ramp") &&
      piece.cell.ix === cell.ix &&
      piece.cell.iz === cell.iz
  );
  if (surfaces.length === 0) return null;

  let best: BuildPiece | null = null;
  let bestTop = -Infinity;
  for (const piece of surfaces) {
    const top = surfaceHeightForPiece(piece);
    if (top <= refY + BUILD_STEP_UP_MAX + 0.01 && top >= bestTop) {
      bestTop = top;
      best = piece;
    }
  }
  if (best) return best;

  return surfaces.sort((a, b) => b.level - a.level)[0] ?? null;
}

/** Topmost build piece at a world hit (2D destroy picking). */
export function findBuildPieceForDestroy(pieces: BuildPiece[], hitX: number, hitZ: number): BuildPiece | null {
  const cell = worldToCell(hitX, hitZ);
  const edge = nearestWallEdge(hitX, hitZ, cell.ix, cell.iz);
  const walls = pieces.filter(
    (piece) =>
      piece.kind === "wall" &&
      piece.cell.ix === cell.ix &&
      piece.cell.iz === cell.iz &&
      piece.edge === edge
  );
  if (walls.length > 0) {
    return walls.sort((a, b) => b.level - a.level)[0] ?? null;
  }

  const surfaces = pieces.filter(
    (piece) =>
      (piece.kind === "floor" || piece.kind === "ramp") &&
      piece.cell.ix === cell.ix &&
      piece.cell.iz === cell.iz
  );
  if (surfaces.length > 0) {
    return surfaces.sort((a, b) => b.level - a.level)[0] ?? null;
  }

  return null;
}

export function resolveBuildTargetFromWorld(input: {
  tool: BuildPieceKind;
  hitX: number;
  hitY: number;
  hitZ: number;
  rotation: BuildPieceRotation;
  materialId: BuildPieceMaterial;
  pieces: BuildPiece[];
  rampRotationOverride?: boolean;
}): BuildPlacementTarget {
  const cell = worldToCell(input.hitX, input.hitZ);
  const surfacePiece = findSurfacePieceAtCell(input.pieces, cell, input.hitY);
  // 2D top-down passes the avatar's feet `y` as `hitY`, so it doubles as the standing level.
  return resolveBuildPlacementTarget({
    tool: input.tool,
    hitX: input.hitX,
    hitY: input.hitY,
    hitZ: input.hitZ,
    rotation: input.rotation,
    materialId: input.materialId,
    surfacePiece,
    baseLevel: avatarStandingLevel(input.hitY),
    ...(input.rampRotationOverride !== undefined
      ? { rampRotationOverride: input.rampRotationOverride }
      : {})
  });
}

/** Cell one step in front of the avatar (mobile / no-raycast placement). */
export function resolvePlaceAheadBuildTarget(input: {
  tool: BuildPieceKind;
  avatarPosition: { x: number; y: number; z: number };
  rotationY: number;
  rotation: BuildPieceRotation;
  materialId: BuildPieceMaterial;
  pieces?: BuildPiece[];
  rampRotationOverride?: boolean;
  distanceCells?: number;
}): BuildPlacementTarget {
  const distance = BUILD_CELL_SIZE * (input.distanceCells ?? 1);
  const hitX = input.avatarPosition.x + Math.sin(input.rotationY) * distance;
  const hitZ = input.avatarPosition.z + Math.cos(input.rotationY) * distance;
  const cell = worldToCell(hitX, hitZ);
  const surfacePiece = input.pieces
    ? findSurfacePieceAtCell(input.pieces, cell, input.avatarPosition.y)
    : null;
  return resolveBuildPlacementTarget({
    tool: input.tool,
    hitX,
    hitY: input.avatarPosition.y,
    hitZ,
    rotation: input.rotation,
    materialId: input.materialId,
    surfacePiece,
    baseLevel: avatarStandingLevel(input.avatarPosition.y),
    ...(input.rampRotationOverride !== undefined
      ? { rampRotationOverride: input.rampRotationOverride }
      : {})
  });
}

export function tryAcquireBuildPlacementSlot(lastAtMs: { current: number }): boolean {
  const now = Date.now();
  if (now - lastAtMs.current < BUILD_PLACEMENT_RATE_LIMIT_MS) return false;
  lastAtMs.current = now;
  return true;
}

export function placementTargetKey(target: Pick<BuildPlacementTarget, "kind" | "cell" | "level" | "edge">) {
  return buildPieceStableId({
    kind: target.kind,
    cell: target.cell,
    level: target.level,
    edge: target.edge
  });
}

export function surfaceHeightForPiece(piece: BuildPiece) {
  if (piece.kind === "floor") {
    return levelToY(piece.level) + BUILD_FLOOR_THICKNESS;
  }
  if (piece.kind === "ramp") {
    return levelToY(piece.level + 1);
  }
  return levelToY(piece.level);
}
