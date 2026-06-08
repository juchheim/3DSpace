import { BUILD_ROOM_EVENT_TYPES } from "@3dspace/contracts";
import { BUILD_MAX_LEVEL, BUILD_MAX_PIECES_PER_ROOM, BUILD_MAX_PIECES_PER_USER, cellToWorldCenter, worldToCell } from "@3dspace/room-engine";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, buildTestApp, createClassAndRoom } from "../helpers/app";
import { buildPiecesConfig, enableBuildingForRoom } from "../helpers/build-pieces";

describe("build pieces routes", () => {
  function cellForIndex(index: number) {
    return { ix: -20 + (index % 25), iz: -20 + Math.floor(index / 25) };
  }

  async function createFfaRoom(app: Awaited<ReturnType<typeof buildApp>>, teacherId = "teacher-ffa") {
    return createClassAndRoom(app, teacherId, "free-for-all");
  }

  it("rejects build requests when the feature flag is off", async () => {
    const app = await buildTestApp({
      config: buildPiecesConfig({ ENABLE_FREE_FOR_ALL_BUILDING: "false" })
    });
    const { roomWithManifest } = await createFfaRoom(app);
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/build-pieces`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { kind: "floor", cell: { ix: 10, iz: 10 }, level: 0 }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("build-disabled");
    await app.close();
  });

  it("creates, lists, upserts idempotently, and deletes build pieces", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-b", "Blake");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "wall", cell: { ix: 15, iz: 15 }, level: 0, edge: "n", materialId: "wood" }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json();
    expect(created.piece.kind).toBe("wall");
    expect(created.piece.edge).toBe("n");
    expect(created.piece.materialId).toBe("wood");
    expect(created.realtimeMessages[0].type).toBe("room.build.upsert.v1");

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().pieces).toHaveLength(1);

    const recreateRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake"),
      payload: { kind: "wall", cell: { ix: 15, iz: 15 }, level: 0, edge: "n", materialId: "metal" }
    });
    expect(recreateRes.statusCode).toBe(200);
    expect(recreateRes.json().piece.id).toBe(created.piece.id);
    expect(recreateRes.json().piece.materialId).toBe("metal");
    expect(recreateRes.json().piece.createdByUserId).toBe("builder-a");

    const listAfterUpsert = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(listAfterUpsert.json().pieces).toHaveLength(1);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${created.piece.id}`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().realtimeMessages[0].type).toBe("room.build.remove.v1");

    const listAfterDelete = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(listAfterDelete.json().pieces).toHaveLength(0);

    await app.close();
  });

  it("places a batch and clears all pieces", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-b", "Blake");

    const batchRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: { ix: 8, iz: 8 }, level: 0 },
          { kind: "floor", cell: { ix: 9, iz: 8 }, level: 0 }
        ]
      }
    });
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.json().pieces).toHaveLength(2);
    expect(batchRes.json().realtimeMessages[0].type).toBe("room.build.batch.v1");

    const clearRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().realtimeMessages[0].type).toBe("room.build.batch.v1");
    expect(clearRes.json().realtimeMessages[0].pieces).toEqual([]);

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake")
    });
    expect(listRes.json().pieces).toHaveLength(0);

    await app.close();
  });

  it("dedupes duplicate slots in batch responses (last write wins)", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const batchRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: { ix: 12, iz: 12 }, level: 0, materialId: "wood" },
          { kind: "floor", cell: { ix: 12, iz: 12 }, level: 0, materialId: "metal" }
        ]
      }
    });
    expect(batchRes.statusCode).toBe(200);
    const body = batchRes.json();
    expect(body.pieces).toHaveLength(1);
    expect(body.pieces[0].materialId).toBe("metal");
    expect(body.realtimeMessages[0].pieces).toHaveLength(1);

    await app.close();
  });

  it("preserves original creator on upsert for per-user cap accounting", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-b", "Blake");

    for (let index = 0; index < BUILD_MAX_PIECES_PER_USER; index += 1) {
      await repository.createBuildPiece({
        roomId,
        kind: "floor",
        cell: cellForIndex(index),
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "builder-a"
      });
    }

    const overwrite = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake"),
      payload: { kind: "floor", cell: cellForIndex(0), level: 0, materialId: "wood" }
    });
    expect(overwrite.statusCode).toBe(200);
    expect(overwrite.json().piece.createdByUserId).toBe("builder-a");
    expect(await repository.countBuildPiecesForUser(roomId, "builder-a")).toBe(BUILD_MAX_PIECES_PER_USER);
    expect(await repository.countBuildPiecesForUser(roomId, "builder-b")).toBe(0);

    const blocked = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: cellForIndex(BUILD_MAX_PIECES_PER_USER), level: 0 }
    });
    expect(blocked.statusCode).toBe(422);
    expect(blocked.json().error).toBe("build-cap-exceeded");
    expect(blocked.json().scope).toBe("user");

    const bypassAttempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-b", "Blake"),
      payload: { kind: "floor", cell: cellForIndex(1), level: 0, materialId: "metal" }
    });
    expect(bypassAttempt.statusCode).toBe(200);
    expect(await repository.countBuildPiecesForUser(roomId, "builder-a")).toBe(BUILD_MAX_PIECES_PER_USER);
    expect(await repository.countBuildPiecesForUser(roomId, "builder-b")).toBe(0);

    await app.close();
  });

  it("dedupes duplicate placements in a batch for cap checks", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const batchCell = { ix: 18, iz: 18 };
    for (let index = 0; index < BUILD_MAX_PIECES_PER_USER - 1; index += 1) {
      await repository.createBuildPiece({
        roomId,
        kind: "floor",
        cell: cellForIndex(index + 20),
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "builder-a"
      });
    }

    const batchRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: batchCell, level: 0 },
          { kind: "floor", cell: batchCell, level: 0 }
        ]
      }
    });
    expect(batchRes.statusCode).toBe(200);
    expect(batchRes.json().pieces).toHaveLength(1);
    expect(await repository.countBuildPiecesForUser(roomId, "builder-a")).toBe(BUILD_MAX_PIECES_PER_USER);

    const overCap = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: { ix: 19, iz: 19 }, level: 0 },
          { kind: "floor", cell: { ix: 19, iz: 19 }, level: 0 }
        ]
      }
    });
    expect(overCap.statusCode).toBe(422);
    expect(overCap.json().error).toBe("build-cap-exceeded");
    expect(overCap.json().scope).toBe("user");

    await app.close();
  });

  it("enforces per-room and per-user caps", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "cap-user", "Cap");
    await addStudentMember(app, classRecord.id, "teacher-ffa", "cap-user-b", "Cap B");

    for (let index = 0; index < BUILD_MAX_PIECES_PER_USER; index += 1) {
      await repository.createBuildPiece({
        roomId,
        kind: "floor",
        cell: cellForIndex(index),
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "cap-user"
      });
    }

    const overUserCap = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("cap-user", "Cap"),
      payload: { kind: "floor", cell: cellForIndex(BUILD_MAX_PIECES_PER_USER), level: 0 }
    });
    expect(overUserCap.statusCode).toBe(422);
    expect(overUserCap.json().error).toBe("build-cap-exceeded");
    expect(overUserCap.json().scope).toBe("user");

    for (let index = 0; index < BUILD_MAX_PIECES_PER_ROOM - BUILD_MAX_PIECES_PER_USER; index += 1) {
      await repository.createBuildPiece({
        roomId,
        kind: "floor",
        cell: cellForIndex(BUILD_MAX_PIECES_PER_USER + index),
        level: 0,
        rotation: 0,
        materialId: "stone",
        createdByUserId: "cap-user-b"
      });
    }

    const overRoomCap = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("cap-user-b", "Cap B"),
      payload: { kind: "floor", cell: cellForIndex(BUILD_MAX_PIECES_PER_ROOM), level: 0 }
    });
    expect(overRoomCap.statusCode).toBe(422);
    expect(overRoomCap.json().error).toBe("build-cap-exceeded");
    expect(overRoomCap.json().scope).toBe("room");

    await app.close();
  });

  it("rejects placements in spawn keep-out zones", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");
    const spawn = roomWithManifest.manifest.spawnPoints[0]!;
    const cell = worldToCell(spawn.position.x, spawn.position.z);

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell, level: 0 }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("build-rejected");
    expect(response.json().reason).toBe("spawn-keep-out");

    const awayFromSpawn = cellToWorldCenter(cell.ix + 8, cell.iz + 8);
    const farCell = worldToCell(awayFromSpawn.x, awayFromSpawn.z);
    const ok = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: farCell, level: 0 }
    });
    expect(ok.statusCode).toBe(200);

    await app.close();
  });

  it("rejects placements in FFA hall and exit keep-out zones", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const hallRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: { ix: 12, iz: 0 }, level: 0 }
    });
    expect(hallRes.statusCode).toBe(422);
    expect(hallRes.json().error).toBe("build-rejected");
    expect(hallRes.json().reason).toBe("hall-keep-out");

    const exitCell = worldToCell(18, 0);
    const exitRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: exitCell, level: 0 }
    });
    expect(exitRes.statusCode).toBe(422);
    expect(exitRes.json().reason).toBe("exit-keep-out");

    void roomWithManifest;
    await app.close();
  });

  it("enforces owner-or-teacher destroy policy", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa", { buildDestroyPolicy: "owner-or-teacher" });
    await addStudentMember(app, classRecord.id, "teacher-ffa", "owner-user", "Owner");
    await addStudentMember(app, classRecord.id, "teacher-ffa", "stranger-user", "Stranger");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("owner-user", "Owner"),
      payload: { kind: "floor", cell: { ix: 16, iz: 16 }, level: 0 }
    });
    const pieceId = createRes.json().piece.id as string;

    const denied = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("stranger-user", "Stranger")
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("build-destroy-denied");

    const ownerDelete = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("owner-user", "Owner")
    });
    expect(ownerDelete.statusCode).toBe(200);

    const recreateRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("owner-user", "Owner"),
      payload: { kind: "floor", cell: { ix: 17, iz: 17 }, level: 0 }
    });
    const teacherPieceId = recreateRes.json().piece.id as string;

    const teacherDelete = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${teacherPieceId}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(teacherDelete.statusCode).toBe(200);

    await app.close();
  });

  it("rejects build requests on non-FFA room types", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-class", "classroom");
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/build-pieces`,
      headers: authHeaders("teacher-class", "Ms. Rivera"),
      payload: { kind: "floor", cell: { ix: 10, iz: 10 }, level: 0 }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("build-disabled");
    await app.close();
  });

  it("rejects build requests when buildingEnabled is false", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await enableBuildingForRoom(app, roomId, "teacher-ffa", { buildingEnabled: false });
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: { ix: 14, iz: 14 }, level: 0 }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("build-disabled");
    await app.close();
  });

  it("returns build-not-found for unknown piece ids", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const response = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/build:floor:99,99:0`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("build-not-found");
    await app.close();
  });

  it("rejects ramps at the max build level", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "ramp", cell: { ix: 15, iz: 15 }, level: BUILD_MAX_LEVEL, rotation: 0 }
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("build-rejected");
    expect(response.json().reason).toBe("level-cap");
    await app.close();
  });

  it("rejects batch requests over the contract size limit", async () => {
    const app = await buildTestApp({ config: buildPiecesConfig() });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: Array.from({ length: 33 }, (_, index) => ({
          kind: "floor" as const,
          cell: { ix: 20 + (index % 10), iz: 20 + Math.floor(index / 10) },
          level: 0
        }))
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("validation_error");
    await app.close();
  });

  it("rate-limits placement bursts per user per room", async () => {
    const app = await buildTestApp({
      config: buildPiecesConfig({ BUILD_PLACEMENT_RATE_LIMIT_PER_MINUTE: "3" })
    });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    for (let index = 0; index < 3; index += 1) {
      const cell = cellForIndex(50 + index);
      const response = await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/build-pieces`,
        headers: authHeaders("builder-a", "Alex"),
        payload: { kind: "floor", cell, level: 0 }
      });
      expect(response.statusCode).toBe(200);
    }

    const blocked = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: cellForIndex(60), level: 0 }
    });
    expect(blocked.statusCode).toBe(429);

    await app.close();
  });

  it("records room events for place, remove, and clear", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: { ix: 11, iz: 11 }, level: 0 }
    });
    const pieceId = createRes.json().piece.id as string;

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(deleteRes.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "wall", cell: { ix: 12, iz: 12 }, level: 0, edge: "n" }
    });
    await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex")
    });

    const events = repository.listRoomEvents(roomId).map((event) => event.type);
    expect(events).toContain(BUILD_ROOM_EVENT_TYPES.piecePlaced);
    expect(events).toContain(BUILD_ROOM_EVENT_TYPES.pieceRemoved);
    expect(events).toContain(BUILD_ROOM_EVENT_TYPES.piecesCleared);

    await app.close();
  });

  it("records per-piece placed events for batch placements", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: cellForIndex(70), level: 0 },
          { kind: "floor", cell: cellForIndex(71), level: 0 }
        ]
      }
    });
    expect(response.statusCode).toBe(200);

    const events = repository.listRoomEvents(roomId).map((event) => event.type);
    expect(events.filter((type) => type === BUILD_ROOM_EVENT_TYPES.piecePlaced)).toHaveLength(2);
    expect(events).toContain(BUILD_ROOM_EVENT_TYPES.piecesBatch);

    await app.close();
  });

  it("rate-limits destroy and clear-all bursts per user per room", async () => {
    const app = await buildTestApp({
      config: buildPiecesConfig({ BUILD_PLACEMENT_RATE_LIMIT_PER_MINUTE: "2" })
    });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const batch = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces/batch`,
      headers: authHeaders("builder-a", "Alex"),
      payload: {
        pieces: [
          { kind: "floor", cell: cellForIndex(80), level: 0 },
          { kind: "floor", cell: cellForIndex(81), level: 0 }
        ]
      }
    });
    expect(batch.statusCode).toBe(200);

    const pieceId = batch.json().pieces[0].id as string;
    const blockedDelete = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("builder-a", "Alex")
    });
    expect(blockedDelete.statusCode).toBe(429);

    await app.close();
  });

  it("deletes build pieces when the room is deleted", async () => {
    const repository = new MemoryRepository();
    const app = await buildTestApp({ config: buildPiecesConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-ffa", "builder-a", "Alex");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("builder-a", "Alex"),
      payload: { kind: "floor", cell: { ix: 17, iz: 17 }, level: 0 }
    });
    expect(createRes.statusCode).toBe(200);
    expect(await repository.countBuildPiecesForRoom(roomId)).toBe(1);

    const deleteRoom = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(deleteRoom.statusCode).toBe(200);
    expect(await repository.countBuildPiecesForRoom(roomId)).toBe(0);

    void classRecord;
    await app.close();
  });
});
