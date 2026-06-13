import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Verse Live Translation E2E.
 *
 * Requires the Playwright webServer env (playwright.config.ts) with
 * ENABLE_TRANSLATION=true / NEXT_PUBLIC_ENABLE_TRANSLATION=true.
 *
 * Uses window.__translationHandleMessage (injected by useTranslation in E2E
 * dev-auth mode) to bypass LiveKit transport and drive the listener-side
 * translation flow directly.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";

const SPEAKER = { userId: "dev-tr-speaker", displayName: "Sam Speaker", role: "teacher" as const };
const LISTENER = { userId: "dev-tr-listener", displayName: "Leo Listener", role: "teacher" as const };

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
    name: `Translation ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", SPEAKER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `TR Lab ${suffix}`,
    freeForAllPassword: FFA_PASSWORD
  });
  return roomWithManifest.room;
}

async function setIdentityAndLang(
  page: Page,
  identity: DevIdentity,
  opts: { readLang: string; speakLang?: string; ffaPassword?: string }
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
      translationValue: { readLang: opts.readLang, speakLang: opts.speakLang ?? opts.readLang },
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
    if (!handler) throw new Error("__translationHandleMessage not registered — is NEXT_PUBLIC_E2E_DEV_AUTH=true?");
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

async function expandDockIfCollapsed(dock: ReturnType<Page["locator"]>) {
  const collapseToggle = dock.locator('[aria-expanded="false"]');
  if (await collapseToggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await collapseToggle.click();
  }
}

test.describe("translation", () => {
  test("listener sees translated utterance from another participant", async ({ browser, request }) => {
    const room = await createFfaRoom(request);

    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();

    try {
      const pageA = await ctxA.newPage();
      const pageB = await ctxB.newPage();

      await setIdentityAndLang(pageA, SPEAKER, { readLang: "en", speakLang: "en", ffaPassword: FFA_PASSWORD });
      await setIdentityAndLang(pageB, LISTENER, { readLang: "es", speakLang: "en", ffaPassword: FFA_PASSWORD });

      // Mock the translate endpoint so the test doesn't need a real OpenAI key
      await pageB.route(`${API_URL}/v1/rooms/${room.id}/translate`, async (route) => {
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

      await Promise.all([joinRoom(pageA, room.id), joinRoom(pageB, room.id)]);
      await Promise.all([waitForRoomJoined(pageA, SPEAKER.userId), waitForRoomJoined(pageB, LISTENER.userId)]);

      await injectUtterance(pageB, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tr-e2e-1",
        sourceLang: "en",
        text: "Hello world"
      });

      const dock = pageB.locator('[aria-label="Live translation"]');
      await expect(dock).toBeVisible({ timeout: 10_000 });
      await expandDockIfCollapsed(dock);

      const log = dock.getByRole("log");
      await expect(log).toContainText("Hola mundo", { timeout: 10_000 });
      await expect(log).toContainText("translated from English");

      // "show original" reveals the source English text
      await dock.getByRole("button", { name: "show original" }).click();
      await expect(log).toContainText("Hello world");

      // "show translation" goes back to translated text
      await dock.getByRole("button", { name: "show translation" }).click();
      await expect(log).toContainText("Hola mundo");
    } finally {
      await ctxA.close();
      await ctxB.close();
    }
  });

  test("same-language passthrough renders without calling translate", async ({ browser, request }) => {
    const room = await createFfaRoom(request);

    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();

      await setIdentityAndLang(page, LISTENER, { readLang: "en", speakLang: "en", ffaPassword: FFA_PASSWORD });

      // Intercept any translate call — it must NOT be made for same-language
      let translateCalled = false;
      await page.route(`${API_URL}/v1/rooms/${room.id}/translate`, async (route) => {
        translateCalled = true;
        await route.abort();
      });

      await joinRoom(page, room.id);
      await waitForRoomJoined(page, LISTENER.userId);

      await injectUtterance(page, {
        roomId: room.id,
        participantId: SPEAKER.userId,
        utteranceId: "tr-e2e-2",
        sourceLang: "en",
        text: "hello"
      });

      const dock = page.locator('[aria-label="Live translation"]');
      await expect(dock).toBeVisible({ timeout: 10_000 });
      await expandDockIfCollapsed(dock);

      const log = dock.getByRole("log");
      await expect(log).toContainText("hello", { timeout: 10_000 });

      // No translate API call should have been made
      expect(translateCalled).toBe(false);

      // Same-language lines show no "translated from" metadata
      await expect(log.getByRole("button", { name: "show original" })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
