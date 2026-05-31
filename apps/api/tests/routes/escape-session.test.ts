import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";
import { escapeRoomConfig } from "../helpers/escape-room";

async function enablePlayMode(
  app: Awaited<ReturnType<typeof buildApp>>,
  roomId: string,
  userId: string,
  role: string
) {
  await app.inject({
    method: "PATCH",
    url: `/v1/rooms/${roomId}`,
    headers: authHeaders(userId, role),
    payload: { settings: { playModeEnabled: true } }
  });
}

describe("escape-session (API)", () => {
  it("author starts, resets, and wins an escape session in play mode", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-es", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-es", "author-es", "Author");
    await enablePlayMode(app, roomId, "author-es", "Author");

    const idleRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/escape-session`,
      headers: authHeaders("author-es", "Author")
    });
    expect(idleRes.statusCode).toBe(200);
    expect(idleRes.json().session.status).toBe("idle");

    const startRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/escape-session/start`,
      headers: authHeaders("author-es", "Author"),
      payload: { durationSec: 900 }
    });
    expect(startRes.statusCode).toBe(200);
    expect(startRes.json().session.status).toBe("running");
    expect(startRes.json().session.startedAt).toBeTruthy();
    expect(startRes.json().realtimeMessages[0]?.type).toBe("room.session.v1");

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("author-es", "Author"),
      payload: { kind: "door", cell: { ix: 1, iz: 1 }, level: 0, edge: "e", channelId: "ch-1" }
    });

    const resetRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/escape-session/reset`,
      headers: authHeaders("author-es", "Author")
    });
    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.json().session.status).toBe("idle");
    expect(resetRes.json().realtimeMessages.some((m: { type: string }) => m.type === "room.logic.state.v1")).toBe(
      true
    );

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/escape-session/start`,
      headers: authHeaders("author-es", "Author"),
      payload: {}
    });

    const winRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/escape-session/win`,
      headers: authHeaders("author-es", "Author")
    });
    expect(winRes.statusCode).toBe(200);
    expect(winRes.json().session.status).toBe("won");
    expect(winRes.json().session.endedAt).toBeTruthy();

    await app.close();
  });

  it("rejects start from non-teachers", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-es", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-es", "player-es", "Player");
    await enablePlayMode(app, roomId, "teacher-es", "Teacher");

    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/escape-session/start`,
      headers: authHeaders("player-es", "Player"),
      payload: {}
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
