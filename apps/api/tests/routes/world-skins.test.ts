import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders } from "../helpers/app";

describe("world skins", () => {
  async function buildSkinsApp() {
    return buildApp({
      config: loadConfig({ NODE_ENV: "test", ENABLE_WORLD_SKINS: "true" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
  }

  async function buildSkinsAppWithRoom() {
    const app = await buildSkinsApp();
    const teacherId = "teacher-skins";
    const studentId = "student-skins";
    const classRes = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { name: "Skins Test Class" }
    });
    expect(classRes.statusCode).toBe(200);
    const classRecord = classRes.json();

    const roomRes = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { classId: classRecord.id, name: "Skins Room" }
    });
    expect(roomRes.statusCode).toBe(200);

    await addStudentMember(app, classRecord.id, teacherId, studentId, "Avery");

    return { app, teacherId, studentId, roomId: roomRes.json().room.id };
  }

  it("seeds the builtin catalog on startup (flag on) — 6 slugs present", async () => {
    const app = await buildSkinsApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/world-skins",
      headers: authHeaders("teacher-skins-seed", "Ms. Rivera")
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skins).toHaveLength(6);
    const slugs = body.skins.map((s: { slug: string }) => s.slug).sort();
    expect(slugs).toEqual([
      "art-studio",
      "cell-interior",
      "default-theater",
      "mars-surface",
      "rainforest-canopy",
      "roman-forum"
    ]);
    await app.close();
  });

  it("GET /v1/world-skins returns absolute thumbnail URLs", async () => {
    const app = await buildSkinsApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/world-skins",
      headers: authHeaders("teacher-skins-url", "Ms. Rivera")
    });
    expect(res.statusCode).toBe(200);
    for (const skin of res.json().skins as Array<{ thumbnailStorageKey: string }>) {
      expect(skin.thumbnailStorageKey).toMatch(/^http/);
      expect(skin.thumbnailStorageKey).toContain("/v1/world-skin-assets/");
    }
    await app.close();
  });

  it("GET /v1/world-skins/mars-surface returns absolute panorama and ambient URLs", async () => {
    const app = await buildSkinsApp();
    const res = await app.inject({
      method: "GET",
      url: "/v1/world-skins/mars-surface",
      headers: authHeaders("teacher-skins-single", "Ms. Rivera")
    });
    expect(res.statusCode).toBe(200);
    const skin = res.json();
    expect(skin.thumbnailStorageKey).toContain("/v1/world-skin-assets/");
    expect(skin.overrides.panoramaWall.storageKey).toContain("/v1/world-skin-assets/");
    expect(skin.overrides.ambient.storageKey).toContain("/v1/world-skin-assets/");
    await app.close();
  });

  it("GET /v1/world-skins returns 404 when flag is off", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const res = await app.inject({
      method: "GET",
      url: "/v1/world-skins",
      headers: authHeaders("teacher-flag-off", "Ms. Rivera")
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("teacher set-room-skin persists setting and returns room.skin.v1 message", async () => {
    const { app, teacherId, roomId } = await buildSkinsAppWithRoom();
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "mars-surface" }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.skinId).toBe("mars-surface");
    expect(body.realtimeMessages).toHaveLength(1);
    expect(body.realtimeMessages[0].type).toBe("room.skin.v1");
    expect(body.realtimeMessages[0].skinId).toBe("mars-surface");

    const rooms = await app.inject({ method: "GET", url: "/v1/rooms", headers: authHeaders(teacherId, "Ms. Rivera") });
    const room = (rooms.json() as Array<{ id: string; settings: { worldSkins: { skinId: string | null } } }>)
      .find((r) => r.id === roomId);
    expect(room?.settings.worldSkins.skinId).toBe("mars-surface");
    await app.close();
  });

  it("teacher can reset skin to null (calm/default)", async () => {
    const { app, teacherId, roomId } = await buildSkinsAppWithRoom();
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "mars-surface" }
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: null }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().skinId).toBeNull();
    expect(res.json().realtimeMessages[0].skinId).toBeNull();
    await app.close();
  });

  it("student set-room-skin returns 403", async () => {
    const { app, studentId, roomId } = await buildSkinsAppWithRoom();
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(studentId, "Avery"),
      payload: { type: "set-room-skin", skinId: "mars-surface" }
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("set-room-skin with unknown slug returns 404", async () => {
    const { app, teacherId, roomId } = await buildSkinsAppWithRoom();
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "not-a-real-skin" }
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("set-room-skin-day-night with non-roman-forum skin returns 422", async () => {
    const { app, teacherId, roomId } = await buildSkinsAppWithRoom();
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "mars-surface" }
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin-day-night", mode: "night" }
    });
    expect(res.statusCode).toBe(422);
    await app.close();
  });

  it("set-room-skin-day-night for roman-forum emits room.skin.v1 with correct dayNight", async () => {
    const { app, teacherId, roomId } = await buildSkinsAppWithRoom();
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "roman-forum" }
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { type: "set-room-skin-day-night", mode: "night" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().dayNight).toBe("night");
    expect(res.json().realtimeMessages[0].type).toBe("room.skin.v1");
    expect(res.json().realtimeMessages[0].dayNight).toBe("night");
    await app.close();
  });

  it("skin classroom actions return 404 when ENABLE_WORLD_SKINS is off", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const classRes = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-flag", "Ms. Rivera"),
      payload: { name: "Flag Off Class" }
    });
    const roomRes = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-flag", "Ms. Rivera"),
      payload: { classId: classRes.json().id, name: "Flag Off Room" }
    });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomRes.json().room.id}/classroom/actions`,
      headers: authHeaders("teacher-flag", "Ms. Rivera"),
      payload: { type: "set-room-skin", skinId: "mars-surface" }
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

