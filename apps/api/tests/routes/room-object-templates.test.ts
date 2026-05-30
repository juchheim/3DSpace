import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";
import {
  createCustomRoomObjectTemplate,
  createTinyGlb,
  enableRoomObjects,
  roomObjectsConfig,
  rewriteGlbJson,
  createPng
} from "../helpers/room-objects";

describe("room object templates", () => {
  it("seeds builtin catalog on app start", async () => {
    const app = await buildApp({
      config: roomObjectsConfig(),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-ro-templates");
    const response = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomWithManifest.room.id}`,
      headers: authHeaders("teacher-ro-templates", "Ms. Rivera")
    });
    expect(response.statusCode).toBe(200);
    const templates = response.json().templates as Array<{ slug: string }>;
    expect(templates.some((template) => template.slug === "water-molecule")).toBe(true);
    expect(templates.some((template) => template.slug === "caffeine-molecule")).toBe(true);
    await app.close();
  });

  it("lets students list visible templates", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-ro-student-list");
    await addStudentMember(app, classRecord.id, "teacher-ro-student-list", "student-ro-list", "Avery");
    const response = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomWithManifest.room.id}`,
      headers: authHeaders("student-ro-list", "Avery")
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().templates.length).toBeGreaterThan(0);
    await app.close();
  });

  it("hides classroom builtins from workforce-training room catalogs", async () => {
    const app = await buildApp({
      config: roomObjectsConfig({ ENABLE_WORKFORCE_TRAINING: "true" }),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-ro-workforce-catalog", "workforce-training");

    const response = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomWithManifest.room.id}`,
      headers: authHeaders("teacher-ro-workforce-catalog", "Ms. Rivera")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().templates).toEqual([]);
    await app.close();
  });

  it("returns 404 when ENABLE_ROOM_OBJECTS is false", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test", ENABLE_ROOM_OBJECTS: "false" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders("teacher-ro-flag-off", "Ms. Rivera")
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("room-object-disabled");
    await app.close();
  });

  it("creates a custom template from uploaded glb and exposes it to the class", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-custom-upload";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true });
    await addStudentMember(app, classRecord.id, teacherId, "student-ro-custom-view", "Avery");

    const { response: createResponse, assetStorageKey, thumbnailStorageKey } = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb()
    });
    expect(createResponse.statusCode).toBe(200);
    const template = createResponse.json().template;
    expect(template.source).toBe("custom");
    expect(template.ownerClassId).toBe(classRecord.id);
    expect(template.visibleRoomTypes).toEqual(["classroom"]);
    expect(template.renderer).toBe("gltf");
    expect(template.assetUrl).toContain("/v1/room-object-assets/");

    const assetServe = await app.inject({
      method: "GET",
      url: `/v1/room-object-assets/${assetStorageKey}`
    });
    expect(assetServe.statusCode).toBe(200);
    expect(assetServe.headers["content-type"]).toContain("model/gltf-binary");
    expect(assetServe.rawPayload.length).toBeGreaterThan(0);

    const thumbnailServe = await app.inject({
      method: "GET",
      url: `/v1/room-object-assets/${thumbnailStorageKey}`
    });
    expect(thumbnailServe.statusCode).toBe(200);
    expect(thumbnailServe.headers["content-type"]).toContain("image/png");

    const teacherTemplates = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomId}`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(teacherTemplates.json().templates.some((entry: { id: string }) => entry.id === template.id)).toBe(true);

    const studentTemplates = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomId}`,
      headers: authHeaders("student-ro-custom-view", "Avery")
    });
    expect(studentTemplates.json().templates.some((entry: { id: string }) => entry.id === template.id)).toBe(true);

    const instantiate = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { templateId: template.id }
    });
    expect(instantiate.statusCode).toBe(200);
    expect(instantiate.json().object.templateId).toBe(template.id);

    const archive = await app.inject({
      method: "DELETE",
      url: `/v1/room-objects/templates/${template.id}`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(archive.statusCode).toBe(200);

    await app.close();
  });

  it("keeps custom templates scoped to the room type they were created in", async () => {
    const app = await buildApp({
      config: roomObjectsConfig({ ENABLE_WORKFORCE_TRAINING: "true" }),
      repository: new MemoryRepository()
    });
    const teacherId = "teacher-ro-room-type-scope";
    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { name: "Room Type Scope" }
    });
    expect(classResponse.statusCode).toBe(200);
    const classId = classResponse.json().id as string;

    const classroomRoom = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { classId, name: "Classroom Objects", type: "classroom" }
    });
    const workforceRoom = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { classId, name: "Training Objects", type: "workforce-training" }
    });
    expect(classroomRoom.statusCode).toBe(200);
    expect(workforceRoom.statusCode).toBe(200);

    const classroomRoomId = classroomRoom.json().room.id as string;
    const workforceRoomId = workforceRoom.json().room.id as string;
    await enableRoomObjects(app, classroomRoomId, teacherId, { customUploadsEnabled: true });
    await enableRoomObjects(app, workforceRoomId, teacherId, { customUploadsEnabled: true });

    const { response: createResponse } = await createCustomRoomObjectTemplate(app, {
      roomId: workforceRoomId,
      teacherId,
      glb: await createTinyGlb()
    });
    expect(createResponse.statusCode).toBe(200);
    const template = createResponse.json().template;
    expect(template.visibleRoomTypes).toEqual(["workforce-training"]);

    const workforceTemplates = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${workforceRoomId}`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(workforceTemplates.json().templates.some((entry: { id: string }) => entry.id === template.id)).toBe(true);

    const classroomTemplates = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${classroomRoomId}`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(classroomTemplates.json().templates.some((entry: { id: string }) => entry.id === template.id)).toBe(false);

    await app.close();
  });

  it("rejects placing classroom-only templates in workforce-training rooms", async () => {
    const app = await buildApp({
      config: roomObjectsConfig({ ENABLE_WORKFORCE_TRAINING: "true" }),
      repository: new MemoryRepository()
    });
    const teacherId = "teacher-ro-workforce-instantiate";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId, "workforce-training");
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);

    const instantiate = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { templateId: "tpl_water_molecule" }
    });

    expect(instantiate.statusCode).toBe(404);
    expect(instantiate.json().message).toMatch(/unavailable for this room type/i);
    await app.close();
  });

  it("rejects custom upload targets when room custom uploads are disabled", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-upload-off";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: false });

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/room-objects/uploads`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: {
        kind: "asset",
        fileName: "sample.glb",
        contentType: "model/gltf-binary"
      }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("rejects oversized glb uploads", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-oversize";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true, maxUploadSizeBytes: 64 });

    const { response } = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb({ triangleCount: 4 })
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-too-large");
    await app.close();
  });

  it("rejects glbs above the triangle budget and reports the actual count", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-triangle-budget";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true });

    const triangleCount = 200_001;
    const { response } = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb({ triangleCount })
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-rejected");
    expect(response.json().reason).toBe("triangle_budget_exceeded");
    expect(response.json().triangleCount).toBe(triangleCount);
    expect(response.json().maxTriangleCount).toBe(200_000);
    expect(response.json().message).toContain("200,001");
    expect(response.json().message).toContain("200k triangle budget");
    await app.close();
  });

  it("rejects glbs with disallowed extensions", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-bad-ext";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true });

    const glb = rewriteGlbJson(await createTinyGlb(), (json) => {
      json.extensionsUsed = ["KHR_lights_punctual"];
    });
    const { response } = await createCustomRoomObjectTemplate(app, { roomId, teacherId, glb });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-rejected");
    await app.close();
  });

  it("rejects glbs with external buffer references", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-external-buffer";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true });

    const glb = rewriteGlbJson(await createTinyGlb(), (json) => {
      const buffers = Array.isArray(json.buffers) ? (json.buffers as Array<Record<string, unknown>>) : [];
      if (buffers[0]) buffers[0].uri = "https://example.com/buffer.bin";
    });
    const { response } = await createCustomRoomObjectTemplate(app, { roomId, teacherId, glb });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-rejected");
    await app.close();
  });

  it("rejects glbs with oversized textures", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-big-texture";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { customUploadsEnabled: true });

    const { response } = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb({ texturePng: createPng(4096, 1) })
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-rejected");
    await app.close();
  });
});

