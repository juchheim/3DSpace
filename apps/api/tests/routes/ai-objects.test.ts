import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { authHeaders, createClassAndRoom } from "../helpers/app";

describe("AI 3D Object Generator", () => {
  function aiObjectConfig() {
    return loadConfig({
      NODE_ENV: "test",
      ENABLE_AI_OBJECT_GENERATION: "true",
      AI_OBJECT_USE_TEST_FIXTURE: "true",
      ENABLE_FREE_FOR_ALL: "true",
      FREE_FOR_ALL_PASSWORD: "open-sesame",
      ENABLE_ROOM_OBJECTS: "true"
    } as NodeJS.ProcessEnv);
  }

  async function createFfaRoom(app: Awaited<ReturnType<typeof buildApp>>, teacherId = "teacher-ffa") {
    return createClassAndRoom(app, teacherId, "free-for-all");
  }

  it("rejects AI object requests on classroom rooms", async () => {
    const app = await buildApp({ config: aiObjectConfig(), repository: new MemoryRepository() });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-class", "classroom");
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/ai-objects/jobs`,
      headers: authHeaders("teacher-class", "Ms. Rivera"),
      payload: { prompt: "a chair" }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toMatch(/not available for this room type/i);
    await app.close();
  });

  it("rejects AI object requests when feature flag is off", async () => {
    const app = await buildApp({
      config: loadConfig({
        NODE_ENV: "test",
        ENABLE_FREE_FOR_ALL: "true",
        FREE_FOR_ALL_PASSWORD: "open-sesame"
      } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createFfaRoom(app);
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: "a chair" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("starts a job with test fixture, polls to ready, then downloads GLB", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiObjectConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    // Start job
    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: "a red cube" }
    });
    expect(startRes.statusCode).toBe(200);
    const { job, realtimeMessages } = startRes.json();
    expect(job.id).toMatch(/^aiobj_/);
    expect(job.status).toBe("queued");
    expect(job.prompt).toBe("a red cube");
    expect(realtimeMessages[0].type).toBe("room.ai-object.started.v1");

    // Poll until ready (fixture runs in background — give it a moment)
    let finalJob = job;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const pollRes = await app.inject({
        method: "GET",
        url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
        headers: authHeaders("teacher-ffa", "Ms. Rivera")
      });
      expect(pollRes.statusCode).toBe(200);
      finalJob = pollRes.json();
      if (finalJob.status === "ready" || finalJob.status === "error") break;
    }
    expect(finalJob.status).toBe("ready");
    expect(finalJob.templateId).toBeTruthy();
    expect(typeof finalJob.fileSizeBytes).toBe("number");

    // List jobs
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().jobs.length).toBe(1);

    // Download GLB
    const dlRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}/object.glb`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(dlRes.statusCode).toBe(200);
    expect(dlRes.headers["content-type"]).toBe("model/gltf-binary");
    expect(dlRes.headers["content-disposition"]).toMatch(/attachment/);
    expect(dlRes.rawPayload.length).toBeGreaterThan(0);

    await app.close();
  });

  it("places a ready job in the room", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiObjectConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: "a wooden chair" }
    });
    expect(startRes.statusCode).toBe(200);
    const { job } = startRes.json();

    let finalJob = job;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await app.inject({
        method: "GET",
        url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
        headers: authHeaders("teacher-ffa", "Ms. Rivera")
      });
      finalJob = poll.json();
      if (finalJob.status === "ready" || finalJob.status === "error") break;
    }
    expect(finalJob.status).toBe("ready");

    const placeRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}/place`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: {}
    });
    expect(placeRes.statusCode).toBe(200);
    const { object, template, realtimeMessages } = placeRes.json();
    expect(object.templateId).toBe(finalJob.templateId);
    expect(template.id).toBe(finalJob.templateId);
    expect(template.source).toBe("ai-generated");
    expect(realtimeMessages[0].type).toBe("room.object.upsert.v1");

    await app.close();
  });

  it("cancels an active job", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiObjectConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: "a sphere" }
    });
    expect(startRes.statusCode).toBe(200);
    const { job } = startRes.json();

    const cancelRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { action: "cancel" }
    });
    expect(cancelRes.statusCode).toBe(200);
    const { job: cancelled, realtimeMessages } = cancelRes.json();
    expect(cancelled.status).toBe("cancelled");
    expect(realtimeMessages[0].type).toBe("room.ai-object.cancelled.v1");

    await app.close();
  });

  it("deletes a job and cascade-removes placed objects", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiObjectConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: "a tree" }
    });
    const { job } = startRes.json();

    let finalJob = job;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const poll = await app.inject({
        method: "GET",
        url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
        headers: authHeaders("teacher-ffa", "Ms. Rivera")
      });
      finalJob = poll.json();
      if (finalJob.status === "ready" || finalJob.status === "error") break;
    }
    expect(finalJob.status).toBe("ready");

    // Place first
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}/place`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: {}
    });

    // Now delete
    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(delRes.statusCode).toBe(200);
    const { deleted, realtimeMessages } = delRes.json();
    expect(deleted).toBe(true);
    expect(realtimeMessages.some((message: { type: string }) => message.type === "room.object.remove.v1")).toBe(true);
    expect(realtimeMessages.some((message: { type: string }) => message.type === "room.ai-object.deleted.v1")).toBe(true);

    const objectsRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(objectsRes.json().objects).toHaveLength(0);

    const templateRes = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates/${finalJob.templateId}?roomId=${roomId}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(templateRes.statusCode).toBe(404);

    // Job should be gone
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(getRes.statusCode).toBe(404);

    await app.close();
  });

  it("rejects prompt that exceeds max length", async () => {
    const app = await buildApp({ config: aiObjectConfig(), repository: new MemoryRepository() });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const longPrompt = "a ".repeat(300);
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt: longPrompt }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("validation_error");

    await app.close();
  });

  it("excludes ai-generated templates from the room object catalog", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiObjectConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    const prompt = "fire hydrant";

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-objects/jobs`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera"),
      payload: { prompt }
    });
    expect(startRes.statusCode).toBe(200);
    const { job } = startRes.json();

    let finalJob = job;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 150));
      const pollRes = await app.inject({
        method: "GET",
        url: `/v1/rooms/${roomId}/ai-objects/jobs/${job.id}`,
        headers: authHeaders("teacher-ffa", "Ms. Rivera")
      });
      finalJob = pollRes.json();
      if (finalJob.status === "ready" || finalJob.status === "error") break;
    }
    expect(finalJob.status).toBe("ready");

    const template = await repository.getRoomObjectTemplate(finalJob.templateId);
    expect(template?.source).toBe("ai-generated");
    expect(template?.description).toBe(prompt);
    expect(template?.description).not.toMatch(/^\{/);

    const catalogRes = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates?roomId=${roomId}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(catalogRes.statusCode).toBe(200);
    expect(
      catalogRes.json().templates.some((entry: { id: string }) => entry.id === finalJob.templateId)
    ).toBe(false);

    const resolveRes = await app.inject({
      method: "GET",
      url: `/v1/room-objects/templates/${finalJob.templateId}?roomId=${roomId}`,
      headers: authHeaders("teacher-ffa", "Ms. Rivera")
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().id).toBe(finalJob.templateId);
    expect(resolveRes.json().source).toBe("ai-generated");

    await app.close();
  });
});

