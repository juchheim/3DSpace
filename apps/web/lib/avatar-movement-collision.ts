import type { BuildPiece, RoomManifest } from "@3dspace/contracts";
import {
  AVATAR_STAND_HEIGHT,
  collectCollisionWalls,
  resolveWallCollisionsV2,
  type WallCollider
} from "@3dspace/room-engine";
import type { MutableRefObject } from "react";

/** Fingerprint manifest + build pieces so the collision wall cache invalidates on in-place edits. */
export function buildCollisionWallsCacheKey(manifest: RoomManifest, pieces: BuildPiece[]): string {
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
  return `${manifestPart}::${piecesPart}`;
}

export type CollisionWallsCache = {
  keyRef: MutableRefObject<string>;
  wallsRef: MutableRefObject<WallCollider[]>;
};

export function syncCollisionWallsCache(
  manifest: RoomManifest,
  pieces: BuildPiece[],
  cache: CollisionWallsCache
): WallCollider[] {
  const key = buildCollisionWallsCacheKey(manifest, pieces);
  if (key !== cache.keyRef.current) {
    cache.keyRef.current = key;
    cache.wallsRef.current = collectCollisionWalls(manifest, pieces);
  }
  return cache.wallsRef.current;
}

export function resolveAvatarXZWithWalls(input: {
  manifest: RoomManifest;
  pieces: BuildPiece[];
  cache: CollisionWallsCache;
  oldPos: { x: number; z: number };
  newPos: { x: number; z: number };
  avatarBaseY: number;
  standHeight?: number;
}): { x: number; z: number } {
  const walls = syncCollisionWallsCache(input.manifest, input.pieces, input.cache);
  return resolveWallCollisionsV2(
    input.oldPos,
    input.newPos,
    walls,
    input.avatarBaseY,
    input.standHeight ?? AVATAR_STAND_HEIGHT
  );
}
