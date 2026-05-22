import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const TEACHER = { userId: "dev-teacher", displayName: "Ms. Rivera", role: "teacher" };

type DevIdentity = typeof TEACHER;

async function setIdentity(page: Page, identity: DevIdentity) {
  await page.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
    },
    { key: IDENTITY_STORAGE_KEY, value: identity }
  );
}

async function postJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.post(`${API_URL}${path}`, {
    data,
    headers: {
      "x-dev-user-id": identity.userId,
      "x-dev-user-name": identity.displayName,
      "x-dev-user-role": identity.role
    }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function patchJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.patch(`${API_URL}${path}`, {
    data,
    headers: {
      "x-dev-user-id": identity.userId,
      "x-dev-user-name": identity.displayName,
      "x-dev-user-role": identity.role
    }
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createRoomWithRoomObjects(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, { name: `Chem ${suffix}` });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Manipulatives ${suffix}`
  });
  await patchJson(request, `/v1/rooms/${roomWithManifest.room.id}`, TEACHER, {
    settings: {
      roomObjects: {
        enabled: true,
        maxActive: 8,
        customUploadsEnabled: false,
        maxUploadSizeBytes: 8 * 1024 * 1024,
        defaultTouchPolicy: "teacher-only"
      }
    }
  });
  return roomWithManifest.room;
}

async function waitForRoomJoined(page: Page, roomName: string) {
  await expect(page.getByTestId("participant-dev-teacher")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".room-hud-name")).toHaveText(roomName, { timeout: 10_000 });
}

test.describe("room objects", () => {
  test.setTimeout(90_000);

  test("teacher places the hero manipulative and opens the inspector", async ({ page, request }) => {
    const room = await createRoomWithRoomObjects(request);
    await setIdentity(page, TEACHER);
    await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
    await waitForRoomJoined(page, room.name);

    const objectsHeading = page.getByRole("button", { name: /^objects\b/i });
    await expect(objectsHeading).toBeVisible({ timeout: 15_000 });
    if ((await objectsHeading.getAttribute("aria-expanded")) !== "true") {
      await objectsHeading.click();
    }

    const placeHero = page.getByTestId("room-object-place-water-molecule");
    await expect(placeHero).toBeVisible({ timeout: 15_000 });
    await placeHero.click();
    const activeObject = page.getByLabel("Room objects").getByRole("button", { name: /water molecule/i });
    await expect(activeObject).toBeVisible({ timeout: 10_000 });

    const inspector = page.locator(".room-object-inspector");
    await expect(inspector).toBeVisible({ timeout: 15_000 });
    await expect(inspector.getByText("Model style", { exact: true })).toBeVisible();
    await expect(inspector.getByText("Bond-angle readout", { exact: true })).toBeVisible();
  });

  test("hero is visible on the 2D map after place", async ({ page, request }) => {
    const room = await createRoomWithRoomObjects(request);
    await setIdentity(page, TEACHER);
    await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
    await waitForRoomJoined(page, room.name);

    const objectsHeading = page.getByRole("button", { name: /^objects\b/i });
    if ((await objectsHeading.getAttribute("aria-expanded")) !== "true") {
      await objectsHeading.click();
    }
    await page.getByTestId("room-object-place-water-molecule").click();
    await expect(page.getByLabel("Room objects").getByRole("button", { name: /water molecule/i })).toBeVisible({
      timeout: 10_000
    });

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page.getByRole("img", { name: /top-down 2d analog/i })).toBeVisible();
    await expect(page.getByLabel("Water molecule (H₂O)")).toBeVisible();
  });
});
