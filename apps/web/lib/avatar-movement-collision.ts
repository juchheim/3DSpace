import type { BuildLogicPiece, BuildPiece, LogicState, RoomManifest } from "@3dspace/contracts";
import {
  AVATAR_STAND_HEIGHT,
  collectCollisionWalls,
  collectLogicDoorColliders,
  resolveWallCollisionsV2,
  type WallCollider
} from "@3dspace/room-engine";
import type { MutableRefObject } from "react";

/** Fingerprint manifest + build pieces so the collision wall cache invalidates on in-place edits. */
export function buildCollisionWallsCacheKey(
  manifest: RoomManifest,
  pieces: BuildPiece[],
  logicPieces: BuildLogicPiece[] = [],
  logicNodes: LogicState["nodes"] = {}
): string {
  const manifestPart = manifest.walls
    .map(
      (wall) =>
        `${wall.id}|${wall.start.x},${wall.start.y},${wall.start.z}|${wall.end.x},${wall.end.y},${wall.end.z}|${wall.height ?? ""}|${wall.thickness ?? ""}|${wall.passable ?? ""}`
    )
    .join(";");
  const piecesPart = pieces
    .map(
      (piece) =>
        `${piece.id}|${piece.kind}|${piece.cell.ix},${piece.cell.iz}|${piece.level}|${piece.edge ?? ""}|${piece.rotation}|${piece.materialId}`
    )
    .join(";");
  const logicPart = logicPieces
    .filter((piece) => piece.kind === "door")
    .map(
      (piece) =>
        `${piece.id}|${piece.cell.ix},${piece.cell.iz}|${piece.level}|${piece.edge ?? ""}|${logicNodes[piece.id]?.open === true ? 1 : 0}`
    )
    .join(";");
  return `${manifestPart}::${piecesPart}::${logicPart}`;
}

export type CollisionWallsCache = {
  keyRef: MutableRefObject<string>;
  wallsRef: MutableRefObject<WallCollider[]>;
};

export function syncCollisionWallsCache(
  manifest: RoomManifest,
  pieces: BuildPiece[],
  cache: CollisionWallsCache,
  logicPieces: BuildLogicPiece[] = [],
  logicNodes: LogicState["nodes"] = {}
): WallCollider[] {
  const key = buildCollisionWallsCacheKey(manifest, pieces, logicPieces, logicNodes);
  if (key !== cache.keyRef.current) {
    cache.keyRef.current = key;
    cache.wallsRef.current = [
      ...collectCollisionWalls(manifest, pieces),
      ...collectLogicDoorColliders(logicPieces, logicNodes)
    ];
  }
  return cache.wallsRef.current;
}

export function resolveAvatarXZWithWalls(input: {
  manifest: RoomManifest;
  pieces: BuildPiece[];
  cache: CollisionWallsCache;
  logicPieces?: BuildLogicPiece[];
  logicNodes?: LogicState["nodes"];
  oldPos: { x: number; z: number };
  newPos: { x: number; z: number };
  avatarBaseY: number;
  standHeight?: number;
}): { x: number; z: number } {
  const walls = syncCollisionWallsCache(
    input.manifest,
    input.pieces,
    input.cache,
    input.logicPieces ?? [],
    input.logicNodes ?? {}
  );
  return resolveWallCollisionsV2(
    input.oldPos,
    input.newPos,
    walls,
    input.avatarBaseY,
    input.standHeight ?? AVATAR_STAND_HEIGHT
  );
}
