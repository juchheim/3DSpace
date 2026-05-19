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

async function addStudentMember(app: Awaited<ReturnType<typeof buildApp>>, classId: string, teacherId: string, userId: string, displayName: string) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/classes/${classId}/members`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      userId,
      displayName,
      role: "student",
      status: "active"
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
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

  it("lets students vote on poll choices and returns live results", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-poll");
    const room = roomWithManifest.room;
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const inviteResponse = await app.inject({
      method: "POST",
      url: `/v1/classes/${classRecord.id}/invites`,
      headers: authHeaders("teacher-poll", "Ms. Rivera"),
      payload: { role: "student", roomId: room.id }
    });
    expect(inviteResponse.statusCode).toBe(200);
    const invite = inviteResponse.json();

    const studentJoin = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/session`,
      headers: authHeaders("student-poll", "Avery"),
      payload: { viewMode: "3d", inviteCode: invite.code }
    });
    expect(studentJoin.statusCode).toBe(200);

    const createPoll = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects`,
      headers: authHeaders("teacher-poll", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "poll",
        title: "Warm-up",
        source: {
          kind: "inline",
          data: {
            question: "Which topic should we review?",
            choices: ["Waves", "Energy", "Forces"]
          }
        }
      }
    });
    expect(createPoll.statusCode).toBe(200);
    const poll = createPoll.json();
    expect(poll.source.data.choices).toHaveLength(3);
    expect(poll.state.poll.votesByUserId).toEqual({});

    const firstChoiceId = poll.source.data.choices[0].id;

    const studentVote = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${poll.id}/control`,
      headers: authHeaders("student-poll", "Avery"),
      payload: { action: "vote", choiceId: firstChoiceId }
    });
    expect(studentVote.statusCode).toBe(200);
    expect(studentVote.json().state.poll.votesByUserId["student-poll"]).toBe(firstChoiceId);

    const teacherVote = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${poll.id}/control`,
      headers: authHeaders("teacher-poll", "Ms. Rivera"),
      payload: { action: "vote", choiceId: poll.source.data.choices[1].id }
    });
    expect(teacherVote.statusCode).toBe(200);
    expect(Object.keys(teacherVote.json().state.poll.votesByUserId)).toHaveLength(2);

    const closePoll = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${poll.id}/control`,
      headers: authHeaders("teacher-poll", "Ms. Rivera"),
      payload: { action: "close-poll" }
    });
    expect(closePoll.statusCode).toBe(200);
    expect(closePoll.json().state.poll.closed).toBe(true);

    const blockedVote = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-objects/${poll.id}/control`,
      headers: authHeaders("student-poll", "Avery"),
      payload: { action: "vote", choiceId: poll.source.data.choices[2].id }
    });
    expect(blockedVote.statusCode).toBe(409);

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

    const teacherNoteBlocked = await app.inject({
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
    expect(teacherNoteBlocked.statusCode).toBe(409);

    const removeStudentNote = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${room.id}/wall-objects/${pendingObject.id}`,
      headers: authHeaders("teacher-policy", "Ms. Rivera")
    });
    expect(removeStudentNote.statusCode).toBe(200);

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

    const anchorOccupied = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-shares`,
      headers: authHeaders("teacher-live", "Ms. Rivera"),
      payload: {
        wallAnchorId: anchorId,
        type: "browser-tab.live",
        title: "Shared screen"
      }
    });
    expect(anchorOccupied.statusCode).toBe(409);

    const endShare = await app.inject({
      method: "POST",
      url: `/v1/rooms/${room.id}/wall-shares/${cameraShare.json().object.id}/end`,
      headers: authHeaders("teacher-live", "Ms. Rivera")
    });
    expect(endShare.statusCode).toBe(200);
    expect(endShare.json().status).toBe("source_ended");

    const removeEndedCamera = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${room.id}/wall-objects/${cameraShare.json().object.id}`,
      headers: authHeaders("teacher-live", "Ms. Rivera")
    });
    expect(removeEndedCamera.statusCode).toBe(200);

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

  it("returns default classroom state for a room member", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-default");

    const response = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-default", "Ms. Rivera")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      roomId: roomWithManifest.room.id,
      version: 1,
      helpRequests: [],
      boardAccessGrants: [],
      privateChecks: [],
      groups: [],
      spotlight: null,
      lessonRun: null
    });

    await app.close();
  });

  it("filters classroom state for students and preserves teacher visibility", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-filter");
    await addStudentMember(app, classRecord.id, "teacher-classroom-filter", "student-filter-1", "Avery");
    await addStudentMember(app, classRecord.id, "teacher-classroom-filter", "student-filter-2", "Jordan");

    const raiseHand = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-filter-1", "Avery"),
      payload: { type: "raise-hand", note: "Need help with problem 3" }
    });
    expect(raiseHand.statusCode).toBe(200);
    expect(raiseHand.json().helpRequests).toHaveLength(1);

    const createCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-filter", "Ms. Rivera"),
      payload: {
        type: "create-private-check",
        question: "How confident are you?",
        promptType: "confidence"
      }
    });
    expect(createCheck.statusCode).toBe(200);
    const checkId = createCheck.json().privateChecks[0].id;

    const openCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-filter", "Ms. Rivera"),
      payload: { type: "open-private-check", checkId }
    });
    expect(openCheck.statusCode).toBe(200);

    const submitCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-filter-1", "Avery"),
      payload: { type: "submit-private-check", checkId, confidence: 4 }
    });
    expect(submitCheck.statusCode).toBe(200);
    expect(submitCheck.json().privateChecks[0].responses).toHaveLength(1);

    const teacherView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-filter", "Ms. Rivera")
    });
    expect(teacherView.statusCode).toBe(200);
    expect(teacherView.json().helpRequests).toHaveLength(1);
    expect(teacherView.json().privateChecks[0].responses).toHaveLength(1);
    expect(teacherView.json().privateChecks[0].responses[0].userId).toBe("student-filter-1");

    const studentOwnView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("student-filter-1", "Avery")
    });
    expect(studentOwnView.statusCode).toBe(200);
    expect(studentOwnView.json().helpRequests).toHaveLength(1);
    expect(studentOwnView.json().privateChecks[0].responses).toHaveLength(1);
    expect(studentOwnView.json().privateChecks[0].responses[0].userId).toBe("student-filter-1");

    const studentPeerView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("student-filter-2", "Jordan")
    });
    expect(studentPeerView.statusCode).toBe(200);
    expect(studentPeerView.json().helpRequests).toHaveLength(0);
    expect(studentPeerView.json().privateChecks[0].responses).toHaveLength(0);

    await app.close();
  });

  it("rejects teacher-only classroom actions from students", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-role");
    await addStudentMember(app, classRecord.id, "teacher-classroom-role", "student-classroom-role", "Avery");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-classroom-role", "Avery"),
      payload: {
        type: "create-group",
        label: "Table A",
        color: "#2a9d8f"
      }
    });

    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("enforces optimistic version checks for classroom actions", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-version");

    const first = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-version", "Ms. Rivera"),
      payload: {
        type: "create-group",
        label: "Table A",
        color: "#264653",
        expectedVersion: 1
      }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().version).toBe(2);

    const stale = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-version", "Ms. Rivera"),
      payload: {
        type: "create-group",
        label: "Table B",
        color: "#e76f51",
        expectedVersion: 1
      }
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().message).toMatch(/version conflict/i);

    await app.close();
  });

  it("tolerates persisted null optional classroom fields when raising a hand", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-null");
    await addStudentMember(app, classRecord.id, "teacher-classroom-null", "student-classroom-null", "Avery");

    const seeded = await repository.getClassroomState(roomWithManifest.room.id);
    await repository.updateClassroomState(roomWithManifest.room.id, {
      state: {
        ...seeded,
        helpRequests: [
          {
            id: "help_legacy",
            userId: "student-classroom-null",
            displayName: "Avery",
            note: null,
            status: "closed",
            createdAt: seeded.createdAt,
            updatedAt: seeded.updatedAt,
            closedByUserId: null
          }
        ]
      } as any,
      expectedVersion: seeded.version
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-classroom-null", "Avery"),
      payload: { type: "raise-hand" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().helpRequests[0].displayName).toBe("Avery");
    expect(response.json().helpRequests[0].status).toBe("raised");

    await app.close();
  });

  it("prefers request display names over stale membership ids in classroom responses", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-name");

    await app.inject({
      method: "POST",
      url: `/v1/classes/${classRecord.id}/members`,
      headers: authHeaders("teacher-classroom-name", "Ms. Rivera"),
      payload: {
        userId: "user_3DomxrOuhgf2otk9eaWiftKuGXp",
        displayName: "user_3DomxrOuhgf2otk9eaWiftKuGXp",
        role: "student",
        status: "active"
      }
    });

    const seeded = await repository.getClassroomState(roomWithManifest.room.id);
    await repository.updateClassroomState(roomWithManifest.room.id, {
      state: {
        ...seeded,
        helpRequests: [
          {
            id: "help_real_name",
            userId: "user_3DomxrOuhgf2otk9eaWiftKuGXp",
            displayName: "Avery Student",
            status: "raised",
            createdAt: seeded.createdAt,
            updatedAt: seeded.updatedAt
          }
        ]
      },
      expectedVersion: seeded.version
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-name", "Ms. Rivera")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().helpRequests[0].displayName).toBe("Avery Student");

    await app.close();
  });

  it("allows grant-scoped student wall creation on a teacher-only room even when student uploads are otherwise disabled", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-grant");
    await addStudentMember(app, classRecord.id, "teacher-classroom-grant", "student-classroom-grant", "Avery");
    const grantedAnchorId = roomWithManifest.manifest.wallAnchors[0].id;
    const blockedAnchorId = roomWithManifest.manifest.wallAnchors[1].id;

    const grant = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-grant", "Ms. Rivera"),
      payload: {
        type: "grant-board-access",
        userId: "student-classroom-grant",
        wallAnchorId: grantedAnchorId,
        allowedObjectTypes: ["image.file", "note"]
      }
    });
    expect(grant.statusCode).toBe(200);

    const attachmentAllowed = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/attachments`,
      headers: authHeaders("student-classroom-grant", "Avery"),
      payload: {
        wallAnchorId: grantedAnchorId,
        kind: "image",
        fileName: "work.png",
        contentType: "image/png",
        metadata: { sizeBytes: 1024 }
      }
    });
    expect(attachmentAllowed.statusCode).toBe(200);

    const noteAllowed = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/wall-objects`,
      headers: authHeaders("student-classroom-grant", "Avery"),
      payload: {
        wallAnchorId: grantedAnchorId,
        type: "note",
        title: "Student work",
        source: { kind: "inline", data: { text: "Answer to problem 3" } }
      }
    });
    expect(noteAllowed.statusCode).toBe(200);
    expect(noteAllowed.json().status).toBe("active");

    const noteBlocked = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/wall-objects`,
      headers: authHeaders("student-classroom-grant", "Avery"),
      payload: {
        wallAnchorId: blockedAnchorId,
        type: "note",
        title: "Wrong board",
        source: { kind: "inline", data: { text: "Should fail" } }
      }
    });
    expect(noteBlocked.statusCode).toBe(403);

    await app.close();
  });

  it("replaces a student's prior active board grant when the teacher grants a new one", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-regrant");
    await addStudentMember(app, classRecord.id, "teacher-classroom-regrant", "student-classroom-regrant", "Avery");
    const targetAnchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const firstGrant = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-regrant", "Ms. Rivera"),
      payload: {
        type: "grant-board-access",
        userId: "student-classroom-regrant",
        wallAnchorId: targetAnchorId,
        allowedObjectTypes: ["note"]
      }
    });
    expect(firstGrant.statusCode).toBe(200);

    const secondGrant = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-regrant", "Ms. Rivera"),
      payload: {
        type: "grant-board-access",
        userId: "student-classroom-regrant",
        wallAnchorId: targetAnchorId,
        allowedObjectTypes: ["image.file", "note"]
      }
    });
    expect(secondGrant.statusCode).toBe(200);

    const classroom = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-regrant", "Ms. Rivera")
    });
    expect(classroom.statusCode).toBe(200);
    expect(classroom.json().boardAccessGrants).toEqual([
      expect.objectContaining({
        userId: "student-classroom-regrant",
        status: "active",
        allowedObjectTypes: ["image.file", "note"]
      }),
      expect.objectContaining({
        userId: "student-classroom-regrant",
        status: "revoked",
        allowedObjectTypes: ["note"]
      })
    ]);

    await app.close();
  });
});
