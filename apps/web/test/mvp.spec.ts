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
  await page.getByRole("button", { name: /^create room$/i }).click();
  await expect(page.getByRole("link", { name: /enter room/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("link", { name: /enter room/i }).click();
  await expect(page.getByRole("button", { name: "2D" })).toBeVisible({ timeout: 20_000 });
  const localPosition = page.getByTestId("participant-dev-teacher-position");
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
  await expect(page.getByText(/WASD, arrow keys/i)).toBeVisible();
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
  await studentPage.getByLabel("Role").selectOption("dev-student");
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

test("teacher can add an image wall object and remove it for a joined student", async ({ context, page, request }) => {
  const { room, invite } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`);
  await expect(page.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
  await page.getByLabel("File").setInputFiles({ name: "wave-diagram.png", mimeType: "image/png", buffer: png });
  await page.getByLabel("Title").fill("Wave diagram");
  await page.getByLabel("Alt text").fill("A wave diagram on the classroom wall");
  await page.getByRole("button", { name: "Add file" }).click();
  await expect(page.getByText("Wave diagram").first()).toBeVisible({ timeout: 20_000 });

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto("/");
  await studentPage.getByLabel("Role").selectOption("dev-student");
  await studentPage.getByLabel("Invite code").fill(invite.code);
  await studentPage.getByRole("button", { name: /join class room/i }).click();
  await expect(studentPage.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });
  await expect(studentPage.getByText("Wave diagram").first()).toBeVisible({ timeout: 20_000 });

  await studentPage.getByRole("button", { name: "2D" }).click();
  await expect(studentPage.getByLabel("Wall objects list")).toContainText("Wave diagram");

  await page.getByRole("button", { name: "Remove" }).first().click();
  await expect(page.getByText("Wave diagram")).toHaveCount(0, { timeout: 10_000 });
  await expect(studentPage.getByText("Wave diagram")).toHaveCount(0, { timeout: 10_000 });
});

test("teacher can author and run a three-step lesson while a student joins mid-run", async ({ context, page, request }) => {
  test.setTimeout(90_000);
  const { room, invite } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 20_000 });

  await page.getByTestId("lesson-run-title").fill("Forces warmup");
  await page.getByTestId("init-lesson-run").click();
  await expect(page.getByText("Lesson Script")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("lesson-script-dock")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("add-lesson-step-instruction").click();
  await page.getByTestId("lesson-instruction-body").fill("Read the diagram silently.");
  await page.getByTestId("save-lesson-step").click();
  await page.getByTestId("add-lesson-step-focus-board").click();
  await page.getByTestId("add-lesson-step-private-check").click();
  await expect(page.getByTestId("lesson-step-list")).toContainText("Quick check");

  await page.getByTestId("start-lesson-run").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Instruction", { timeout: 10_000 });
  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Look at the board", { timeout: 10_000 });

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("Avery Student", { timeout: 20_000 });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Step 2 of 3", { timeout: 10_000 });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Use this board");

  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Quick check", { timeout: 10_000 });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Answer the active check", { timeout: 10_000 });
  await expect(studentPage.getByLabel("Private checks")).toContainText("What do you notice?", { timeout: 10_000 });
  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-timeline")).toContainText("Quick check", { timeout: 10_000 });
});

test("lesson hud timers remain visible after advancing to the next step", async ({ context, page, request }) => {
  test.setTimeout(60_000);
  const { room, invite } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 20_000 });

  await page.getByTestId("lesson-run-title").fill("Timer overlap");
  await page.getByTestId("init-lesson-run").click();

  await page.getByTestId("add-lesson-step-timer").click();
  await page.getByTestId("save-lesson-step").click();
  await page.getByTestId("add-lesson-step-instruction").click();
  await page.getByTestId("save-lesson-step").click();

  await page.getByTestId("start-lesson-run").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Work timer", { timeout: 10_000 });
  await expect(page.getByTestId("lesson-timer-hud")).toContainText("Work time");

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "domcontentloaded" });
  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("Avery Student", { timeout: 20_000 });
  await expect(studentPage.getByTestId("lesson-timer-hud")).toContainText("Work time", { timeout: 10_000 });

  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Instruction", { timeout: 10_000 });
  await expect(page.getByTestId("lesson-timer-hud")).toContainText("Work time");
  await expect(studentPage.getByTestId("lesson-timer-hud")).toContainText("Work time", { timeout: 10_000 });
});

test("lesson quick-check multiple-choice choices accept new lines", async ({ page, request }) => {
  const { room } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 20_000 });

  await page.getByTestId("lesson-run-title").fill("Choice authoring");
  await page.getByTestId("init-lesson-run").click();
  await page.getByTestId("add-lesson-step-private-check").click();
  await page.getByLabel("Prompt type").selectOption("multiple-choice");
  const choices = page.getByLabel("Choices, one per line");
  await choices.fill("A");
  await choices.press("Enter");
  await choices.type("B");
  await expect(choices).toHaveValue("A\nB");
});

test("group-work lesson steps assign students to a board zone", async ({ context, page, request }) => {
  test.setTimeout(90_000);
  const { room, invite } = await createRoomWithInvite(request);
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 20_000 });

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "domcontentloaded" });
  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("Avery Student", { timeout: 20_000 });
  await expect(page.getByTestId("participant-dev-student")).toContainText("Avery Student", { timeout: 10_000 });

  await page.getByTestId("lesson-run-title").fill("Group zone");
  await page.getByTestId("init-lesson-run").click();
  await page.getByTestId("add-lesson-step-group-work").click();
  await page.getByTestId("save-lesson-step").click();

  await page.getByTestId("start-lesson-run").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Group work", { timeout: 10_000 });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Team A", { timeout: 10_000 });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Main board");
  await studentPage.getByRole("button", { name: /^group/i }).click();
  await expect(studentPage.getByLabel("Your group")).toContainText("Board: Main board");
  await expect(page.getByTestId("participant-dev-student")).toContainText("Team A");
});

test("room remains usable under a throttled browser profile", async ({ context, page }) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  try {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /class, with depth/i })).toBeVisible();
    const startedAt = Date.now();
    await page.getByRole("button", { name: /^create room$/i }).click();
    await page.getByRole("link", { name: /enter room/i }).click();
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

test("existing three-step lesson flow is unaffected when a non-default skin is pre-seeded on the room", async ({
  context,
  page,
  request
}) => {
  test.setTimeout(90_000);
  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
  const { room, invite } = await createRoomWithInvite(request);

  // Pre-seed the room with mars-surface via PATCH (mirrors a teacher setting it before class)
  const patchResp = await request.patch(`${API}/v1/rooms/${room.id}`, {
    data: {
      settings: {
        worldSkins: {
          enabled: true,
          skinId: "mars-surface",
          skinDayNightMode: "day",
          skinLocked: false,
          ambientGainOverride: null
        }
      }
    },
    headers: {
      "x-dev-user-id": TEACHER.userId,
      "x-dev-user-name": TEACHER.displayName,
      "x-dev-user-role": TEACHER.role
    }
  });
  // If ENABLE_WORLD_SKINS is off the patch still succeeds (settings are stored, inert)
  expect(patchResp.ok()).toBeTruthy();

  // Standard three-step lesson flow (copy of the existing test, no skin-specific assertions)
  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "commit" });
  await expect(page.getByTestId("participant-dev-teacher")).toContainText("Ms. Rivera", { timeout: 20_000 });

  await page.getByTestId("lesson-run-title").fill("Forces warmup (skin smoke)");
  await page.getByTestId("init-lesson-run").click();
  await expect(page.getByTestId("lesson-script-dock")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("add-lesson-step-instruction").click();
  await page.getByTestId("lesson-instruction-body").fill("Read the diagram silently.");
  await page.getByTestId("save-lesson-step").click();
  await page.getByTestId("add-lesson-step-private-check").click();
  await expect(page.getByTestId("lesson-step-list")).toContainText("Quick check");

  await page.getByTestId("start-lesson-run").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Instruction", { timeout: 10_000 });

  const studentPage = await context.newPage();
  await setIdentity(studentPage, STUDENT);
  await studentPage.goto(`/rooms/${room.id}?invite=${invite.code}`, { waitUntil: "commit" });
  await expect(studentPage.getByTestId("participant-dev-student")).toContainText("Avery Student", {
    timeout: 20_000
  });
  await expect(studentPage.getByTestId("lesson-student-callout")).toContainText("Step 1 of 2", {
    timeout: 10_000
  });

  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-run-current")).toContainText("Quick check", { timeout: 10_000 });
  await page.getByTestId("advance-lesson-step").click();
  await expect(page.getByTestId("lesson-timeline")).toContainText("Quick check", { timeout: 10_000 });
});
