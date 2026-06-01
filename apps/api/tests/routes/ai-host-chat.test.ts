import { describe, expect, it } from "vitest";
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
    AI_WORLD_HOST_MOCK_RESPONSES: "true",
    ...env
  } as NodeJS.ProcessEnv);
}

type SseEvent = { event: string; data: any };

function parseSse(payload: string): SseEvent[] {
  return payload
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event:"))?.slice("event:".length).trim() ?? "message";
      const dataLine = lines.find((l) => l.startsWith("data:"))?.slice("data:".length).trim() ?? "{}";
      return { event, data: JSON.parse(dataLine) };
    });
}

async function summonHost(app: Awaited<ReturnType<typeof buildApp>>, roomId: string, userId: string, name: string) {
  const res = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/ai-host`,
    headers: authHeaders(userId, "Tester"),
    payload: { displayName: name, position: { x: 0, y: 0, z: 0 } }
  });
  expect(res.statusCode).toBe(200);
}

describe("AI world host chat (build help)", () => {
  it("streams a corpus-grounded reply and persists user + assistant messages", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-chat", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId, "teacher-chat", "Chip");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-chat", "Ms. Rivera"),
      payload: { mode: "build-help", content: "How do I undo?" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    const events = parseSse(response.payload);
    const deltas = events.filter((e) => e.event === "delta");
    expect(deltas.length).toBeGreaterThan(0);
    const fullText = deltas.map((e) => e.data.delta).join("");
    expect(fullText).toContain("⌘Z");

    const done = events.find((e) => e.event === "done");
    expect(done).toBeTruthy();
    expect(done?.data.message.role).toBe("assistant");
    expect(done?.data.message.content).toContain("⌘Z");

    const list = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host/chat?mode=build-help`,
      headers: authHeaders("teacher-chat", "Ms. Rivera")
    });
    expect(list.statusCode).toBe(200);
    const messages = list.json().messages;
    expect(messages.map((m: any) => m.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("How do I undo?");

    await app.close();
  });

  it("answers what key 3 does (ramp) from the corpus", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-ramp", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId, "teacher-ramp", "Chip");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-ramp", "Ms. Rivera"),
      payload: { mode: "build-help", content: "What does key 3 do?" }
    });
    expect(response.statusCode).toBe(200);
    const fullText = parseSse(response.payload)
      .filter((e) => e.event === "delta")
      .map((e) => e.data.delta)
      .join("");
    expect(fullText).toMatch(/Ramp/i);
    await app.close();
  });

  it("keeps chat private per user", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-priv", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-priv", "student-b", "Bo");
    await summonHost(app, roomId, "teacher-priv", "Chip");

    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-priv", "Ms. Rivera"),
      payload: { mode: "build-help", content: "Teacher question" }
    });

    const studentList = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("student-b", "Bo")
    });
    expect(studentList.statusCode).toBe(200);
    expect(studentList.json().messages).toEqual([]);
    await app.close();
  });

  it("returns 404 when no host has been summoned", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-nohost", "free-for-all");
    const roomId = roomWithManifest.room.id;

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-nohost", "Ms. Rivera"),
      payload: { mode: "build-help", content: "Hi" }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("ai-host-not-found");
    await app.close();
  });

  it("defers file-study chat to Phase 6 with a file-not-found error", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-file", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId, "teacher-file", "Chip");

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-file", "Ms. Rivera"),
      payload: { mode: "file-study", fileId: "file-missing", content: "Summarize" }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("ai-host-file-not-found");
    await app.close();
  });

  it("rate limits per user per hour", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-rate", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId, "teacher-rate", "Chip");

    const patch = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("teacher-rate", "Ms. Rivera"),
      payload: {
        settings: {
          aiWorldHost: {
            enabled: true,
            maxFilesPerRoom: 10,
            maxFileSizeBytes: 5_000_000,
            maxMessagesPerUserPerHour: 1,
            maxContextMessages: 20,
            allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
          }
        }
      }
    });
    expect(patch.statusCode).toBe(200);

    const first = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-rate", "Ms. Rivera"),
      payload: { mode: "build-help", content: "One" }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-rate", "Ms. Rivera"),
      payload: { mode: "build-help", content: "Two" }
    });
    expect(second.statusCode).toBe(429);
    expect(second.json().error).toBe("ai-host-rate-limited");
    await app.close();
  });
});
