import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { BUILD_WALL_HEIGHT, buildPieceColliders, levelToY } from "@3dspace/room-engine";

/**
 * Boards on build walls E2E (Phase 5).
 * Requires the same Playwright webServer env as world-building.spec.ts.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const FFA_PASSWORD = process.env.FREE_FOR_ALL_PASSWORD ?? "open-sesame";
const TEACHER = { userId: "dev-teacher-boards-build", displayName: "Ms. Rivera", role: "teacher" as const };
const BUILDER = { userId: "dev-builder-boards-build", displayName: "Alex Builder", role: "student" as const };
const OBSERVER = { userId: "dev-observer-boards-build", displayName: "Blake Observer", role: "student" as const };

type DevIdentity = typeof TEACHER | typeof BUILDER | typeof OBSERVER;

type DynamicBoardDebug = {
  enabled?: boolean;
  anchors?: Array<{ id: string; wallId: string; position: { x: number; y: number; z: number } }>;
};

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

async function setIdentity(page: Page, identity: DevIdentity) {
  await page.addInitScript(
    ({ key, value, ffaKey, ffaValue }) => {
      window.localStorage.setItem(key, JSON.stringify(value));
      window.sessionStorage.setItem(ffaKey, ffaValue);
    },
    {
      key: IDENTITY_STORAGE_KEY,
      value: identity,
      ffaKey: "freeForAllPassword",
      ffaValue: FFA_PASSWORD
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

async function createFfaBuildingRoom(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", TEACHER, {
    name: `Boards Build ${suffix}`
  });
  const roomWithManifest = await postJson<{ room: { id: string; name: string } }>(request, "/v1/rooms", TEACHER, {
    classId: classRecord.id,
    type: "free-for-all",
    name: `Board Lab ${suffix}`,
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

async function joinRoom(page: Page, roomId: string, roomName: string, identity: DevIdentity) {
  await setIdentity(page, identity);
  await page.goto(`/rooms/${roomId}`, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByTestId(`participant-${identity.userId}`)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".room-hud-name")).toContainText(roomName, { timeout: 15_000 });
}

async function readDynamicBoardsDebug(page: Page) {
  return page.evaluate(() => {
    const debug = (window as Window & { __debug?: { dynamicBoards?: DynamicBoardDebug } }).__debug?.dynamicBoards;
    return {
      enabled: debug?.enabled ?? false,
      count: debug?.anchors?.length ?? 0,
      anchors: debug?.anchors ?? []
    };
  });
}

function anchorBodyForBuildWall(piece: { id: string; kind: string; cell: { ix: number; iz: number }; level: number; edge?: string }) {
  const wall = buildPieceColliders(piece as Parameters<typeof buildPieceColliders>[0]).walls[0]!;
  const baseY = Math.min(wall.start.y, wall.end.y);
  return {
    wallId: wall.id,
    center: {
      x: (wall.start.x + wall.end.x) / 2,
      y: baseY + wall.height / 2,
      z: (wall.start.z + wall.end.z) / 2
    },
    normal: { x: 0, y: 0, z: -1 },
    width: 1.5,
    height: 1.5,
    title: "Build wall board",
    accepts: ["image", "video"]
  };
}

async function placeBuildWall(
  request: APIRequestContext,
  roomId: string,
  cell = safeBuildCell(70),
  level = 0
) {
  return postJson<{ piece: { id: string; kind: string; cell: { ix: number; iz: number }; level: number; edge?: string } }>(
    request,
    `/v1/rooms/${roomId}/build-pieces`,
    BUILDER,
    { kind: "wall", cell, level, edge: "n", materialId: "stone" }
  );
}

async function createBoardOnBuildWall(
  request: APIRequestContext,
  roomId: string,
  piece: { id: string; kind: string; cell: { ix: number; iz: number }; level: number; edge?: string }
) {
  return postJson<{ anchor: { id: string; wallId: string; position: { x: number; y: number; z: number } } }>(
    request,
    `/v1/rooms/${roomId}/dynamic-wall-anchors`,
    BUILDER,
    anchorBodyForBuildWall(piece)
  );
}

test.beforeAll(async ({ request }) => {
  await waitForApi(request);
});

test.describe.configure({ timeout: 120_000 });

test.describe("boards on build walls", () => {
  test("syncs a board on a built wall across clients and survives reload", async ({ browser, request }) => {
    const room = await createFfaBuildingRoom(request);
    const builderContext = await browser.newContext();
    const observerContext = await browser.newContext();
    const builder = await builderContext.newPage();
    const observer = await observerContext.newPage();

    await joinRoom(builder, room.id, room.name, BUILDER);
    await joinRoom(observer, room.id, room.name, OBSERVER);

    const { piece } = await placeBuildWall(request, room.id);
    await expect.poll(async () => (await readDynamicBoardsDebug(builder)).enabled).toBe(true);

    const { anchor } = await createBoardOnBuildWall(request, room.id, piece);
    expect(anchor.wallId).toBe(piece.id);

    await expect
      .poll(async () => {
        const list = await getJson<Array<{ id: string }>>(
          request,
          `/v1/rooms/${room.id}/dynamic-wall-anchors`,
          OBSERVER
        );
        return list.length;
      }, { timeout: 20_000 })
      .toBe(1);

    await observer.evaluate(async () => {
      await (window as Window & { __debug?: { dynamicBoards?: { refresh?: () => Promise<void> } } }).__debug
        ?.dynamicBoards?.refresh?.();
    });
    await expect
      .poll(async () => (await readDynamicBoardsDebug(observer)).count, { timeout: 20_000 })
      .toBe(1);
    await expect
      .poll(async () => (await readDynamicBoardsDebug(observer)).anchors[0]?.id)
      .toBe(anchor.id);

    await observer.reload();
    await expect(observer.getByTestId(`participant-${OBSERVER.userId}`)).toBeVisible({ timeout: 45_000 });
    await expect
      .poll(async () => (await readDynamicBoardsDebug(observer)).count, { timeout: 20_000 })
      .toBe(1);

    const apiList = await getJson<Array<{ id: string; wallId: string }>>(
      request,
      `/v1/rooms/${room.id}/dynamic-wall-anchors`,
      OBSERVER
    );
    expect(apiList.some((entry) => entry.id === anchor.id && entry.wallId === piece.id)).toBe(true);

    await builderContext.close();
    await observerContext.close();
  });

  test("rejects overlapping boards on the same built wall", async ({ request }) => {
    const room = await createFfaBuildingRoom(request);
    const { piece } = await placeBuildWall(request, room.id);
    const body = anchorBodyForBuildWall(piece);

    const first = await request.post(`${API_URL}/v1/rooms/${room.id}/dynamic-wall-anchors`, {
      headers: authHeaders(BUILDER),
      data: body
    });
    expect(first.ok()).toBeTruthy();

    const second = await request.post(`${API_URL}/v1/rooms/${room.id}/dynamic-wall-anchors`, {
      headers: authHeaders(BUILDER),
      data: body
    });
    expect(second.status()).toBe(422);
    const payload = await second.json();
    expect(payload.error).toBe("unprocessable_entity");
    expect(payload.message).toMatch(/overlap/i);
  });

  test("blocks destroying a wall while a board is attached (orphan policy B)", async ({ request }) => {
    const room = await createFfaBuildingRoom(request);
    const { piece } = await placeBuildWall(request, room.id);
    await createBoardOnBuildWall(request, room.id, piece);

    const blocked = await request.delete(`${API_URL}/v1/rooms/${room.id}/build-pieces/${piece.id}`, {
      headers: authHeaders(BUILDER)
    });
    expect(blocked.status()).toBe(409);
    const body = await blocked.json();
    expect(body.error).toBe("build-wall-has-boards");
    expect(body.message).toMatch(/remove the board/i);
  });

  test("places a board spanning multiple adjacent build wall segments", async ({ request }) => {
    const room = await createFfaBuildingRoom(request);
    const baseCell = safeBuildCell(90);
    const pieces = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const created = await placeBuildWall(request, room.id, {
        ix: baseCell.ix + offset,
        iz: baseCell.iz
      });
      pieces.push(created.piece);
    }

    const firstWall = buildPieceColliders(pieces[0] as Parameters<typeof buildPieceColliders>[0]).walls[0]!;
    const lastWall = buildPieceColliders(pieces[2] as Parameters<typeof buildPieceColliders>[0]).walls[0]!;
    const spanLength = Math.hypot(lastWall.end.x - firstWall.start.x, lastWall.end.z - firstWall.start.z);

    const response = await request.post(`${API_URL}/v1/rooms/${room.id}/dynamic-wall-anchors`, {
      headers: authHeaders(BUILDER),
      data: {
        wallId: pieces[0]!.id,
        center: {
          x: (firstWall.start.x + lastWall.end.x) / 2,
          y: firstWall.start.y + firstWall.height / 2,
          z: (firstWall.start.z + lastWall.end.z) / 2
        },
        normal: { x: 0, y: 0, z: -1 },
        width: Math.min(6, spanLength - 0.25),
        height: 1.5,
        title: "Wide board",
        accepts: ["image"]
      }
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.anchor.width).toBeGreaterThan(2);
  });

  test("places a board on an elevated build wall at the correct height", async ({ request }) => {
    const room = await createFfaBuildingRoom(request);
    const cell = safeBuildCell(72);

    await postJson(request, `/v1/rooms/${room.id}/build-pieces`, BUILDER, {
      kind: "floor",
      cell,
      level: 0,
      materialId: "stone"
    });
    const { piece } = await postJson<{ piece: { id: string; kind: string; cell: { ix: number; iz: number }; level: number; edge?: string } }>(
      request,
      `/v1/rooms/${room.id}/build-pieces`,
      BUILDER,
      { kind: "wall", cell, level: 1, edge: "n", materialId: "stone" }
    );

    const { anchor } = await createBoardOnBuildWall(request, room.id, piece);
    const expectedY = levelToY(1) + BUILD_WALL_HEIGHT / 2;
    expect(anchor.position.y).toBeCloseTo(expectedY, 3);
  });
});
