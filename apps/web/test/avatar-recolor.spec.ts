import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";

const TEACHER = { userId: "dev-teacher-recolor", displayName: "Ms. Rivera", role: "teacher" as const };
const STUDENT = { userId: "dev-student-recolor-a", displayName: "Avery Color", role: "student" as const };

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

async function getJson<T>(request: APIRequestContext, path: string, identity: DevIdentity) {
  const response = await request.get(`${API_URL}${path}`, {
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createRecolorRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Recolor ${suffix}`
  });
  const roomRecord = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Recolor Lab ${suffix}`
  });
  await postJson(request, `/v1/classes/${classRecord.id}/members`, TEACHER, {
    userId: STUDENT.userId,
    displayName: STUDENT.displayName,
    role: "student",
    status: "active"
  });
  const invite = await postJson<{ code: string }>(
    request,
    `/v1/classes/${classRecord.id}/invites`,
    TEACHER,
    { role: "student", roomId: roomRecord.room.id, expiresInMinutes: 60 }
  );
  return { room: roomRecord.room, invite };
}

async function waitForRoomJoined(page: Page, roomName: string, userId: string) {
  await expect(page.getByTestId(`participant-${userId}`)).toBeVisible({ timeout: 45_000 });
  await expect(page.locator(".room-hud-name")).toHaveText(roomName, { timeout: 10_000 });
}

async function openAvatarEditor(page: Page) {
  const dialog = page.getByRole("dialog", { name: /avatar editor/i });
  if (await dialog.isVisible()) return;
  await page.getByRole("button", { name: /edit your avatar/i }).click();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
}

async function setChestColor(page: Page, color: string) {
  await page.locator(".avatar-editor__section-header").filter({ hasText: "Body" }).click();
  await page.evaluate((nextColor) => {
    const rows = Array.from(document.querySelectorAll(".avatar-editor__zone-row"));
    const row = rows.find((element) => element.textContent?.includes("Chest"));
    const input = row?.querySelector("input[type='color']") as HTMLInputElement | null;
    if (!input) throw new Error("Chest color input not found.");
    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, nextColor);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, color);
  await expect(page.getByRole("button", { name: /^save$/i })).toBeEnabled();
}

async function expectRenderState(page: Page, participantId: string, recolorActive: boolean) {
  await expect.poll(
    async () => {
      return page.evaluate((id) => {
        return (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).__debug?.avatarRecolor?.getRenderState?.(id)?.recolorActive as boolean | undefined
        ) ?? null;
      }, participantId);
    },
    { timeout: 15_000 }
  ).toBe(recolorActive);
}

test("avatar recolor stays baked until preview/save, then persists to peers", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(90_000);
  const { room, invite } = await createRecolorRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await waitForRoomJoined(studentPage, room.name, STUDENT.userId);

  await expectRenderState(page, TEACHER.userId, false);
  await expectRenderState(studentPage, TEACHER.userId, false);
  await expectRenderState(studentPage, STUDENT.userId, false);

  await openAvatarEditor(page);
  await setChestColor(page, "#ff0000");
  await expectRenderState(page, TEACHER.userId, true);

  await page.getByRole("button", { name: /close avatar editor/i }).click();
  await expectRenderState(page, TEACHER.userId, false);

  await openAvatarEditor(page);
  await setChestColor(page, "#ff0000");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("button", { name: /^save$/i })).toBeDisabled({ timeout: 10_000 });

  await expectRenderState(page, TEACHER.userId, true);
  await expectRenderState(studentPage, TEACHER.userId, true);
  await expectRenderState(studentPage, STUDENT.userId, false);

  const me = await getJson<{ avatar: { appearance?: { shirtFront?: string } | null } }>(request, "/v1/users/me", TEACHER);
  expect(me.avatar.appearance?.shirtFront?.toLowerCase()).toBe("#ff0000");

  await page.reload({ waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);
  await expectRenderState(page, TEACHER.userId, true);
});
