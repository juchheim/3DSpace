import { describe, expect, it } from "vitest";
import { BuildPieceSchema } from "@3dspace/contracts";
import { BUILD_ID_PREFIX, createFreeForAllManifest } from "@3dspace/room-engine";
import {
  buildCollisionWallsCacheKey,
  resolveAvatarXZWithWalls,
  type CollisionWallsCache
} from "../lib/avatar-movement-collision.js";

function emptyCache(): CollisionWallsCache {
  return { keyRef: { current: "" }, wallsRef: { current: [] } };
}

describe("buildCollisionWallsCacheKey", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-cache-key" });

  it("changes when a build piece level changes at the same id", () => {
    const base = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:1,1:0:e`,
      roomId: manifest.roomId,
      kind: "wall",
      cell: { ix: 1, iz: 1 },
      level: 0,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const elevated = { ...base, level: 2 as const };
    expect(buildCollisionWallsCacheKey(manifest, [base])).not.toBe(
      buildCollisionWallsCacheKey(manifest, [elevated])
    );
  });

  it("changes when manifest wall geometry changes at the same count", () => {
    const wall = manifest.walls[0]!;
    const mutated = {
      ...manifest,
      walls: [{ ...wall, end: { ...wall.end, x: wall.end.x + 0.01 } }, ...manifest.walls.slice(1)]
    };
    expect(buildCollisionWallsCacheKey(manifest, [])).not.toBe(buildCollisionWallsCacheKey(mutated, []));
  });
});

describe("resolveAvatarXZWithWalls", () => {
  const manifest = createFreeForAllManifest({ roomId: "room-move-resolve" });

  it("blocks click-to-move through a ground-level build wall", () => {
    const piece = BuildPieceSchema.parse({
      id: `${BUILD_ID_PREFIX}wall:5,0:0:e`,
      roomId: manifest.roomId,
      kind: "wall",
      cell: { ix: 5, iz: 0 },
      level: 0,
      edge: "e",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });
    const cache = emptyCache();
    const start = { x: 13, z: 1 };
    const target = { x: 10, z: 1 };

    const resolved = resolveAvatarXZWithWalls({
      manifest,
      pieces: [piece],
      cache,
      oldPos: start,
      newPos: target,
      avatarBaseY: 0
    });

    expect(resolved.x).toBeGreaterThan(target.x);
    expect(resolved.z).toBeCloseTo(target.z, 3);
  });
});
