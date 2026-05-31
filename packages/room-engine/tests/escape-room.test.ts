import { describe, expect, it } from "vitest";
import { BuildPieceSchema, RoomManifestSchema } from "@3dspace/contracts";
import {
  BUILD_ID_PREFIX,
  BUILD_MAX_LEVEL,
  createDefaultRoomManifest,
  createEscapeRoomManifest,
  createFreeForAllManifest,
  ESCAPE_ROOM_HALF_EXTENT,
  ESCAPE_ROOM_MANIFEST_FEATURE,
  floorYFromZ,
  isBuildAllowedAt,
  isEscapeRoomManifest,
  worldToCell
} from "../src/index.js";
import { isFreeForAllManifest } from "../src/build.js";

describe("createEscapeRoomManifest", () => {
  const manifest = createEscapeRoomManifest({ roomId: "room-escape-1" });

  it("parses as a valid RoomManifest with an empty canvas", () => {
    expect(() => RoomManifestSchema.parse(manifest)).not.toThrow();
    expect(manifest.walls).toEqual([]);
    expect(manifest.wallAnchors).toEqual([]);
    expect(manifest.tiers).toEqual([]);
  });

  it("uses 80×80 m bounds centered on the origin", () => {
    expect(manifest.dimensions).toEqual({ width: 80, depth: 80, height: 8 });
    expect(manifest.bounds).toEqual({
      minX: -ESCAPE_ROOM_HALF_EXTENT,
      maxX: ESCAPE_ROOM_HALF_EXTENT,
      minZ: -ESCAPE_ROOM_HALF_EXTENT,
      maxZ: ESCAPE_ROOM_HALF_EXTENT
    });
  });

  it("marks the manifest with the escape-room canvas feature", () => {
    expect(manifest.features).toContainEqual({
      key: ESCAPE_ROOM_MANIFEST_FEATURE,
      enabled: true,
      config: {}
    });
    expect(isEscapeRoomManifest(manifest)).toBe(true);
  });

  it("includes author and player spawn points", () => {
    expect(manifest.spawnPoints.map((s) => s.id)).toEqual([
      "spawn-author",
      "spawn-player-1",
      "spawn-player-2",
      "spawn-player-3"
    ]);
    expect(manifest.spawnPoints[0]!.position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("isEscapeRoomManifest", () => {
  it("is false for classroom and free-for-all manifests", () => {
    expect(isEscapeRoomManifest(createDefaultRoomManifest({ roomId: "room-class" }))).toBe(false);
    expect(isEscapeRoomManifest(createFreeForAllManifest({ roomId: "room-ffa" }))).toBe(false);
    expect(isFreeForAllManifest(createFreeForAllManifest({ roomId: "room-ffa" }))).toBe(true);
  });
});

describe("escape room build mask", () => {
  const escapeManifest = createEscapeRoomManifest({ roomId: "room-escape-build" });
  const ffaManifest = createFreeForAllManifest({ roomId: "room-ffa-build" });

  const hallCellPiece = BuildPieceSchema.parse({
    id: `${BUILD_ID_PREFIX}floor:12,0:0`,
    roomId: "room-escape-build",
    kind: "floor",
    cell: { ix: 12, iz: 0 },
    level: 0,
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt: "2026-05-30T12:00:00.000Z"
  });

  it("accepts placements in FFA hall corridors on the escape canvas", () => {
    expect(isBuildAllowedAt(ffaManifest, hallCellPiece)).toEqual({ ok: false, reason: "hall-keep-out" });
    expect(isBuildAllowedAt(escapeManifest, hallCellPiece)).toEqual({ ok: true });
  });

  it("rejects out-of-bounds and spawn keep-out", () => {
    const outOfBounds = BuildPieceSchema.parse({
      ...hallCellPiece,
      id: `${BUILD_ID_PREFIX}floor:999,999:0`,
      cell: { ix: 999, iz: 999 }
    });
    expect(isBuildAllowedAt(escapeManifest, outOfBounds)).toEqual({ ok: false, reason: "out-of-bounds" });

    const overLevel = {
      ...hallCellPiece,
      id: `${BUILD_ID_PREFIX}ramp:0,0:${BUILD_MAX_LEVEL}`,
      kind: "ramp" as const,
      level: BUILD_MAX_LEVEL
    };
    expect(isBuildAllowedAt(escapeManifest, overLevel)).toEqual({ ok: false, reason: "level-cap" });

    const spawnCell = worldToCell(
      escapeManifest.spawnPoints[0]!.position.x,
      escapeManifest.spawnPoints[0]!.position.z
    );
    const onSpawn = BuildPieceSchema.parse({
      ...hallCellPiece,
      id: `${BUILD_ID_PREFIX}floor:${spawnCell.ix},${spawnCell.iz}:0`,
      cell: spawnCell
    });
    expect(isBuildAllowedAt(escapeManifest, onSpawn)).toEqual({ ok: false, reason: "spawn-keep-out" });
  });

  it("keeps floor elevation at y=0 for all z", () => {
    for (const z of [-40, -20, 0, 20, 40]) {
      expect(floorYFromZ(escapeManifest, z)).toBe(0);
    }
  });
});
