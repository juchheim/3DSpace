import {
  BUILD_MAX_LEVEL,
  type BuildLogicPiece,
  type BuildPiece,
  type LogicState,
  type RoomManifest
} from "@3dspace/contracts";

import {
  buildCellFootprint,
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  cellToWorldCenter,
  wallColliderForEdge,
  worldToCell,
  type WallCollider
} from "./build.js";
import { buildGroundHeightContext, groundHeightAt, type GroundHeightContext } from "./ground-height.js";

function manifestFloorY(manifest: RoomManifest, z: number): number {
  if (!manifest.tiers?.length) return 0;
  const sorted = [...manifest.tiers].sort((a, b) => b.minZ - a.minZ);
  const tier = sorted.find((t) => z >= t.minZ);
  return tier?.floorY ?? 0;
}
import {
  cellFootprintCorners,
  footprintOverlapsAnyRect,
  footprintOverlapsExitWedge,
  footprintOverlapsSpawnKeepOut,
  freeForAllBuildMask,
  isFreeForAllManifest
} from "./free-for-all-build-mask.js";

export const LOGIC_ID_PREFIX = "logic:";
export const LOGIC_MAX_PIECES_PER_ROOM = 500;
export const LOGIC_MAX_PIECES_PER_USER = 200;

export const LOGIC_EDGE_KINDS = ["door", "button"] as const;

export function logicPieceRequiresEdge(kind: BuildLogicPiece["kind"]): boolean {
  return (LOGIC_EDGE_KINDS as readonly string[]).includes(kind);
}

export function logicRoleForKind(kind: BuildLogicPiece["kind"]): "emitter" | "consumer" {
  switch (kind) {
    case "button":
    case "pressurePlate":
    case "proximityZone":
    case "timer":
      return "emitter";
    case "door":
    case "light":
    case "teleporter":
      return "consumer";
  }
}

export function logicPieceStableId(
  piece: Pick<BuildLogicPiece, "kind" | "cell" | "level" | "edge">
): string {
  const edgePart = piece.edge ? `:${piece.edge}` : "";
  return `${LOGIC_ID_PREFIX}${piece.kind}:${piece.cell.ix},${piece.cell.iz}:${piece.level}${edgePart}`;
}

/**
 * Shared client/server placement predicate for logic pieces (bounds + spawn only).
 */
export function isLogicPlacementAllowed(
  manifest: RoomManifest,
  piece: Pick<BuildLogicPiece, "kind" | "cell" | "level" | "edge">
): { ok: true } | { ok: false; reason: string } {
  if (piece.level < 0 || piece.level > BUILD_MAX_LEVEL) {
    return { ok: false, reason: "level-cap" };
  }
  if (logicPieceRequiresEdge(piece.kind) && !piece.edge) {
    return { ok: false, reason: "invalid-piece" };
  }
  if (!logicPieceRequiresEdge(piece.kind) && piece.edge !== undefined) {
    return { ok: false, reason: "invalid-piece" };
  }

  const cellFootprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const cellCorners = cellFootprintCorners(cellFootprint);

  if (footprintOverlapsSpawnKeepOut(manifest, cellCorners)) {
    return { ok: false, reason: "spawn-keep-out" };
  }

  const { minX, maxX, minZ, maxZ } = manifest.bounds;
  for (const { x, z } of cellCorners) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) {
      return { ok: false, reason: "out-of-bounds" };
    }
  }

  if (isFreeForAllManifest(manifest)) {
    const mask = freeForAllBuildMask(manifest);
    if (mask) {
      if (footprintOverlapsAnyRect(cellFootprint, mask.halls)) {
        return { ok: false, reason: "hall-keep-out" };
      }
      if (footprintOverlapsExitWedge(cellCorners)) {
        return { ok: false, reason: "exit-keep-out" };
      }
    }
  }

  return { ok: true };
}

export type LogicAvatarCell = { ix: number; iz: number; level: number };

/** Grid cell + standing level for an avatar world position. */
export function avatarCellFromPosition(x: number, y: number, z: number): LogicAvatarCell {
  const { ix, iz } = worldToCell(x, z);
  const level = Math.min(Math.max(0, Math.round(y / BUILD_LEVEL_HEIGHT)), BUILD_MAX_LEVEL);
  return { ix, iz, level };
}

/** Expanded axis-aligned footprint for a proximity zone (one cell padding). */
export function footprintForZone(piece: BuildLogicPiece) {
  const base = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  return {
    minX: base.minX - BUILD_CELL_SIZE,
    maxX: base.maxX + BUILD_CELL_SIZE,
    minZ: base.minZ - BUILD_CELL_SIZE,
    maxZ: base.maxZ + BUILD_CELL_SIZE
  };
}

export function logicPieceOccupiesCell(
  piece: BuildLogicPiece,
  ix: number,
  iz: number,
  level: number
): boolean {
  if (piece.kind === "proximityZone") return false;
  return piece.cell.ix === ix && piece.cell.iz === iz && piece.level === level;
}

export function pointInLogicFootprint(
  piece: BuildLogicPiece,
  x: number,
  z: number,
  level?: number
): boolean {
  if (level !== undefined && piece.level !== level) return false;
  if (piece.kind === "proximityZone") {
    const fp = footprintForZone(piece);
    return x >= fp.minX && x <= fp.maxX && z >= fp.minZ && z <= fp.maxZ;
  }
  const cell = worldToCell(x, z);
  return logicPieceOccupiesCell(piece, cell.ix, cell.iz, piece.level);
}

const STEP_ON_KINDS = new Set<BuildLogicPiece["kind"]>(["pressurePlate", "teleporter"]);

export function isStepOnLogicKind(kind: BuildLogicPiece["kind"]): boolean {
  return STEP_ON_KINDS.has(kind);
}

export function isInteractLogicKind(kind: BuildLogicPiece["kind"]): boolean {
  return kind === "button";
}

export function findStepOnLogicPieces(pieces: BuildLogicPiece[], cell: LogicAvatarCell) {
  return pieces.filter(
    (piece) =>
      isStepOnLogicKind(piece.kind) &&
      logicPieceOccupiesCell(piece, cell.ix, cell.iz, cell.level)
  );
}

export function findProximityZonesContaining(
  pieces: BuildLogicPiece[],
  x: number,
  z: number,
  level: number
) {
  return pieces.filter(
    (piece) => piece.kind === "proximityZone" && pointInLogicFootprint(piece, x, z, level)
  );
}

/** Nearest interactable emitter within maxDistance (world units). */
export function findNearestInteractableLogicPiece(
  pieces: BuildLogicPiece[],
  position: { x: number; y: number; z: number },
  maxDistance = 2.5
) {
  let best: BuildLogicPiece | null = null;
  let bestDist = maxDistance;
  for (const piece of pieces) {
    if (!isInteractLogicKind(piece.kind)) continue;
    const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
    const cx = (footprint.minX + footprint.maxX) / 2;
    const cz = (footprint.minZ + footprint.maxZ) / 2;
    const cy = piece.level * BUILD_LEVEL_HEIGHT + 1;
    const dist = Math.hypot(position.x - cx, position.y - cy, position.z - cz);
    if (dist < bestDist) {
      bestDist = dist;
      best = piece;
    }
  }
  return best;
}

export function isDoorOpen(nodes: LogicState["nodes"], doorId: string): boolean {
  return nodes[doorId]?.open === true;
}

/** Impassable wall segment for a closed logic door; null when open or not a door. */
export function doorCollider(
  piece: BuildLogicPiece,
  nodes: LogicState["nodes"]
): WallCollider | null {
  if (piece.kind !== "door" || !piece.edge || isDoorOpen(nodes, piece.id)) return null;
  return wallColliderForEdge({
    id: piece.id,
    label: "logic-door",
    ix: piece.cell.ix,
    iz: piece.cell.iz,
    edge: piece.edge,
    level: piece.level
  });
}

export function collectLogicDoorColliders(
  logicPieces: BuildLogicPiece[],
  nodes: LogicState["nodes"]
): WallCollider[] {
  const walls: WallCollider[] = [];
  for (const piece of logicPieces) {
    const collider = doorCollider(piece, nodes);
    if (collider) walls.push(collider);
  }
  return walls;
}

export function isTeleporterArmed(nodes: LogicState["nodes"], pieceId: string): boolean {
  return nodes[pieceId]?.armed !== false;
}

export function isLogicLightOn(nodes: LogicState["nodes"], pieceId: string): boolean {
  return nodes[pieceId]?.on === true;
}

/** World XZ center of a teleporter / plate pad. */
export function logicPadCenter(piece: BuildLogicPiece) {
  const center = cellToWorldCenter(piece.cell.ix, piece.cell.iz);
  return { x: center.x, z: center.z, level: piece.level };
}

/** Resolve the paired teleporter pad by shared `linkId` (excludes the source pad). */
export function teleportTarget(
  source: BuildLogicPiece,
  pieces: BuildLogicPiece[]
): BuildLogicPiece | null {
  if (source.kind !== "teleporter" || !source.linkId) return null;
  const matches = pieces.filter(
    (piece) => piece.kind === "teleporter" && piece.linkId === source.linkId && piece.id !== source.id
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  matches.sort((a, b) => a.id.localeCompare(b.id));
  return matches[0]!;
}

export function teleportLandingPosition(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  target: BuildLogicPiece,
  groundCtx?: GroundHeightContext
): { x: number; y: number; z: number } {
  const ctx =
    groundCtx ?? buildGroundHeightContext(manifest, buildPieces, (z) => manifestFloorY(manifest, z));
  const { x, z } = logicPadCenter(target);
  const y = groundHeightAt(x, z, ctx, 0, "teleport");
  return { x, y, z };
}

/** Channels referenced by a piece (its emit channel + every channel it listens on). */
export function logicChannelsForPiece(piece: BuildLogicPiece): string[] {
  const ids = new Set<string>();
  if (piece.channelId) ids.add(piece.channelId);
  for (const id of piece.config?.requireAll ?? []) ids.add(id);
  if (piece.config?.triggerChannelId) ids.add(piece.config.triggerChannelId);
  return [...ids];
}

/** Unique, sorted list of channel ids referenced by any piece (for pickers). */
export function logicChannelsFromPieces(pieces: BuildLogicPiece[]): string[] {
  const ids = new Set<string>();
  for (const piece of pieces) {
    for (const id of logicChannelsForPiece(piece)) ids.add(id);
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

const LOGIC_CHANNEL_PALETTE = [
  "#ff6b6b",
  "#ffa94d",
  "#ffd43b",
  "#69db7c",
  "#38d9a9",
  "#4dabf7",
  "#748ffc",
  "#b197fc",
  "#f783ac",
  "#e599f7"
] as const;

/** Deterministic, stable color for a channel id so linked nodes share a tint. */
export function logicChannelColor(channelId: string): string {
  let hash = 0;
  for (let i = 0; i < channelId.length; i += 1) {
    hash = (hash * 31 + channelId.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % LOGIC_CHANNEL_PALETTE.length;
  return LOGIC_CHANNEL_PALETTE[index]!;
}

/** Primary channel a piece should be tinted by (emit channel, else first listen channel). */
export function primaryChannelForPiece(piece: BuildLogicPiece): string | null {
  if (piece.channelId) return piece.channelId;
  const requireAll = piece.config?.requireAll ?? [];
  if (requireAll.length > 0) return requireAll[0]!;
  if (piece.config?.triggerChannelId) return piece.config.triggerChannelId;
  return null;
}
