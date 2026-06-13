import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Verse Voice Translation E2E.
 *
 * Requires the Playwright webServer env (playwright.config.ts) with:
 *   ENABLE_TRANSLATION=true / NEXT_PUBLIC_ENABLE_TRANSLATION=true
 *   ENABLE_TRANSLATION_VOICE=true / NEXT_PUBLIC_ENABLE_TRANSLATION_VOICE=true
 *
 * Stubs /translate/speech to return a tiny silent fixture audio buffer,
 * then drives the listener-side voice flow via window.__translationHandleMessage.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";

const SPEAKER = { userId: "dev-tts-speaker", displayName: "Sam Speaker", role: "teacher" as const };
const LISTENER = { userId: "dev-tts-listener", displayName: "Leo Listener", role: "teacher" as const };

type DevIdentity = typeof SPEAKER | typeof LISTENER;

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

async function postJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createFfaRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", SPEAKER, {
    name: `TTS Lab ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", SPEAKER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `TTS Room ${suffix}`,
    freeForAllPassword: FFA_PASSWORD
  });
  return roomWithManifest.room;
}

// A tiny valid silent MP3 (32 bytes, enough for decodeAudioData to succeed or fail gracefully)
const SILENT_MP3_BASE64 = "//MUxAABaAIGUUkYA" + "A".repeat(40);

async function setIdentityAndLang(
  page: Page,
  identity: DevIdentity,
  opts: { readLang: string; speakLang?: string; voiceMode?: string; ffaPassword?: string }
) {
  await page.addInitScript(
    ({ identityKey, identityValue, translationKey, translationValue, ffaKey, ffaValue }) => {
      window.localStorage.setItem(identityKey, JSON.stringify(identityValue));
      window.localStorage.setItem(translationKey, JSON.stringify(translationValue));
      if (ffaValue) window.sessionStorage.setItem(ffaKey, ffaValue);
    },
    {
      identityKey: IDENTITY_STORAGE_KEY,
      identityValue: identity,
      translationKey: `3dspace.translation:${identity.userId}`,
      translationValue: {
        readLang: opts.readLang,
        speakLang: opts.speakLang ?? opts.readLang,
        voiceMode: opts.voiceMode ?? "off",
        voiceChoice: "auto"
      },
      ffaKey: "freeForAllPassword",
      ffaValue: opts.ffaPassword ?? ""
    }
  );
}

async function joinRoom(page: Page, roomId: string) {
  await page.goto(`/rooms/${roomId}`, { waitUntil: "commit", timeout: 90_000 });
}

async function waitForRoomJoined(page: Page, userId: string) {
  await expect(page.getByTestId(`participant-${userId}`)).toBeVisible({ timeout: 60_000 });
}

type UtterancePayload = {
  roomId: string;
  participantId: string;
  utteranceId: string;
  sourceLang: string;
  text: string;
};

async function injectUtterance(page: Page, payload: UtterancePayload) {
  await page.evaluate((msg) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (window as any).__translationHandleMessage as ((m: unknown) => boolean) | undefined;
    if (!handler) throw new Error("__translationHandleMessage not registered");
    handler({
      type: "room.translation.utterance.v1",
      roomId: msg.roomId,
      participantId: msg.participantId,
      utteranceId: msg.utteranceId,
      sourceLang: msg.sourceLang,
      text: msg.text,
      isFinal: true,
      startMs: 0,
      sentAt: Date.now()
    });
  }, payload);
}

test.describe("voice translation", () => {
  test("Duck mode: /translate/speech is called after /translate; same-language utterance skips TTS", async ({
    browser,
    request
  }) => {
    const room = await createFfaRoom(request);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();

    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await setIdentityAndLang(pageA, SPEAKER, {
        readLang: "en",
        speakLang: "en",
        ffaPassword: FFA_PASSWORD
      });
      await setIdentityAndLang(pageB, LISTENER, {
        readLang: "es",
        speakLang: "es",
        voiceMode: "duck",
        ffaPassword: FFA_PASSWORD
      });

      // Track which API calls B makes
      const translateCalls: string[] = [];
      const speechCalls: string[] = [];

      await pageB.route(`${API_URL}/v1/rooms/${room.id}/translate`, async (route) => {
        translateCalls.push(route.request().url());
        const body = route.request().postDataJSON() as { text: string; sourceLang: string; targetLang: string };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            translatedText: "Hola mundo",
            sourceLang: body.sourceLang,
            targetLang: body.targetLang,
            cached: false,
            model: "mock"
          })
        });
      });

      await pageB.route(`${API_URL}/v1/rooms/${room.id}/translate/speech`, async (route) => {
        speechCalls.push(route.request().url());
        // Return a tiny audio fixture so decodeAudioData can handle it (or fail gracefully)
        const mp3Bytes = Buffer.from(SILENT_MP3_BASE64, "base64");
        await route.fulfill({
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "x-translation-cached": "false",
            "x-translation-voice": "alloy"
          },
          body: mp3Bytes
        });
      });

      await Promise.all([joinRoom(pageA, room.id), joinRoom(pageB, room.id)]);
      await Promise.all([waitForRoomJoined(pageA, SPEAKER.userId), waitForRoomJoined(pageB, LISTENER.userId)]);

      // Inject a foreign (English → listener reads Spanish) utterance
      await injectUtterance(pageB, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tts-e2e-1",
        sourceLang: "en",
        text: "Hello world"
      });

      // Wait for translation dock to appear with translated text
      const dock = pageB.locator('[aria-label="Live translation"]');
      await expect(dock).toBeVisible({ timeout: 10_000 });

      // Both /translate and /translate/speech should have been called
      await expect.poll(() => translateCalls.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);
      await expect.poll(() => speechCalls.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

      // Now inject a same-language (Spanish → listener reads Spanish) utterance
      const speechCallsBefore = speechCalls.length;
      await injectUtterance(pageB, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tts-e2e-same",
        sourceLang: "es",
        text: "Hola"
      });

      // Wait briefly; no new speech call should come
      await pageB.waitForTimeout(2_000);
      expect(speechCalls.length).toBe(speechCallsBefore);
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("voice mode Off: /translate/speech is NOT called even for foreign utterances", async ({
    browser,
    request
  }) => {
    const room = await createFfaRoom(request);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();

      await setIdentityAndLang(page, LISTENER, {
        readLang: "es",
        speakLang: "es",
        voiceMode: "off",
        ffaPassword: FFA_PASSWORD
      });

      let speechCalled = false;
      await page.route(`${API_URL}/v1/rooms/${room.id}/translate`, async (route) => {
        const body = route.request().postDataJSON() as { text: string; sourceLang: string; targetLang: string };
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            translatedText: "Hola",
            sourceLang: body.sourceLang,
            targetLang: body.targetLang,
            cached: false,
            model: "mock"
          })
        });
      });
      await page.route(`${API_URL}/v1/rooms/${room.id}/translate/speech`, async (route) => {
        speechCalled = true;
        await route.abort();
      });

      await joinRoom(page, room.id);
      await waitForRoomJoined(page, LISTENER.userId);

      await injectUtterance(page, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tts-off-1",
        sourceLang: "en",
        text: "Hello"
      });

      // Wait for translation to appear
      const dock = page.locator('[aria-label="Live translation"]');
      await expect(dock).toBeVisible({ timeout: 10_000 });
      await page.waitForTimeout(2_000);
      expect(speechCalled).toBe(false);
    } finally {
      await ctx.close();
    }
  });

  test("own speech is never dubbed", async ({ browser, request }) => {
    const room = await createFfaRoom(request);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();

      await setIdentityAndLang(page, SPEAKER, {
        readLang: "es",
        speakLang: "en",
        voiceMode: "duck",
        ffaPassword: FFA_PASSWORD
      });

      let speechCalled = false;
      await page.route(`${API_URL}/v1/rooms/${room.id}/translate/speech`, async (route) => {
        speechCalled = true;
        await route.abort();
      });

      await joinRoom(page, room.id);
      await waitForRoomJoined(page, SPEAKER.userId);

      // Inject utterance from the same participant (own speech)
      await injectUtterance(page, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tts-own-1",
        sourceLang: "en",
        text: "My own speech"
      });

      await page.waitForTimeout(2_000);
      expect(speechCalled).toBe(false);
    } finally {
      await ctx.close();
    }
  });
});
