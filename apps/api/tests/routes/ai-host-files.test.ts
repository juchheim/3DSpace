import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { putDevStoredObject } from "../../src/services/storage";
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

function parseSse(payload: string) {
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

async function summonHost(app: Awaited<ReturnType<typeof buildApp>>, roomId: string) {
  await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/ai-host`,
    headers: authHeaders("teacher-files", "Ms. Rivera"),
    payload: { displayName: "Chip", position: { x: 0, y: 0, z: 0 } }
  });
}

describe("AI world host study files", () => {
  it("uploads txt, extracts, answers file-study chat, and deletes with cascade", async () => {
    const repository = new MemoryRepository();
    const config = aiHostConfig();
    const app = await buildApp({ config, repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-files", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId);

    const studyText = "The capital of France is Paris. Paris is known for the Eiffel Tower.";
    const target = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files/upload-target`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });
    expect(target.statusCode).toBe(200);
    const { fileId, storageKey } = target.json();

    putDevStoredObject({
      storageKey,
      body: Buffer.from(studyText, "utf8"),
      contentType: "text/plain"
    });

    const register = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileId,
        storageKey,
        originalFileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });
    expect(register.statusCode).toBe(200);
    expect(register.json().file.status).toBe("ready");
    expect(register.json().file.charCount).toBeGreaterThan(0);

    const chat = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        mode: "file-study",
        fileId,
        content: "What is the capital of France?"
      }
    });
    expect(chat.statusCode).toBe(200);
    const reply = parseSse(chat.payload)
      .filter((e) => e.event === "delta")
      .map((e) => e.data.delta)
      .join("");
    expect(reply.length).toBeGreaterThan(0);

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host/files/${fileId}`,
      headers: authHeaders("teacher-files", "Ms. Rivera")
    });
    expect(del.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera")
    });
    expect(list.json().files).toEqual([]);

    const chatAfterDelete = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        mode: "file-study",
        fileId,
        content: "Summarize"
      }
    });
    expect(chatAfterDelete.statusCode).toBe(404);
    expect(chatAfterDelete.json().error).toBe("ai-host-file-not-found");

    await app.close();
  });

  it("returns ai-host-file-not-ready when chatting before extraction succeeds", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-files", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId);

    const target = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files/upload-target`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 1
      }
    });
    const { fileId, storageKey } = target.json();
    putDevStoredObject({
      storageKey,
      body: Buffer.from(" ", "utf8"),
      contentType: "text/plain"
    });
    const register = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileId,
        storageKey,
        originalFileName: "notes.txt",
        contentType: "text/plain",
        sizeBytes: 1
      }
    });
    expect(register.json().file.status).toBe("failed");

    const chat = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: { mode: "file-study", fileId, content: "Summarize" }
    });
    expect(chat.statusCode).toBe(422);
    expect(chat.json().error).toBe("ai-host-file-not-ready");
    await app.close();
  });

  it("preserves chat messages when host is dismissed without deleting files", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-files", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId);

    const studyText = "Retention test content for chat history.";
    const target = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files/upload-target`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileName: "keep.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });
    const { fileId, storageKey } = target.json();
    putDevStoredObject({ storageKey, body: Buffer.from(studyText, "utf8"), contentType: "text/plain" });
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileId,
        storageKey,
        originalFileName: "keep.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });

    const chat = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/chat`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: { mode: "file-study", fileId, content: "What is in this file?" }
    });
    expect(chat.statusCode).toBe(200);
    parseSse(chat.payload);

    await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-files", "Ms. Rivera")
    });

    const history = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host/chat?mode=file-study&fileId=${fileId}`,
      headers: authHeaders("teacher-files", "Ms. Rivera")
    });
    expect(history.json().messages.length).toBeGreaterThanOrEqual(2);

    const list = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera")
    });
    expect(list.json().files).toHaveLength(1);

    await app.close();
  });

  it("forbids deleting another user's study file", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest, classRecord } = await createClassAndRoom(app, "teacher-files", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await summonHost(app, roomId);
    await addStudentMember(app, classRecord.id, "teacher-files", "student-b", "Student B");

    const studyText = "Private notes";
    const target = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files/upload-target`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileName: "mine.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });
    const { fileId, storageKey } = target.json();
    putDevStoredObject({ storageKey, body: Buffer.from(studyText, "utf8"), contentType: "text/plain" });
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files`,
      headers: authHeaders("teacher-files", "Ms. Rivera"),
      payload: {
        fileId,
        storageKey,
        originalFileName: "mine.txt",
        contentType: "text/plain",
        sizeBytes: Buffer.byteLength(studyText, "utf8")
      }
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/v1/rooms/${roomId}/ai-host/files/${fileId}`,
      headers: authHeaders("student-b", "Student B")
    });
    expect(del.statusCode).toBe(403);

    await app.close();
  });

  it("rejects disallowed mime types", async () => {
    const repository = new MemoryRepository();
    const app = await buildApp({ config: aiHostConfig(), repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-mime", "free-for-all");
    const roomId = roomWithManifest.room.id;
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host`,
      headers: authHeaders("teacher-mime", "Ms. Rivera"),
      payload: { displayName: "Chip", position: { x: 0, y: 0, z: 0 } }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/ai-host/files/upload-target`,
      headers: authHeaders("teacher-mime", "Ms. Rivera"),
      payload: {
        fileName: "image.png",
        contentType: "image/png",
        sizeBytes: 100
      }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("ai-host-file-rejected");
    await app.close();
  });
});
