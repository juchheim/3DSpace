import type { RoomRecord, WallObject, WhiteboardSnapshot } from "@3dspace/contracts";
import type { AppConfig } from "../config.js";
import { nowIso, type Repository } from "../repository.js";
import { writeStoredObject } from "../services/storage.js";
import { normalizedWhiteboardStateUpdate, readWhiteboardState } from "./validation.js";

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function whiteboardSnapshotStorageKey(config: AppConfig, input: {
  roomId: string;
  wallObjectId: string;
  snapshotZ: number;
}) {
  const prefix = trimSlashes(config.tuning.whiteboardStoragePrefix || "whiteboards");
  return `${prefix}/${input.roomId}/${input.wallObjectId}/snapshot-${input.snapshotZ}.json`;
}

export async function maybeCompactWhiteboard(input: {
  config: AppConfig;
  repository: Repository;
  room: RoomRecord;
  object: WallObject;
  updatedByUserId: string;
  force?: boolean;
}) {
  const state = readWhiteboardState(input.object);
  const snapshotEvery = Math.max(1, input.room.settings.whiteboards.snapshotEvery);
  const unsnapshotted = Math.max(0, state.strokeCount - ((state.snapshotZ ?? -1) + 1));
  if (!input.force && unsnapshotted < snapshotEvery) {
    return null;
  }

  const strokes = await input.repository.listWhiteboardStrokes(input.room.id, input.object.id);
  const latestStroke = strokes.at(-1);
  if (!latestStroke) return null;

  const snapshotZ = latestStroke.z;
  const storageKey = whiteboardSnapshotStorageKey(input.config, {
    roomId: input.room.id,
    wallObjectId: input.object.id,
    snapshotZ
  });
  const body = Buffer.from(JSON.stringify({ strokes }), "utf8");
  await writeStoredObject(input.config, {
    storageKey,
    body,
    contentType: "application/json; charset=utf-8"
  });

  const createdAt = nowIso();
  const snapshot: WhiteboardSnapshot = {
    roomId: input.room.id,
    wallObjectId: input.object.id,
    snapshotZ,
    storageKey,
    byteSize: body.length,
    createdAt
  };
  await input.repository.upsertWhiteboardSnapshot(snapshot);
  const updatedObject = await input.repository.updateWallObject(input.room.id, input.object.id, {
    updatedByUserId: input.updatedByUserId,
    state: normalizedWhiteboardStateUpdate({
      object: input.object,
      strokeCount: strokes.length,
      snapshot: { storageKey, snapshotZ },
      now: createdAt
    })
  });

  return { snapshot, object: updatedObject };
}
