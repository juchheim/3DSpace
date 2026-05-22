import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const TEACHER = { userId: "dev-teacher-room-objects", displayName: "Ms. Rivera", role: "teacher" as const };
const STUDENT = { userId: "dev-student-room-objects-a", displayName: "Jordan Chem", role: "student" as const };
type DevIdentity = typeof TEACHER | typeof STUDENT;

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

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
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function patchJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.patch(`${API_URL}${path}`, {
    data,
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getJson<T>(request: APIRequestContext, path: string, identity: DevIdentity) {
  const response = await request.get(`${API_URL}${path}`, {
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

type RoomObjectRecord = {
  id: string;
  touchPolicy: string;
  scale: number;
  pose: { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number; roll: number } };
};

async function listRoomObjects(request: APIRequestContext, roomId: string) {
  const payload = await getJson<{ objects: RoomObjectRecord[] }>(request, `/v1/rooms/${roomId}/objects`, TEACHER);
  return payload.objects;
}

async function createRoomWithRoomObjects(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, { name: `Chem ${suffix}` });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Manipulatives ${suffix}`
  });

  await postJson(request, `/v1/classes/${classRecord.id}/members`, TEACHER, {
    userId: STUDENT.userId,
    displayName: STUDENT.displayName,
    role: "student",
    status: "active"
  });

  await patchJson(request, `/v1/rooms/${roomWithManifest.room.id}`, TEACHER, {
    settings: {
      roomObjects: {
        enabled: true,
        maxActive: 8,
        customUploadsEnabled: false
      }
    }
  });

  return roomWithManifest.room;
}

async function waitForRoomJoined(page: Page, roomName: string, identity: DevIdentity) {
  await expect(page.getByTestId(`participant-${identity.userId}`)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".room-hud-name")).toHaveText(roomName, { timeout: 10_000 });
}

async function expandObjectsToolbar(page: Page) {
  const objectsHeading = page.getByRole("button", { name: /^objects\b/i });
  await expect(objectsHeading).toBeVisible({ timeout: 15_000 });
  if ((await objectsHeading.getAttribute("aria-expanded")) !== "true") {
    await objectsHeading.click();
  }
}

async function placeHero(page: Page) {
  await expandObjectsToolbar(page);
  const placeHeroButton = page.getByTestId("room-object-place-water-molecule");
  await expect(placeHeroButton).toBeVisible({ timeout: 15_000 });
  await placeHeroButton.click();
  await expect(page.getByLabel("Room objects").getByRole("button", { name: /water molecule/i })).toBeVisible({
    timeout: 10_000
  });
}

async function heroInspector(page: Page) {
  const dock = page.getByTestId("room-object-inspector-dock");
  if (!(await dock.isVisible())) {
    const activeButton = page.getByLabel("Room objects").getByRole("button", { name: /water molecule/i });
    const isSelected = await activeButton.evaluate((element) =>
      element.classList.contains("room-object-toolbar__inspect--active")
    );
    if (!isSelected) {
      await activeButton.click();
    }
  }
  await expect(dock).toBeVisible({ timeout: 15_000 });
  const inspector = dock.locator(".room-object-inspector");
  await expect(inspector).toBeVisible();
  return inspector;
}

async function grantTouchToClass(teacherInspector: ReturnType<Page["locator"]>) {
  await teacherInspector.locator(".room-object-inspector__section--teacher select").selectOption("all-class");
  await teacherInspector.getByRole("button", { name: "Apply touch policy" }).click();
}

test.describe("room objects", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("teacher opts in, places hero, sees 3D canvas, inspector params, and 2D icon", async ({ page, request }) => {
    const room = await createRoomWithRoomObjects(request);
    await setIdentity(page, TEACHER);
    await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
    await waitForRoomJoined(page, room.name, TEACHER);

    await placeHero(page);
    await expect(page.locator("canvas").first()).toBeVisible({ timeout: 15_000 });

    const inspector = await heroInspector(page);
    await expect(inspector.getByText("Model style", { exact: true })).toBeVisible();
    await expect(inspector.getByText("Bond-angle readout", { exact: true })).toBeVisible();
    await expect(inspector.locator(".room-object-inspector__row").filter({ hasText: "Scale" })).toBeVisible();

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page.getByRole("img", { name: /top-down 2d analog/i })).toBeVisible();
    await expect(page.locator('.room-object-icon-2d[aria-label="Water molecule (H₂O)"]')).toBeVisible();
  });

  test("granted student manipulates hero; teacher syncs, resets, and removes for both tabs", async ({
    context,
    page,
    request
  }) => {
    const room = await createRoomWithRoomObjects(request);

    await setIdentity(page, TEACHER);
    await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
    await waitForRoomJoined(page, room.name, TEACHER);
    await placeHero(page);
    const teacherInspector = await heroInspector(page);
    await grantTouchToClass(teacherInspector);
    await expect.poll(async () => (await listRoomObjects(request, room.id))[0]?.touchPolicy).toBe("all-class");

    const [placedObject] = await listRoomObjects(request, room.id);
    expect(placedObject).toBeTruthy();

    const studentPage = await context.newPage();
    await setIdentity(studentPage, STUDENT);
    await studentPage.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
    await waitForRoomJoined(studentPage, room.name, STUDENT);
    await studentPage.getByRole("button", { name: "2D" }).click();
    await expect(studentPage.locator('.room-object-icon-2d[aria-label="Water molecule (H₂O)"]')).toBeVisible({
      timeout: 10_000
    });

    await studentPage.evaluate(async (objectId) => {
      const debug = (window as Window & { __debug?: { roomObjects?: { actions: { beginGrab(id: string): Promise<boolean>; endGrab(id: string, pose: unknown, scale: number): Promise<void> }; objectsById: Record<string, { pose: { position: { x: number; y: number; z: number }; rotation: { yaw: number; pitch: number; roll: number } }; scale: number }> } } }).__debug
        ?.roomObjects;
      if (!debug?.actions) throw new Error("roomObjects debug hook is unavailable");
      const grabbed = await debug.actions.beginGrab(objectId);
      if (!grabbed) throw new Error("student could not acquire grab lock");
      const current = debug.objectsById[objectId]!;
      const nextPose = {
        ...current.pose,
        position: { ...current.pose.position, x: current.pose.position.x + 0.75 },
        rotation: { ...current.pose.rotation, yaw: current.pose.rotation.yaw + 0.35 }
      };
      await debug.actions.endGrab(objectId, nextPose, current.scale);
    }, placedObject!.id);

    await expect
      .poll(
        async () => {
          const [current] = await listRoomObjects(request, room.id);
          if (!current) return false;
          const moved =
            Math.abs(current.pose.position.x - placedObject!.pose.position.x) > 0.05 ||
            Math.abs(current.pose.position.z - placedObject!.pose.position.z) > 0.05;
          const rotated = Math.abs(current.pose.rotation.yaw - placedObject!.pose.rotation.yaw) > 0.05;
          return moved || rotated;
        },
        { timeout: 30_000 }
      )
      .toBe(true);

    const [afterManip] = await listRoomObjects(request, room.id);
    await teacherInspector.getByRole("button", { name: "Reset" }).click();
    await expect
      .poll(
        async () => {
          const [current] = await listRoomObjects(request, room.id);
          if (!current || !afterManip) return false;
          const poseReset =
            Math.abs(current.pose.position.x - afterManip.pose.position.x) > 0.05 ||
            Math.abs(current.pose.position.z - afterManip.pose.position.z) > 0.05 ||
            Math.abs(current.pose.rotation.yaw - afterManip.pose.rotation.yaw) > 0.05;
          const scaleReset = Math.abs(current.scale - afterManip.scale) > 0.01 || Math.abs(current.scale - 2.2) < 0.15;
          return poseReset || scaleReset;
        },
        { timeout: 15_000 }
      )
      .toBe(true);

    await teacherInspector.getByRole("button", { name: "Remove" }).click();
    await expect.poll(async () => (await listRoomObjects(request, room.id)).length).toBe(0);
    await expect(page.getByLabel("Room objects").getByText("No objects placed yet.")).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.locator('.room-object-icon-2d[aria-label="Water molecule (H₂O)"]')).toHaveCount(0);
  });
});
