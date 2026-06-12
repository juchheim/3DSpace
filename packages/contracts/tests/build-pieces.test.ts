import { describe, expect, it } from "vitest";
import {
  BUILD_MAX_LEVEL as CONTRACTS_BUILD_MAX_LEVEL,
  BUILD_ROOM_EVENT_TYPES,
  BuildRoomEventTypeSchema,
  BuildPieceSchema,
  CreateBuildPieceRequestSchema,
  parseRoomSettings,
  RoomBuildRealtimeMessageSchema,
  RoomSettingsSchema,
  getRoomTypeFeatureFlags
} from "../src/index";
import {
  BUILD_CELL_SIZE,
  BUILD_MAX_LEVEL as ENGINE_BUILD_MAX_LEVEL,
  cellToWorldCenter,
  worldToCell
} from "@3dspace/room-engine";

describe("build piece contracts", () => {
  it("documents build room-event type strings", () => {
    expect(BuildRoomEventTypeSchema.parse(BUILD_ROOM_EVENT_TYPES.piecePlaced)).toBe("build.piece.placed.v1");
    expect(BuildRoomEventTypeSchema.parse(BUILD_ROOM_EVENT_TYPES.piecesCleared)).toBe("build.pieces.cleared.v1");
  });

  it("extends room settings with building defaults", () => {
    const settings = RoomSettingsSchema.parse({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });
    expect(settings.buildingEnabled).toBe(true);
    expect(settings.buildDestroyPolicy).toBe("anyone");
  });

  it("parseRoomSettings applies building defaults for legacy rooms", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true,
      enableWallObjects: true,
      wallObjectCreation: "teacher-only",
      wallObjectModeration: "pre",
      allowLiveStudentShares: false,
      allowStudentUploads: false,
      allowWebLinks: true,
      allowEmbeds: false,
      maxActiveWallObjects: 20,
      maxActiveLiveShares: 4,
      hallpass: { enabled: true, maxConcurrent: 1, perPeriodLimit: 2 },
      pods: { enabled: true, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false }
    });
    expect(settings.buildingEnabled).toBe(true);
    expect(settings.buildDestroyPolicy).toBe("anyone");
  });

  it("gates building to free-for-all room type", () => {
    expect(getRoomTypeFeatureFlags("free-for-all").building).toBe(true);
    expect(getRoomTypeFeatureFlags("classroom").building).toBe(false);
    expect(getRoomTypeFeatureFlags("workforce-training").building).toBe(false);
  });

  it("requires edge for walls and forbids edge on floors", () => {
    expect(() =>
      BuildPieceSchema.parse({
        id: "build:wall:0,0:0:n",
        roomId: "room-1",
        kind: "wall",
        cell: { ix: 0, iz: 0 },
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "u1",
        createdAt: new Date().toISOString()
      })
    ).toThrow();

    const wall = BuildPieceSchema.parse({
      id: "build:wall:0,0:0:n",
      roomId: "room-1",
      kind: "wall",
      cell: { ix: 0, iz: 0 },
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    });
    expect(wall.edge).toBe("n");

    const simpleWall = BuildPieceSchema.parse({
      id: "build:simple-wall:0,0:0:n",
      roomId: "room-1",
      kind: "simple-wall",
      cell: { ix: 0, iz: 0 },
      level: 0,
      edge: "n",
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    });
    expect(simpleWall.kind).toBe("simple-wall");

    expect(() =>
      BuildPieceSchema.parse({
        id: "build:floor:0,0:0",
        roomId: "room-1",
        kind: "floor",
        cell: { ix: 0, iz: 0 },
        level: 0,
        edge: "n",
        rotation: 0,
        materialId: "stone",
        createdByUserId: "u1",
        createdAt: new Date().toISOString()
      })
    ).toThrow();
  });

  it("allows textureStorageKey only on image floors", () => {
    const base = {
      roomId: "room-1",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    };

    const imageFloor = BuildPieceSchema.parse({
      ...base,
      id: "build:image-floor:0,0:0",
      kind: "image-floor",
      textureStorageKey: "rooms/room-1/floor-textures/abc.webp"
    });
    expect(imageFloor.textureStorageKey).toBe("rooms/room-1/floor-textures/abc.webp");

    // An image floor without a texture is valid (renders as a blank slab).
    expect(
      BuildPieceSchema.parse({ ...base, id: "build:image-floor:1,0:0", kind: "image-floor", cell: { ix: 1, iz: 0 } })
        .textureStorageKey
    ).toBeUndefined();

    // A plain floor must not carry a texture.
    expect(() =>
      BuildPieceSchema.parse({
        ...base,
        id: "build:floor:0,0:0",
        kind: "floor",
        textureStorageKey: "rooms/room-1/floor-textures/abc.webp"
      })
    ).toThrow();

    expect(() =>
      CreateBuildPieceRequestSchema.parse({
        kind: "wall",
        cell: { ix: 0, iz: 0 },
        level: 0,
        edge: "n",
        textureStorageKey: "rooms/room-1/floor-textures/abc.webp"
      })
    ).toThrow();

    const request = CreateBuildPieceRequestSchema.parse({
      kind: "image-floor",
      cell: { ix: 0, iz: 0 },
      level: 0,
      textureStorageKey: "rooms/room-1/floor-textures/abc.webp"
    });
    expect(request.textureStorageKey).toBe("rooms/room-1/floor-textures/abc.webp");
  });

  it("allows textureSpanCells only on image floors", () => {
    const base = {
      roomId: "room-1",
      cell: { ix: 0, iz: 0 },
      level: 0,
      rotation: 0,
      materialId: "stone",
      createdByUserId: "u1",
      createdAt: new Date().toISOString()
    };

    const imageFloor = BuildPieceSchema.parse({
      ...base,
      id: "build:image-floor:0,0:0",
      kind: "image-floor",
      textureSpanCells: 8
    });
    expect(imageFloor.textureSpanCells).toBe(8);

    expect(() =>
      BuildPieceSchema.parse({
        ...base,
        id: "build:floor:0,0:0",
        kind: "floor",
        textureSpanCells: 4
      })
    ).toThrow();

    expect(() =>
      CreateBuildPieceRequestSchema.parse({
        kind: "wall",
        cell: { ix: 0, iz: 0 },
        level: 0,
        edge: "n",
        textureSpanCells: 4
      })
    ).toThrow();

    expect(() =>
      CreateBuildPieceRequestSchema.parse({
        kind: "image-floor",
        cell: { ix: 0, iz: 0 },
        level: 0,
        textureSpanCells: 3
      })
    ).toThrow();
  });

  it("round-trips create request and realtime upsert", () => {
    const request = CreateBuildPieceRequestSchema.parse({
      kind: "ramp",
      cell: { ix: 2, iz: -1 },
      level: 1,
      rotation: 90,
      materialId: "wood"
    });
    expect(request.kind).toBe("ramp");

    const piece = BuildPieceSchema.parse({
      id: "build:ramp:2,-1:1",
      roomId: "room-ffa",
      ...request,
      rotation: request.rotation ?? 0,
      materialId: request.materialId ?? "stone",
      createdByUserId: "u1",
      createdAt: "2026-05-30T12:00:00.000Z"
    });

    const upsert = RoomBuildRealtimeMessageSchema.parse({
      type: "room.build.upsert.v1",
      roomId: "room-ffa",
      piece,
      sentAt: 1,
      senderId: "u1"
    });
    expect(upsert.type).toBe("room.build.upsert.v1");
    expect(upsert.piece.kind).toBe("ramp");
  });

  it("re-exports BUILD_MAX_LEVEL from contracts in room-engine", () => {
    expect(CONTRACTS_BUILD_MAX_LEVEL).toBe(4);
    expect(ENGINE_BUILD_MAX_LEVEL).toBe(CONTRACTS_BUILD_MAX_LEVEL);
  });
});

describe("build grid mapping (room-engine)", () => {
  it("worldToCell inverts cellToWorldCenter for cell centers", () => {
    for (const ix of [-2, 0, 5]) {
      for (const iz of [-3, 1, 8]) {
        const center = cellToWorldCenter(ix, iz);
        const cell = worldToCell(center.x, center.z);
        expect(cell).toEqual({ ix, iz });
      }
    }
  });

  it("maps arbitrary world coordinates to the containing cell", () => {
    const x = 3.1;
    const z = -2.4;
    expect(worldToCell(x, z)).toEqual({
      ix: Math.floor(x / BUILD_CELL_SIZE),
      iz: Math.floor(z / BUILD_CELL_SIZE)
    });
  });
});
