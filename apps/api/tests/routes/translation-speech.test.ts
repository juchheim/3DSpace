import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { TranslationSpeechCache } from "../../src/translation/speech-cache";
import { authHeaders, createClassAndRoom } from "../helpers/app";

const FIXTURE_AUDIO = Buffer.from("FAKE_MP3_BYTES");

function mockOpenAiTts(status = 200, body: Buffer | string = FIXTURE_AUDIO) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    if (String(url).includes("/v1/audio/speech")) {
      return new Response(body, {
        status,
        headers: { "content-type": "audio/mpeg" }
      });
    }
    return new Response("unexpected", { status: 500 });
  });
}

describe("POST /v1/rooms/:roomId/translate/speech", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn> | undefined;

  afterEach(() => {
    fetchSpy?.mockRestore();
    vi.restoreAllMocks();
  });

  async function buildTranslationApp(overrides: Partial<Parameters<typeof loadConfig>[0]> = {}) {
    const config = loadConfig({
      NODE_ENV: "test",
      ENABLE_TRANSLATION: "true",
      ENABLE_TRANSLATION_VOICE: "true",
      OPENAI_API_KEY: "test-key",
      ENABLE_FREE_FOR_ALL: "true",
      FREE_FOR_ALL_PASSWORD: "open-sesame",
      ...overrides
    } as NodeJS.ProcessEnv);
    const repository = new MemoryRepository();
    const translationSpeechCache = new TranslationSpeechCache();
    const app = await buildApp({ config, repository, translationSpeechCache });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-1", "free-for-all");
    return { app, roomId: roomWithManifest.room.id as string, translationSpeechCache };
  }

  it("returns 403 for non-member of a classroom room", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ENABLE_TRANSLATION: "true",
      ENABLE_TRANSLATION_VOICE: "true",
      OPENAI_API_KEY: "test-key"
    } as NodeJS.ProcessEnv);
    const repository = new MemoryRepository();
    const app = await buildApp({ config, repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-1", "classroom");
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/translate/speech`,
      headers: authHeaders("stranger", "Stranger"),
      payload: { text: "hello", lang: "es" }
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 409 when enableTranslationVoice=false", async () => {
    const { app, roomId } = await buildTranslationApp({ ENABLE_TRANSLATION_VOICE: "false" });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { text: "hello", lang: "es" }
    });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: "translation-voice-unavailable" } });
  });

  it("returns 204 when no OPENAI_API_KEY", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ENABLE_TRANSLATION: "true",
      ENABLE_TRANSLATION_VOICE: "true",
      ENABLE_FREE_FOR_ALL: "true",
      FREE_FOR_ALL_PASSWORD: "open-sesame"
      // no OPENAI_API_KEY
    } as NodeJS.ProcessEnv);
    const repository = new MemoryRepository();
    const app = await buildApp({ config, repository });
    const { roomWithManifest } = await createClassAndRoom(app, "teacher-1", "free-for-all");
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomWithManifest.room.id}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { text: "hello", lang: "es" }
    });
    expect(res.statusCode).toBe(204);
  });

  it("returns 204 when provider=off", async () => {
    const { app, roomId } = await buildTranslationApp({ TRANSLATION_TTS_PROVIDER: "off" });
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { text: "hello", lang: "es" }
    });
    expect(res.statusCode).toBe(204);
  });

  it("happy path: returns binary audio with correct headers", async () => {
    fetchSpy = mockOpenAiTts();
    const { app, roomId } = await buildTranslationApp();
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { text: "hola mundo", lang: "es" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("audio/mpeg");
    expect(res.headers["x-translation-cached"]).toBe("false");
    expect(Buffer.from(res.rawPayload).length).toBeGreaterThan(0);
  });

  it("second identical request returns cached result (x-translation-cached: true, no second fetch)", async () => {
    fetchSpy = mockOpenAiTts();
    const { app, roomId } = await buildTranslationApp();
    const payload = { text: "cached text", lang: "fr", voice: "alloy" };

    const first = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers["x-translation-cached"]).toBe("false");

    const callCountAfterFirst = (fetchSpy as { mock: { calls: unknown[] } }).mock.calls.length;

    const second = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers["x-translation-cached"]).toBe("true");
    // No additional fetch call was made
    expect((fetchSpy as { mock: { calls: unknown[] } }).mock.calls.length).toBe(callCountAfterFirst);
  });

  it("returns 503 on OpenAI error with translation-voice-unavailable code", async () => {
    fetchSpy = mockOpenAiTts(500, "error");
    const { app, roomId } = await buildTranslationApp();
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { text: "bad request", lang: "de" }
    });
    expect(res.statusCode).toBe(503);
  });

  it("returns 429 when rate limit exceeded", async () => {
    fetchSpy = mockOpenAiTts();
    const { app, roomId } = await buildTranslationApp({ TRANSLATION_TTS_RATE_LIMIT_PER_MINUTE: "1" });
    const payload = { text: "rate test", lang: "es" };

    const first = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { ...payload, text: "first" }
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/translate/speech`,
      headers: authHeaders("teacher-1", "Teacher"),
      payload: { ...payload, text: "second" }
    });
    expect(second.statusCode).toBe(429);
  });
});
