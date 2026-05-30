import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { authHeaders, createClassAndRoom } from "../helpers/app";

function meetingNotesConfig(env: Record<string, string> = {}) {
  return loadConfig(
    {
      NODE_ENV: "test",
      ENABLE_FREE_FOR_ALL: "true",
      FREE_FOR_ALL_PASSWORD: "open-sesame",
      ENABLE_AI_MEETING_NOTES: "true",
      ...env
    } as NodeJS.ProcessEnv
  );
}

describe("meeting notes routes", () => {
  it("persists a session, finalizes artifacts, and serves transcript downloads", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({
      config: meetingNotesConfig(),
      repository
    });

    const { roomWithManifest } = await createClassAndRoom(app, "teacher-notes", "free-for-all");
    const roomId = roomWithManifest.room.id;

    const startResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions`,
      headers: authHeaders("teacher-notes", "Ms. Rivera")
    });
    expect(startResponse.statusCode).toBe(200);
    const sessionId: string = startResponse.json().session.id;
    expect(startResponse.json().session.status).toBe("recording");

    await repository.createMeetingNotesSegment({
      id: "seg_1",
      sessionId,
      roomId,
      speakerUserId: "teacher-notes",
      startMs: 0,
      endMs: 2200,
      text: "Welcome to the room.",
      isFinal: true,
      createdAt: new Date().toISOString()
    });
    await repository.createMeetingNotesSegment({
      id: "seg_2",
      sessionId,
      roomId,
      speakerUserId: "teacher-notes",
      startMs: 2400,
      endMs: 5200,
      text: "We decided to keep the open board layout.",
      isFinal: true,
      createdAt: new Date().toISOString()
    });

    const stopResponse = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`,
      headers: authHeaders("teacher-notes", "Ms. Rivera"),
      payload: { action: "stop" }
    });
    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json().session.status).toBe("ready");
    expect(
      stopResponse.json().realtimeMessages.some((message: { type: string }) => message.type === "room.meeting-notes.summary-ready.v1")
    ).toBe(true);

    const detailResponse = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`,
      headers: authHeaders("teacher-notes", "Ms. Rivera")
    });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json().segments).toHaveLength(2);

    const txtDownload = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/download?format=txt`,
      headers: authHeaders("teacher-notes", "Ms. Rivera")
    });
    expect(txtDownload.statusCode).toBe(200);
    expect(txtDownload.headers["content-disposition"]).toContain(".txt");
    expect(txtDownload.body).toContain("Welcome to the room.");

    const mdDownload = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/download?format=md`,
      headers: authHeaders("teacher-notes", "Ms. Rivera")
    });
    expect(mdDownload.statusCode).toBe(200);
    expect(mdDownload.body).toContain("# Meeting Notes");

    await app.close();
  });

  it("buffers uploaded audio and transcribes it when the session stops", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/v1/audio/transcriptions")) {
        return new Response(JSON.stringify({ text: "Buffered transcript from the whole recording." }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      if (url.includes("/v1/chat/completions")) {
        return new Response(JSON.stringify({ choices: [{ message: { content: "# Summary\n\nBuffered transcript from the whole recording." } }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
      return new Response("not found", { status: 404 });
    });
    const app = await buildApp({
      config: meetingNotesConfig({ OPENAI_API_KEY: "sk-test" }),
      repository: new MemoryRepository()
    });

    const { roomWithManifest } = await createClassAndRoom(app, "teacher-buffered-notes", "free-for-all");
    const roomId = roomWithManifest.room.id;

    const startResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions`,
      headers: authHeaders("teacher-buffered-notes", "Ms. Rivera")
    });
    expect(startResponse.statusCode).toBe(200);
    const sessionId: string = startResponse.json().session.id;

    const uploadResponse = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/audio-chunks`,
      headers: authHeaders("teacher-buffered-notes", "Ms. Rivera"),
      payload: {
        participantId: "teacher-buffered-notes",
        startedAtMs: 0,
        endedAtMs: 2200,
        mimeType: "audio/webm;codecs=opus",
        audioBase64: Buffer.from("webm-chunk").toString("base64")
      }
    });
    expect(uploadResponse.statusCode).toBe(202);
    expect(uploadResponse.json().accepted).toBe(true);

    const beforeStopDetail = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`,
      headers: authHeaders("teacher-buffered-notes", "Ms. Rivera")
    });
    expect(beforeStopDetail.statusCode).toBe(200);
    expect(beforeStopDetail.json().segments).toHaveLength(0);

    const stopResponse = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`,
      headers: authHeaders("teacher-buffered-notes", "Ms. Rivera"),
      payload: { action: "stop" }
    });
    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json().session.status).toBe("ready");

    const afterStopDetail = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`,
      headers: authHeaders("teacher-buffered-notes", "Ms. Rivera")
    });
    expect(afterStopDetail.statusCode).toBe(200);
    expect(afterStopDetail.json().segments).toHaveLength(1);
    expect(afterStopDetail.json().segments[0].text).toBe("Buffered transcript from the whole recording.");

    await app.close();
    fetchMock.mockRestore();
  });

  it("is unavailable for classroom rooms", async () => {
    const app = await buildApp({
      config: loadConfig({
        NODE_ENV: "test",
        ENABLE_AI_MEETING_NOTES: "true"
      } as NodeJS.ProcessEnv),
      repository: new MemoryRepository()
    });

    const { roomWithManifest } = await createClassAndRoom(app, "teacher-classroom", "classroom");
    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/meeting-notes/sessions`,
      headers: authHeaders("teacher-classroom", "Ms. Rivera")
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().message).toMatch(/not available for this room type/i);
    await app.close();
  });
});
