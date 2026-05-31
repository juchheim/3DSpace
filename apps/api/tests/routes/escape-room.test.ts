import type { CreateDynamicWallAnchorRequest } from "@3dspace/contracts";
import { buildPieceColliders, ESCAPE_ROOM_MANIFEST_FEATURE } from "@3dspace/room-engine";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, buildTestApp, createClassAndRoom } from "../helpers/app";
import { escapeRoomConfig } from "../helpers/escape-room";

describe("escape-room room type (API)", () => {
  async function setup(env: Record<string, string> = {}) {
    const config = escapeRoomConfig(env);
    const app = await buildApp({ config, repository: new MemoryRepository() });
    const classRes = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("author-1", "Puzzle Author"),
      payload: { name: "Puzzle Lab" }
    });
    expect(classRes.statusCode).toBe(200);
    return { app, classId: classRes.json().id };
  }

  it("returns 403 when ENABLE_ESCAPE_ROOM is false", async () => {
    const { app, classId } = await setup({ ENABLE_ESCAPE_ROOM: "false" });
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("author-1", "Puzzle Author"),
      payload: { classId, name: "The Locked Study", type: "escape-room" }
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("creates an escape room with an empty canvas manifest and author defaults", async () => {
    const { app, classId } = await setup();
    const res = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("author-1", "Puzzle Author"),
      payload: { classId, name: "The Locked Study", type: "escape-room" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.room.type).toBe("escape-room");
    expect(body.manifest.walls).toEqual([]);
    expect(body.manifest.wallAnchors).toEqual([]);
    expect(body.manifest.tiers).toEqual([]);
    expect(body.manifest.bounds).toEqual({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 });
    expect(body.manifest.features).toContainEqual({
      key: ESCAPE_ROOM_MANIFEST_FEATURE,
      enabled: true,
      config: {}
    });
    expect(body.room.settings.buildDestroyPolicy).toBe("owner-or-teacher");
    expect(body.room.settings.worldSkins.skinDayNightMode).toBe("night");
    expect(body.room.settings.aiMeetingNotes.enabled).toBe(false);
    expect(body.room.settings.sharedBrowsers.enabled).toBe(false);
    expect(body.room.settings.hallpass.enabled).toBe(false);
    expect(body.room.settings.pods.enabled).toBe(false);
    await app.close();
  });

  it("places build pieces when only ENABLE_ESCAPE_ROOM is on", async () => {
    const app = await buildTestApp({
      config: escapeRoomConfig({ ENABLE_FREE_FOR_ALL_BUILDING: "false" })
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-build", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-build", "author-build", "Author");

    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("author-build", "Author"),
      payload: { kind: "wall", cell: { ix: 15, iz: 15 }, level: 0, edge: "n", materialId: "wood" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().piece.kind).toBe("wall");
    await app.close();
  });

  it("rejects build pieces when ENABLE_ESCAPE_ROOM is off", async () => {
    const repository = new MemoryRepository();
    const onApp = await buildApp({ config: escapeRoomConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(onApp, "author-off", "escape-room");
    await onApp.close();

    const offApp = await buildApp({
      config: escapeRoomConfig({ ENABLE_ESCAPE_ROOM: "false" }),
      repository
    });
    const res = await offApp.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/build-pieces`,
      headers: authHeaders("author-off", "Author"),
      payload: { kind: "floor", cell: { ix: 10, iz: 10 }, level: 0 }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("build-disabled");
    await offApp.close();
  });

  it("accepts dynamic board placement on a build wall", async () => {
    const app = await buildTestApp({ config: escapeRoomConfig() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-board", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-board", "author-board", "Author");

    const wallRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("author-board", "Author"),
      payload: { kind: "wall", cell: { ix: 15, iz: 15 }, level: 0, edge: "n", materialId: "wood" }
    });
    expect(wallRes.statusCode).toBe(200);
    const wall = buildPieceColliders(wallRes.json().piece).walls[0]!;
    const baseY = Math.min(wall.start.y, wall.end.y);
    const body: CreateDynamicWallAnchorRequest = {
      wallId: wall.id,
      center: {
        x: (wall.start.x + wall.end.x) / 2,
        y: baseY + wall.height / 2,
        z: (wall.start.z + wall.end.z) / 2
      },
      normal: { x: 0, y: 0, z: -1 },
      width: 1.5,
      height: 1.5,
      title: "Clue board",
      accepts: ["image"]
    };

    const anchorRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/dynamic-wall-anchors`,
      headers: authHeaders("author-board", "Author"),
      payload: body
    });
    expect(anchorRes.statusCode).toBe(200);
    expect(anchorRes.json().anchor.wallId).toBe(wall.id);
    await app.close();
  });

  it("returns 404 for dynamic boards in classroom rooms", async () => {
    const app = await buildTestApp({ config: escapeRoomConfig() });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-class", "classroom");

    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/dynamic-wall-anchors`,
      headers: authHeaders("teacher-class", "Ms. Rivera"),
      payload: {
        wallId: "wall-back-1",
        center: { x: 0, y: 2, z: -14 },
        normal: { x: 0, y: 0, z: 1 },
        width: 2,
        height: 2,
        title: "Class board",
        accepts: ["image"]
      }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().message).toMatch(/dynamic boards are enabled/i);
    await app.close();
  });

  it("rejects build pieces while play mode is enabled", async () => {
    const app = await buildTestApp({ config: escapeRoomConfig() });
    const { roomWithManifest } = await createClassAndRoom(app, "author-play", "escape-room");
    const roomId = roomWithManifest.room.id;

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("author-play", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("author-play", "Author"),
      payload: { kind: "floor", cell: { ix: 10, iz: 10 }, level: 0 }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("build-disabled");
    await app.close();
  });

  it("enforces owner-or-teacher destroy policy by default", async () => {
    const app = await buildTestApp({ config: escapeRoomConfig() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-destroy", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-destroy", "author-destroy", "Author");
    await addStudentMember(app, classRecord.id, "author-destroy", "player-1", "Player");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/build-pieces`,
      headers: authHeaders("author-destroy", "Author"),
      payload: { kind: "floor", cell: { ix: 16, iz: 16 }, level: 0 }
    });
    expect(createRes.statusCode).toBe(200);
    const pieceId = createRes.json().piece.id as string;

    const denied = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("player-1", "Player")
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("build-destroy-denied");

    const allowed = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/build-pieces/${pieceId}`,
      headers: authHeaders("author-destroy", "Author")
    });
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });
});
