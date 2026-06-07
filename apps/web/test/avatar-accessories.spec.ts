import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Avatar accessories — end-to-end coverage.
 *
 * Requires both servers started with:
 *   ENABLE_AVATAR_ACCESSORIES=true  (API)
 *   NEXT_PUBLIC_ENABLE_AVATAR_ACCESSORIES=true  (web)
 *
 * Flags are set in playwright.config.ts webServer commands.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";

const TEACHER = { userId: "dev-teacher-accessories", displayName: "Ms. Rivera", role: "teacher" as const };
const STUDENT = { userId: "dev-student-accessories-a", displayName: "Avery Hat", role: "student" as const };

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

async function createAccessoriesRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Accessories ${suffix}`
  });
  const roomRecord = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Hat Lab ${suffix}`
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

async function expectParticipantAccessoryHead(
  page: Page,
  participantId: string,
  headSlug: string | null
) {
  await expect.poll(
    async () => {
      return page.evaluate((id) => {
        type DebugAccessories = {
          getAccessories?: (participantId: string) => { head?: string | null };
        };
        const debug = (window as Window & { __debug?: { avatarAccessories?: DebugAccessories } }).__debug
          ?.avatarAccessories;
        return debug?.getAccessories?.(id)?.head ?? null;
      }, participantId);
    },
    { timeout: 15_000 }
  ).toBe(headSlug);
}

async function openAvatarEditor(page: Page) {
  const dialog = page.getByRole("dialog", { name: /avatar editor/i });
  if (await dialog.isVisible()) {
    return;
  }
  await page.getByRole("button", { name: /edit your avatar/i }).click();
  await expect(dialog).toBeVisible({ timeout: 10_000 });
}

async function equipHeadAccessory(page: Page, slug: string | null) {
  const label = slug === null ? /^none$/i : new RegExp(slug === "bowler-hat" ? "bowler hat" : slug, "i");
  await page.getByRole("radio", { name: label }).check();
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByRole("button", { name: /^save$/i })).toBeDisabled({ timeout: 10_000 });
}

test("avatar accessory catalog API returns bowler-hat", async ({ request }) => {
  const { items } = await getJson<{ items: Array<{ slug: string; slot: string }> }>(
    request,
    "/v1/avatar-accessories",
    TEACHER
  );
  expect(items.some((entry) => entry.slug === "bowler-hat" && entry.slot === "head")).toBe(true);
});

test("equip bowler hat in editor; peer receives accessory; unequip clears it", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(90_000);
  const { room, invite } = await createAccessoriesRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await waitForRoomJoined(studentPage, room.name, STUDENT.userId);

  await openAvatarEditor(page);
  await equipHeadAccessory(page, "bowler-hat");

  const me = await getJson<{ avatar: { accessories?: { head?: string | null } } }>(
    request,
    "/v1/users/me",
    TEACHER
  );
  expect(me.avatar.accessories?.head).toBe("bowler-hat");

  await expectParticipantAccessoryHead(studentPage, TEACHER.userId, "bowler-hat");

  await openAvatarEditor(page);
  await equipHeadAccessory(page, null);

  const meAfter = await getJson<{ avatar: { accessories?: { head?: string | null } } }>(
    request,
    "/v1/users/me",
    TEACHER
  );
  expect(meAfter.avatar.accessories?.head ?? null).toBeNull();

  await expectParticipantAccessoryHead(studentPage, TEACHER.userId, null);
});

test("PATCH accessories via API persists on user record", async ({ request }) => {
  await patchJson(request, "/v1/users/me/accessories", TEACHER, {
    accessories: { head: "bowler-hat" }
  });

  const equipped = await getJson<{ avatar: { accessories?: { head?: string | null } } }>(
    request,
    "/v1/users/me",
    TEACHER
  );
  expect(equipped.avatar.accessories?.head).toBe("bowler-hat");

  await patchJson(request, "/v1/users/me/accessories", TEACHER, {
    accessories: { head: null }
  });

  const cleared = await getJson<{ avatar: { accessories?: { head?: string | null } } }>(
    request,
    "/v1/users/me",
    TEACHER
  );
  expect(cleared.avatar.accessories?.head ?? null).toBeNull();
});
