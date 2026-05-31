import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * Escape Room logic E2E (Phase 10.6).
 * Two clients (author + player) join a room; the puzzle is wired and solved over
 * the live HTTP API: start session → button opens the door → light reveal →
 * step on the exit plate → win before the timer. Requires the Playwright
 * webServer env with ENABLE_ESCAPE_ROOM + NEXT_PUBLIC_ENABLE_ESCAPE_ROOM.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const IDENTITY_STORAGE_KEY = "3dspace.identity";
const AUTHOR = { userId: "dev-author-logic", displayName: "Puzzle Author", role: "teacher" as const };
const PLAYER = { userId: "dev-player-logic", displayName: "Casey Player", role: "student" as const };

type DevIdentity = typeof AUTHOR | typeof PLAYER;

type RoomWithManifest = {
  room: { id: string; name: string; type: string };
};

type LogicPiece = { id: string; kind: string };
type LogicStateResponse = {
  state: { channels: Record<string, { latched: boolean }>; nodes: Record<string, Record<string, unknown>> };
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
    .poll(async () => (await request.get(`${API_URL}/health`)).ok(), { timeout: 180_000 })
    .toBe(true);
}

async function setIdentity(page: Page, identity: DevIdentity) {
  await page.addInitScript(
    ({ key, value }) => window.localStorage.setItem(key, JSON.stringify(value)),
    { key: IDENTITY_STORAGE_KEY, value: identity }
  );
}

async function postJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.post(`${API_URL}${path}`, { data, headers: authHeaders(identity) });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function patchJson<T>(request: APIRequestContext, path: string, identity: DevIdentity, data: unknown) {
  const response = await request.patch(`${API_URL}${path}`, { data, headers: authHeaders(identity) });
  expect(response.ok(), `${path} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function getJson<T>(request: APIRequestContext, path: string, identity: DevIdentity) {
  const response = await request.get(`${API_URL}${path}`, { headers: authHeaders(identity) });
  expect(response.ok(), `${path} -> ${response.status()}`).toBeTruthy();
  return response.json() as Promise<T>;
}

async function createEscapeRoomWithInvite(request: APIRequestContext) {
  const suffix = Date.now().toString(36);
  const classRecord = await postJson<{ id: string }>(request, "/v1/classes", AUTHOR, {
    name: `Logic Lab ${suffix}`
  });
  const roomWithManifest = await postJson<RoomWithManifest>(request, "/v1/rooms", AUTHOR, {
    classId: classRecord.id,
    type: "escape-room",
    name: `Wired Study ${suffix}`
  });
  const invite = await postJson<{ code: string }>(request, `/v1/classes/${classRecord.id}/invites`, AUTHOR, {
    role: "student",
    roomId: roomWithManifest.room.id,
    expiresInMinutes: 60
  });
  return { roomWithManifest, invite };
}

async function joinRoom(page: Page, roomId: string, roomName: string, identity: DevIdentity, inviteCode?: string) {
  await setIdentity(page, identity);
  const url = inviteCode ? `/rooms/${roomId}?invite=${encodeURIComponent(inviteCode)}` : `/rooms/${roomId}`;
  await page.goto(url, { waitUntil: "commit", timeout: 90_000 });
  await expect(page.getByTestId(`participant-${identity.userId}`)).toBeVisible({ timeout: 60_000 });
}

async function placeLogic(
  request: APIRequestContext,
  roomId: string,
  payload: Record<string, unknown>
) {
  const result = await postJson<{ piece: LogicPiece }>(
    request,
    `/v1/rooms/${roomId}/logic-pieces`,
    AUTHOR,
    payload
  );
  return result.piece;
}

test.beforeAll(async ({ request }) => {
  await waitForApi(request);
});

test.describe.configure({ timeout: 120_000 });

test.describe("escape room logic", () => {
  test("two clients solve button → door → light → exit before timer wins", async ({ browser, request }) => {
    const { roomWithManifest, invite } = await createEscapeRoomWithInvite(request);
    const { room } = roomWithManifest;

    // Author wires the puzzle: button opens a latched door; closet button lights
    // the room; an exit plate ends the session.
    const door = await placeLogic(request, room.id, {
      kind: "door",
      cell: { ix: 2, iz: 4 },
      level: 0,
      edge: "n",
      channelId: "exit-door",
      config: { listenMode: "latch" }
    });
    const doorButton = await placeLogic(request, room.id, {
      kind: "button",
      cell: { ix: 3, iz: 1 },
      level: 0,
      edge: "e",
      channelId: "exit-door",
      config: { fireMode: "pulse" }
    });
    const light = await placeLogic(request, room.id, {
      kind: "light",
      cell: { ix: 1, iz: 1 },
      level: 0,
      channelId: "study-light",
      config: { listenMode: "latch" }
    });
    const lightButton = await placeLogic(request, room.id, {
      kind: "button",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: "w",
      channelId: "study-light",
      config: { fireMode: "pulse" }
    });
    const exitPlate = await placeLogic(request, room.id, {
      kind: "pressurePlate",
      cell: { ix: 2, iz: 5 },
      level: 0,
      channelId: "escaped",
      config: { fireMode: "pulse", isExit: true }
    });

    // Two clients join; play mode + session start.
    const authorContext = await browser.newContext();
    const playerContext = await browser.newContext();
    const authorPage = await authorContext.newPage();
    const playerPage = await playerContext.newPage();
    await joinRoom(authorPage, room.id, room.name, AUTHOR);
    await joinRoom(playerPage, room.id, room.name, PLAYER, invite.code);

    await patchJson(request, `/v1/rooms/${room.id}`, AUTHOR, {
      settings: { playModeEnabled: true }
    });
    const started = await postJson<{ session: { status: string } }>(
      request,
      `/v1/rooms/${room.id}/escape-session/start`,
      AUTHOR,
      { durationSec: 300 }
    );
    expect(started.session.status).toBe("running");

    // Player presses the door button → door latches open.
    await postJson(request, `/v1/rooms/${room.id}/logic-pieces/${doorButton.id}/signal`, PLAYER, {
      kind: "interact"
    });
    await expect
      .poll(async () => {
        const { state } = await getJson<LogicStateResponse>(request, `/v1/rooms/${room.id}/logic-state`, PLAYER);
        return state.nodes[door.id]?.open === true;
      }, { timeout: 10_000 })
      .toBe(true);

    // Player lights the room with the closet button.
    await postJson(request, `/v1/rooms/${room.id}/logic-pieces/${lightButton.id}/signal`, PLAYER, {
      kind: "interact"
    });
    await expect
      .poll(async () => {
        const { state } = await getJson<LogicStateResponse>(request, `/v1/rooms/${room.id}/logic-state`, PLAYER);
        return state.nodes[light.id]?.on === true;
      }, { timeout: 10_000 })
      .toBe(true);

    // Player steps on the exit plate, then the exit triggers a win.
    await postJson(request, `/v1/rooms/${room.id}/logic-pieces/${exitPlate.id}/signal`, PLAYER, {
      kind: "stepOn"
    });
    const won = await postJson<{ session: { status: string; endedAt?: string } }>(
      request,
      `/v1/rooms/${room.id}/escape-session/win`,
      PLAYER,
      {}
    );
    expect(won.session.status).toBe("won");
    expect(won.session.endedAt).toBeTruthy();

    await authorContext.close();
    await playerContext.close();
  });
});
