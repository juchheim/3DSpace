import { describe, expect, it } from "vitest";
import { createAiHostRecord } from "../../src/ai-host/host-service.js";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";

function aiHostConfig(env: Record<string, string> = {}) {
  return loadConfig({
    NODE_ENV: "test",
    ENABLE_FREE_FOR_ALL: "true",
    FREE_FOR_ALL_PASSWORD: "open-sesame",
    ENABLE_AI_WORLD_HOST: "true",
    ...env
  } as NodeJS.ProcessEnv);
}

describe("AI world host routes", () => {
  async function createFfaRoom(app: Awaited<ReturnType<typeof buildApp>>, teacherId = "teacher-aihost") {
    return createClassAndRoom(app, teacherId, "free-for-all");
  }

  it("rejects host routes when the feature flag is off", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: aiHostConfig({ ENABLE_AI_WORLD_HOST: "false" }),
      repository
    });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Guide Bot",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("ai-host-disabled");
    await app.close();
  });

  it("rejects host routes for non free-for-all room types", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-class", "classroom");
    const roomId = roomWithManifest.room.id;

    const response = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-class", "Ms. Rivera")
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("summons, renames, repositions, and dismisses the AI world host", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { classRecord, roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-aihost", "student-a", "Alex");

    const empty = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("student-a", "Alex")
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().host).toBeNull();

    const summon = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("student-a", "Alex"),
      payload: {
        displayName: "  Chip  ",
        position: { x: 1, y: 0.5, z: 2 },
        rotationY: 1.2
      }
    });
    expect(summon.statusCode).toBe(200);
    expect(summon.json().host.displayName).toBe("Chip");
    expect(summon.json().host.rotationY).toBe(1.2);
    // Avatar defaults to Simple Bot when not specified.
    expect(summon.json().host.avatar).toBe("simple-bot");
    expect(summon.json().realtimeMessages[0].type).toBe("room.ai-host.updated.v1");

    const duplicate = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Other Bot",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error).toBe("ai-host-exists");

    const rename = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: { displayName: "Guide-42" }
    });
    expect(rename.statusCode).toBe(200);
    expect(rename.json().host.displayName).toBe("Guide-42");
    expect(rename.json().realtimeMessages[0].type).toBe("room.ai-host.updated.v1");

    const reposition = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("student-a", "Alex"),
      payload: {
        position: { x: 4, y: 0, z: -2 },
        rotationY: 0.5
      }
    });
    expect(reposition.statusCode).toBe(200);
    expect(reposition.json().host.position).toEqual({ x: 4, y: 0, z: -2 });
    expect(reposition.json().host.rotationY).toBe(0.5);

    const dismiss = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("student-a", "Alex")
    });
    expect(dismiss.statusCode).toBe(200);
    expect(dismiss.json().dismissed).toBe(true);
    expect(dismiss.json().realtimeMessages[0].type).toBe("room.ai-host.dismissed.v1");

    const afterDismiss = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("student-a", "Alex")
    });
    expect(afterDismiss.json().host).toBeNull();

    await app.close();
  });

  it("summons a Sprocket-Bot host and switches avatar via patch", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const summon = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Sprocket",
        avatar: "sprocket-bot",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(summon.statusCode).toBe(200);
    expect(summon.json().host.avatar).toBe("sprocket-bot");

    // The choice survives a round-trip through the repository.
    const fetched = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera")
    });
    expect(fetched.json().host.avatar).toBe("sprocket-bot");

    // Users can switch the look back to the retro robot.
    const patched = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: { avatar: "retro-robot" }
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().host.avatar).toBe("retro-robot");

    // Unknown avatar variants are rejected.
    const bad = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: { avatar: "mystery-bot" }
    });
    expect(bad.statusCode).toBe(400);

    await app.close();
  });

  it("rejects invalid display names and empty patches", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const badName = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "ab",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(badName.statusCode).toBe(400);

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Chip",
        position: { x: 0, y: 0, z: 0 }
      }
    });

    const emptyPatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {}
    });
    expect(emptyPatch.statusCode).toBe(400);

    const dismissMissing = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera")
    });
    expect(dismissMissing.statusCode).toBe(200);

    const patchMissing = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: { displayName: "Nope" }
    });
    expect(patchMissing.statusCode).toBe(404);
    expect(patchMissing.json().error).toBe("ai-host-not-found");

    await app.close();
  });

  it("rejects when room settings disable aiWorldHost", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const patchRoom = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        settings: {
          aiWorldHost: {
            enabled: false,
            maxFilesPerRoom: 10,
            maxFileSizeBytes: 5_000_000,
            maxMessagesPerUserPerHour: 60,
            maxContextMessages: 20,
            allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
          }
        }
      }
    });
    expect(patchRoom.statusCode).toBe(200);

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Guide Bot",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("allows display names that only contain blocked words as substrings", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Classic",
        position: { x: 0, y: 0, z: 0 }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().host.displayName).toBe("Classic");
    await app.close();
  });

  it("accepts deleteFiles query on dismiss (file cascade deferred to Phase 6)", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createFfaRoom(app);
    const roomId = roomWithManifest.room.id;

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera"),
      payload: {
        displayName: "Chip",
        position: { x: 0, y: 0, z: 0 }
      }
    });

    const dismiss = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host?deleteFiles=true`,
      headers: authHeaders("teacher-aihost", "Ms. Rivera")
    });
    expect(dismiss.statusCode).toBe(200);
    expect(dismiss.json().dismissed).toBe(true);
    await app.close();
  });

  it("repository createAiHost throws ai-host-exists on duplicate", async () => {
    const repository = new MemoryRepository();
    const host = createAiHostRecord({
      roomId: "room-dup",
      displayName: "Chip",
      position: { x: 0, y: 0, z: 0 },
      createdByUserId: "user-1"
    });
    await repository.createAiHost(host);
    await expect(repository.createAiHost(host)).rejects.toMatchObject({
      statusCode: 409,
      code: "ai-host-exists"
    });
  });
});
