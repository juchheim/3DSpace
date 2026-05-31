import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { ESCAPE_ROOM_MANIFEST_FEATURE, buildPieceColliders } from "@3dspace/room-engine";

/**
 * Escape Room E2E (Phase 5).
 * Requires Playwright webServer env with ENABLE_ESCAPE_ROOM and NEXT_PUBLIC_ENABLE_ESCAPE_ROOM
 * (see playwright.config.ts).
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const AUTHOR = { userId: "dev-author-escape", displayName: "Puzzle Author", role: "teacher" as const };
const PLAYER = { userId: "dev-player-escape", displayName: "Casey Player", role: "student" as const };

type DevIdentity = typeof AUTHOR | typeof PLAYER;

type RoomWithManifest = {
  room: { id: string; name: string; type: string; settings: { buildDestroyPolicy: string } };
  manifest: {
    walls: unknown[];
    wallAnchors: unknown[];
    tiers: unknown[];
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
    features: Array<{ key: string; enabled: boolean }>;
  };
};

type BuildDebug = {
  enabled?: boolean;
  pieces?: Array<{ id: string; kind: string }>;
};

type DynamicBoardDebug = {
  enabled?: boolean;
  anchors?: Array<{ id: string; wallId: string }>;
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

async function createEscapeRoomWithInvite(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", AUTHOR, {
    name: `Puzzle Lab ${suffix}`
  });
  const roomWithManifest = await postJson<RoomWithManifest>(request, "/v1/rooms", AUTHOR, {
    classId: classRecord.id,
    type: "escape-room",
    name: `The Locked Study ${suffix}`
  });
  const invite = await postJson<{ code: string }>(request, `/v1/classes/${classRecord.id}/invites`, AUTHOR, {
    role: "student",
    roomId: roomWithManifest.room.id,
    expiresInMinutes: 60
  });

  return { classRecord, roomWithManifest, invite };
}

async function joinRoom(page: Page, roomId: string, roomName: string, identity: DevIdentity, inviteCode?: string) {
  await setIdentity(page, identity);
  const url = inviteCode
    ? `/rooms/${roomId}?invite=${encodeURIComponent(inviteCode)}`
    : `/rooms/${roomId}`;
  await page.goto(url, { waitUntil: "commit", timeout: 90_000 });
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
    title: "Clue board",
    accepts: ["image"]
  };
}

async function placeWall(
  request: APIRequestContext,
  roomId: string,
  cell: { ix: number; iz: number },
  identity: DevIdentity = AUTHOR
) {
  return postJson<{ piece: { id: string; kind: string; cell: { ix: number; iz: number }; level: number; edge?: string } }>(
    request,
    `/v1/rooms/${roomId}/build-pieces`,
    identity,
    { kind: "wall", cell, level: 0, edge: "n", materialId: "stone" }
  );
}

test.beforeAll(async ({ request }) => {
  await waitForApi(request);
});

test.describe.configure({ timeout: 120_000 });

test.describe("escape room room type", () => {
  test("creates an empty canvas with owner-or-teacher defaults", async ({ request }) => {
    const { roomWithManifest } = await createEscapeRoomWithInvite(request);
    const { room, manifest } = roomWithManifest;

    expect(room.type).toBe("escape-room");
    expect(room.settings.buildDestroyPolicy).toBe("owner-or-teacher");
    expect(manifest.walls).toEqual([]);
    expect(manifest.wallAnchors).toEqual([]);
    expect(manifest.tiers).toEqual([]);
    expect(manifest.bounds).toEqual({ minX: -40, maxX: 40, minZ: -40, maxZ: 40 });
    expect(manifest.features.some((f) => f.key === ESCAPE_ROOM_MANIFEST_FEATURE && f.enabled)).toBe(true);
  });

  test("author builds a wall run, places a board, player joins and cannot destroy", async ({
    browser,
    request
  }) => {
    const { roomWithManifest, invite } = await createEscapeRoomWithInvite(request);
    const { room } = roomWithManifest;
    const baseCell = safeBuildCell(80);

    const pieces = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const created = await placeWall(request, room.id, {
        ix: baseCell.ix + offset,
        iz: baseCell.iz
      });
      pieces.push(created.piece);
    }

    const { anchor } = await postJson<{ anchor: { id: string; wallId: string } }>(
      request,
      `/v1/rooms/${room.id}/dynamic-wall-anchors`,
      AUTHOR,
      anchorBodyForBuildWall(pieces[0]!)
    );
    expect(anchor.wallId).toBe(pieces[0]!.id);

    const authorContext = await browser.newContext();
    const playerContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const playerPage = await playerContext.newPage();

    await joinRoom(authorPage, room.id, room.name, AUTHOR);
    await joinRoom(playerPage, room.id, room.name, PLAYER, invite.code);

    await expect(authorPage.getByRole("button", { name: /build off/i })).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => (await readBuildDebug(authorPage)).enabled).toBe(true);
    await expect.poll(async () => (await readDynamicBoardsDebug(authorPage)).enabled).toBe(true);

    await expect
      .poll(async () => (await readBuildDebug(playerPage)).count, { timeout: 20_000 })
      .toBeGreaterThanOrEqual(3);
    await expect
      .poll(async () => (await readDynamicBoardsDebug(playerPage)).count, { timeout: 20_000 })
      .toBe(1);
    await expect
      .poll(async () => (await readDynamicBoardsDebug(playerPage)).anchors[0]?.id)
      .toBe(anchor.id);

    const denied = await request.delete(`${API_URL}/v1/rooms/${room.id}/build-pieces/${pieces[0]!.id}`, {
      headers: authHeaders(PLAYER)
    });
    expect(denied.status()).toBe(403);
    const body = await denied.json();
    expect(body.error).toBe("build-destroy-denied");

    const apiPieces = await getJson<{ pieces: Array<{ id: string }> }>(
      request,
      `/v1/rooms/${room.id}/build-pieces`,
      PLAYER
    );
    expect(apiPieces.pieces.length).toBeGreaterThanOrEqual(3);

    await authorContext.close();
    await playerContext.close();
  });

  test("lobby lists escape room when the public flag is on", async ({ page }) => {
    await setIdentity(page, AUTHOR);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#lb-room-type")).toBeVisible();
    const options = page.locator("#lb-room-type option");
    const labels = await options.allTextContents();
    expect(labels.some((label) => /escape room/i.test(label))).toBe(true);
  });
});
