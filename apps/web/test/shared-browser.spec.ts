import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";
const FFA_ANCHOR = "ffa-adj-east-anchor";

const HOST = { userId: "dev-host-sb", displayName: "Host Browser", role: "teacher" as const };
const GUEST = { userId: "dev-guest-sb", displayName: "Guest Browser", role: "student" as const };

type DevIdentity = typeof HOST | typeof GUEST;

type RoomWithManifest = {
  room: { id: string; name: string; type: string };
  manifest: { wallAnchors: Array<{ id: string }> };
};

type WallObject = { id: string; type: string };

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

async function setIdentity(page: Page, identity: DevIdentity) {
  await page.addInitScript(
    ({ key, value, ffaKey, ffaValue }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      window.sessionStorage.setItem(ffaKey, ffaValue);
    },
    {
      key: IDENTITY_STORAGE_KEY,
      value: identity,
      ffaKey: "freeForAllPassword",
      ffaValue: FFA_PASSWORD
    }
  );
}

async function postJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.post(`${API_URL}${path}`, {
    data,
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createFfaRoomWithSharedBrowser(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", HOST, {
    name: `FFA Shared Browser ${suffix}`
  });
  const roomWithManifest = await postJson<RoomWithManifest>(request, "/v1/rooms", HOST, {
    classId: classRecord.id,
    name: `Browser Lab ${suffix}`,
    type: "free-for-all",
    freeForAllPassword: FFA_PASSWORD
  });
  expect(roomWithManifest.room.type).toBe("free-for-all");

  await postJson(request, `/v1/classes/${classRecord.id}/members`, HOST, {
    userId: GUEST.userId,
    displayName: GUEST.displayName,
    role: "student",
    status: "active"
  });

  const wallObject = await postJson<WallObject>(request, `/v1/rooms/${roomWithManifest.room.id}/wall-objects`, HOST, {
    type: "web.browser.shared",
    title: "Shared Browser",
    wallAnchorId: FFA_ANCHOR,
    placement: { row: 0, column: 0 },
    source: { kind: "inline", data: { startUrl: "https://www.wikipedia.org/" } }
  });
  expect(wallObject.type).toBe("web.browser.shared");

  return { classId: classRecord.id, room: roomWithManifest.room, wallObjectId: wallObject.id };
}

async function waitForRoomReady(page: Page, roomName: string) {
  await expect(page.locator(".room-hud-name")).toContainText(roomName, { timeout: 45_000 });
  await expect(page.getByRole("button", { name: "2D", exact: true })).toBeEnabled({ timeout: 45_000 });
}

async function enterRoom2D(page: Page, roomId: string, roomName: string) {
  await page.goto(`/rooms/${roomId}`, { waitUntil: "domcontentloaded" });
  await waitForRoomReady(page, roomName);
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.locator(".map2d-whiteboard--browser").first()).toBeVisible({ timeout: 20_000 });
}

async function openSharedBrowserOnMap(page: Page) {
  const board = page.locator(".map2d-whiteboard--browser").first();
  await expect(board.getByTestId("shared-browser-viewport")).toBeVisible({ timeout: 20_000 });
  return board;
}

test.describe("shared browser (Hyperbeam)", () => {
  test.describe.configure({ timeout: 60_000 });

  test("API: resume, navigate, and hydrate return Hyperbeam embed metadata", async ({ request }) => {
    const { room, wallObjectId } = await createFfaRoomWithSharedBrowser(request);

    const resumed = await request.post(
      `${API_URL}/v1/rooms/${room.id}/wall-objects/${wallObjectId}/shared-browser/resume`,
      { headers: authHeaders(HOST) }
    );
    expect(resumed.ok()).toBeTruthy();
    const resumedBody = (await resumed.json()) as { session: { status: string; hyperbeam?: { embedUrl?: string } } };
    expect(resumedBody.session.status).toBe("active");
    expect(resumedBody.session.hyperbeam?.embedUrl).toContain("127.0.0.1");

    const navigated = await request.post(
      `${API_URL}/v1/rooms/${room.id}/wall-objects/${wallObjectId}/shared-browser/navigate`,
      { headers: authHeaders(HOST), data: { url: "https://example.com/" } }
    );
    expect(navigated.ok()).toBeTruthy();

    const hydrate = await request.get(
      `${API_URL}/v1/rooms/${room.id}/wall-objects/${wallObjectId}/shared-browser`,
      { headers: authHeaders(GUEST) }
    );
    expect(hydrate.ok()).toBeTruthy();
    const hydrateBody = (await hydrate.json()) as { session: { currentUrl: string; hyperbeam?: { embedUrl?: string } } };
    expect(hydrateBody.session.currentUrl).toBe("https://example.com/");
    expect(hydrateBody.session.hyperbeam?.embedUrl).toContain("127.0.0.1");
  });

  test("two participants resume in UI, see embed, navigate, and take control", async ({ context, page, request }) => {
    test.setTimeout(90_000);
    const { room } = await createFfaRoomWithSharedBrowser(request);

    await setIdentity(page, HOST);
    await enterRoom2D(page, room.id, room.name);
    await page.getByTestId("shared-browser-resume").click();

    const hostBoard = await openSharedBrowserOnMap(page);
    await expect(hostBoard.getByTestId("hyperbeam-mock-video")).toBeVisible({ timeout: 25_000 });

    const urlInput = hostBoard.getByRole("textbox", { name: "Shared browser URL" });
    await urlInput.fill("https://example.com/");
    await hostBoard.getByRole("button", { name: "Go" }).click();
    await expect(urlInput).toHaveValue("https://example.com/");

    const guestPage = await context.newPage();
    await setIdentity(guestPage, GUEST);
    await enterRoom2D(guestPage, room.id, room.name);

    const guestBoard = await openSharedBrowserOnMap(guestPage);
    await expect(guestBoard.getByTestId("hyperbeam-mock-video")).toBeVisible({ timeout: 25_000 });

    await guestBoard.getByRole("button", { name: "Take control" }).click();
    await expect(guestBoard.getByRole("button", { name: "Release" })).toBeVisible({ timeout: 10_000 });
    await expect(guestBoard).toContainText("You have control");

    const playAudio = guestBoard.getByTestId("hyperbeam-mock-play-audio");
    if (await playAudio.count()) {
      await playAudio.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(playAudio).toHaveCount(0);
    }

    await guestPage.close();
  });
});
