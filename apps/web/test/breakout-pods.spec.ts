import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const TEACHER = { userId: "dev-teacher-pods", displayName: "Ms. Rivera", role: "teacher" as const };
const STUDENT_A = { userId: "dev-student-pods-a", displayName: "Avery Pod", role: "student" as const };
const STUDENT_B = { userId: "dev-student-pods-b", displayName: "Sam Pod", role: "student" as const };

type DevIdentity = typeof TEACHER | typeof STUDENT_A | typeof STUDENT_B;

type RoomWithManifest = {
  room: { id: string; name: string };
  manifest: {
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    wallAnchors: Array<{ id: string; label: string }>;
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

async function createPodsRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Breakout Pods ${suffix}`
  });
  const roomWithManifest = await postJson<RoomWithManifest>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Pods Lab ${suffix}`
  });

  for (const student of [STUDENT_A, STUDENT_B]) {
    await postJson(
      request,
      `/v1/classes/${classRecord.id}/members`,
      TEACHER,
      {
        userId: student.userId,
        displayName: student.displayName,
        role: "student",
        status: "active"
      }
    );
  }

  await patchJson(
    request,
    `/v1/rooms/${roomWithManifest.room.id}`,
    TEACHER,
    {
      settings: {
        pods: {
          enabled: true,
          podRadiusMeters: 3,
          podMurmurFloor: 0.08,
          drawPartitions: true
        }
      }
    }
  );

  const leftAnchor = roomWithManifest.manifest.wallAnchors[0];
  const rightAnchor = roomWithManifest.manifest.wallAnchors[1] ?? roomWithManifest.manifest.wallAnchors[0];
  const { minX, maxX, minZ } = roomWithManifest.manifest.bounds;
  const leftTarget = { x: minX + 3.2, y: 0, z: minZ + 4.6 };
  const rightTarget = { x: maxX - 3.2, y: 0, z: minZ + 4.6 };

  const createdGroupA = await classroomAction<{ groups: Array<{ id: string; label: string }> }>(
    request,
    roomWithManifest.room.id,
    { type: "create-group", label: "Team A", color: "#2980b9" }
  );
  const groupAId = createdGroupA.groups.find((group) => group.label === "Team A")?.id;
  expect(groupAId).toBeTruthy();

  const createdGroupB = await classroomAction<{ groups: Array<{ id: string; label: string }> }>(
    request,
    roomWithManifest.room.id,
    { type: "create-group", label: "Team B", color: "#27ae60" }
  );
  const groupBId = createdGroupB.groups.find((group) => group.label === "Team B")?.id;
  expect(groupBId).toBeTruthy();

  await classroomAction(request, roomWithManifest.room.id, {
    type: "assign-group",
    groupId: groupAId,
    memberUserIds: [STUDENT_A.userId]
  });
  await classroomAction(request, roomWithManifest.room.id, {
    type: "assign-group",
    groupId: groupBId,
    memberUserIds: [STUDENT_B.userId]
  });
  await classroomAction(request, roomWithManifest.room.id, {
    type: "update-group",
    groupId: groupAId,
    targetPosition: leftTarget,
    targetWallAnchorId: leftAnchor?.id,
    hold: { enabled: true, mode: "hard", radiusMeters: 2 }
  });
  await classroomAction(request, roomWithManifest.room.id, {
    type: "update-group",
    groupId: groupBId,
    targetPosition: rightTarget,
    targetWallAnchorId: rightAnchor?.id,
    hold: { enabled: true, mode: "hard", radiusMeters: 2 }
  });

  return {
    room: roomWithManifest.room,
    groupAId: groupAId!,
    groupBId: groupBId!
  };
}

test("breakout pods show pod HUD, zones, cross-pod outlines, and broadcast grants", async ({ context, page, request }) => {
  test.setTimeout(120_000);
  const { room, groupAId, groupBId } = await createPodsRoom(request);

  await setIdentity(page, TEACHER);
  await page.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("participant-dev-teacher-pods")).toContainText("Ms. Rivera", { timeout: 20_000 });

  const studentPageA = await context.newPage();
  await setIdentity(studentPageA, STUDENT_A);
  await studentPageA.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(studentPageA.getByTestId("participant-dev-student-pods-a")).toContainText("Avery Pod", { timeout: 20_000 });

  const studentPageB = await context.newPage();
  await setIdentity(studentPageB, STUDENT_B);
  await studentPageB.goto(`/rooms/${room.id}`, { waitUntil: "domcontentloaded" });
  await expect(studentPageB.getByTestId("participant-dev-student-pods-b")).toContainText("Sam Pod", { timeout: 20_000 });

  await page.getByRole("button", { name: /^groups/i }).click();
  await page.getByRole("button", { name: /^turn on$/i }).click();

  await expect(studentPageA.getByTestId("pods-indicator")).toContainText("Pods on", { timeout: 10_000 });
  await expect(studentPageB.getByTestId("pods-indicator")).toContainText("Pods on", { timeout: 10_000 });
  await expect(studentPageA.getByTestId(`pod-floor-${groupAId}`)).toContainText("Team A", { timeout: 10_000 });
  await expect(studentPageB.getByTestId(`pod-floor-${groupBId}`)).toContainText("Team B", { timeout: 10_000 });
  await expect(studentPageA.getByTestId(`participant-${STUDENT_B.userId}-nameplate`)).toHaveClass(/avatar-nameplate--cross-pod/);
  await expect(studentPageB.getByTestId(`participant-${STUDENT_A.userId}-nameplate`)).toHaveClass(/avatar-nameplate--cross-pod/);

  await studentPageA.getByRole("button", { name: "2D" }).click();
  await studentPageB.getByRole("button", { name: "2D" }).click();
  await expect(studentPageA.getByTestId(`pod-zone-${groupAId}`)).toHaveAttribute("fill", "#2980b9");
  await expect(studentPageB.getByTestId(`pod-zone-${groupBId}`)).toHaveAttribute("fill", "#27ae60");
  await expect.poll(async () => studentPageA.getByTestId(`pod-zone-${groupAId}`).getAttribute("stroke-dasharray")).toBeNull();
  await expect.poll(async () => studentPageB.getByTestId(`pod-zone-${groupBId}`).getAttribute("stroke-dasharray")).toBeNull();

  await page.getByRole("button", { name: `Grant broadcast for ${STUDENT_A.displayName}` }).click();
  await expect.poll(async () => {
    const classroom = await getJson<{ podsRuntime: { broadcastFromUserIds: string[] } }>(request, `/v1/rooms/${room.id}/classroom`, TEACHER);
    return classroom.podsRuntime.broadcastFromUserIds.join(",");
  }).toBe(STUDENT_A.userId);

  await expect(studentPageA.getByTestId("student-broadcast-toggle")).toBeVisible({ timeout: 10_000 });
  await expect(studentPageB.getByTestId("student-broadcast-toggle")).toHaveCount(0);
});
