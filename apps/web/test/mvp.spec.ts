import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const TEACHER = { userId: "dev-teacher", displayName: "Ms. Rivera", role: "teacher" };
const STUDENT = { userId: "dev-student", displayName: "Avery Student", role: "student" };

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

async function createRoomWithInvite(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, { name: `Physics ${suffix}` });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Peer Lab ${suffix}`
  });
  const invite = await postJson<{ code: string }>(request, `/v1/classes/${classRecord.id}/invites`, TEACHER, {
    role: "student",
    roomId: roomWithManifest.room.id,
    expiresInMinutes: 60
  });
  return { room: roomWithManifest.room, invite };
}

test("teacher can create a room, move, and switch between 3D and 2D", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /class, with depth/i })).toBeVisible();
  await page.getByRole("button", { name: /create room and invite/i }).click();
  await expect(page.getByRole("button", { name: "2D" })).toBeVisible({ timeout: 20_000 });
  const localPosition = page.getByTestId("participant-dev-teacher-position");
  const positionBeforePointerMove = await localPosition.textContent();
  const canvas = page.locator("canvas").first();
  await canvas.click({ position: { x: 260, y: 220 } });
  await expect.poll(async () => localPosition.textContent(), { timeout: 5_000 }).not.toBe(positionBeforePointerMove);
  const positionBefore3dMove = await localPosition.textContent();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(350);
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => localPosition.textContent(), { timeout: 5_000 }).not.toBe(positionBefore3dMove);
  await page.getByRole("button", { name: /turn camera on/i }).click();
  await expect(page.getByRole("button", { name: /turn camera off/i })).toBeVisible();
  await page.getByRole("button", { name: /turn microphone on/i }).click();
  await expect(page.getByRole("button", { name: /mute microphone/i })).toBeVisible();
  await page.getByRole("button", { name: "2D" }).click();
  await expect(page.getByRole("img", { name: /top-down 2d analog/i })).toBeVisible();
  const positionBefore2dMove = await localPosition.textContent();
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(350);
  await page.keyboard.up("ArrowDown");
  await expect.poll(async () => localPosition.textContent(), { timeout: 5_000 }).not.toBe(positionBefore2dMove);
  await page.getByRole("button", { name: "3D" }).click();
  await expect(page.getByText(/keyboard movement/i)).toBeVisible();
});

test("student can join an invite and share movement and media state with the teacher", async ({ context, page, request }) => {
  const { room, invite } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`);
  await expect(page.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera");

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto("/");
  await studentPage.getByLabel("Role").selectOption("student");
  await studentPage.getByLabel("Invite code").fill(invite.code);
  await studentPage.getByRole("button", { name: /join class room/i }).click();
  await expect(studentPage.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });

  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("Avery Student");
  await expect(page.getByTestId("participant-dev-student")).toContainText("Avery Student", { timeout: 10_000 });
  await expect(studentPage.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 10_000 });

  await studentPage.bringToFront();
  await studentPage.locator(".room-stage").click();
  const localStudentPosition = studentPage.getByTestId("participant-dev-student-position");
  const localPositionBeforeMove = await localStudentPosition.textContent();
  const remoteStudentPosition = page.getByTestId("participant-dev-student-position");
  const remotePositionBeforeMove = await remoteStudentPosition.textContent();
  await studentPage.keyboard.down("ArrowRight");
  await studentPage.waitForTimeout(500);
  await studentPage.keyboard.up("ArrowRight");
  await expect.poll(async () => localStudentPosition.textContent(), { timeout: 5_000 }).not.toBe(localPositionBeforeMove);
  await expect.poll(async () => remoteStudentPosition.textContent(), { timeout: 8_000 }).not.toBe(remotePositionBeforeMove);

  await studentPage.getByRole("button", { name: /turn camera on/i }).click();
  await expect(studentPage.getByRole("button", { name: /turn camera off/i })).toBeVisible();
  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("camera on");
  await expect(page.getByTestId("participant-dev-student")).toContainText("camera on", { timeout: 8_000 });
  await studentPage.getByRole("button", { name: "2D" }).click();
  await expect(page.getByTestId("participant-dev-student")).toContainText("2d", { timeout: 8_000 });
});

test("room remains usable under a throttled browser profile", async ({ context, page }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /class, with depth/i })).toBeVisible();
    const startedAt = Date.now();
    await page.getByRole("button", { name: /create room and invite/i }).click();
    await expect(page.getByRole("button", { name: "2D" })).toBeVisible({ timeout: 30_000 });
    expect(Date.now() - startedAt).toBeLessThan(30_000);

    await page.getByRole("button", { name: "2D" }).click();
    await expect(page.getByRole("img", { name: /top-down 2d analog/i })).toBeVisible();
    const localPosition = page.getByTestId("participant-dev-teacher-position");
    const positionBeforeMove = await localPosition.textContent();
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(500);
    await page.keyboard.up("ArrowLeft");
    await expect.poll(async () => localPosition.textContent(), { timeout: 8_000 }).not.toBe(positionBeforeMove);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => undefined);
    await cdp.detach().catch(() => undefined);
  }
});
