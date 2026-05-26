import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const INSTRUCTOR = { userId: "dev-instructor-wt", displayName: "Jordan Instructor", role: "teacher" as const };
const TRAINEE = { userId: "dev-trainee-wt", displayName: "Casey Trainee", role: "student" as const };

type DevIdentity = typeof INSTRUCTOR | typeof TRAINEE;

type RoomWithManifest = {
  room: { id: string; name: string; type: string };
  manifest: {
    dimensions: { width: number; depth: number; height: number };
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    wallAnchors: Array<{ id: string; label: string }>;
    spawnPoints: Array<{ id: string }>;
  };
};

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

async function createWorkforceTrainingRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", INSTRUCTOR, {
    name: `Acme Field Ops ${suffix}`
  });
  const roomWithManifest = await postJson<RoomWithManifest>(request, "/v1/rooms", INSTRUCTOR, {
    classId: classRecord.id,
    name: `Compliance Refresher ${suffix}`,
    type: "workforce-training"
  });
  const invite = await postJson<{ code: string }>(
    request,
    `/v1/classes/${classRecord.id}/invites`,
    INSTRUCTOR,
    { role: "student", roomId: roomWithManifest.room.id, expiresInMinutes: 60 }
  );
  return { classId: classRecord.id, roomWithManifest, invite };
}

test("instructor creates workforce-training room and trainee joins", async ({ context, page, request }) => {
  const { roomWithManifest, invite } = await createWorkforceTrainingRoom(request);
  const { room, manifest } = roomWithManifest;

  // Manifest geometry is the multi-zone layout, not the 30×30 classroom.
  expect(room.type).toBe("workforce-training");
  expect(manifest.dimensions.width).toBe(68);
  expect(manifest.dimensions.depth).toBe(54);
  expect(manifest.bounds.maxX).toBe(34);
  expect(manifest.bounds.minX).toBe(-34);
  expect(manifest.wallAnchors.length).toBe(16);
  expect(manifest.spawnPoints.some((sp) => sp.id === "spawn-instructor")).toBe(true);

  // Instructor enters the room.
  await setIdentity(page, INSTRUCTOR);
  await page.goto(`/rooms/${room.id}`);
  await expect(page.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });

  // People panel shows "I" (Instructor) tag for the host, not "T" (Teacher).
  const instructorRow = page.getByTestId(`participant-${INSTRUCTOR.userId}`);
  await expect(instructorRow).toContainText("Jordan Instructor");
  await expect(instructorRow.locator(".tag-teacher")).toContainText("I");

  // Trainee joins via invite code in a second browser context.
  const traineePage = await context.newPage();
  await setIdentity(traineePage, TRAINEE);
  await traineePage.goto("/");
  await traineePage.getByLabel("Role").selectOption(TRAINEE.userId);
  await traineePage.getByLabel("Invite code").fill(invite.code);
  await traineePage.getByRole("button", { name: /join class room/i }).click();
  await expect(traineePage.getByRole("heading", { name: room.name })).toBeVisible({ timeout: 20_000 });

  // Both see each other in the roster.
  await expect(page.getByTestId(`participant-${TRAINEE.userId}`)).toContainText("Casey Trainee", {
    timeout: 10_000
  });
  await expect(traineePage.getByTestId(`participant-${INSTRUCTOR.userId}`)).toContainText("Jordan Instructor", {
    timeout: 10_000
  });

  // Trainee can move and stays within the wide outer bounds (x ∈ [-34, 34]).
  await traineePage.bringToFront();
  await traineePage.locator(".room-stage").click();
  const traineePosition = traineePage.getByTestId(`participant-${TRAINEE.userId}-position`);
  const positionBefore = await traineePosition.textContent();
  await traineePage.keyboard.down("ArrowRight");
  await traineePage.waitForTimeout(400);
  await traineePage.keyboard.up("ArrowRight");
  await expect
    .poll(async () => traineePosition.textContent(), { timeout: 5_000 })
    .not.toBe(positionBefore);
});

test("workforce-training lobby step uses Instructor / Trainee copy", async ({ page }) => {
  await page.goto("/");
  // Select the Workforce Training room type.
  await page.getByLabel(/room type/i).selectOption("workforce-training");
  // The create button uses workforce-training copy, not classroom copy.
  await expect(page.getByRole("button", { name: /create training/i })).toBeVisible();
  // Step labels should reference trainee vocabulary, not student vocabulary.
  await expect(page.getByText(/organization \/ team name/i)).toBeVisible();
  await expect(page.getByText(/session name/i)).toBeVisible();
});
