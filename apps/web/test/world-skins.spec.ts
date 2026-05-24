import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * World Skins Phase A — end-to-end coverage.
 *
 * Requires both servers started with:
 *   ENABLE_WORLD_SKINS=true  (API)
 *   NEXT_PUBLIC_ENABLE_WORLD_SKINS=true  (web)
 *
 * These flags are set in playwright.config.ts webServer commands so
 * `npx playwright test apps/web/test/world-skins.spec.ts` works out of the box.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";

const TEACHER = { userId: "dev-teacher-skins", displayName: "Ms. Rivera", role: "teacher" as const };
const STUDENT = { userId: "dev-student-skins-a", displayName: "Avery Skins", role: "student" as const };

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

async function expectWorldSkinSlug(page: Page, slug: string | null) {
  await expect.poll(
    async () => {
      return page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__debug?.worldSkin?.skin?.slug as string | null | undefined;
      });
    },
    { timeout: 10_000 }
  ).toBe(slug);
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

async function classroomAction<T>(request: APIRequestContext, roomId: string, data: unknown) {
  return postJson<T>(request, `/v1/rooms/${roomId}/classroom/actions`, TEACHER, data);
}

async function createSkinsRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `World Skins ${suffix}`
  });
  const roomRecord = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Skins Lab ${suffix}`
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
  await expect(page.getByTestId(`participant-${userId}`)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".room-hud-name")).toHaveText(roomName, { timeout: 10_000 });
}

// ─── Catalog API ─────────────────────────────────────────────────────────────

test("world skin catalog returns default-theater plus five themed skins with absolute URLs", async ({
  request
}) => {
  const { skins } = await getJson<{ skins: Array<{ slug: string; thumbnailStorageKey: string }> }>(
    request,
    "/v1/world-skins",
    TEACHER
  );

  const slugs = skins.map((s) => s.slug).sort();
  expect(slugs).toEqual([
    "art-studio",
    "cell-interior",
    "default-theater",
    "mars-surface",
    "rainforest-canopy",
    "roman-forum"
  ]);

  for (const skin of skins) {
    expect(skin.thumbnailStorageKey).toMatch(/^https?:\/\//);
  }
});

test("world skin catalog single-skin fetch includes absolute asset URLs", async ({ request }) => {
  const skin = await getJson<{ slug: string; overrides: { ambient?: { storageKey: string } } }>(
    request,
    "/v1/world-skins/mars-surface",
    TEACHER
  );
  expect(skin.slug).toBe("mars-surface");
  if (skin.overrides.ambient) {
    expect(skin.overrides.ambient.storageKey).toMatch(/^https?:\/\//);
  }
});

// ─── Classroom actions via API ────────────────────────────────────────────────

test("teacher can set room skin via classroom action; student receives realtime room.skin.v1", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room, invite } = await createSkinsRoom(request);

  // Teacher joins
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  // Student joins
  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await waitForRoomJoined(studentPage, room.name, STUDENT.userId);

  // Teacher dispatches set-room-skin via API (mirrors HUD action)
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "mars-surface" });

  // Student receives the active skin
  await expectWorldSkinSlug(studentPage, "mars-surface");

  // Teacher's __debug hook reflects the skin
  const teacherSkinSlug = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__debug?.worldSkin?.skin?.slug as string | undefined;
  });
  expect(teacherSkinSlug).toBe("mars-surface");
});

test("teacher sets mars skin then switches to cell-interior; student skin updates", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room, invite } = await createSkinsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await waitForRoomJoined(studentPage, room.name, STUDENT.userId);

  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "mars-surface" });
  await expectWorldSkinSlug(studentPage, "mars-surface");

  // Switch to cell-interior — student receives the new skin
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "cell-interior" });
  await expectWorldSkinSlug(studentPage, "cell-interior");
});

test("set-room-skin to null restores default theater; active skin clears", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room, invite } = await createSkinsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await waitForRoomJoined(studentPage, room.name, STUDENT.userId);

  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "mars-surface" });
  await expectWorldSkinSlug(studentPage, "mars-surface");

  await classroomAction(request, room.id, { type: "set-room-skin", skinId: null });
  await expectWorldSkinSlug(studentPage, null);
});

test("walk speed multiplier available on debug hook when mars skin is active", async ({
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room } = await createSkinsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "mars-surface" });

  // Wait for skin to hydrate on teacher client
  await expect.poll(
    async () => {
      return page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (window as any).__debug?.worldSkin?.skin?.overrides?.walkSpeedMultiplier as number | undefined;
      });
    },
    { timeout: 10_000 }
  ).toBeDefined();

  const multiplier = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (window as any).__debug?.worldSkin?.skin?.overrides?.walkSpeedMultiplier as number | undefined;
  });
  // Mars walk speed multiplier is less than 1 (lower gravity feel)
  expect(multiplier).toBeLessThan(1);
});

test("roman-forum day/night toggle changes state; set-room-skin-day-night error on non-forum skin", async ({
  request
}) => {
  const { room } = await createSkinsRoom(request);

  // Set roman-forum skin
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "roman-forum" });

  // Day/night toggle on roman-forum should succeed
  const dayNightResp = await request.post(`${API_URL}/v1/rooms/${room.id}/classroom/actions`, {
    data: { type: "set-room-skin-day-night", mode: "night" },
    headers: authHeaders(TEACHER)
  });
  expect(dayNightResp.ok()).toBeTruthy();

  // Verify persisted
  const roomData = await getJson<{ room: { settings: { worldSkins?: { skinDayNightMode?: string } } } }>(
    request,
    `/v1/rooms/${room.id}`,
    TEACHER
  );
  expect(roomData.room.settings.worldSkins?.skinDayNightMode).toBe("night");

  // Day/night toggle on non-roman-forum skin should 422
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "art-studio" });
  const badDayNight = await request.post(`${API_URL}/v1/rooms/${room.id}/classroom/actions`, {
    data: { type: "set-room-skin-day-night", mode: "night" },
    headers: authHeaders(TEACHER)
  });
  expect(badDayNight.status()).toBe(422);
});

// ─── EnvironmentCard HUD ─────────────────────────────────────────────────────

test("teacher environment card shows current skin label and picker opens", async ({
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room } = await createSkinsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  // Expand environment card
  const envHeading = page.getByRole("button", { name: /environment/i });
  await expect(envHeading).toBeVisible({ timeout: 15_000 });
  if ((await envHeading.getAttribute("aria-expanded")) !== "true") {
    await envHeading.click();
  }

  // No skin yet — label shows default
  await expect(page.locator(".environment-card__label")).toContainText(/default theater/i, {
    timeout: 5_000
  });

  // Open picker
  await page.getByRole("button", { name: /change/i }).click();
  await expect(page.getByRole("dialog", { name: /choose environment/i })).toBeVisible({ timeout: 5_000 });

  // Default theater tile + five themed skins (default-theater hidden from themed grid)
  const tiles = page.locator(".environment-picker__tile");
  await expect(tiles).toHaveCount(6, { timeout: 10_000 });

  // Select mars-surface from picker
  await page.locator(".environment-picker__tile", { hasText: /mars surface/i }).click();

  // Picker closes; card label updates
  await expect(page.getByRole("dialog", { name: /choose environment/i })).toHaveCount(0, { timeout: 5_000 });
  await expect(page.locator(".environment-card__label")).toContainText(/mars surface/i, { timeout: 10_000 });
});

test("teacher default button in environment card resets skin to null", async ({
  page,
  request
}) => {
  test.setTimeout(60_000);
  const { room } = await createSkinsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  // Set a skin via API so the Default button appears
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "art-studio" });

  const envHeading = page.getByRole("button", { name: /environment/i });
  await expect(envHeading).toBeVisible({ timeout: 10_000 });
  if ((await envHeading.getAttribute("aria-expanded")) !== "true") {
    await envHeading.click();
  }

  await expect(page.locator(".environment-card__label")).toContainText(/art studio/i, { timeout: 10_000 });

  await page.getByRole("button", { name: /^default$/i }).click();
  await expect(page.locator(".environment-card__label")).toContainText(/default theater/i, { timeout: 10_000 });
});

// ─── Smoke: lesson run + mid-run skin switch doesn't break state ──────────────

test("three-step lesson still works when a skin is active mid-run", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(90_000);
  const { room, invite } = await createSkinsRoom(request);

  // Pre-seed mars-surface via settings PATCH
  await patchJson(request, `/v1/rooms/${room.id}`, TEACHER, {
    settings: { worldSkins: { enabled: true, skinId: "mars-surface", skinDayNightMode: "day", ambientGainOverride: null } }
  });

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await waitForRoomJoined(page, room.name, TEACHER.userId);

  // Active skin hydrates for teacher
  await expectWorldSkinSlug(page, "mars-surface");

  // Lesson authoring
  await page.getByTestId("lesson-run-title").fill("Mars Forces");
  await page.getByTestId("init-lesson-run").click();
  await expect(page.getByTestId("lesson-script-dock")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("add-lesson-step-instruction").click();
  await page.getByTestId("lesson-instruction-body").fill("Observe the Martian terrain.");
  await page.getByTestId("save-lesson-step").click();
  await page.getByTestId("add-lesson-step-private-check").click();
  await expect(page.getByTestId("lesson-step-list")).toContainText("Quick check");

  await page.getByTestId("start-lesson-run").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Instruction", { timeout: 10_000 });

  // Student joins mid-run
  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await expect(studentPage.getByTestId(`participant-${STUDENT.userId}`)).toBeVisible({ timeout: 30_000 });
  await expectWorldSkinSlug(studentPage, "mars-surface");
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Step 1 of 2", { timeout: 10_000 });

  // Switch skin mid-run — lesson state must not drift
  await classroomAction(request, room.id, { type: "set-room-skin", skinId: "cell-interior" });
  await expectWorldSkinSlug(studentPage, "cell-interior");
  // Lesson callout still intact
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Step 1 of 2");

  // Complete the run
  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Quick check", { timeout: 10_000 });
  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-timeline")).toContainText("Quick check", { timeout: 10_000 });
});
