import { Accessor, Document, NodeIO } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { RoomObjectGrabLock } from "../src/room-objects/grab-lock.js";
import { MemoryRepository } from "../src/repository";
import { putDevStoredObject } from "../src/services/storage.js";

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

function lessonConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_CLASSROOM_LESSONS: "true" } as NodeJS.ProcessEnv);
}

function breakoutPodsConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_BREAKOUT_PODS: "true" } as NodeJS.ProcessEnv);
}

function breakoutPodsLessonConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_BREAKOUT_PODS: "true", ENABLE_CLASSROOM_LESSONS: "true" } as NodeJS.ProcessEnv);
}

async function enableRoomPods(app: Awaited<ReturnType<typeof buildApp>>, roomId: string, teacherId: string) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      settings: {
        pods: {
          enabled: true,
          podRadiusMeters: 3,
          podMurmurFloor: 0.08,
          drawPartitions: false
        }
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

async function classroomAction(app: Awaited<ReturnType<typeof buildApp>>, roomId: string, actorId: string, payload: Record<string, unknown>) {
  const response = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/classroom/actions`,
    headers: authHeaders(actorId, actorId.startsWith("student") ? "Avery" : "Ms. Rivera"),
    payload
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

    const getInviteResponse = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/invite`,
      headers: authHeaders("teacher-1", "Ms. Rivera")
    });
    expect(getInviteResponse.statusCode).toBe(200);
    expect(getInviteResponse.json().code).toBe(invite.code);

    const studentGetInviteResponse = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/invite`,
      headers: authHeaders("student-1", "Avery")
    });
    expect(studentGetInviteResponse.statusCode).toBe(403);

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
        type: "document.file",
        title: "Unsupported document",
        source: { kind: "inline", data: { attachmentId: audioAttachmentId } }
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

  it("coerces legacy invalid lessonRun payloads to null on classroom reads", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: lessonConfig(),
      repository
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-legacy-lesson");

    await repository.updateClassroomState(roomWithManifest.room.id, {
      state: {
        roomId: roomWithManifest.room.id,
        version: 1,
        helpRequests: [],
        boardAccessGrants: [],
        privateChecks: [],
        groups: [],
        spotlight: null,
        lessonRun: {} as any,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-legacy-lesson", "Ms. Rivera")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().lessonRun).toBeNull();

    await app.close();
  });

  it("normalizes legacy lesson steps with null optional fields on classroom reads", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: lessonConfig(),
      repository
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-legacy-step");
    const now = new Date().toISOString();

    await repository.updateClassroomState(roomWithManifest.room.id, {
      state: {
        roomId: roomWithManifest.room.id,
        version: 1,
        helpRequests: [],
        boardAccessGrants: [],
        privateChecks: [],
        groups: [],
        spotlight: null,
        lessonRun: {
          id: "lessonrun_legacy",
          title: "Legacy lesson",
          status: "ready",
          steps: [
            {
              id: "lessonstep_legacy",
              kind: "instruction",
              title: "Instruction",
              notes: null,
              payload: { kind: "instruction", data: { body: "Read the prompt." } },
              createdAt: now,
              updatedAt: now
            }
          ],
          currentStepIndex: -1,
          timeline: [],
          createdByUserId: "teacher-classroom-legacy-step",
          createdAt: now,
          updatedAt: now
        } as any,
        createdAt: now,
        updatedAt: now
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-legacy-step", "Ms. Rivera")
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().lessonRun?.steps).toHaveLength(1);
    expect(response.json().lessonRun.steps[0].notes).toBeUndefined();

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

  it("accepts multiple private-check responses and rejects submissions while closed", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-classroom-checks");
    await addStudentMember(app, classRecord.id, "teacher-classroom-checks", "student-check-1", "Avery");
    await addStudentMember(app, classRecord.id, "teacher-classroom-checks", "student-check-2", "Jordan");

    const createCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-checks", "Ms. Rivera"),
      payload: {
        type: "create-private-check",
        question: "What is one thing you learned?",
        promptType: "short-answer"
      }
    });
    expect(createCheck.statusCode).toBe(200);
    const checkId = createCheck.json().privateChecks[0].id;

    const openCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-checks", "Ms. Rivera"),
      payload: { type: "open-private-check", checkId }
    });
    expect(openCheck.statusCode).toBe(200);

    for (const [userId, displayName, answer] of [
      ["student-check-1", "Avery", "I learned equivalent fractions."],
      ["student-check-2", "Jordan", "I learned to check the denominator."]
    ] as const) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
        headers: authHeaders(userId, displayName),
        payload: { type: "submit-private-check", checkId, answer }
      });
      expect(response.statusCode).toBe(200);
    }

    const closeCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-checks", "Ms. Rivera"),
      payload: { type: "close-private-check", checkId }
    });
    expect(closeCheck.statusCode).toBe(200);

    const closedSubmit = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-check-1", "Avery"),
      payload: { type: "submit-private-check", checkId, answer: "Trying after close." }
    });
    expect(closedSubmit.statusCode).toBe(409);

    const reopenCheck = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-classroom-checks", "Ms. Rivera"),
      payload: { type: "reopen-private-check", checkId }
    });
    expect(reopenCheck.statusCode).toBe(200);

    const updatedSubmit = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-check-1", "Avery"),
      payload: { type: "submit-private-check", checkId, answer: "Updated after reopen." }
    });
    expect(updatedSubmit.statusCode).toBe(200);

    const teacherView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("teacher-classroom-checks", "Ms. Rivera")
    });
    expect(teacherView.statusCode).toBe(200);
    expect(teacherView.json().privateChecks[0].responses).toHaveLength(2);
    expect(teacherView.json().privateChecks[0].responses).toContainEqual(
      expect.objectContaining({ userId: "student-check-1", answer: "Updated after reopen." })
    );

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

  it("teacher can position a group and then unlock it", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-group-position");

    const created = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-position", "Ms. Chen"),
      payload: { type: "create-group", label: "Blue Team", color: "#2980b9" }
    });
    const groupId = created.json().groups[0].id as string;

    const positioned = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-position", "Ms. Chen"),
      payload: {
        type: "update-group",
        groupId,
        targetPosition: { x: 2.5, y: 0, z: -1.0 },
        hold: { enabled: true, mode: "hard", radiusMeters: 2 }
      }
    });
    expect(positioned.statusCode).toBe(200);
    expect(positioned.json().groups[0].targetPosition).toEqual({ x: 2.5, y: 0, z: -1.0 });
    expect(positioned.json().groups[0].hold?.enabled).toBe(true);
    expect(positioned.json().groups[0].hold?.mode).toBe("hard");

    const unlocked = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-position", "Ms. Chen"),
      payload: {
        type: "update-group",
        groupId,
        targetPosition: null,
        hold: { enabled: false, mode: "soft", radiusMeters: 2 }
      }
    });
    expect(unlocked.statusCode).toBe(200);
    expect(unlocked.json().groups[0].targetPosition).toBeUndefined();
    expect(unlocked.json().groups[0].hold?.enabled).toBe(false);

    await app.close();
  });

  it("teacher can create, assign members to, and release a group", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-group-flow");
    await addStudentMember(app, classRecord.id, "teacher-group-flow", "student-group-1", "Morgan");
    await addStudentMember(app, classRecord.id, "teacher-group-flow", "student-group-2", "Riley");

    const created = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-flow", "Ms. Chen"),
      payload: { type: "create-group", label: "Red Team", color: "#c0392b" }
    });
    expect(created.statusCode).toBe(200);
    const groupId = created.json().groups[0].id as string;
    expect(created.json().groups[0].label).toBe("Red Team");
    expect(created.json().groups[0].color).toBe("#c0392b");
    expect(created.json().groups[0].status).toBe("active");
    expect(created.json().groups[0].memberUserIds).toHaveLength(0);

    const assigned = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-flow", "Ms. Chen"),
      payload: { type: "assign-group", groupId, memberUserIds: ["student-group-1", "student-group-2"] }
    });
    expect(assigned.statusCode).toBe(200);
    expect(assigned.json().groups[0].memberUserIds).toContain("student-group-1");
    expect(assigned.json().groups[0].memberUserIds).toContain("student-group-2");

    const released = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-flow", "Ms. Chen"),
      payload: { type: "release-group", groupId }
    });
    expect(released.statusCode).toBe(200);
    expect(released.json().groups[0].status).toBe("released");

    await app.close();
  });

  it("assign-group moves members from other active groups", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-group-move");
    await addStudentMember(app, classRecord.id, "teacher-group-move", "student-move-1", "Sasha");

    const groupA = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-move", "Ms. Rivera"),
      payload: { type: "create-group", label: "Group A", color: "#2980b9" }
    });
    const groupB = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-move", "Ms. Rivera"),
      payload: { type: "create-group", label: "Group B", color: "#27ae60" }
    });
    const groupAId = groupA.json().groups.find((g: { label: string }) => g.label === "Group A").id as string;
    const groupBId = groupB.json().groups.find((g: { label: string }) => g.label === "Group B").id as string;

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-move", "Ms. Rivera"),
      payload: { type: "assign-group", groupId: groupAId, memberUserIds: ["student-move-1"] }
    });

    const moved = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-group-move", "Ms. Rivera"),
      payload: { type: "assign-group", groupId: groupBId, memberUserIds: ["student-move-1"] }
    });
    expect(moved.statusCode).toBe(200);
    const groups = moved.json().groups as Array<{ id: string; memberUserIds: string[] }>;
    expect(groups.find((g) => g.id === groupAId)?.memberUserIds).not.toContain("student-move-1");
    expect(groups.find((g) => g.id === groupBId)?.memberUserIds).toContain("student-move-1");

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

  it("teacher can set and clear spotlight on a wall anchor", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-spotlight-flow");
    await addStudentMember(app, classRecord.id, "teacher-spotlight-flow", "student-spotlight-1", "Morgan");
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const setResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-spotlight-flow", "Ms. Rivera"),
      payload: {
        type: "set-spotlight",
        targetType: "wall-anchor",
        anchorId,
        mode: "highlight",
        title: "Look at the diagram",
        instruction: "Identify the labeled parts"
      }
    });
    expect(setResponse.statusCode).toBe(200);
    expect(setResponse.json().spotlight).toMatchObject({
      targetType: "wall-anchor",
      anchorId,
      mode: "highlight",
      title: "Look at the diagram",
      instruction: "Identify the labeled parts",
      createdByUserId: "teacher-spotlight-flow"
    });

    const studentView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("student-spotlight-1", "Morgan")
    });
    expect(studentView.statusCode).toBe(200);
    expect(studentView.json().spotlight).toMatchObject({ anchorId, mode: "highlight" });

    const clearResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-spotlight-flow", "Ms. Rivera"),
      payload: { type: "clear-spotlight" }
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json().spotlight).toBeNull();

    const afterClear = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("student-spotlight-1", "Morgan")
    });
    expect(afterClear.json().spotlight).toBeNull();

    await app.close();
  });

  it("student cannot set or clear spotlight", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "student-spotlight-reject");
    await addStudentMember(app, classRecord.id, "student-spotlight-reject", "student-spotlight-2", "Avery");
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    const setAttempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-spotlight-2", "Avery"),
      payload: { type: "set-spotlight", targetType: "wall-anchor", anchorId, mode: "guide" }
    });
    expect(setAttempt.statusCode).toBe(403);

    const clearAttempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-spotlight-2", "Avery"),
      payload: { type: "clear-spotlight" }
    });
    expect(clearAttempt.statusCode).toBe(403);

    await app.close();
  });

  it("set-spotlight without anchorId on wall-anchor target returns 400", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-spotlight-bad");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-spotlight-bad", "Ms. Rivera"),
      payload: { type: "set-spotlight", targetType: "wall-anchor", mode: "highlight" }
    });
    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("runs a lesson lifecycle with focus and private-check side effects, privacy, and conflicts", async () => {
    const app = await buildApp({
      config: lessonConfig(),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-lesson-flow");
    await addStudentMember(app, classRecord.id, "teacher-lesson-flow", "student-lesson-flow", "Avery");
    const roomId = roomWithManifest.room.id;
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    let state = await classroomAction(app, roomId, "teacher-lesson-flow", { type: "init-lesson-run", expectedVersion: 1, title: "Forces warmup" });
    state = await classroomAction(app, roomId, "teacher-lesson-flow", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "instruction",
        title: "Read the prompt",
        notes: "Teacher-only note",
        payload: { kind: "instruction", data: { body: "Read the board prompt silently." } }
      }
    });
    state = await classroomAction(app, roomId, "teacher-lesson-flow", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "focus-board",
        title: "Look at the diagram",
        payload: { kind: "focus-board", data: { anchorId, mode: "guide", title: "Diagram", instruction: "Use this diagram." } }
      }
    });
    state = await classroomAction(app, roomId, "teacher-lesson-flow", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "private-check",
        title: "Explain",
        payload: {
          kind: "private-check",
          data: { question: "What force is largest?", promptType: "short-answer", autoCloseOnAdvance: true }
        }
      }
    });
    const staleVersion = state.version;
    state = await classroomAction(app, roomId, "teacher-lesson-flow", { type: "start-lesson-run", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("running");
    expect(state.lessonRun.currentStepIndex).toBe(0);

    state = await classroomAction(app, roomId, "teacher-lesson-flow", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.currentStepIndex).toBe(1);
    expect(state.spotlight).toMatchObject({ anchorId, mode: "guide", title: "Diagram" });

    const staleAdvance = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-lesson-flow", "Ms. Rivera"),
      payload: { type: "advance-lesson-step", expectedVersion: staleVersion }
    });
    expect(staleAdvance.statusCode).toBe(409);

    state = await classroomAction(app, roomId, "teacher-lesson-flow", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.spotlight).toBeNull();
    expect(state.privateChecks[0]).toMatchObject({ question: "What force is largest?", status: "open" });

    const studentView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-lesson-flow", "Avery")
    });
    expect(studentView.statusCode).toBe(200);
    const studentState = studentView.json();
    expect(studentState.lessonRun.steps).toHaveLength(3);
    expect(studentState.lessonRun.steps[0].title).toBe("Hidden step");
    expect(studentState.lessonRun.steps[2].title).toBe("Explain");
    expect(studentState.lessonRun.steps[2].notes).toBeUndefined();
    expect(studentState.lessonRun.timeline).toEqual([]);

    const studentMutation = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-lesson-flow", "Avery"),
      payload: { type: "pause-lesson-run", expectedVersion: studentState.version }
    });
    expect(studentMutation.statusCode).toBe(403);

    state = await classroomAction(app, roomId, "teacher-lesson-flow", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("ended");
    expect(state.privateChecks[0].status).toBe("closed");

    await app.close();
  });

  it("keeps hud lesson timers active across step advancement until the run ends", async () => {
    const app = await buildApp({
      config: lessonConfig(),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-lesson-hud-timer");
    await addStudentMember(app, classRecord.id, "teacher-lesson-hud-timer", "student-lesson-hud-timer", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", { type: "init-lesson-run", expectedVersion: 1, title: "Timer overlap" });
    state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "timer",
        title: "Work time",
        payload: {
          kind: "timer",
          data: { durationSeconds: 90, label: "Independent work", placement: "hud", autoAdvanceOnComplete: false }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "instruction",
        title: "Debrief",
        payload: { kind: "instruction", data: { body: "Discuss what you noticed." } }
      }
    });

    const timerStepId = state.lessonRun.steps[0].id;
    state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", { type: "start-lesson-run", expectedVersion: state.version });
    expect(state.lessonRun.activeTimer).toMatchObject({
      stepId: timerStepId,
      title: "Work time",
      label: "Independent work",
      durationSeconds: 90,
      placement: "hud"
    });

    const studentRunningView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-lesson-hud-timer", "Avery")
    });
    expect(studentRunningView.statusCode).toBe(200);
    expect(studentRunningView.json().lessonRun.activeTimer).toMatchObject({
      stepId: timerStepId,
      label: "Independent work",
      placement: "hud"
    });

    state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("running");
    expect(state.lessonRun.currentStepIndex).toBe(1);
    expect(state.lessonRun.activeTimer).toMatchObject({
      stepId: timerStepId,
      label: "Independent work",
      placement: "hud"
    });

    const studentAdvancedView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-lesson-hud-timer", "Avery")
    });
    expect(studentAdvancedView.statusCode).toBe(200);
    expect(studentAdvancedView.json().lessonRun.activeTimer).toMatchObject({
      stepId: timerStepId,
      label: "Independent work",
      placement: "hud"
    });

    state = await classroomAction(app, roomId, "teacher-lesson-hud-timer", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("ended");
    expect(state.lessonRun.activeTimer).toBeNull();

    await app.close();
  });

  it("orchestrates group, student-share, timer cleanup, and focus drift", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: lessonConfig(),
      repository
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-lesson-effects");
    await addStudentMember(app, classRecord.id, "teacher-lesson-effects", "student-lesson-effects", "Avery");
    const roomId = roomWithManifest.room.id;
    const [firstAnchor, secondAnchor] = roomWithManifest.manifest.wallAnchors;

    let state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "init-lesson-run", expectedVersion: 1, title: "Effects" });
    for (const step of [
      {
        kind: "focus-board",
        title: "Original focus",
        payload: { kind: "focus-board", data: { anchorId: firstAnchor.id, mode: "highlight" } }
      },
      {
        kind: "group-work",
        title: "Team work",
        payload: {
          kind: "group-work",
          data: {
            newGroup: {
              label: "Team A",
              color: "#389060",
              memberUserIds: ["student-lesson-effects"],
              targetWallAnchorId: secondAnchor.id,
              hold: { enabled: true, mode: "hard", radiusMeters: 2.5 }
            },
            releaseOnAdvance: true
          }
        }
      },
      {
        kind: "student-share",
        title: "Avery shares",
        payload: { kind: "student-share", data: { userId: "student-lesson-effects", wallAnchorId: firstAnchor.id, allowedObjectTypes: ["note"], revokeOnAdvance: true } }
      },
      {
        kind: "timer",
        title: "Wall timer",
        payload: { kind: "timer", data: { durationSeconds: 30, label: "Share timer", placement: "wall", wallAnchorId: secondAnchor.id } }
      },
      {
        kind: "instruction",
        title: "Wrap up",
        payload: { kind: "instruction", data: { body: "Summarize the share-out." } }
      }
    ]) {
      state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "add-lesson-step", expectedVersion: state.version, step });
    }

    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "start-lesson-run", expectedVersion: state.version });
    expect(state.spotlight.anchorId).toBe(firstAnchor.id);

    state = await classroomAction(app, roomId, "teacher-lesson-effects", {
      type: "set-spotlight",
      expectedVersion: state.version,
      targetType: "wall-anchor",
      anchorId: secondAnchor.id,
      mode: "guide"
    });
    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.timeline[0]).toMatchObject({ drifted: true });
    expect(state.groups[0]).toMatchObject({
      label: "Team A",
      status: "active",
      memberUserIds: ["student-lesson-effects"],
      targetWallAnchorId: secondAnchor.id,
      hold: { enabled: true, mode: "hard", radiusMeters: 2.5 }
    });
    expect(state.groups[0].targetPosition).toBeTruthy();

    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.groups[0].status).toBe("released");
    expect(state.boardAccessGrants[0]).toMatchObject({ userId: "student-lesson-effects", status: "active", wallAnchorId: firstAnchor.id });

    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.boardAccessGrants[0].status).toBe("revoked");
    const wallTimers = await repository.listWallObjects(roomId, { includeRemoved: true });
    expect(wallTimers.some((object) => object.type === "timer" && object.status === "active")).toBe(true);
    expect(state.lessonRun.activeTimer).toMatchObject({ placement: "wall", wallAnchorId: secondAnchor.id, label: "Share timer" });

    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("running");
    expect(state.lessonRun.currentStepIndex).toBe(4);
    expect(state.lessonRun.activeTimer).toMatchObject({ placement: "wall", wallAnchorId: secondAnchor.id, label: "Share timer" });
    const duringWrapTimers = await repository.listWallObjects(roomId, { includeRemoved: true });
    expect(duringWrapTimers.some((object) => object.type === "timer" && object.status === "active")).toBe(true);

    state = await classroomAction(app, roomId, "teacher-lesson-effects", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.lessonRun.status).toBe("ended");
    expect(state.lessonRun.activeTimer).toBeNull();
    const afterEndTimers = await repository.listWallObjects(roomId, { includeRemoved: true });
    expect(afterEndTimers.some((object) => object.type === "timer" && object.status === "removed")).toBe(true);

    await app.close();
  });

  it("exit-ticket step creates 3 open private checks with correct shape when includeConfidence and whatsNext are set", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-exit-ticket");
    await addStudentMember(app, classRecord.id, "teacher-exit-ticket", "student-exit-ticket", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-exit-ticket", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-exit-ticket", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "End of class reflection",
        payload: {
          kind: "exit-ticket",
          data: {
            reflectionPrompt: "What was the muddiest point today?",
            includeConfidence: true,
            whatsNext: {
              question: "What would help you most next class?",
              choices: [
                { id: "c1", label: "More practice problems" },
                { id: "c2", label: "Review the concept again" },
                { id: "c3", label: "Move on to the next topic" }
              ]
            },
            requiredToEnd: false,
            autoCloseOnAdvance: true
          }
        }
      }
    });

    state = await classroomAction(app, roomId, "teacher-exit-ticket", { type: "start-lesson-run", expectedVersion: state.version });

    expect(state.privateChecks).toHaveLength(3);
    const shortAnswer = state.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer");
    const confidence = state.privateChecks.find((c: { promptType: string }) => c.promptType === "confidence");
    const multiChoice = state.privateChecks.find((c: { promptType: string }) => c.promptType === "multiple-choice");

    expect(shortAnswer).toBeDefined();
    expect(shortAnswer.question).toBe("What was the muddiest point today?");
    expect(shortAnswer.status).toBe("open");
    expect(shortAnswer.visibility).toBe("teacher-only");
    expect(shortAnswer.target.kind).toBe("all");

    expect(confidence).toBeDefined();
    expect(confidence.question).toBe("How confident do you feel about today's material?");
    expect(confidence.status).toBe("open");
    expect(confidence.visibility).toBe("teacher-only");
    expect(confidence.target.kind).toBe("all");

    expect(multiChoice).toBeDefined();
    expect(multiChoice.question).toBe("What would help you most next class?");
    expect(multiChoice.choices).toHaveLength(3);
    expect(multiChoice.status).toBe("open");
    expect(multiChoice.visibility).toBe("teacher-only");
    expect(multiChoice.target.kind).toBe("all");

    const record = state.lessonRun.timeline[state.lessonRun.timeline.length - 1];
    expect(record.createdExitTicket.reflectionCheckId).toBe(shortAnswer.id);
    expect(record.createdExitTicket.confidenceCheckId).toBe(confidence.id);
    expect(record.createdExitTicket.whatsNextCheckId).toBe(multiChoice.id);

    await app.close();
  });

  it("exit-ticket step without whatsNext creates only 2 checks; without confidence creates only 1", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-exit-ticket-min");
    await addStudentMember(app, classRecord.id, "teacher-exit-ticket-min", "student-exit-ticket-min", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-exit-ticket-min", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-exit-ticket-min", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Minimal exit ticket",
        payload: {
          kind: "exit-ticket",
          data: {
            reflectionPrompt: "One word: how do you feel?",
            includeConfidence: false,
            autoCloseOnAdvance: true
          }
        }
      }
    });

    state = await classroomAction(app, roomId, "teacher-exit-ticket-min", { type: "start-lesson-run", expectedVersion: state.version });

    expect(state.privateChecks).toHaveLength(1);
    expect(state.privateChecks[0].promptType).toBe("short-answer");
    expect(state.privateChecks[0].status).toBe("open");

    await app.close();
  });

  it("exit-ticket checks are visible to students and student responses are filtered", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-exit-privacy");
    await addStudentMember(app, classRecord.id, "teacher-exit-privacy", "student-exit-privacy", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-exit-privacy", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-exit-privacy", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Privacy test",
        payload: {
          kind: "exit-ticket",
          data: { reflectionPrompt: "What did you learn?", includeConfidence: true, autoCloseOnAdvance: true }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-exit-privacy", { type: "start-lesson-run", expectedVersion: state.version });

    const reflectionId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer")?.id;
    const confidenceId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "confidence")?.id;

    await classroomAction(app, roomId, "student-exit-privacy", { type: "submit-private-check", checkId: reflectionId, answer: "I learned a lot." });
    await classroomAction(app, roomId, "student-exit-privacy", { type: "submit-private-check", checkId: confidenceId, confidence: 4 });

    const studentView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-exit-privacy", "Avery")
    });
    expect(studentView.statusCode).toBe(200);
    const studentChecks = studentView.json().privateChecks;
    expect(studentChecks).toHaveLength(2);
    const studentReflection = studentChecks.find((c: { promptType: string }) => c.promptType === "short-answer");
    expect(studentReflection.responses).toHaveLength(1);
    expect(studentReflection.responses[0].answer).toBe("I learned a lot.");

    const teacherView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("teacher-exit-privacy", "Ms. Rivera")
    });
    expect(teacherView.statusCode).toBe(200);
    const teacherChecks = teacherView.json().privateChecks;
    const teacherReflection = teacherChecks.find((c: { promptType: string }) => c.promptType === "short-answer");
    expect(teacherReflection.responses).toHaveLength(1);
    expect(teacherReflection.responses[0].userId).toBe("student-exit-privacy");

    await app.close();
  });

  it("exit-ticket autoCloseOnAdvance closes all 3 checks when the step completes", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-exit-cleanup");
    await addStudentMember(app, classRecord.id, "teacher-exit-cleanup", "student-exit-cleanup", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-exit-cleanup", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-exit-cleanup", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Cleanup test",
        payload: {
          kind: "exit-ticket",
          data: {
            reflectionPrompt: "Final thoughts?",
            includeConfidence: true,
            whatsNext: { question: "Next?", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
            autoCloseOnAdvance: true
          }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-exit-cleanup", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: { kind: "instruction", title: "Done", payload: { kind: "instruction", data: { body: "" } } }
    });

    state = await classroomAction(app, roomId, "teacher-exit-cleanup", { type: "start-lesson-run", expectedVersion: state.version });
    expect(state.privateChecks.filter((c: { status: string }) => c.status === "open")).toHaveLength(3);

    state = await classroomAction(app, roomId, "teacher-exit-cleanup", { type: "advance-lesson-step", expectedVersion: state.version });
    expect(state.privateChecks.filter((c: { status: string }) => c.status === "open")).toHaveLength(0);
    expect(state.privateChecks.filter((c: { status: string }) => c.status === "closed")).toHaveLength(3);

    await app.close();
  });

  it("end-lesson-run with requiredToEnd exit ticket and unsubmitted student returns 409 exit-ticket-incomplete", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-et-gate");
    await addStudentMember(app, classRecord.id, "teacher-et-gate", "student-et-gate", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-et-gate", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-et-gate", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Required exit ticket",
        payload: {
          kind: "exit-ticket",
          data: { reflectionPrompt: "What did you learn?", includeConfidence: false, requiredToEnd: true, autoCloseOnAdvance: false }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-et-gate", { type: "start-lesson-run", expectedVersion: state.version });

    const endAttempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-et-gate", "Ms. Rivera"),
      payload: { type: "end-lesson-run", force: false }
    });
    expect(endAttempt.statusCode).toBe(409);
    expect(endAttempt.json().error).toBe("exit-ticket-incomplete");
    expect(endAttempt.json().missingUserIds).toContain("student-et-gate");
    expect(endAttempt.json().submittedCount).toBe(0);
    expect(endAttempt.json().expectedCount).toBe(1);
    expect(endAttempt.json().stepId).toBeDefined();

    await app.close();
  });

  it("end-lesson-run with force: true bypasses exit-ticket gate and ends the lesson", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-et-force");
    await addStudentMember(app, classRecord.id, "teacher-et-force", "student-et-force", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-et-force", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-et-force", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Required exit ticket",
        payload: {
          kind: "exit-ticket",
          data: { reflectionPrompt: "Summary?", includeConfidence: false, requiredToEnd: true, autoCloseOnAdvance: false }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-et-force", { type: "start-lesson-run", expectedVersion: state.version });

    const forceEnd = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-et-force", "Ms. Rivera"),
      payload: { type: "end-lesson-run", force: true }
    });
    expect(forceEnd.statusCode).toBe(200);
    expect(forceEnd.json().lessonRun.status).toBe("ended");

    await app.close();
  });

  it("end-lesson-run succeeds without force once all students have submitted the exit ticket", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-et-submitted");
    await addStudentMember(app, classRecord.id, "teacher-et-submitted", "student-et-submitted", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-et-submitted", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-et-submitted", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Required exit ticket",
        payload: {
          kind: "exit-ticket",
          data: { reflectionPrompt: "What did you learn?", includeConfidence: false, requiredToEnd: true, autoCloseOnAdvance: false }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-et-submitted", { type: "start-lesson-run", expectedVersion: state.version });

    const reflectionId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer")?.id;
    await classroomAction(app, roomId, "student-et-submitted", { type: "submit-private-check", checkId: reflectionId, answer: "Everything!" });

    const endResult = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-et-submitted", "Ms. Rivera"),
      payload: { type: "end-lesson-run", force: false }
    });
    expect(endResult.statusCode).toBe(200);
    expect(endResult.json().lessonRun.status).toBe("ended");

    await app.close();
  });

  it("abandon-lesson-run always succeeds regardless of exit-ticket gate", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-et-abandon");
    await addStudentMember(app, classRecord.id, "teacher-et-abandon", "student-et-abandon", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-et-abandon", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-et-abandon", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Required exit ticket",
        payload: {
          kind: "exit-ticket",
          data: { reflectionPrompt: "Reflect.", includeConfidence: false, requiredToEnd: true, autoCloseOnAdvance: false }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-et-abandon", { type: "start-lesson-run", expectedVersion: state.version });

    const abandonResult = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-et-abandon", "Ms. Rivera"),
      payload: { type: "abandon-lesson-run" }
    });
    expect(abandonResult.statusCode).toBe(200);
    expect(abandonResult.json().lessonRun.status).toBe("abandoned");

    await app.close();
  });

  it("recap GET returns correct attendance, check counts, and exit ticket section", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-recap");
    await addStudentMember(app, classRecord.id, "teacher-recap", "student-recap-1", "Avery");
    await addStudentMember(app, classRecord.id, "teacher-recap", "student-recap-2", "Blake");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-recap", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-recap", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Reflection",
        payload: {
          kind: "exit-ticket",
          data: {
            reflectionPrompt: "What did you learn?",
            includeConfidence: true,
            whatsNext: { question: "Next?", choices: [{ id: "a", label: "A" }, { id: "b", label: "B" }] },
            requiredToEnd: false,
            autoCloseOnAdvance: false
          }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-recap", { type: "start-lesson-run", expectedVersion: state.version });

    const reflectionId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer")?.id;
    const confidenceId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "confidence")?.id;
    const whatsNextId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "multiple-choice")?.id;

    await classroomAction(app, roomId, "student-recap-1", { type: "submit-private-check", checkId: reflectionId, answer: "I learned loops." });
    await classroomAction(app, roomId, "student-recap-1", { type: "submit-private-check", checkId: confidenceId, confidence: 4 });
    await classroomAction(app, roomId, "student-recap-1", { type: "submit-private-check", checkId: whatsNextId, choiceId: "a" });

    state = await classroomAction(app, roomId, "teacher-recap", { type: "end-lesson-run", force: true });
    const runId = state.lessonRun.id;

    const recapRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/lesson-runs/${runId}/recap`,
      headers: authHeaders("teacher-recap", "Ms. Rivera")
    });
    expect(recapRes.statusCode).toBe(200);
    const recap = recapRes.json();

    expect(recap.lessonRunId).toBe(runId);
    expect(recap.attendance.total).toBe(2);
    expect(recap.attendance.knownParticipantIds).toContain("student-recap-1");
    expect(recap.attendance.knownParticipantIds).toContain("student-recap-2");

    expect(recap.steps).toHaveLength(1);
    expect(recap.steps[0].kind).toBe("exit-ticket");
    expect(recap.steps[0].drifted).toBe(false);

    expect(recap.privateChecks).toHaveLength(3);
    const reflectionSummary = recap.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer");
    expect(reflectionSummary.responseCount).toBe(1);
    const confidenceSummary = recap.privateChecks.find((c: { promptType: string }) => c.promptType === "confidence");
    expect(confidenceSummary.confidenceAverage).toBe(4);

    expect(recap.exitTicket).toBeDefined();
    expect(recap.exitTicket.submittedCount).toBe(1);
    expect(recap.exitTicket.expectedCount).toBe(2);
    expect(recap.exitTicket.confidenceAverage).toBe(4);
    expect(recap.exitTicket.reflections).toHaveLength(1);
    expect(recap.exitTicket.reflections[0].answer).toBe("I learned loops.");
    expect(recap.exitTicket.reflections[0].confidence).toBe(4);
    expect(recap.exitTicket.reflections[0].whatsNextChoiceId).toBe("a");

    await app.close();
  });

  it("recap GET returns 403 for students", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-recap-authz");
    await addStudentMember(app, classRecord.id, "teacher-recap-authz", "student-recap-authz", "Avery");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-recap-authz", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-recap-authz", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: { kind: "instruction", title: "Intro", payload: { kind: "instruction", data: { body: "" } } }
    });
    state = await classroomAction(app, roomId, "teacher-recap-authz", { type: "start-lesson-run", expectedVersion: state.version });
    state = await classroomAction(app, roomId, "teacher-recap-authz", { type: "end-lesson-run", force: true });
    const runId = state.lessonRun.id;

    const studentRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/lesson-runs/${runId}/recap`,
      headers: authHeaders("student-recap-authz", "Avery")
    });
    expect(studentRes.statusCode).toBe(403);

    await app.close();
  });

  it("recap GET with ?format=csv returns text/csv starting with the documented header", async () => {
    const app = await buildApp({ config: lessonConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-recap-csv");
    await addStudentMember(app, classRecord.id, "teacher-recap-csv", "student-recap-csv-1", "Avery");
    await addStudentMember(app, classRecord.id, "teacher-recap-csv", "student-recap-csv-2", "Blake");
    const roomId = roomWithManifest.room.id;

    let state = await classroomAction(app, roomId, "teacher-recap-csv", { type: "init-lesson-run", expectedVersion: 1 });
    state = await classroomAction(app, roomId, "teacher-recap-csv", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "exit-ticket",
        title: "Reflection",
        payload: {
          kind: "exit-ticket",
          data: {
            reflectionPrompt: "Summary?",
            includeConfidence: true,
            whatsNext: {
              question: "What's next?",
              choices: [
                { id: "choice-1", label: "Review tomorrow" },
                { id: "choice-2", label: "Move on" }
              ]
            },
            requiredToEnd: false,
            autoCloseOnAdvance: false
          }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-recap-csv", { type: "start-lesson-run", expectedVersion: state.version });

    const reflectionId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "short-answer")?.id;
    const confidenceId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "confidence")?.id;
    const whatsNextId = state.privateChecks.find((c: { promptType: string }) => c.promptType === "multiple-choice")?.id;
    await classroomAction(app, roomId, "student-recap-csv-1", { type: "submit-private-check", checkId: reflectionId, answer: 'He said "hello".' });
    await classroomAction(app, roomId, "student-recap-csv-1", { type: "submit-private-check", checkId: confidenceId, confidence: 5 });
    await classroomAction(app, roomId, "student-recap-csv-1", { type: "submit-private-check", checkId: whatsNextId, choiceId: "choice-1" });

    state = await classroomAction(app, roomId, "teacher-recap-csv", { type: "end-lesson-run", force: true });
    const runId = state.lessonRun.id;

    const csvRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/lesson-runs/${runId}/recap?format=csv`,
      headers: authHeaders("teacher-recap-csv", "Ms. Rivera")
    });
    expect(csvRes.statusCode).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    const body = csvRes.body;
    expect(body.startsWith("userId,displayName,reflection,confidence,whatsNextChoiceId,submittedAt")).toBe(true);
    const lines = body.trim().split("\n");
    expect(lines).toHaveLength(3);
    const submitterLine = lines.find((l: string) => l.includes("student-recap-csv-1"))!;
    expect(submitterLine).toBeDefined();
    expect(submitterLine).toContain('"He said ""hello""."');
    expect(submitterLine).toContain('"5"');
    expect(submitterLine).toContain('"Review tomorrow"');
    expect(submitterLine).not.toContain('"choice-1"');
    const nonSubmitterLine = lines.find((l: string) => l.includes("student-recap-csv-2"))!;
    expect(nonSubmitterLine).toBeDefined();

    await app.close();
  });

  it("teacher can lock and unlock reactions; GET classroom reflects the value", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-reactions-lock");
    await addStudentMember(app, classRecord.id, "teacher-reactions-lock", "student-reactions-1", "Sam");

    const lockResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-reactions-lock", "Ms. Rivera"),
      payload: { type: "set-reactions-locked", locked: true }
    });
    expect(lockResponse.statusCode).toBe(200);
    expect(lockResponse.json().reactionsLocked).toBe(true);

    const studentView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom`,
      headers: authHeaders("student-reactions-1", "Sam")
    });
    expect(studentView.statusCode).toBe(200);
    expect(studentView.json().reactionsLocked).toBe(true);

    const unlockResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-reactions-lock", "Ms. Rivera"),
      payload: { type: "set-reactions-locked", locked: false }
    });
    expect(unlockResponse.statusCode).toBe(200);
    expect(unlockResponse.json().reactionsLocked).toBe(false);

    await app.close();
  });

  it("student cannot lock reactions", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "student-reactions-reject");
    await addStudentMember(app, classRecord.id, "student-reactions-reject", "student-reactions-2", "Avery");

    const attempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-reactions-2", "Avery"),
      payload: { type: "set-reactions-locked", locked: true }
    });
    expect(attempt.statusCode).toBe(403);

    await app.close();
  });

  it("teacher can update whisper settings and change persists", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-whisper-settings");
    await addStudentMember(app, classRecord.id, "teacher-whisper-settings", "student-whisper-1", "Sam");

    const enableRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-whisper-settings", "Ms. Rivera"),
      payload: { type: "update-whisper-settings", allowed: true, maxRadiusMeters: 5 }
    });
    expect(enableRes.statusCode).toBe(200);
    expect(enableRes.json().whisper?.allowed).toBe(true);
    expect(enableRes.json().whisper?.maxRadiusMeters).toBe(5);
    expect(enableRes.json().whisper?.autoEnableInGroupWork).toBe(true);

    const disableRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-whisper-settings", "Ms. Rivera"),
      payload: { type: "update-whisper-settings", allowed: false }
    });
    expect(disableRes.statusCode).toBe(200);
    expect(disableRes.json().whisper?.allowed).toBe(false);
    expect(disableRes.json().whisper?.maxRadiusMeters).toBe(5);

    await app.close();
  });

  it("student cannot update whisper settings", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "student-whisper-reject");
    await addStudentMember(app, classRecord.id, "student-whisper-reject", "student-whisper-2", "Avery");

    const attempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("student-whisper-2", "Avery"),
      payload: { type: "update-whisper-settings", allowed: true }
    });
    expect(attempt.statusCode).toBe(403);

    await app.close();
  });

  it("manages pods runtime, enforces teacher-only access, and filters broadcast visibility for students", async () => {
    const app = await buildApp({
      config: breakoutPodsConfig(),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-pods-runtime");
    await addStudentMember(app, classRecord.id, "teacher-pods-runtime", "student-pods-a", "Avery");
    await addStudentMember(app, classRecord.id, "teacher-pods-runtime", "student-pods-b", "Sam");
    const roomId = roomWithManifest.room.id;

    await enableRoomPods(app, roomId, "teacher-pods-runtime");

    const initialView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("teacher-pods-runtime", "Ms. Rivera")
    });
    expect(initialView.statusCode).toBe(200);
    expect(initialView.json().podsRuntime).toEqual({
      podsEnabled: false,
      broadcastFromUserIds: []
    });

    const invalidToggle = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-pods-runtime", "Ms. Rivera"),
      payload: { type: "toggle-pods", enabled: true }
    });
    expect(invalidToggle.statusCode).toBe(422);

    const groupState = await classroomAction(app, roomId, "teacher-pods-runtime", {
      type: "create-group",
      label: "Pod A",
      color: "#389060",
      memberUserIds: ["student-pods-a"],
      targetPosition: { x: 2, y: 0, z: 2 },
      status: "active"
    });
    const groupId = groupState.groups[0].id;

    const toggledState = await classroomAction(app, roomId, "teacher-pods-runtime", {
      type: "toggle-pods",
      expectedVersion: groupState.version,
      enabled: true
    });
    expect(toggledState.podsRuntime).toEqual({
      podsEnabled: true,
      broadcastFromUserIds: []
    });

    const studentToggle = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-pods-a", "Avery"),
      payload: { type: "toggle-pods", enabled: false }
    });
    expect(studentToggle.statusCode).toBe(403);

    const broadcastState = await classroomAction(app, roomId, "teacher-pods-runtime", {
      type: "set-student-broadcast",
      expectedVersion: toggledState.version,
      userId: "student-pods-a",
      enabled: true
    });
    expect(broadcastState.groups.find((group: { id: string }) => group.id === groupId)?.memberUserIds).toEqual(["student-pods-a"]);
    expect(broadcastState.podsRuntime.broadcastFromUserIds).toEqual(["student-pods-a"]);

    const studentABody = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-pods-a", "Avery")
    });
    expect(studentABody.statusCode).toBe(200);
    expect(studentABody.json().podsRuntime).toEqual({
      podsEnabled: true,
      broadcastFromUserIds: ["student-pods-a"]
    });

    const studentBBody = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("student-pods-b", "Sam")
    });
    expect(studentBBody.statusCode).toBe(200);
    expect(studentBBody.json().podsRuntime).toEqual({
      podsEnabled: true,
      broadcastFromUserIds: []
    });

    const invalidBroadcast = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-pods-runtime", "Ms. Rivera"),
      payload: {
        type: "set-student-broadcast",
        expectedVersion: broadcastState.version,
        userId: "student-pods-b",
        enabled: true
      }
    });
    expect(invalidBroadcast.statusCode).toBe(422);

    await app.close();
  });

  it("auto-enables pods for group-work steps when the room is configured for pods", async () => {
    const app = await buildApp({
      config: breakoutPodsLessonConfig(),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-pods-lesson-group");
    await addStudentMember(app, classRecord.id, "teacher-pods-lesson-group", "student-pods-group", "Avery");
    const roomId = roomWithManifest.room.id;

    await enableRoomPods(app, roomId, "teacher-pods-lesson-group");

    let state = await classroomAction(app, roomId, "teacher-pods-lesson-group", {
      type: "init-lesson-run",
      expectedVersion: 1,
      title: "Pods lesson"
    });
    state = await classroomAction(app, roomId, "teacher-pods-lesson-group", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "group-work",
        title: "Collaborate",
        payload: {
          kind: "group-work",
          data: {
            newGroup: {
              label: "Pod A",
              color: "#389060",
              memberUserIds: ["student-pods-group"],
              targetPosition: { x: 3, y: 0, z: 3 }
            },
            releaseOnAdvance: false
          }
        }
      }
    });
    state = await classroomAction(app, roomId, "teacher-pods-lesson-group", {
      type: "add-lesson-step",
      expectedVersion: state.version,
      step: {
        kind: "instruction",
        title: "Debrief",
        payload: { kind: "instruction", data: { body: "Discuss the work." } }
      }
    });

    state = await classroomAction(app, roomId, "teacher-pods-lesson-group", {
      type: "start-lesson-run",
      expectedVersion: state.version
    });
    expect(state.podsRuntime.podsEnabled).toBe(true);
    expect(state.lessonRun.timeline[0].emittedActionIds).toContain("toggle-pods");

    state = await classroomAction(app, roomId, "teacher-pods-lesson-group", {
      type: "advance-lesson-step",
      expectedVersion: state.version
    });
    expect(state.lessonRun.currentStepIndex).toBe(1);
    expect(state.podsRuntime.podsEnabled).toBe(true);

    await app.close();
  });

  it("temporarily disables pods for student-share steps and restores them on advance", async () => {
    const app = await buildApp({
      config: breakoutPodsLessonConfig(),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-pods-lesson-share");
    await addStudentMember(app, classRecord.id, "teacher-pods-lesson-share", "student-pods-share", "Avery");
    const roomId = roomWithManifest.room.id;
    const anchorId = roomWithManifest.manifest.wallAnchors[0].id;

    await enableRoomPods(app, roomId, "teacher-pods-lesson-share");

    let state = await classroomAction(app, roomId, "teacher-pods-lesson-share", {
      type: "init-lesson-run",
      expectedVersion: 1,
      title: "Pods share"
    });
    for (const step of [
      {
        kind: "group-work",
        title: "Collaborate",
        payload: {
          kind: "group-work",
          data: {
            newGroup: {
              label: "Pod A",
              color: "#389060",
              memberUserIds: ["student-pods-share"],
              targetPosition: { x: 4, y: 0, z: 4 }
            },
            releaseOnAdvance: false
          }
        }
      },
      {
        kind: "student-share",
        title: "Share out",
        payload: {
          kind: "student-share",
          data: {
            userId: "student-pods-share",
            wallAnchorId: anchorId,
            allowedObjectTypes: ["note"],
            revokeOnAdvance: true
          }
        }
      },
      {
        kind: "instruction",
        title: "Wrap",
        payload: { kind: "instruction", data: { body: "Close the discussion." } }
      }
    ]) {
      state = await classroomAction(app, roomId, "teacher-pods-lesson-share", {
        type: "add-lesson-step",
        expectedVersion: state.version,
        step
      });
    }

    state = await classroomAction(app, roomId, "teacher-pods-lesson-share", {
      type: "start-lesson-run",
      expectedVersion: state.version
    });
    expect(state.podsRuntime.podsEnabled).toBe(true);

    state = await classroomAction(app, roomId, "teacher-pods-lesson-share", {
      type: "advance-lesson-step",
      expectedVersion: state.version
    });
    expect(state.lessonRun.currentStepIndex).toBe(1);
    expect(state.podsRuntime.podsEnabled).toBe(false);
    expect(state.lessonRun.timeline[1].emittedActionIds).toContain("toggle-pods");

    state = await classroomAction(app, roomId, "teacher-pods-lesson-share", {
      type: "advance-lesson-step",
      expectedVersion: state.version
    });
    expect(state.lessonRun.currentStepIndex).toBe(2);
    expect(state.podsRuntime.podsEnabled).toBe(true);
    expect(state.lessonRun.timeline[1].emittedActionIds.filter((actionId: string) => actionId === "toggle-pods")).toHaveLength(2);

    await app.close();
  });

  it("returns 404 for pod actions when the feature flag is off", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-pods-disabled");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-pods-disabled", "Ms. Rivera"),
      payload: { type: "toggle-pods", enabled: true }
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("returns 404 for lesson actions when the feature flag is off", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-lesson-disabled");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/classroom/actions`,
      headers: authHeaders("teacher-lesson-disabled", "Ms. Rivera"),
      payload: { type: "init-lesson-run", expectedVersion: 1, title: "Hidden" }
    });
    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("hall pass: request → approve → return records a hallpass.completed.v1 RoomEvent with positive durationSeconds", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-hallpass-1");
    await addStudentMember(app, classRecord.id, "teacher-hallpass-1", "student-hp-1", "Avery");
    const roomId = roomWithManifest.room.id;

    const requestRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-1", "Avery"),
      payload: { type: "request-hallpass" }
    });
    expect(requestRes.statusCode).toBe(200);
    const requestState = requestRes.json();
    const passId = requestState.helpRequests.find((r: { kind: string }) => r.kind === "hallpass")?.id;
    expect(passId).toBeDefined();

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-hallpass-1", "Ms. Rivera"),
      payload: { type: "approve-hallpass", requestId: passId }
    });
    expect(approveRes.statusCode).toBe(200);

    const returnRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-1", "Avery"),
      payload: { type: "return-from-hallpass" }
    });
    expect(returnRes.statusCode).toBe(200);
    const returnState = returnRes.json();
    const closedPass = returnState.helpRequests.find((r: { kind: string; status: string }) => r.kind === "hallpass" && r.status === "closed");
    expect(closedPass).toBeDefined();
    expect(closedPass.durationSeconds).toBeGreaterThanOrEqual(0);

    const events = repository.listRoomEvents(roomId);
    const hallpassEvent = events.find((e) => e.type === "hallpass.completed.v1");
    expect(hallpassEvent).toBeDefined();
    expect(hallpassEvent!.payload.durationSeconds).toBeGreaterThanOrEqual(0);
    expect(hallpassEvent!.payload.userId).toBe("student-hp-1");

    await app.close();
  });

  it("hall pass: approving above maxConcurrent returns 400", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-hallpass-2");
    await addStudentMember(app, classRecord.id, "teacher-hallpass-2", "student-hp-2a", "Sam");
    await addStudentMember(app, classRecord.id, "teacher-hallpass-2", "student-hp-2b", "Lee");
    const roomId = roomWithManifest.room.id;

    // Both students request; default maxConcurrent = 1
    const req1 = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-2a", "Sam"),
      payload: { type: "request-hallpass" }
    });
    expect(req1.statusCode).toBe(200);
    const pass1Id = req1.json().helpRequests.find((r: { kind: string }) => r.kind === "hallpass")?.id;

    const req2 = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-2b", "Lee"),
      payload: { type: "request-hallpass" }
    });
    expect(req2.statusCode).toBe(200);
    // Teacher view to get pass 2 id
    const teacherView = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/classroom`,
      headers: authHeaders("teacher-hallpass-2", "Ms. Rivera")
    });
    const pass2Id = teacherView.json().helpRequests.find((r: { kind: string; id: string }) => r.kind === "hallpass" && r.id !== pass1Id)?.id;

    // Approve first — should succeed
    const approve1 = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-hallpass-2", "Ms. Rivera"),
      payload: { type: "approve-hallpass", requestId: pass1Id }
    });
    expect(approve1.statusCode).toBe(200);

    // Approve second — should fail (maxConcurrent = 1)
    const approve2 = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("teacher-hallpass-2", "Ms. Rivera"),
      payload: { type: "approve-hallpass", requestId: pass2Id }
    });
    expect(approve2.statusCode).toBe(400);

    await app.close();
  });

  it("hall pass: student cannot approve a hall pass", async () => {
    const app = await buildApp({
      config: loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-hallpass-3");
    await addStudentMember(app, classRecord.id, "teacher-hallpass-3", "student-hp-3", "Jordan");
    const roomId = roomWithManifest.room.id;

    const requestRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-3", "Jordan"),
      payload: { type: "request-hallpass" }
    });
    expect(requestRes.statusCode).toBe(200);
    const passId = requestRes.json().helpRequests.find((r: { kind: string }) => r.kind === "hallpass")?.id;

    const approveAttempt = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/classroom/actions`,
      headers: authHeaders("student-hp-3", "Jordan"),
      payload: { type: "approve-hallpass", requestId: passId }
    });
    expect(approveAttempt.statusCode).toBe(403);

    await app.close();
  });
});

function roomObjectsConfig() {
  return loadConfig({ NODE_ENV: "test", ENABLE_ROOM_OBJECTS: "true" } as NodeJS.ProcessEnv);
}

async function enableRoomObjects(app: Awaited<ReturnType<typeof buildApp>>, roomId: string, teacherId: string, overrides: Record<string, unknown> = {}) {
  const response = await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(teacherId, "Ms. Rivera"),
    payload: {
      settings: {
        roomObjects: {
          enabled: true,
          maxActive: 8,
          customUploadsEnabled: false,
          maxUploadSizeBytes: 8 * 1024 * 1024,
          defaultTouchPolicy: "teacher-only",
          ...overrides
        }
      }
    }
  });
  expect(response.statusCode).toBe(200);
  return response.json();
}

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(0, 8 + data.length);
  return chunk;
}

function createPng(width: number, height: number) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([signature, pngChunk("IHDR", ihdr), pngChunk("IEND", Buffer.alloc(0))]);
}

async function createTinyGlb(options: { triangleCount?: number; texturePng?: Buffer } = {}) {
  const triangleCount = options.triangleCount ?? 1;
  const document = new Document();
  const buffer = document.createBuffer("geometry");
  const positions = new Float32Array(triangleCount * 9);
  const uvs = options.texturePng ? new Float32Array(triangleCount * 6) : undefined;

  for (let index = 0; index < triangleCount; index += 1) {
    const positionOffset = index * 9;
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0], positionOffset);
    if (uvs) {
      uvs.set([0, 0, 1, 0, 0, 1], index * 6);
    }
  }

  const primitive = document.createPrimitive().setAttribute(
    "POSITION",
    document.createAccessor("positions", buffer).setType(Accessor.Type.VEC3).setArray(positions)
  );

  if (uvs && options.texturePng) {
    primitive.setAttribute(
      "TEXCOORD_0",
      document.createAccessor("uvs", buffer).setType(Accessor.Type.VEC2).setArray(uvs)
    );
    const texture = document.createTexture("albedo").setImage(new Uint8Array(options.texturePng)).setMimeType("image/png");
    const material = document.createMaterial("material").setBaseColorTexture(texture);
    primitive.setMaterial(material);
  }

  const mesh = document.createMesh("mesh").addPrimitive(primitive);
  const node = document.createNode("node").setMesh(mesh);
  document.createScene("scene").addChild(node);

  return Buffer.from(await new NodeIO().writeBinary(document));
}

function rewriteGlbJson(glb: Buffer, mutate: (json: Record<string, unknown>) => void) {
  const chunks: Array<{ type: number; data: Buffer }> = [];
  let offset = 12;
  while (offset + 8 <= glb.length) {
    const length = glb.readUInt32LE(offset);
    const type = glb.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    chunks.push({ type, data: Buffer.from(glb.subarray(start, end)) });
    offset = end;
  }

  const jsonChunk = chunks.find((chunk) => chunk.type === 0x4e4f534a);
  if (!jsonChunk) throw new Error("GLB JSON chunk missing");
  const json = JSON.parse(jsonChunk.data.toString("utf8").replace(/\u0000+$/g, "")) as Record<string, unknown>;
  mutate(json);
  const jsonData = Buffer.from(JSON.stringify(json), "utf8");
  const padding = (4 - (jsonData.length % 4)) % 4;
  jsonChunk.data = Buffer.concat([jsonData, Buffer.alloc(padding, 0x20)]);

  const totalLength = 12 + chunks.reduce((sum, chunk) => sum + 8 + chunk.data.length, 0);
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(totalLength, 8);
  offset = 12;
  for (const chunk of chunks) {
    output.writeUInt32LE(chunk.data.length, offset);
    output.writeUInt32LE(chunk.type, offset + 4);
    chunk.data.copy(output, offset + 8);
    offset += 8 + chunk.data.length;
  }
  return output;
}

async function uploadToSignedTarget(
  input: { storageKey: string; contentType: string },
  body: Buffer
) {
  putDevStoredObject({
    storageKey: input.storageKey,
    body,
    contentType: input.contentType
  });
}

async function createCustomRoomObjectTemplate(
  app: Awaited<ReturnType<typeof buildApp>>,
  input: {
    roomId: string;
    teacherId: string;
    glb: Buffer;
    thumbnail?: Buffer;
    displayName?: string;
    description?: string;
  }
) {
  const assetUpload = await app.inject({
    method: "POST",
    url: `/v1/rooms/${input.roomId}/room-objects/uploads`,
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      kind: "asset",
      fileName: "sample.glb",
      contentType: "model/gltf-binary"
    }
  });
  expect(assetUpload.statusCode).toBe(200);
  await uploadToSignedTarget(
    { storageKey: assetUpload.json().storageKey, contentType: "model/gltf-binary" },
    input.glb
  );

  const thumbnailUpload = await app.inject({
    method: "POST",
    url: `/v1/rooms/${input.roomId}/room-objects/uploads`,
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      kind: "thumbnail",
      fileName: "thumb.png",
      contentType: "image/png"
    }
  });
  expect(thumbnailUpload.statusCode).toBe(200);
  await uploadToSignedTarget(
    { storageKey: thumbnailUpload.json().storageKey, contentType: "image/png" },
    input.thumbnail ?? createPng(64, 64)
  );

  return app.inject({
    method: "POST",
    url: "/v1/room-objects/templates",
    headers: authHeaders(input.teacherId, "Ms. Rivera"),
    payload: {
      roomId: input.roomId,
      assetStorageKey: assetUpload.json().storageKey,
      thumbnailStorageKey: thumbnailUpload.json().storageKey,
      displayName: input.displayName ?? "Custom lab model",
      category: "custom",
      description: input.description ?? "Teacher-uploaded GLB.",
      license: "CC-BY",
      attribution: "Uploaded by teacher"
    }
  });
}

describe("room object templates", () => {
  it("seeds builtin catalog on app start", async () => {
    const app = await buildApp({
      config: roomObjectsConfig(),
      repository: new MemoryRepository()
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
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
    const { classRecord } = await createClassAndRoom(app, "teacher-ro-student-list");
    await addStudentMember(app, classRecord.id, "teacher-ro-student-list", "student-ro-list", "Avery");
    const response = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders("student-ro-list", "Avery")
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().templates.length).toBeGreaterThan(0);
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

    const createResponse = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb()
    });
    expect(createResponse.statusCode).toBe(200);
    const template = createResponse.json().template;
    expect(template.source).toBe("custom");
    expect(template.ownerClassId).toBe(classRecord.id);
    expect(template.renderer).toBe("gltf");
    expect(template.assetUrl).toContain("/v1/room-object-assets/");

    const teacherTemplates = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(teacherTemplates.json().templates.some((entry: { id: string }) => entry.id === template.id)).toBe(true);

    const studentTemplates = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
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

    const response = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb({ triangleCount: 4 })
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-too-large");
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
    const response = await createCustomRoomObjectTemplate(app, { roomId, teacherId, glb });
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
    const response = await createCustomRoomObjectTemplate(app, { roomId, teacherId, glb });
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

    const response = await createCustomRoomObjectTemplate(app, {
      roomId,
      teacherId,
      glb: await createTinyGlb({ texturePng: createPng(4096, 1) })
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe("room-object-upload-rejected");
    await app.close();
  });
});

describe("room object instances", () => {
  it("teacher creates, updates, touches, resets, and archives instances", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-instances";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);

    const templates = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    const templateId = templates.json().templates.find((t: { slug: string }) => t.slug === "water-molecule")?.id;
    expect(templateId).toBeTruthy();

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: {
        templateId,
        pose: {
          position: { x: 99, y: 12, z: -99 },
          rotation: { yaw: 0, pitch: 0, roll: 0 }
        },
        scale: 10
      }
    });
    expect(createRes.statusCode).toBe(200);
    const created = createRes.json().object;
    const bounds = roomWithManifest.manifest.bounds;
    expect(created.pose.position.x).toBeLessThanOrEqual(bounds.maxX);
    expect(created.pose.position.x).toBeGreaterThanOrEqual(bounds.minX);
    expect(created.pose.position.z).toBeLessThanOrEqual(bounds.maxZ);
    expect(created.pose.position.z).toBeGreaterThanOrEqual(bounds.minZ);
    expect(created.scale).toBe(10);
    expect(created.pose.position.y).toBeGreaterThan(0);

    const heightPatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${created.id}`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: {
        pose: {
          position: { x: created.pose.position.x, y: 2.5, z: created.pose.position.z },
          rotation: { yaw: 0.5, pitch: 0.25, roll: 0.1 }
        },
        scale: 3
      }
    });
    expect(heightPatch.statusCode).toBe(200);
    expect(heightPatch.json().pose.position.y).toBeCloseTo(2.5, 1);
    expect(heightPatch.json().pose.rotation.pitch).toBeCloseTo(0.25, 2);
    expect(heightPatch.json().scale).toBe(3);

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${created.id}`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: {
        parameters: { modelStyle: "space-filling", bondAngleVisible: false, palette: "accessible" },
        colorTintHex: "#336699"
      }
    });
    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().parameters.modelStyle).toBe("space-filling");
    expect(patchRes.json().colorTintHex).toBe("#336699");

    await addStudentMember(app, classRecord.id, teacherId, "student-ro-touch", "Jordan");
    const touchRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects/${created.id}/touch`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { touchPolicy: "granted", userIds: ["student-ro-touch"], groupIds: [] }
    });
    expect(touchRes.statusCode).toBe(200);

    const studentPatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${created.id}`,
      headers: authHeaders("student-ro-touch", "Jordan"),
      payload: { scale: 1.2 }
    });
    expect(studentPatch.statusCode).toBe(200);
    expect(studentPatch.json().scale).toBe(1.2);

    const resetRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects/${created.id}/reset`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().object.parameters.modelStyle).toBe("ball-and-stick");
    expect(resetRes.json().object.scale).toBe(2.2);

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/objects/${created.id}`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().status).toBe("archived");

    const patchArchived = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${created.id}`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { scale: 1 }
    });
    expect(patchArchived.statusCode).toBe(404);
    expect(patchArchived.json().error).toBe("room-object-not-found");

    await app.close();
  });

  it("enforces active object cap", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-cap";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { maxActive: 2 });

    const templates = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    const templateId = templates.json().templates[0].id;

    for (let index = 0; index < 2; index += 1) {
      const res = await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: { templateId }
      });
      expect(res.statusCode).toBe(200);
    }

    const overCap = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { templateId }
    });
    expect(overCap.statusCode).toBe(422);
    expect(overCap.json().error).toBe("room-object-limit-reached");

    await app.close();
  });

  it("returns 403 when students create or patch without touch", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-student-deny";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-ro-deny", "Avery");

    const templates = await app.inject({
      method: "GET",
      url: "/v1/room-objects/templates",
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    const templateId = templates.json().templates[0].id;

    const createDenied = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders("student-ro-deny", "Avery"),
      payload: { templateId }
    });
    expect(createDenied.statusCode).toBe(403);

    const teacherCreate = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { templateId }
    });
    const objectId = teacherCreate.json().object.id;

    const patchDenied = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${objectId}`,
      headers: authHeaders("student-ro-deny", "Avery"),
      payload: { scale: 1.1 }
    });
    expect(patchDenied.statusCode).toBe(403);
    expect(patchDenied.json().error).toBe("room-object-touch-denied");

    await app.close();
  });

  it("returns 404 when room.settings.roomObjects.enabled is false", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-room-off";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId, { enabled: false });

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    expect(listRes.statusCode).toBe(404);
    expect(listRes.json().error).toBe("room-object-disabled");

    await app.close();
  });
});

async function postRoomObjectRealtime(
  app: Awaited<ReturnType<typeof buildApp>>,
  roomId: string,
  userId: string,
  payload: Record<string, unknown>
) {
  return app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/room-objects/realtime`,
    headers: authHeaders(userId, userId.startsWith("student") ? "Avery" : "Ms. Rivera"),
    payload
  });
}

describe("room object realtime grab lock", () => {
  it("first grab wins and second client receives current holder", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-grab-race";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-grab-a", "Avery");
    await addStudentMember(app, classRecord.id, teacherId, "student-grab-b", "Jordan");

    const templateId = (
      await app.inject({
        method: "GET",
        url: "/v1/room-objects/templates",
        headers: authHeaders(teacherId, "Ms. Rivera")
      })
    ).json().templates[0].id;

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: { templateId, touchPolicy: "all-class" }
      })
    ).json().object.id;

    const first = await postRoomObjectRealtime(app, roomId, "student-grab-a", {
      type: "room.object.grab.v1",
      objectId
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().messages[0].holderUserId).toBe("student-grab-a");

    const second = await postRoomObjectRealtime(app, roomId, "student-grab-b", {
      type: "room.object.grab.v1",
      objectId
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().messages[0].holderUserId).toBe("student-grab-a");

    await app.close();
  });

  it("rejects grab on a locked object", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-locked";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-ro-locked", "Avery");

    const templateId = (
      await app.inject({
        method: "GET",
        url: "/v1/room-objects/templates",
        headers: authHeaders(teacherId, "Ms. Rivera")
      })
    ).json().templates[0].id;

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: { templateId, touchPolicy: "all-class" }
      })
    ).json().object.id;

    const lockRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${objectId}`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { status: "locked" }
    });
    expect(lockRes.statusCode).toBe(200);
    expect(lockRes.json().status).toBe("locked");

    const grabRes = await postRoomObjectRealtime(app, roomId, "student-ro-locked", {
      type: "room.object.grab.v1",
      objectId
    });
    expect(grabRes.statusCode).toBe(409);
    expect(grabRes.json().error).toBe("room-object-locked");

    await app.close();
  });

  it("drops pose updates from non-holders", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-pose-drop";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-pose-drop", "Avery");
    await addStudentMember(app, classRecord.id, teacherId, "student-pose-drop-b", "Jordan");

    const templateId = (
      await app.inject({
        method: "GET",
        url: "/v1/room-objects/templates",
        headers: authHeaders(teacherId, "Ms. Rivera")
      })
    ).json().templates[0].id;

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: { templateId, touchPolicy: "all-class" }
      })
    ).json().object.id;

    await postRoomObjectRealtime(app, roomId, "student-pose-drop", { type: "room.object.grab.v1", objectId });

    const denied = await postRoomObjectRealtime(app, roomId, "student-pose-drop-b", {
      type: "room.object.pose.v1",
      objectId,
      pose: { position: { x: 2, y: 1, z: 2 }, rotation: { yaw: 1, pitch: 0, roll: 0 } },
      scale: 1
    });
    expect(denied.json().messages).toHaveLength(0);

    await app.close();
  });

  it("persists final pose on release", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-release";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);

    const templateId = (
      await app.inject({
        method: "GET",
        url: "/v1/room-objects/templates",
        headers: authHeaders(teacherId, "Ms. Rivera")
      })
    ).json().templates[0].id;

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: { templateId }
      })
    ).json().object.id;

    await postRoomObjectRealtime(app, roomId, teacherId, { type: "room.object.grab.v1", objectId });

    const finalPose = { position: { x: 1.5, y: 1.1, z: -1.5 }, rotation: { yaw: 0.5, pitch: 0, roll: 0 } };
    const release = await postRoomObjectRealtime(app, roomId, teacherId, {
      type: "room.object.release.v1",
      objectId,
      finalPose,
      finalScale: 1.25
    });
    expect(release.json().messages[0].type).toBe("room.object.upsert.v1");
    expect(release.json().messages[0].object.pose.position.x).toBeCloseTo(finalPose.position.x, 5);

    const list = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/objects`,
      headers: authHeaders(teacherId, "Ms. Rivera")
    });
    const persisted = list.json().objects.find((entry: { id: string }) => entry.id === objectId);
    expect(persisted.scale).toBeCloseTo(1.25, 5);
    expect(persisted.pose.position.x).toBeCloseTo(finalPose.position.x, 5);

    await app.close();
  });

  it("reaps stale grabs after 30 seconds without pose updates", async () => {
    let now = 1_000_000;
    const grabLock = new RoomObjectGrabLock({ now: () => now });
    const app = await buildApp({
      config: roomObjectsConfig(),
      repository: new MemoryRepository(),
      roomObjectGrabLock: grabLock
    });
    const teacherId = "teacher-ro-reaper";
    const { roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: {
          templateId: (
            await app.inject({
              method: "GET",
              url: "/v1/room-objects/templates",
              headers: authHeaders(teacherId, "Ms. Rivera")
            })
          ).json().templates[0].id
        }
      })
    ).json().object.id;

    await postRoomObjectRealtime(app, roomId, teacherId, { type: "room.object.grab.v1", objectId });
    expect(grabLock.get(objectId)).toBeDefined();

    now += 31_000;
    grabLock.sweepStale();
    expect(grabLock.get(objectId)).toBeUndefined();

    const reclaim = await postRoomObjectRealtime(app, roomId, teacherId, {
      type: "room.object.grab.v1",
      objectId
    });
    expect(reclaim.json().messages[0].holderUserId).toBe(teacherId);

    await app.close();
  });

  it("force-releases grab when touch grant is revoked", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-touch-revoke";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-touch-revoke", "Avery");

    const objectId = (
      await app.inject({
        method: "POST",
        url: `/v1/rooms/${roomId}/objects`,
        headers: authHeaders(teacherId, "Ms. Rivera"),
        payload: {
          templateId: (
            await app.inject({
              method: "GET",
              url: "/v1/room-objects/templates",
              headers: authHeaders(teacherId, "Ms. Rivera")
            })
          ).json().templates[0].id
        }
      })
    ).json().object.id;

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects/${objectId}/touch`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { touchPolicy: "granted", userIds: ["student-touch-revoke"], groupIds: [] }
    });

    await postRoomObjectRealtime(app, roomId, "student-touch-revoke", {
      type: "room.object.grab.v1",
      objectId
    });

    const revoke = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects/${objectId}/touch`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { touchPolicy: "teacher-only", userIds: [], groupIds: [] }
    });
    expect(revoke.statusCode).toBe(200);
    expect(revoke.json().realtimeMessages.some((message: { type: string }) => message.type === "room.object.upsert.v1")).toBe(
      true
    );

    const reclaim = await postRoomObjectRealtime(app, roomId, teacherId, {
      type: "room.object.grab.v1",
      objectId
    });
    expect(reclaim.json().messages[0].holderUserId).toBe(teacherId);

    await app.close();
  });
});
