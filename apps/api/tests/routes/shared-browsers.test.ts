import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { loadConfig } from "../../src/config";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";
import {
  buildFailingSharedBrowserApp,
  buildHyperbeamSharedBrowserApp,
  buildSharedBrowserApp,
  createSharedBrowser
} from "../helpers/shared-browser";

describe("shared browser boards", () => {
it("creates a session and mirrors state onto the wall object", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;

  const created = await createSharedBrowser(app, roomId, "teacher-sb");
  expect(created.statusCode).toBe(200);
  const object = created.json();
  expect(object.type).toBe("web.browser.shared");
  expect(object.state.sessionStatus).toBe("paused");
  expect(object.state.currentUrl).toBe("https://1.1.1.1/");

  const hydrate = await app.inject({
    method: "GET",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser`,
    headers: authHeaders("teacher-sb", "Ms. Rivera")
  });
  expect(hydrate.statusCode).toBe(200);
  expect(hydrate.json().session.status).toBe("paused");
  expect(hydrate.json().session.currentUrl).toBe("https://1.1.1.1/");

  await app.close();
});

it("navigates the session and updates currentUrl", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  const nav = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/navigate`,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { url: "https://1.0.0.1/" }
  });
  expect(nav.statusCode).toBe(200);
  expect(nav.json().session.currentUrl).toBe("https://1.0.0.1/");
  const navMsg = nav.json().realtimeMessages.find((m: { type: string }) => m.type === "room.shared-browser.navigate.v1");
  expect(navMsg.url).toBe("https://1.0.0.1/");

  await app.close();
});

it("blocks navigation to private/reserved/localhost targets (SSRF)", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  for (const url of ["https://127.0.0.1/", "https://169.254.169.254/", "https://10.0.0.5/", "https://localhost/"]) {
    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/navigate`,
      headers: authHeaders("teacher-sb", "Ms. Rivera"),
      payload: { url }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toMatch(/navigation_blocked/);
  }

  await app.close();
});

it("rejects shared browser creation with a non-https start URL", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;

  const res = await createSharedBrowser(app, roomId, "teacher-sb", "http://1.1.1.1/");
  expect(res.statusCode).toBe(400);

  await app.close();
});

it("hides shared browsers on non-FFA rooms and when the flag is off", async () => {
  const classApp = await buildSharedBrowserApp();
  const { roomWithManifest: classRoom } = await createClassAndRoom(classApp, "teacher-class", "classroom");
  const classRes = await classApp.inject({
    method: "POST",
    url: `/v1/rooms/${classRoom.room.id}/wall-objects`,
    headers: authHeaders("teacher-class", "Ms. Rivera"),
    payload: {
      type: "web.browser.shared",
      title: "Shared Browser",
      wallAnchorId: classRoom.manifest.wallAnchors[0].id,
      placement: { row: 0, column: 0 },
      source: { kind: "inline", data: { startUrl: "https://1.1.1.1/" } }
    }
  });
  expect(classRes.statusCode).toBe(404);
  await classApp.close();

  const offApp = await buildApp({
    config: loadConfig({ NODE_ENV: "test", ENABLE_FREE_FOR_ALL: "true", FREE_FOR_ALL_PASSWORD: "open-sesame" } as NodeJS.ProcessEnv),
    repository: new MemoryRepository()
  });
  const { roomWithManifest } = await createClassAndRoom(offApp, "teacher-off", "free-for-all");
  const offRes = await createSharedBrowser(offApp, roomWithManifest.room.id, "teacher-off");
  expect(offRes.statusCode).toBe(404);
  await offApp.close();
});

it("stops the session when the wall object is deleted", async () => {
  const repository = new MemoryRepository();
  const app = await buildSharedBrowserApp(repository);
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  expect(await repository.getSharedBrowserSessionByWallObject(object.id)).toBeDefined();

  const del = await app.inject({
    method: "DELETE",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}`,
    headers: authHeaders("teacher-sb", "Ms. Rivera")
  });
  expect(del.statusCode).toBe(200);
  expect(await repository.getSharedBrowserSessionByWallObject(object.id)).toBeUndefined();

  await app.close();
});

it("enforces a per-room active shared browser limit", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;

  const first = await createSharedBrowser(app, roomId, "teacher-sb", "https://1.1.1.1/", "ffa-adj-east-anchor");
  expect(first.statusCode).toBe(200);
  const second = await createSharedBrowser(app, roomId, "teacher-sb", "https://1.1.1.1/", "ffa-adj-south-anchor");
  expect(second.statusCode).toBe(200);
  const third = await createSharedBrowser(app, roomId, "teacher-sb", "https://1.1.1.1/", "ffa-adj-west-anchor");
  expect(third.statusCode).toBe(409);

  await app.close();
});

it("returns hyperbeam embedUrl on hydrate after resume", async () => {
  const app = await buildHyperbeamSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  const resumed = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/resume`,
    headers: authHeaders("teacher-sb", "Ms. Rivera")
  });
  expect(resumed.statusCode).toBe(200);
  expect(resumed.json().session.hyperbeam?.embedUrl).toContain("embed.hyperbeam.test");

  const hydrate = await app.inject({
    method: "GET",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser`,
    headers: authHeaders("teacher-sb", "Ms. Rivera")
  });
  expect(hydrate.statusCode).toBe(200);
  expect(hydrate.json().session.hyperbeam?.sessionId).toBeTruthy();
  expect(hydrate.json().session.hyperbeam?.embedUrl).toContain("embed.hyperbeam.test");
  expect(hydrate.json().session.adminToken).toBeUndefined();

  await app.close();
});

it("lets any participant take over control without a conflict (cooperative)", async () => {
  const app = await buildSharedBrowserApp();
  const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  await addStudentMember(app, classRecord.id, "teacher-sb", "participant-sb", "Trip Juchheim");
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  const leaseUrl = `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/control-lease`;

  const first = await app.inject({
    method: "POST",
    url: leaseUrl,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { action: "take" }
  });
  expect(first.statusCode).toBe(200);
  expect(first.json().session.controlLease.userId).toBe("teacher-sb");

  // A different participant can always take over — no 409.
  const takeover = await app.inject({
    method: "POST",
    url: leaseUrl,
    headers: authHeaders("participant-sb", "Trip Juchheim"),
    payload: { action: "take" }
  });
  expect(takeover.statusCode).toBe(200);
  expect(takeover.json().session.controlLease.userId).toBe("participant-sb");

  // The previous holder's periodic renew must NOT steal control back.
  const staleRenew = await app.inject({
    method: "POST",
    url: leaseUrl,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { action: "renew" }
  });
  expect(staleRenew.statusCode).toBe(200);
  expect(staleRenew.json().session.controlLease.userId).toBe("participant-sb");

  await app.close();
});

it("fans out realtime envelopes for control-lease changes", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  const lease = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/control-lease`,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { action: "take" }
  });
  expect(lease.statusCode).toBe(200);
  const leaseMsg = lease.json().realtimeMessages.find(
    (m: { type: string }) => m.type === "room.shared-browser.control-lease.v1"
  );
  expect(leaseMsg.controlLease.userId).toBe("teacher-sb");

  await app.close();
});

it("clears the stored control lease on release", async () => {
  const app = await buildSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();
  const leaseUrl = `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/control-lease`;

  const take = await app.inject({
    method: "POST",
    url: leaseUrl,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { action: "take" }
  });
  expect(take.statusCode).toBe(200);
  expect(take.json().session.controlLease.userId).toBe("teacher-sb");

  const release = await app.inject({
    method: "POST",
    url: leaseUrl,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { action: "release" }
  });
  expect(release.statusCode).toBe(200);
  expect(release.json().session.controlLease ?? null).toBeNull();

  const hydrate = await app.inject({
    method: "GET",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser`,
    headers: authHeaders("teacher-sb", "Ms. Rivera")
  });
  expect(hydrate.statusCode).toBe(200);
  expect(hydrate.json().session.controlLease ?? null).toBeNull();

  await app.close();
});

it("returns a typed conflict instead of a 500 when the browser driver is unavailable", async () => {
  const app = await buildFailingSharedBrowserApp();
  const { roomWithManifest } = await createClassAndRoom(app, "teacher-sb", "free-for-all");
  const roomId = roomWithManifest.room.id;
  const object = (await createSharedBrowser(app, roomId, "teacher-sb")).json();

  const nav = await app.inject({
    method: "POST",
    url: `/v1/rooms/${roomId}/wall-objects/${object.id}/shared-browser/navigate`,
    headers: authHeaders("teacher-sb", "Ms. Rivera"),
    payload: { url: "https://1.0.0.1/" }
  });
  expect(nav.statusCode).toBe(409);
  expect(nav.json().message).toMatch(/failed to (launch|start)|unavailable/i);

  await app.close();
});
});

