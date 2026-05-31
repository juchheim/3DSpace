import { describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { MemoryRepository } from "../../src/repository";
import { addStudentMember, authHeaders, createClassAndRoom } from "../helpers/app";
import { escapeRoomConfig } from "../helpers/escape-room";

describe("logic-pieces (API)", () => {
  it("author places and lists logic pieces on an escape room", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-logic", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-logic", "author-logic", "Author");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("author-logic", "Author"),
      payload: {
        kind: "button",
        cell: { ix: 5, iz: 5 },
        level: 0,
        edge: "n",
        channelId: "door-a"
      }
    });
    expect(createRes.statusCode).toBe(200);
    expect(createRes.json().piece.kind).toBe("button");
    expect(createRes.json().piece.channelId).toBe("door-a");
    expect(createRes.json().realtimeMessages[0]?.type).toBe("room.logic.upsert.v1");

    const listRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("author-logic", "Author")
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().pieces).toHaveLength(1);

    const stateRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/logic-state`,
      headers: authHeaders("author-logic", "Author")
    });
    expect(stateRes.statusCode).toBe(200);
    expect(stateRes.json().state.roomId).toBe(roomId);

    await app.close();
  });

  it("rejects logic placement from non-teachers", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "teacher-er", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "teacher-er", "player-1", "Player");

    const res = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("player-1", "Player"),
      payload: { kind: "door", cell: { ix: 1, iz: 1 }, level: 0, edge: "e", channelId: "ch-1" }
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("accepts logic signals during play mode", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-signal", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-signal", "author-signal", "Author");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("author-signal", "Author"),
      payload: { kind: "button", cell: { ix: 2, iz: 2 }, level: 0, edge: "n", channelId: "test-ch" }
    });
    const pieceId = createRes.json().piece.id as string;

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("author-signal", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const signalRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${pieceId}/signal`,
      headers: authHeaders("author-signal", "Author"),
      payload: { kind: "interact" }
    });
    expect(signalRes.statusCode).toBe(200);
    expect(signalRes.json().ok).toBe(true);
    expect(signalRes.json().pieceId).toBe(pieceId);
    expect(signalRes.json().realtimeMessages[0]?.type).toBe("room.logic.state.v1");
    await app.close();
  });

  it("author toggles door node state", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "author-door", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "author-door", "author-door", "Author");

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("author-door", "Author"),
      payload: { kind: "door", cell: { ix: 3, iz: 3 }, level: 0, edge: "n" }
    });
    const pieceId = createRes.json().piece.id as string;

    const openRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/logic-pieces/${pieceId}/state`,
      headers: authHeaders("author-door", "Author"),
      payload: { open: true }
    });
    expect(openRes.statusCode).toBe(200);
    expect(openRes.json().state.nodes[pieceId].open).toBe(true);
    expect(openRes.json().realtimeMessages[0]?.type).toBe("room.logic.state.v1");

    await app.close();
  });

  it("button interact opens a latched door on the same channel in play mode", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "btn-door", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "btn-door", "btn-door", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("btn-door", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const doorRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("btn-door", "Author"),
      payload: {
        kind: "door",
        cell: { ix: 4, iz: 4 },
        level: 0,
        edge: "e",
        channelId: "main-door",
        config: { listenMode: "latch", initialState: { open: false } }
      }
    });
    const buttonRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("btn-door", "Author"),
      payload: {
        kind: "button",
        cell: { ix: 5, iz: 4 },
        level: 0,
        edge: "n",
        channelId: "main-door",
        config: { fireMode: "pulse" }
      }
    });
    const doorId = doorRes.json().piece.id as string;
    const buttonId = buttonRes.json().piece.id as string;

    const signalRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${buttonId}/signal`,
      headers: authHeaders("btn-door", "Author"),
      payload: { kind: "interact" }
    });
    expect(signalRes.statusCode).toBe(200);
    expect(signalRes.json().state.nodes[doorId].open).toBe(true);
    expect(signalRes.json().realtimeMessages[0]?.type).toBe("room.logic.state.v1");

    await app.close();
  });

  it("step-on teleporter moves player to paired pad when armed", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "tp-pair", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "tp-pair", "tp-pair", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const padA = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { kind: "teleporter", cell: { ix: 2, iz: 2 }, level: 0, linkId: "pair-1" }
    });
    const padB = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { kind: "teleporter", cell: { ix: 8, iz: 8 }, level: 0, linkId: "pair-1" }
    });
    const padAId = padA.json().piece.id as string;
    const padBId = padB.json().piece.id as string;

    const signalRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${padAId}/signal`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { kind: "stepOn" }
    });
    expect(signalRes.statusCode).toBe(200);
    expect(signalRes.json().teleportTo).toBeTruthy();
    expect(signalRes.json().teleportTo.x).not.toBe(0);

    const disarmedRes = await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}/logic-pieces/${padBId}/state`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { armed: false }
    });
    expect(disarmedRes.statusCode).toBe(200);

    const blockedRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${padBId}/signal`,
      headers: authHeaders("tp-pair", "Author"),
      payload: { kind: "stepOn" }
    });
    expect(blockedRes.statusCode).toBe(422);

    await app.close();
  });

  it("button interact turns on a latched light on the same channel in play mode", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "btn-light", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "btn-light", "btn-light", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("btn-light", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const lightRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("btn-light", "Author"),
      payload: {
        kind: "light",
        cell: { ix: 6, iz: 6 },
        level: 0,
        channelId: "room-light",
        config: { listenMode: "latch", initialState: { on: false } }
      }
    });
    const buttonRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("btn-light", "Author"),
      payload: {
        kind: "button",
        cell: { ix: 7, iz: 6 },
        level: 0,
        edge: "n",
        channelId: "room-light",
        config: { fireMode: "pulse" }
      }
    });
    const lightId = lightRes.json().piece.id as string;
    const buttonId = buttonRes.json().piece.id as string;

    const signalRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${buttonId}/signal`,
      headers: authHeaders("btn-light", "Author"),
      payload: { kind: "interact" }
    });
    expect(signalRes.statusCode).toBe(200);
    expect(signalRes.json().state.nodes[lightId].on).toBe(true);
    expect(signalRes.json().realtimeMessages[0]?.type).toBe("room.logic.state.v1");

    await app.close();
  });

  it("whileHeld plate keeps a momentary door open only while stepped on", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "plate-door", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "plate-door", "plate-door", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("plate-door", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const doorRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("plate-door", "Author"),
      payload: {
        kind: "door",
        cell: { ix: 3, iz: 3 },
        level: 0,
        edge: "e",
        channelId: "hold-door",
        config: { listenMode: "momentary", initialState: { open: false } }
      }
    });
    const plateRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("plate-door", "Author"),
      payload: {
        kind: "pressurePlate",
        cell: { ix: 4, iz: 3 },
        level: 0,
        channelId: "hold-door",
        config: { fireMode: "whileHeld" }
      }
    });
    const doorId = doorRes.json().piece.id as string;
    const plateId = plateRes.json().piece.id as string;

    const stepOnRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${plateId}/signal`,
      headers: authHeaders("plate-door", "Author"),
      payload: { kind: "stepOn" }
    });
    expect(stepOnRes.statusCode).toBe(200);
    expect(stepOnRes.json().state.nodes[doorId].open).toBe(true);

    const stepOffRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${plateId}/signal`,
      headers: authHeaders("plate-door", "Author"),
      payload: { kind: "stepOff" }
    });
    expect(stepOffRes.statusCode).toBe(200);
    expect(stepOffRes.json().state.nodes[doorId].open).toBe(false);

    await app.close();
  });

  it("proximity enter turns on a latched light on the same channel", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "prox-light", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "prox-light", "prox-light", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("prox-light", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const lightRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("prox-light", "Author"),
      payload: {
        kind: "light",
        cell: { ix: 9, iz: 9 },
        level: 0,
        channelId: "corridor-light",
        config: { listenMode: "latch", initialState: { on: false } }
      }
    });
    const zoneRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("prox-light", "Author"),
      payload: {
        kind: "proximityZone",
        cell: { ix: 10, iz: 10 },
        level: 0,
        channelId: "corridor-light",
        config: { fireMode: "pulse" }
      }
    });
    const lightId = lightRes.json().piece.id as string;
    const zoneId = zoneRes.json().piece.id as string;

    const enterRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${zoneId}/signal`,
      headers: authHeaders("prox-light", "Author"),
      payload: { kind: "proximityEnter" }
    });
    expect(enterRes.statusCode).toBe(200);
    expect(enterRes.json().state.nodes[lightId].on).toBe(true);

    await app.close();
  });

  it("timer pulses its output channel after delay when trigger channel fires", async () => {
    const app = await buildApp({ config: escapeRoomConfig(), repository: new MemoryRepository() });
    const { classRecord, roomWithManifest } = await createClassAndRoom(app, "logic-timer", "escape-room");
    const roomId = roomWithManifest.room.id;
    await addStudentMember(app, classRecord.id, "logic-timer", "logic-timer", "Author");

    await app.inject({
      method: "PATCH",
      url: `/v1/rooms/${roomId}`,
      headers: authHeaders("logic-timer", "Author"),
      payload: { settings: { playModeEnabled: true } }
    });

    const doorRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("logic-timer", "Author"),
      payload: {
        kind: "door",
        cell: { ix: 6, iz: 6 },
        level: 0,
        edge: "n",
        channelId: "vault-open",
        config: { listenMode: "latch", initialState: { open: false } }
      }
    });
    await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("logic-timer", "Author"),
      payload: {
        kind: "timer",
        cell: { ix: 7, iz: 7 },
        level: 0,
        channelId: "vault-open",
        config: { triggerChannelId: "start-vault-timer", delayMs: 40 }
      }
    });
    const buttonRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces`,
      headers: authHeaders("logic-timer", "Author"),
      payload: {
        kind: "button",
        cell: { ix: 8, iz: 7 },
        level: 0,
        edge: "n",
        channelId: "start-vault-timer",
        config: { fireMode: "pulse" }
      }
    });
    const doorId = doorRes.json().piece.id as string;
    const buttonId = buttonRes.json().piece.id as string;

    const triggerRes = await app.inject({
      method: "POST",
      url: `/v1/rooms/${roomId}/logic-pieces/${buttonId}/signal`,
      headers: authHeaders("logic-timer", "Author"),
      payload: { kind: "interact" }
    });
    expect(triggerRes.statusCode).toBe(200);
    expect(triggerRes.json().state.nodes[doorId].open).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 80));

    const stateRes = await app.inject({
      method: "GET",
      url: `/v1/rooms/${roomId}/logic-state`,
      headers: authHeaders("logic-timer", "Author")
    });
    expect(stateRes.json().state.nodes[doorId].open).toBe(true);

    await app.close();
  }, 10_000);
});
