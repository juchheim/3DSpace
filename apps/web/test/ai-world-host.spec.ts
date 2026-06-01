import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * FFA AI World Host E2E.
 *
 * Requires Playwright webServer env (see `playwright.config.ts`) with
 * `ENABLE_AI_WORLD_HOST`, `AI_WORLD_HOST_MOCK_RESPONSES`, and matching `NEXT_PUBLIC_*`.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";
const HOST_USER = { userId: "dev-ai-host-guide", displayName: "Ms. Rivera", role: "teacher" as const };

type DevIdentity = typeof HOST_USER;

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

async function setIdentity(page: Page, identity: DevIdentity, options?: { ffaPassword?: string }) {
  await page.addInitScript(
    ({ key, value, ffaKey, ffaValue }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      if (ffaValue) {
        window.sessionStorage.setItem(ffaKey, ffaValue);
      }
    },
    {
      key: IDENTITY_STORAGE_KEY,
      value: identity,
      ffaKey: "freeForAllPassword",
      ffaValue: options?.ffaPassword ?? ""
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

async function createFfaRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", HOST_USER, {
    name: `AI Host ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", HOST_USER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `Guide Lab ${suffix}`,
    freeForAllPassword: FFA_PASSWORD
  });
  return roomWithManifest.room;
}

async function createClassroomRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", HOST_USER, {
    name: `Classroom ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", HOST_USER, {
    classId: classRecord.id,
    name: `Peer Lab ${suffix}`
  });
  return roomWithManifest.room;
}

async function joinFfaRoom(page: Page, roomId: string, roomName: string) {
  await setIdentity(page, HOST_USER, { ffaPassword: FFA_PASSWORD });
  await page.goto(`/rooms/${roomId}`, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByTestId(`participant-${HOST_USER.userId}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".room-hud-name")).toContainText(roomName, { timeout: 15_000 });
}

async function summonGuideAtHub(page: Page, name = "Chip") {
  await page.getByRole("button", { name: /summon guide/i }).click();
  await page.getByLabel(/guide name/i).fill(name);
  await page.getByRole("button", { name: /place at hub/i }).click();
  await expect(page.getByTestId("ai-host-nameplate")).toContainText(name, { timeout: 20_000 });
}

test.describe("ai world host", () => {
  test("does not show World Host UI in non-FFA rooms", async ({ page, request }) => {
    const room = await createClassroomRoom(request);
    await setIdentity(page, HOST_USER);
    await page.goto(`/rooms/${room.id}`, { waitUntil: "commit", timeout: 90_000 });
    await expect(page.getByTestId(`participant-${HOST_USER.userId}`)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("region", { name: "World Host" })).toHaveCount(0);
    await expect(page.getByTestId("ai-world-host-panel")).toHaveCount(0);
  });

  test("summons guide, answers build help, and shows speech bubble", async ({ page, request }) => {
    const room = await createFfaRoom(request);
    await joinFfaRoom(page, room.id, room.name);

    await expect(page.getByRole("region", { name: "World Host" })).toBeVisible();
    await summonGuideAtHub(page);

    await page.getByRole("button", { name: "How do I undo?" }).click();

    const panel = page.getByTestId("ai-world-host-panel");
    await expect(panel.getByText(/⌘Z|Ctrl\+Z/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("ai-host-bubble")).toContainText(/⌘Z|undo/i, { timeout: 20_000 });
  });

  test("shows guide marker and chat panel in 2D view", async ({ page, request }) => {
    const room = await createFfaRoom(request);
    await joinFfaRoom(page, room.id, room.name);
    await summonGuideAtHub(page);

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page.getByRole("img", { name: /top-down 2d analog/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".world-host-marker-2d")).toBeVisible();
    await expect(page.getByTestId("ai-world-host-panel")).toBeVisible();

    await page.getByRole("button", { name: "How do I place a wall?" }).click();
    await expect(page.getByTestId("ai-world-host-panel").getByText(/You asked:/i)).toBeVisible({
      timeout: 20_000
    });
  });
});
