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

async function createClassAndRoom(app: Awaited<ReturnType<typeof buildApp>>, teacherId = "teacher-wall") {
  const classResponse = await app.inject({
    method: "POST",
    url: "/v1/classes",
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: { name: `Wall Media ${teacherId}` }
  });
  expect(classResponse.statusCode).toBe(200);
  const classRecord = classResponse.json();

  const roomResponse = await app.inject({
    method: "POST",
    url: "/v1/rooms",
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: { classId: classRecord.id, name: "Wall Lab" }
  });
  expect(roomResponse.statusCode).toBe(200);
  const roomWithManifest = roomResponse.json();
  return { classRecord, roomWithManifest };
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
    expect(openapiResponse.json().paths["/v1/rooms/{roomId}/wall-objects"]).toBeDefined();
    expect(openapiResponse.json().paths["/v1/rooms/{roomId}/attachments/{attachmentId}/finalize"]).toBeDefined();

    const readyResponse = await app.inject({ method: "GET", url: "/ready" });
    expect(readyResponse.statusCode).toBe(200);
    expect(readyResponse.json().status).toBe("degraded");

    await app.close();
  });

  it("persists timer elapsed position across pause and resume controls", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-timer");
    const room = roomWithManifest.room;
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const createTimer = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-timer", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "timer",
        title: "Class timer",
        source: { kind: "inline", data: { seconds: 300 } }
      }
    });
    expect(createTimer.statusCode).toBe(200);
    const timer = createTimer.json();

    const play = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${timer.id}/control`,
      headers: authHeaders("teacher-timer", "Ms. Rivera"),
      payload: { action: "play", positionSeconds: 0 }
    });
    expect(play.statusCode).toBe(200);
    expect(play.json().state.playback.status).toBe("playing");
    expect(play.json().state.playback.positionSeconds).toBe(0);

    const pause = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${timer.id}/control`,
      headers: authHeaders("teacher-timer", "Ms. Rivera"),
      payload: { action: "pause", positionSeconds: 42 }
    });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().state.playback.status).toBe("paused");
    expect(pause.json().state.playback.positionSeconds).toBe(42);

    const resume = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${timer.id}/control`,
      headers: authHeaders("teacher-timer", "Ms. Rivera"),
      payload: { action: "play", positionSeconds: 42 }
    });
    expect(resume.statusCode).toBe(200);
    expect(resume.json().state.playback.status).toBe("playing");
    expect(resume.json().state.playback.positionSeconds).toBe(42);

    await app.close();
  });

  it("requires attachment finalization before creating an active file-backed wall object", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-file");
    const room = roomWithManifest.room;
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const attachmentResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/attachments`,
      headers: authHeaders("teacher-file", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        kind: "image",
        fileName: "diagram.png",
        contentType: "image/png",
        metadata: { altText: "Wave diagram", sizeBytes: 256 }
      }
    });
    expect(attachmentResponse.statusCode).toBe(200);
    const attachment = attachmentResponse.json().attachment;
    expect(attachment.status).toBe("pending_upload");

    const blockedObject = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-file", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "image.file",
        title: "Wave diagram",
        source: { kind: "asset", attachmentId: attachment.id }
      }
    });
    expect(blockedObject.statusCode).toBe(409);

    const finalizeResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/attachments/${attachment.id}/finalize`,
      headers: authHeaders("teacher-file", "Ms. Rivera"),
      payload: { metadata: { naturalWidth: 640, naturalHeight: 360 } }
    });
    expect(finalizeResponse.statusCode).toBe(200);
    expect(finalizeResponse.json().status).toBe("ready");

    const objectResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-file", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "image.file",
        title: "Wave diagram",
        source: { kind: "asset", attachmentId: attachment.id }
      }
    });
    expect(objectResponse.statusCode).toBe(200);
    expect(objectResponse.json().status).toBe("active");

    await app.close();
  });

  it("enforces wall object role policy, student request mode, anchor policy, soft remove, and version conflicts", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-policy");
    const room = roomWithManifest.room;
    const boardAnchorId = "anchor-board";

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/v1/classes/${classRecord.id}/invites`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: { role: "student", roomId: room.id }
    });
    const invite = inviteResponse.json();
    const studentJoin = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/session`,
      headers: authHeaders("student-policy", "Avery"),
      payload: { viewMode: "2d", inviteCode: invite.code }
    });
    expect(studentJoin.statusCode).toBe(200);

    const defaultBlocked = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("student-policy", "Avery"),
      payload: {
        wallAnchorId: boardAnchorId,
        type: "note",
        title: "Student note",
        source: { kind: "inline", data: { text: "hello" } }
      }
    });
    expect(defaultBlocked.statusCode).toBe(403);

    const updateRoom = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${room.id}`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: { settings: { wallObjectCreation: "student-request", allowStudentUploads: true } }
    });
    expect(updateRoom.statusCode).toBe(200);

    const studentRequest = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("student-policy", "Avery"),
      payload: {
        wallAnchorId: boardAnchorId,
        type: "note",
        title: "Student question",
        source: { kind: "inline", data: { text: "Can we review this?" } }
      }
    });
    expect(studentRequest.statusCode).toBe(200);
    expect(studentRequest.json().status).toBe("pending_moderation");
    const pendingObject = studentRequest.json();

    const studentSelfApprove = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${pendingObject.id}/control`,
      headers: authHeaders("student-policy", "Avery"),
      payload: { action: "approve" }
    });
    expect(studentSelfApprove.statusCode).toBe(403);

    const teacherApprove = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${pendingObject.id}/control`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: { action: "approve" }
    });
    expect(teacherApprove.statusCode).toBe(200);
    expect(teacherApprove.json().status).toBe("active");

    const audioAttachment = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/attachments`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: {
        wallAnchorId: boardAnchorId,
        kind: "audio",
        fileName: "clip.mp3",
        contentType: "audio/mpeg",
        metadata: { sizeBytes: 512 }
      }
    });
    expect(audioAttachment.statusCode).toBe(200);
    const audioAttachmentId = audioAttachment.json().attachment.id;
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/attachments/${audioAttachmentId}/finalize`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: {}
    });
    const disallowedAnchor = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: {
        wallAnchorId: boardAnchorId,
        type: "audio.file",
        title: "Audio clip",
        source: { kind: "asset", attachmentId: audioAttachmentId }
      }
    });
    expect(disallowedAnchor.statusCode).toBe(400);

    const teacherNote = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: {
        wallAnchorId: boardAnchorId,
        type: "note",
        title: "Teacher note",
        source: { kind: "inline", data: { text: "Focus on wavelength." } }
      }
    });
    expect(teacherNote.statusCode).toBe(200);
    const object = teacherNote.json();

    const firstPatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${room.id}/wall-objects/${object.id}`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: { expectedVersion: 1, title: "Teacher note updated" }
    });
    expect(firstPatch.statusCode).toBe(200);
    expect(firstPatch.json().version).toBe(2);

    const stalePatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${room.id}/wall-objects/${object.id}`,
      headers: authHeaders("teacher-policy", "Ms. Rivera"),
      payload: { expectedVersion: 1, title: "Stale title" }
    });
    expect(stalePatch.statusCode).toBe(409);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${room.id}/wall-objects/${object.id}`,
      headers: authHeaders("teacher-policy", "Ms. Rivera")
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().status).toBe("removed");

    const defaultList = await app.inject({
      method: "GET",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-policy", "Ms. Rivera")
    });
    expect(defaultList.json().some((item: { id: string }) => item.id === object.id)).toBe(false);

    const removedList = await app.inject({
      method: "GET",
      url: `/v1/rooms/${room.id}/wall-objects?includeRemoved=true`,
      headers: authHeaders("teacher-policy", "Ms. Rivera")
    });
    expect(removedList.json().some((item: { id: string }) => item.id === object.id)).toBe(true);

    await app.close();
  });

  it("creates live wall shares, enforces live limits, ends shares, and keeps web resources safe", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test", WALL_OBJECT_MAX_ACTIVE_LIVE_SHARES: "1" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-live");
    const room = roomWithManifest.room;
    const anchorId = "anchor-board";

    const cameraShare = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-shares`,
      headers: authHeaders("teacher-live", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "camera.live",
        title: "Pinned camera"
      }
    });
    expect(cameraShare.statusCode).toBe(200);
    expect(cameraShare.json().publicationName).toMatch(/^wall:/);
    expect(cameraShare.json().object.status).toBe("active");

    const overLiveLimit = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-shares`,
      headers: authHeaders("teacher-live", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "browser-tab.live",
        title: "Shared screen"
      }
    });
    expect(overLiveLimit.statusCode).toBe(409);

    const endShare = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-shares/${cameraShare.json().object.id}/end`,
      headers: authHeaders("teacher-live", "Ms. Rivera")
    });
    expect(endShare.statusCode).toBe(200);
    expect(endShare.json().status).toBe("source_ended");

    const unsafeUrl = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/web-resources`,
      headers: authHeaders("teacher-live", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        url: "http://example.com",
        title: "Unsafe"
      }
    });
    expect(unsafeUrl.statusCode).toBe(400);

    const iframeFallback = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/web-resources`,
      headers: authHeaders("teacher-live", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        url: "https://example.com/resource",
        title: "Example",
        embedMode: "iframe"
      }
    });
    expect(iframeFallback.statusCode).toBe(200);
    expect(iframeFallback.json().type).toBe("web.link");
    expect(iframeFallback.json().source.embedMode).toBe("link");

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
