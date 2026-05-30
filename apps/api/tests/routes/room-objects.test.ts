import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { RoomObjectGrabLock } from "../../src/room-objects/grab-lock.js";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";
import { classroomAction } from "../helpers/classroom";
import { enableRoomObjects, postRoomObjectRealtime, roomObjectsConfig } from "../helpers/room-objects";

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

  it("lets a student patch an object when touch is granted through a classroom group", async () => {
    const app = await buildApp({ config: roomObjectsConfig(), repository: new MemoryRepository() });
    const teacherId = "teacher-ro-group-touch";
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, teacherId);
    const roomId = roomWithManifest.room.id;
    await enableRoomObjects(app, roomId, teacherId);
    await addStudentMember(app, classRecord.id, teacherId, "student-ro-group-touch", "Avery");

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

    let state = await classroomAction(app, roomId, teacherId, {
      type: "create-group",
      label: "Blue Team",
      color: "#2980b9"
    });
    const groupId = state.groups[0].id as string;
    state = await classroomAction(app, roomId, teacherId, {
      type: "assign-group",
      groupId,
      memberUserIds: ["student-ro-group-touch"]
    });
    expect(state.groups.find((group: { id: string }) => group.id === groupId)?.memberUserIds).toContain("student-ro-group-touch");

    const touchRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/objects/${objectId}/touch`,
      headers: authHeaders(teacherId, "Ms. Rivera"),
      payload: { touchPolicy: "granted", userIds: [], groupIds: [groupId] }
    });
    expect(touchRes.statusCode).toBe(200);

    const studentPatch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/objects/${objectId}`,
      headers: authHeaders("student-ro-group-touch", "Avery"),
      payload: { scale: 1.4 }
    });
    expect(studentPatch.statusCode).toBe(200);
    expect(studentPatch.json().scale).toBe(1.4);

    await app.close();
  });
});
