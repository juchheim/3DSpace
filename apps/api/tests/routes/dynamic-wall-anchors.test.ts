import type { CreateDynamicWallAnchorRequest } from "@3dspace/contracts";
import { buildPieceColliders, boardPlacementWalls } from "@3dspace/room-engine";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { addStudentMember, authHeaders, buildTestApp, createClassAndRoom } from "../helpers/app";
import { buildPiecesConfig, enableBuildingForRoom } from "../helpers/build-pieces";

describe("dynamic wall anchor routes", () => {
  async function createFfaRoom(app: Awaited<ReturnType<typeof buildApp>>, teacherId = "teacher-ffa-boards") {
    return createClassAndRoom(app, teacherId, "free-for-all");
  }

  function anchorBodyForBuildWall(
    wall: ReturnType<typeof buildPieceColliders>["walls"][number],
    overrides: Partial<CreateDynamicWallAnchorRequest> = {}
  ): CreateDynamicWallAnchorRequest {
    const baseY = Math.min(wall.start.y, wall.end.y);
    return {
      wallId: wall.id,
      center: {
        x: (wall.start.x + wall.end.x) / 2,
        y: baseY + wall.height / 2,
        z: (wall.start.z + wall.end.z) / 2
      },
      normal: { x: 0, y: 0, z: -1 },
      width: 1.5,
      height: 1.5,
      title: "Build wall board",
      accepts: ["image", "video"],
      ...overrides
    };
  }

  async function createBuildWall(
    app: Awaited<ReturnType<typeof buildApp>>,
    roomId: string,
    userId: string,
    cell = { ix: 15, iz: 15 }
  ) {
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders(userId, "Alex"),
      payload: { kind: "wall", cell, level: 0, edge: "n", materialId: "wood" }
    });
    expect(response.statusCode).toBe(200);
    return response.json().piece;
  }

  function safeBuildCell(index: number) {
    return { ix: -20 + (index % 25), iz: -20 + Math.floor(index / 25) };
  }

  it("accepts board placement on a built wall", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const piece = await createBuildWall(app, roomId, "builder-a");
    const wall = buildPieceColliders(piece).walls[0]!;

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: anchorBodyForBuildWall(wall)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().anchor.wallId).toBe(wall.id);
    expect(response.json().realtimeMessages[0].type).toBe("room.board.created.v1");
    await app.close();
  });

  it("still accepts board placement on manifest walls", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        wallId: "ffa-central-west",
        center: { x: -6, z: 4, y: 3 },
        normal: { x: 1, y: 0, z: 0 },
        width: 4,
        height: 4,
        title: "Central board",
        accepts: ["image"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().anchor.wallId).toBe("ffa-central-west");
    await app.close();
  });

  it("rejects placement on an unknown wall id", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        wallId: "build:wall:999,999:0:n",
        center: { x: 0, y: 1, z: 0 },
        normal: { x: 0, y: 0, z: -1 },
        width: 1.5,
        height: 1.5,
        title: "Missing wall",
        accepts: ["image"]
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json().message).toMatch(/wall not found/i);
    await app.close();
  });

  it("rejects overlapping boards on the same built wall", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const piece = await createBuildWall(app, roomId, "builder-a");
    const wall = buildPieceColliders(piece).walls[0]!;
    const body = anchorBodyForBuildWall(wall);

    const first = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: body
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: body
    });
    expect(second.statusCode).toBe(422);
    expect(second.json().message).toMatch(/overlap/i);
    await app.close();
  });

  it("rejects placement on a build wall id after the piece is destroyed", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const piece = await createBuildWall(app, roomId, "builder-a");
    const wall = buildPieceColliders(piece).walls[0]!;
    const body = anchorBodyForBuildWall(wall);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${piece.id}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(deleteRes.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: body
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().message).toMatch(/wall not found/i);
    await app.close();
  });

  it("validates PATCH repositioning against built walls", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const piece = await createBuildWall(app, roomId, "builder-a");
    const wall = buildPieceColliders(piece).walls[0]!;

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: anchorBodyForBuildWall(wall, { width: 1 })
    });
    expect(createRes.statusCode).toBe(200);
    const anchorId = createRes.json().anchor.id;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors/${anchorId}`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        center: {
          x: wall.start.x + 0.5,
          y: wall.start.y + wall.height / 2,
          z: (wall.start.z + wall.end.z) / 2
        },
        width: 1
      }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().anchor.position.x).toBeCloseTo(wall.start.x + 0.5, 3);
    await app.close();
  });

  it("accepts a board spanning multiple adjacent build wall segments", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const baseCell = safeBuildCell(80);
    const pieces = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const piece = await createBuildWall(app, roomId, "builder-a", {
        ix: baseCell.ix + offset,
        iz: baseCell.iz
      });
      pieces.push(piece);
    }

    const run = boardPlacementWalls(roomWithManifest.manifest, pieces).at(-1)!;
    expect(run.anchorIds).toHaveLength(3);

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        wallId: run.id,
        center: {
          x: (run.start.x + run.end.x) / 2,
          y: run.start.y + run.height / 2,
          z: (run.start.z + run.end.z) / 2
        },
        normal: { x: 0, y: 0, z: -1 },
        width: 5.5,
        height: 1.5,
        title: "Wide build board",
        accepts: ["image"]
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().anchor.width).toBe(5.5);
    await app.close();
  });

  it("blocks destroying any segment in a multi-segment board run (orphan policy B)", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const baseCell = safeBuildCell(85);
    const pieces = [];
    for (let offset = 0; offset < 3; offset += 1) {
      pieces.push(await createBuildWall(app, roomId, "builder-a", { ix: baseCell.ix + offset, iz: baseCell.iz }));
    }
    const run = boardPlacementWalls(roomWithManifest.manifest, pieces).at(-1)!;
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        wallId: run.id,
        center: {
          x: (run.start.x + run.end.x) / 2,
          y: run.start.y + run.height / 2,
          z: (run.start.z + run.end.z) / 2
        },
        normal: { x: 0, y: 0, z: -1 },
        width: 4,
        height: 1.5,
        title: "Run board",
        accepts: ["image"]
      }
    });

    const middleDelete = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieces[1]!.id}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(middleDelete.statusCode).toBe(409);
    expect(middleDelete.json().error).toBe("build-wall-has-boards");
    await app.close();
  });

  it("rejects destroying a wall that has a board attached (orphan policy B)", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const piece = await createBuildWall(app, roomId, "builder-a");
    const wall = buildPieceColliders(piece).walls[0]!;

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: anchorBodyForBuildWall(wall)
    });
    expect(createRes.statusCode).toBe(200);
    const anchorId = createRes.json().anchor.id;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${piece.id}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(deleteRes.statusCode).toBe(409);
    expect(deleteRes.json().error).toBe("build-wall-has-boards");
    expect(deleteRes.json().message).toMatch(/remove the board/i);

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(listRes.json().pieces).toHaveLength(1);

    const removeBoard = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors/${anchorId}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(removeBoard.statusCode).toBe(200);

    const deleteAfterBoard = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${piece.id}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(deleteAfterBoard.statusCode).toBe(200);
    await app.close();
  });

  it("still allows destroying floors and ramps when a board exists elsewhere", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa-boards");
    await addStudentMember(app, classRecord.id, "teacher-ffa-boards", "builder-a", "Alex");

    const wallPiece = await createBuildWall(app, roomId, "builder-a", { ix: 15, iz: 15 });
    const wall = buildPieceColliders(wallPiece).walls[0]!;
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("builder-a", "Alex"),
      payload: anchorBodyForBuildWall(wall)
    });

    const floorRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: { ix: 16, iz: 15 }, level: 0, materialId: "wood" }
    });
    expect(floorRes.statusCode).toBe(200);
    const floorId = floorRes.json().piece.id;

    const deleteFloor = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${floorId}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(deleteFloor.statusCode).toBe(200);
    await app.close();
  });
});
