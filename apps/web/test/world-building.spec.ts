import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BUILD_FLOOR_THICKNESS, BUILD_LEVEL_HEIGHT, cellToWorldCenter } from "@3dspace/room-engine";

/**
 * FFA world building E2E.
 *
 * Requires Playwright webServer env (see `playwright.config.ts`) or manually started
 * API/web with `ENABLE_FREE_FOR_ALL_BUILDING=true` and matching `NEXT_PUBLIC_*` flag.
 * If a local API is already on :8080 without building enabled, set
 * `PLAYWRIGHT_REUSE_SERVER=false` so Playwright starts fresh servers.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";
const TEACHER = { userId: "dev-teacher-world-building", displayName: "Ms. Rivera", role: "teacher" as const };
const BUILDER = { userId: "dev-builder-world-building", displayName: "Alex Builder", role: "student" as const };
const OBSERVER = { userId: "dev-observer-world-building", displayName: "Blake Observer", role: "student" as const };

type DevIdentity = typeof TEACHER | typeof BUILDER | typeof OBSERVER;

type AvatarState = {
  position: { x: number; y: number; z: number };
  rotation: { y: number };
};

type BuildPreviewResult = {
  allowed: boolean;
  reason?: string;
  message?: string;
};

type BuildDebug = {
  enabled?: boolean;
  pieces?: Array<{ id: string; kind: string }>;
  previewPlacementAtWorld?: (input: {
    tool: "wall" | "floor" | "ramp";
    x: number;
    z: number;
    y?: number;
  }) => BuildPreviewResult | null;
  actions?: {
    place(
      kind: "wall" | "floor" | "ramp",
      cell: { ix: number; iz: number },
      level: number,
      edge?: "n" | "e" | "s" | "w",
      rotation?: 0 | 90 | 180 | 270,
      materialId?: string
    ): Promise<unknown>;
    destroy(pieceId: string): Promise<unknown>;
  };
};

type MovementDebug = {
  avatarState?: AvatarState | null;
  getAvatarState?: () => AvatarState | null;
  moveTo3DPoint?: (point: { x: number; z: number }) => void;
  tryMoveDelta?: (
    dx: number,
    dz: number
  ) => {
    from: { x: number; z: number };
    requested: { x: number; z: number };
    to: { x: number; z: number };
    blocked: boolean;
  } | null;
};

/** Cells away from spawn/hall keep-out zones (matches API route tests). */
function safeBuildCell(index: number) {
  return { ix: -20 + (index % 25), iz: -20 + Math.floor(index / 25) };
}

function authHeaders(identity: DevIdentity) {
  return {
    "x-dev-user-id": identity.userId,
    "x-dev-user-name": identity.displayName,
    "x-dev-user-role": identity.role
  };
}

async function waitForApi(request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const response = await request.get(`${API_URL}/health`);
        return response.ok();
      },
      { timeout: 180_000 }
    )
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

async function getJson<T>(request: APIRequestContext, path: string, identity: DevIdentity) {
  const response = await request.get(`${API_URL}${path}`, {
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<T>;
}

async function deleteJson(request: APIRequestContext, path: string, identity: DevIdentity) {
  const response = await request.delete(`${API_URL}${path}`, {
    headers: authHeaders(identity)
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function createFfaBuildingRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `World Building ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `Build Lab ${suffix}`,
    freeForAllPassword: FFA_PASSWORD
  });

  for (const student of [BUILDER, OBSERVER]) {
    await postJson(request, `/v1/classes/${classRecord.id}/members`, TEACHER, {
      userId: student.userId,
      displayName: student.displayName,
      role: "student",
      status: "active"
    });
  }

  return roomWithManifest.room;
}

async function createClassroomRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Classroom ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    name: `Peer Lab ${suffix}`
  });

  await postJson(request, `/v1/classes/${classRecord.id}/members`, TEACHER, {
    userId: BUILDER.userId,
    displayName: BUILDER.displayName,
    role: "student",
    status: "active"
  });

  return roomWithManifest.room;
}

async function joinRoom(
  page: Page,
  roomId: string,
  roomName: string,
  identity: DevIdentity,
  options?: { ffaPassword?: string }
) {
  await setIdentity(page, identity, options);
  await page.goto(`/rooms/${roomId}`, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByTestId(`participant-${identity.userId}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".room-hud-name")).toContainText(roomName, { timeout: 15_000 });
}

async function readBuildDebug(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & { __debug?: { buildPieces?: BuildDebug } }).__debug?.buildPieces;
    return {
      enabled: debug?.enabled ?? false,
      count: debug?.pieces?.length ?? 0,
      pieces: debug?.pieces ?? []
    };
  });
}

async function previewPlacementAtWorld(
  page: Page,
  input: { tool: "wall" | "floor" | "ramp"; x: number; z: number; y?: number }
) {
  return page.evaluate(({ tool, x, z, y }) => {
    const debug = (window as Window & { __debug?: { buildPieces?: BuildDebug } }).__debug?.buildPieces;
    return debug?.previewPlacementAtWorld?.({ tool, x, z, ...(y !== undefined ? { y } : {}) }) ?? null;
  }, input);
}

async function getAvatarState(page: Page) {
  return page.evaluate(() => {
    const movement = (window as Window & { __debug?: { movement?: MovementDebug } }).__debug?.movement;
    return movement?.getAvatarState?.() ?? movement?.avatarState ?? null;
  });
}

async function moveTo3D(page: Page, x: number, z: number) {
  await page.evaluate(
    ({ x, z }) => {
      const movement = (window as Window & { __debug?: { movement?: MovementDebug } }).__debug?.movement;
      movement?.moveTo3DPoint?.({ x, z });
    },
    { x, z }
  );
}

async function tryMoveDelta(page: Page, dx: number, dz: number) {
  return page.evaluate(
    ({ dx, dz }) => {
      const movement = (window as Window & { __debug?: { movement?: MovementDebug } }).__debug?.movement;
      return movement?.tryMoveDelta?.(dx, dz) ?? null;
    },
    { dx, dz }
  );
}

async function placeViaApi(
  request: APIRequestContext,
  roomId: string,
  payload: Record<string, unknown>
) {
  return postJson<{ piece: { id: string; kind: string } }>(
    request,
    `/v1/rooms/${roomId}/build-pieces`,
    BUILDER,
    payload
  );
}

test.beforeAll(async ({ request }) => {
  await waitForApi(request);
});

test.describe.configure({ timeout: 120_000 });

test.describe("FFA world building", () => {
  test("shows build controls when building is enabled", async ({ page, request }) => {
    const room = await createFfaBuildingRoom(request);
    await joinRoom(page, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });
    await expect(page.getByRole("button", { name: /build off/i })).toBeVisible({ timeout: 15_000 });
    const debug = await readBuildDebug(page);
    expect(debug.enabled).toBe(true);
  });

  test("syncs build pieces across two clients and persists after reload", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const builderContext = await browser.newContext();
    const observerContext = await browser.newContext();
    const builder = await builderContext.newPage();
    const observer = await observerContext.newPage();

    await joinRoom(builder, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });
    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    const created = await placeViaApi(request, room.id, {
      kind: "wall",
      cell: safeBuildCell(10),
      level: 0,
      edge: "n",
      materialId: "stone"
    });

    await expect
      .poll(async () => (await readBuildDebug(observer)).count, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);

    await observer.reload();
    await expect(observer.getByTestId(`participant-${OBSERVER.userId}`)).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(async () => (await readBuildDebug(observer)).count, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(1);

    const apiList = await getJson<{ pieces: Array<{ id: string }> }>(
      request,
      `/v1/rooms/${room.id}/build-pieces`,
      OBSERVER
    );
    expect(apiList.pieces.some((piece) => piece.id === created.piece.id)).toBe(true);

    await builderContext.close();
    await observerContext.close();
  });

  test("destroy removes pieces for both clients", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const builderContext = await browser.newContext();
    const observerContext = await browser.newContext();
    const builder = await builderContext.newPage();
    const observer = await observerContext.newPage();

    await joinRoom(builder, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });
    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    const created = await placeViaApi(request, room.id, {
      kind: "floor",
      cell: safeBuildCell(8),
      level: 0
    });

    await expect.poll(async () => (await readBuildDebug(observer)).count).toBe(1);

    await deleteJson(request, `/v1/rooms/${room.id}/build-pieces/${created.piece.id}`, BUILDER);

    await expect.poll(async () => (await readBuildDebug(builder)).count).toBe(0);
    await expect.poll(async () => (await readBuildDebug(observer)).count).toBe(0);

    await builderContext.close();
    await observerContext.close();
  });

  test("clear all removes pieces for both clients", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const builderContext = await browser.newContext();
    const observerContext = await browser.newContext();
    const builder = await builderContext.newPage();
    const observer = await observerContext.newPage();

    await joinRoom(builder, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });
    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    await placeViaApi(request, room.id, {
      kind: "floor",
      cell: safeBuildCell(12),
      level: 0
    });
    await placeViaApi(request, room.id, {
      kind: "wall",
      cell: safeBuildCell(13),
      level: 0,
      edge: "n"
    });

    await expect.poll(async () => (await readBuildDebug(observer)).count).toBe(2);

    await deleteJson(request, `/v1/rooms/${room.id}/build-pieces`, BUILDER);

    await expect.poll(async () => (await readBuildDebug(builder)).count).toBe(0);
    await expect.poll(async () => (await readBuildDebug(observer)).count).toBe(0);

    await builderContext.close();
    await observerContext.close();
  });

  test("rejects no-build-zone placement on server", async ({ request }) => {
    const room = await createFfaBuildingRoom(request);
    const response = await request.post(`${API_URL}/v1/rooms/${room.id}/build-pieces`, {
      headers: authHeaders(BUILDER),
      data: { kind: "floor", cell: { ix: 12, iz: 0 }, level: 0 }
    });
    expect(response.status()).toBe(422);
    const body = await response.json();
    expect(body.error).toBe("build-rejected");
    expect(body.reason).toBe("hall-keep-out");
  });

  test("client preview rejects hall keep-out zones", async ({ page, request }) => {
    const room = await createFfaBuildingRoom(request);
    await joinRoom(page, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });
    await expect(page.getByRole("button", { name: /build off/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /build off/i }).click();
    await expect(page.getByRole("button", { name: /build on/i })).toBeVisible();

    const hallCenter = cellToWorldCenter(12, 0);
    const preview = await previewPlacementAtWorld(page, {
      tool: "floor",
      x: hallCenter.x,
      z: hallCenter.z
    });

    expect(preview?.allowed).toBe(false);
    expect(preview?.reason).toBe("hall-keep-out");
    expect(preview?.message).toContain("hall-keep-out");
  });

  test("observer movement is blocked by a synced build wall", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const observerContext = await browser.newContext();
    const observer = await observerContext.newPage();

    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    const wallCell = safeBuildCell(60);
    const center = cellToWorldCenter(wallCell.ix, wallCell.iz);
    await moveTo3D(observer, center.x - 1.5, center.z);
    await expect.poll(async () => getAvatarState(observer)).not.toBeNull();

    const openPath = await tryMoveDelta(observer, 3, 0);
    expect(openPath?.blocked).toBe(false);

    await placeViaApi(request, room.id, {
      kind: "wall",
      cell: wallCell,
      level: 0,
      edge: "e",
      materialId: "stone"
    });

    await expect.poll(async () => (await readBuildDebug(observer)).count, { timeout: 20_000 }).toBe(1);

    const blockedPath = await tryMoveDelta(observer, 3, 0);
    expect(blockedPath?.blocked).toBe(true);
    expect(blockedPath!.to.x).toBeLessThan(blockedPath!.requested.x);

    await observerContext.close();
  });

  test("observer avatar y snaps when standing on a synced floor", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const observerContext = await browser.newContext();
    const observer = await observerContext.newPage();

    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    const floorCell = safeBuildCell(55);
    await placeViaApi(request, room.id, {
      kind: "floor",
      cell: floorCell,
      level: 0,
      materialId: "stone"
    });

    await expect.poll(async () => (await readBuildDebug(observer)).count, { timeout: 20_000 }).toBe(1);

    const center = cellToWorldCenter(floorCell.ix, floorCell.iz);
    await moveTo3D(observer, center.x, center.z);

    await expect
      .poll(async () => (await getAvatarState(observer))?.position.y ?? null, { timeout: 15_000 })
      .toBeCloseTo(BUILD_FLOOR_THICKNESS, 1);

    await observerContext.close();
  });

  test("observer walks up a synced ramp to the next level", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const observerContext = await browser.newContext();
    const observer = await observerContext.newPage();

    await joinRoom(observer, room.id, room.name, OBSERVER, { ffaPassword: FFA_PASSWORD });

    const rampCell = safeBuildCell(65);
    await placeViaApi(request, room.id, {
      kind: "floor",
      cell: rampCell,
      level: 0,
      materialId: "stone"
    });
    await placeViaApi(request, room.id, {
      kind: "ramp",
      cell: rampCell,
      level: 0,
      rotation: 0,
      materialId: "stone"
    });

    await expect.poll(async () => (await readBuildDebug(observer)).count, { timeout: 20_000 }).toBe(2);

    const center = cellToWorldCenter(rampCell.ix, rampCell.iz);
    await moveTo3D(observer, center.x, center.z - 1.2);
    const lowY = (await getAvatarState(observer))?.position.y ?? 0;
    expect(lowY).toBeLessThan(BUILD_LEVEL_HEIGHT * 0.5);

    await moveTo3D(observer, center.x, center.z + 1.2);

    await expect
      .poll(async () => (await getAvatarState(observer))?.position.y ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(BUILD_FLOOR_THICKNESS + 0.5);

    const highY = (await getAvatarState(observer))?.position.y ?? 0;
    expect(highY).toBeCloseTo(BUILD_LEVEL_HEIGHT, 0.5);

    await observerContext.close();
  });

  test("avatar y snaps up when a floor is placed underfoot", async ({ page, request }) => {
    const room = await createFfaBuildingRoom(request);
    await joinRoom(page, room.id, room.name, BUILDER, { ffaPassword: FFA_PASSWORD });

    const floorCell = safeBuildCell(52);
    const center = cellToWorldCenter(floorCell.ix, floorCell.iz);
    await moveTo3D(page, center.x, center.z);
    await expect.poll(async () => getAvatarState(page)).not.toBeNull();

    await placeViaApi(request, room.id, { kind: "floor", cell: floorCell, level: 0, materialId: "stone" });

    await expect
      .poll(async () => (await getAvatarState(page))?.position.y ?? null, { timeout: 15_000 })
      .toBeCloseTo(BUILD_FLOOR_THICKNESS, 1);
  });
});

test.describe("world building absence", () => {
  test("does not show build controls in classroom rooms", async ({ page, request }) => {
    const room = await createClassroomRoom(request);
    await joinRoom(page, room.id, room.name, BUILDER);

    await expect(page.getByRole("button", { name: /build (on|off)/i })).toHaveCount(0);
    const debug = await readBuildDebug(page);
    expect(debug.enabled).toBe(false);
  });
});
