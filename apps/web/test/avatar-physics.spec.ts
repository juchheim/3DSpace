import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BUILD_FLOOR_THICKNESS, BUILD_LEVEL_HEIGHT, cellToWorldCenter } from "@3dspace/room-engine";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";

const TEACHER = { userId: "dev-teacher-avatar-physics", displayName: "Ms. Newton", role: "teacher" as const };
const JUMPER = { userId: "dev-jumper-avatar-physics", displayName: "Avery Jumper", role: "student" as const };
const OBSERVER = { userId: "dev-observer-avatar-physics", displayName: "Blake Observer", role: "student" as const };

type DevIdentity = typeof TEACHER | typeof JUMPER | typeof OBSERVER;

type AvatarState = {
  position: { x: number; y: number; z: number };
  rotation: { y: number };
  movement: "idle" | "walking";
  airborneState?: "grounded" | "jumping" | "falling";
};

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

async function waitForApi(request: APIRequestContext) {
  await expect
    .poll(async () => {
      const response = await request.get(`${API_URL}/health`);
      return response.ok();
    }, { timeout: 180_000 })
    .toBe(true);
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

async function patchJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.patch(`${API_URL}${path}`, {
    data,
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createFfaRoom(request: APIRequestContext, options?: { physicsEnabled?: boolean }) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Avatar Physics ${suffix}`
  });
  const roomResponse = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `Physics Lab ${suffix}`,
    freeForAllPassword: FFA_PASSWORD
  });

  for (const student of [JUMPER, OBSERVER]) {
    await postJson(request, `/v1/classes/${classRecord.id}/members`, TEACHER, {
      userId: student.userId,
      displayName: student.displayName,
      role: "student",
      status: "active"
    });
  }

  if (options?.physicsEnabled === false) {
    await patchJson(request, `/v1/rooms/${roomResponse.room.id}`, TEACHER, {
      settings: {
        physics: {
          enabled: false
        }
      }
    });
  }

  return roomResponse.room;
}

async function joinRoom(page: Page, roomId: string, roomName: string, identity: DevIdentity) {
  await setIdentity(page, identity, { ffaPassword: FFA_PASSWORD });
  await page.goto(`/rooms/${roomId}`, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByTestId(`participant-${identity.userId}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".room-hud-name")).toContainText(roomName, { timeout: 15_000 });
}

async function getAvatarState(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movement = (window as any).__debug?.movement;
    return (movement?.getAvatarState?.() ?? movement?.avatarState ?? null) as AvatarState | null;
  });
}

async function requestJump(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__debug?.movement?.requestJump?.();
  });
}

async function moveTo3D(page: Page, x: number, z: number) {
  await page.evaluate(({ x, z }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__debug?.movement?.moveTo3DPoint?.({ x, z });
  }, { x, z });
}

async function teleportTo(page: Page, x: number, y: number, z: number) {
  await page.evaluate(({ x, y, z }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__debug?.movement?.teleportToPosition?.({ x, y, z });
  }, { x, y, z });
}

async function setWorldMoveVector(page: Page, worldX: number, worldZ: number) {
  await page.evaluate(({ worldX, worldZ }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const movement = (window as any).__debug?.movement;
    const state = movement?.getAvatarState?.() ?? movement?.avatarState;
    if (!state) return;
    const yaw = state.rotation.y;
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const forwardX = Math.sin(yaw);
    const forwardZ = Math.cos(yaw);
    const magnitude = Math.hypot(worldX, worldZ) || 1;
    const unitWorldX = worldX / magnitude;
    const unitWorldZ = worldZ / magnitude;
    movement?.setTouchVector?.({
      x: -(unitWorldX * rightX + unitWorldZ * rightZ),
      z: -(unitWorldX * forwardX + unitWorldZ * forwardZ)
    });
  }, { worldX, worldZ });
}

async function stopMove(page: Page) {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__debug?.movement?.setTouchVector?.({ x: 0, z: 0 });
  });
}

async function getRemoteY(page: Page, participantId: string) {
  return page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const participants = (window as any).__debug?.participants as Record<string, { state?: AvatarState }> | undefined;
    return participants?.[id]?.state?.position?.y ?? null;
  }, participantId);
}

async function getBuildPieceCount(page: Page) {
  return page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((window as any).__debug?.buildPieces?.pieces?.length as number | undefined) ?? 0;
  });
}

async function placeFloor(request: APIRequestContext, roomId: string, cell: { ix: number; iz: number }, level: number) {
  const response = await request.post(`${API_URL}/v1/rooms/${roomId}/build-pieces`, {
    data: {
      kind: "floor",
      cell,
      level,
      materialId: "wood"
    },
    headers: authHeaders(JUMPER)
  });
  expect(response.ok()).toBeTruthy();
}

test.beforeAll(async ({ request }) => {
  await waitForApi(request);
});

test.describe.configure({ timeout: 120_000 });

test("jump arc updates local and observer y without remote re-simulation", async ({ context, page, request }) => {
  const room = await createFfaRoom(request);

  await joinRoom(page, room.id, room.name, JUMPER);
  const observerPage = await context.newPage();
  await joinRoom(observerPage, room.id, room.name, OBSERVER);

  const baseline = await expect
    .poll(async () => {
      const state = await getAvatarState(page);
      return state?.position.y ?? null;
    }, { timeout: 15_000 })
    .toBeTruthy();

  const baselineY = (await getAvatarState(page))!.position.y;
  await requestJump(page);

  await expect
    .poll(async () => (await getAvatarState(page))?.position.y ?? baselineY, { timeout: 10_000 })
    .toBeGreaterThan(baselineY + 0.6);
  await expect
    .poll(async () => await getRemoteY(observerPage, JUMPER.userId), { timeout: 10_000 })
    .toBeGreaterThan(baselineY + 0.4);

  await expect
    .poll(async () => (await getAvatarState(page))?.position.y ?? null, { timeout: 10_000 })
    .toBeCloseTo(baselineY, 1);
  await expect
    .poll(async () => (await getAvatarState(page))?.airborneState ?? null, { timeout: 10_000 })
    .toBe("grounded");
});

test("walking off an elevated built floor falls over multiple frames instead of snapping once", async ({ page, request }) => {
  const room = await createFfaRoom(request);
  const towerCell = { ix: -18, iz: -18 };
  for (const level of [0, 1, 2]) {
    await placeFloor(request, room.id, towerCell, level);
  }

  await joinRoom(page, room.id, room.name, JUMPER);
  await expect.poll(async () => await getBuildPieceCount(page), { timeout: 10_000 }).toBe(3);

  const towerCenter = cellToWorldCenter(towerCell.ix, towerCell.iz);
  const towerTopY = 2 * BUILD_LEVEL_HEIGHT + BUILD_FLOOR_THICKNESS;
  await teleportTo(page, towerCenter.x, towerTopY + 1, towerCenter.z);
  await expect
    .poll(async () => (await getAvatarState(page))?.position.y ?? 0, { timeout: 10_000 })
    .toBeGreaterThan(towerTopY - 0.2);

  await setWorldMoveVector(page, 1, 0);
  const samples: number[] = [];
  for (let index = 0; index < 8; index += 1) {
    await page.waitForTimeout(120);
    const state = await getAvatarState(page);
    samples.push(state?.position.y ?? 0);
  }
  await stopMove(page);

  const descending = samples.filter((value) => value < towerTopY - 0.2);
  const distinctDescending = new Set(descending.map((value) => value.toFixed(2)));
  expect(descending.length).toBeGreaterThan(2);
  expect(distinctDescending.size).toBeGreaterThan(2);
  expect(samples[samples.length - 1]!).toBeLessThan(towerTopY - 0.5);
});

test("room physics override disabled keeps jump as a vertical no-op", async ({ page, request }) => {
  const room = await createFfaRoom(request, { physicsEnabled: false });
  await joinRoom(page, room.id, room.name, JUMPER);

  const baselineY = (await getAvatarState(page))!.position.y;
  await requestJump(page);
  await page.waitForTimeout(1200);

  const state = await getAvatarState(page);
  expect(state?.position.y ?? 0).toBeCloseTo(baselineY, 1);
  expect(state?.airborneState ?? null).toBeNull();
});
