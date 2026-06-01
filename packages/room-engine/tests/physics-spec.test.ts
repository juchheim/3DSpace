import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema, BuildPieceSchema } from "@3dspace/contracts";

import {
  buildPhysicsWorldSpec,
  BUILD_FLOOR_THICKNESS,
  createDefaultRoomManifest,
  physicsWorldSpecCacheKey
} from "../src/index.js";

const createdAt = "2026-06-01T12:00:00.000Z";

function manifestWithoutWalls() {
  return {
    ...createDefaultRoomManifest({ roomId: "room-physics-spec" }),
    walls: [],
    wallAnchors: [],
    tiers: []
  };
}

function wallPiece() {
  return BuildPieceSchema.parse({
    id: "build:wall:1,2:0:e",
    roomId: "room-physics-spec",
    kind: "wall",
    cell: { ix: 1, iz: 2 },
    level: 0,
    edge: "e",
    rotation: 0,
    materialId: "stone",
    createdByUserId: "u1",
    createdAt
  });
}

function floorPiece() {
  return BuildPieceSchema.parse({
    id: "build:floor:3,4:1",
    roomId: "room-physics-spec",
    kind: "floor",
    cell: { ix: 3, iz: 4 },
    level: 1,
    rotation: 0,
    materialId: "wood",
    createdByUserId: "u1",
    createdAt
  });
}

function rampPiece(rotation: 0 | 90 | 180 | 270 = 0) {
  return BuildPieceSchema.parse({
    id: `build:ramp:5,6:0:${rotation}`,
    roomId: "room-physics-spec",
    kind: "ramp",
    cell: { ix: 5, iz: 6 },
    level: 0,
    rotation,
    materialId: "metal",
    createdByUserId: "u1",
    createdAt
  });
}

function doorPiece() {
  return BuildLogicPieceSchema.parse({
    id: "logic:door:2,2:0:e",
    roomId: "room-physics-spec",
    kind: "door",
    cell: { ix: 2, iz: 2 },
    level: 0,
    edge: "e",
    rotation: 0,
    config: { initialState: { open: false } },
    createdByUserId: "u1",
    createdAt
  });
}

describe("buildPhysicsWorldSpec", () => {
  it("emits only the ground spec for an otherwise empty manifest", () => {
    const manifest = manifestWithoutWalls();
    const spec = buildPhysicsWorldSpec(manifest, []);

    expect(spec).toEqual([
      {
        kind: "ground",
        id: "ground:0",
        minX: manifest.bounds.minX,
        maxX: manifest.bounds.maxX,
        minZ: manifest.bounds.minZ,
        maxZ: manifest.bounds.maxZ,
        y: 0
      }
    ]);
  });

  it("maps a wall piece to a cuboid collider spec", () => {
    const piece = wallPiece();
    const spec = buildPhysicsWorldSpec(manifestWithoutWalls(), [piece]);
    const wall = spec.find((entry) => entry.kind === "cuboid" && entry.id === piece.id);

    expect(wall).toMatchObject({
      kind: "cuboid",
      id: piece.id,
      source: "wall",
      center: { x: 4, y: 1, z: 5 },
      half: { x: 1, y: 1, z: 0.1 },
      rotationY: Math.PI / 2
    });
  });

  it("maps a floor piece to a top-aligned cuboid collider spec", () => {
    const piece = floorPiece();
    const spec = buildPhysicsWorldSpec(manifestWithoutWalls(), [piece]);
    const floor = spec.find((entry) => entry.kind === "cuboid" && entry.id === piece.id);

    expect(floor).toMatchObject({
      kind: "cuboid",
      id: piece.id,
      source: "floor",
      center: { x: 7, y: 2 + BUILD_FLOOR_THICKNESS / 2, z: 9 },
      half: { x: 1, y: BUILD_FLOOR_THICKNESS / 2, z: 1 }
    });
  });

  it("maps a ramp piece to a ramp collider spec with the correct climb axis/sign", () => {
    const piece = rampPiece(270);
    const spec = buildPhysicsWorldSpec(manifestWithoutWalls(), [piece]);
    const ramp = spec.find((entry) => entry.kind === "ramp" && entry.id === piece.id);

    expect(ramp).toMatchObject({
      kind: "ramp",
      id: piece.id,
      minX: 10,
      maxX: 12,
      minZ: 12,
      maxZ: 14,
      lowY: 0,
      highY: 2,
      climbAxis: "x",
      climbSign: -1,
      rotation: 270
    });
  });

  it("adds a door cuboid only when the logic door is closed", () => {
    const piece = doorPiece();
    const closed = buildPhysicsWorldSpec(manifestWithoutWalls(), [], {
      pieces: [piece],
      nodes: { [piece.id]: { open: false } }
    });
    const open = buildPhysicsWorldSpec(manifestWithoutWalls(), [], {
      pieces: [piece],
      nodes: { [piece.id]: { open: true } }
    });

    expect(closed.find((entry) => entry.kind === "cuboid" && entry.id === piece.id)).toMatchObject({
      kind: "cuboid",
      id: piece.id,
      source: "door"
    });
    expect(open.find((entry) => entry.kind === "cuboid" && entry.id === piece.id)).toBeUndefined();
  });

  it("creates tier-aware ground slices from manifest tiers", () => {
    const manifest = {
      ...manifestWithoutWalls(),
      bounds: { minX: 0, maxX: 30, minZ: 0, maxZ: 30 },
      tiers: [
        { minZ: 0, maxZ: 10, floorY: 0 },
        { minZ: 10, maxZ: 20, floorY: 2 },
        { minZ: 20, maxZ: 30, floorY: 4 }
      ]
    };

    const grounds = buildPhysicsWorldSpec(manifest, []).filter((entry) => entry.kind === "ground");
    expect(grounds).toEqual([
      { kind: "ground", id: "ground:0", minX: 0, maxX: 30, minZ: 0, maxZ: 10, y: 0 },
      { kind: "ground", id: "ground:1", minX: 0, maxX: 30, minZ: 10, maxZ: 20, y: 2 },
      { kind: "ground", id: "ground:2", minX: 0, maxX: 30, minZ: 20, maxZ: 30, y: 4 }
    ]);
  });
});

describe("physicsWorldSpecCacheKey", () => {
  it("changes when geometry changes and when a door toggles", () => {
    const manifest = manifestWithoutWalls();
    const piece = wallPiece();
    const door = doorPiece();

    const base = physicsWorldSpecCacheKey(manifest, [piece], {
      pieces: [door],
      nodes: { [door.id]: { open: false } }
    });
    const same = physicsWorldSpecCacheKey({ ...manifest }, [{ ...piece }], {
      pieces: [{ ...door }],
      nodes: { [door.id]: { open: false } }
    });
    const moved = physicsWorldSpecCacheKey(manifest, [{ ...piece, level: 1 }], {
      pieces: [door],
      nodes: { [door.id]: { open: false } }
    });
    const opened = physicsWorldSpecCacheKey(manifest, [piece], {
      pieces: [door],
      nodes: { [door.id]: { open: true } }
    });

    expect(same).toBe(base);
    expect(moved).not.toBe(base);
    expect(opened).not.toBe(base);
  });
});
