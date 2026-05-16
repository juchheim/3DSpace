import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { MemoryRepository } from "../src/repository";

function authHeaders(userId: string, name: string) {
  return {
    "x-dev-user-id": userId,
    "x-dev-user-name": name
  };
}

describe("3dspace api", () => {
  it("creates class, room, invite, and student session with dev fallbacks", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { name: "Physics 101" }
    });
    expect(classResponse.statusCode).toBe(200);
    const classRecord = classResponse.json();

    const roomResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { classId: classRecord.id, name: "Wave Lab" }
    });
    expect(roomResponse.statusCode).toBe(200);
    const roomWithManifest = roomResponse.json();
    expect(roomWithManifest.manifest.wallAnchors.length).toBeGreaterThan(0);

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/v1/classes/${classRecord.id}/invites`,
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { role: "student", roomId: roomWithManifest.room.id }
    });
    expect(inviteResponse.statusCode).toBe(200);
    const invite = inviteResponse.json();

    const sessionResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/session`,
      headers: authHeaders("student-1", "Avery"),
      payload: { viewMode: "2d", inviteCode: invite.code }
    });
    expect(sessionResponse.statusCode).toBe(200);
    const session = sessionResponse.json();
    expect(session.token).toContain("dev-token");
    expect(session.role).toBe("student");
    expect(session.capabilities.maxParticipants).toBe(30);

    const attachmentResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/attachments`,
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: {
        wallAnchorId: roomWithManifest.manifest.wallAnchors[0].id,
        kind: "image",
        fileName: "lesson-board.png",
        contentType: "image/png",
        metadata: { test: true }
      }
    });
    expect(attachmentResponse.statusCode).toBe(200);
    const attachmentPayload = attachmentResponse.json();
    expect(attachmentPayload.upload.method).toBe("PUT");
    expect(attachmentPayload.upload.url).toContain("/dev-upload/");

    const downloadResponse = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/attachments/${attachmentPayload.attachment.id}/download`,
      headers: authHeaders("student-1", "Avery")
    });
    expect(downloadResponse.statusCode).toBe(200);
    const downloadPayload = downloadResponse.json();
    expect(downloadPayload.download.method).toBe("GET");
    expect(downloadPayload.download.url).toContain("/dev-download/");
    expect(downloadPayload.attachment.id).toBe(attachmentPayload.attachment.id);

    await app.close();
  });

  it("lets a teacher delete a room they created", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { name: "Physics 101" }
    });
    const classRecord = classResponse.json();

    const roomResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { classId: classRecord.id, name: "Wave Lab" }
    });
    const roomWithManifest = roomResponse.json();

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomWithManifest.room.id}`,
      headers: authHeaders("teacher-1", "Ms. Rivera")
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ roomId: roomWithManifest.room.id, deleted: true });

    const listResponse = await app.inject({
      method: "GET",
      url: "/v1/rooms",
      headers: authHeaders("teacher-1", "Ms. Rivera")
    });
    expect(listResponse.json()).toEqual([]);

    await app.close();
  });

  it("enforces teacher-only actions", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { name: "Math" }
    });
    const classRecord = classResponse.json();

    const forbiddenResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("student-1", "Avery"),
      payload: { classId: classRecord.id, name: "Unauthorized Room" }
    });

    expect(forbiddenResponse.statusCode).toBe(403);

    const roomResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-1", "Ms. Rivera"),
      payload: { classId: classRecord.id, name: "Wave Lab" }
    });
    const roomWithManifest = roomResponse.json();

    const studentDeleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomWithManifest.room.id}`,
      headers: authHeaders("student-1", "Avery")
    });
    expect(studentDeleteResponse.statusCode).toBe(403);

    await app.close();
  });

  it("returns generated OpenAPI and readiness status", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const openapiResponse = await app.inject({ method: "GET", url: "/openapi.json" });
    expect(openapiResponse.statusCode).toBe(200);
    expect(openapiResponse.json().paths["/v1/rooms/{roomId}/session"]).toBeDefined();
    expect(openapiResponse.json().paths["/v1/rooms/{roomId}/attachments/{attachmentId}/download"]).toBeDefined();

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json().status).toBe("degraded");

    await app.close();
  });

  it("supports the documented 30 participant capacity and rejects the 31st active session", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-capacity", "Ms. Capacity"),
      payload: { name: "Capacity Lab" }
    });
    const classRecord = classResponse.json();

    const roomResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-capacity", "Ms. Capacity"),
      payload: { classId: classRecord.id, name: "Thirty Seat Room" }
    });
    const room = roomResponse.json().room;

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/v1/classes/${classRecord.id}/invites`,
      headers: authHeaders("teacher-capacity", "Ms. Capacity"),
      payload: { role: "student", roomId: room.id }
    });
    const invite = inviteResponse.json();

    const teacherJoin = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/session`,
      headers: authHeaders("teacher-capacity", "Ms. Capacity"),
      payload: { viewMode: "3d" }
    });
    expect(teacherJoin.statusCode).toBe(200);

    for (let index = 1; index <= 29; index += 1) {
      const join = await app.inject({
        method: "POST",
        url: `/v1/rooms/${room.id}/session`,
        headers: authHeaders(`student-${index}`, `Student ${index}`),
        payload: { viewMode: index % 2 === 0 ? "2d" : "3d", inviteCode: invite.code }
      });
      expect(join.statusCode).toBe(200);
    }

    const overCapacity = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/session`,
      headers: authHeaders("student-30", "Student 30"),
      payload: { viewMode: "3d", inviteCode: invite.code }
    });
    expect(overCapacity.statusCode).toBe(409);

    await app.close();
  });

  it("rate limits repeated room session token requests", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test", SESSION_JOIN_RATE_LIMIT_PER_MINUTE: "2" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const classResponse = await app.inject({
      method: "POST",
      url: "/v1/classes",
      headers: authHeaders("teacher-rate", "Ms. Rate"),
      payload: { name: "Rate Limit Lab" }
    });
    const classRecord = classResponse.json();

    const roomResponse = await app.inject({
      method: "POST",
      url: "/v1/rooms",
      headers: authHeaders("teacher-rate", "Ms. Rate"),
      payload: { classId: classRecord.id, name: "Token Room" }
    });
    const room = roomResponse.json().room;

    for (let index = 0; index < 2; index += 1) {
      const allowed = await app.inject({
        method: "POST",
        url: `/v1/rooms/${room.id}/session`,
        headers: authHeaders("teacher-rate", "Ms. Rate"),
        payload: { viewMode: "3d" }
      });
      expect(allowed.statusCode).toBe(200);
    }

    const limited = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/session`,
      headers: authHeaders("teacher-rate", "Ms. Rate"),
      payload: { viewMode: "3d" }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe("rate_limited");

    await app.close();
  });
});
