import type {
  ClassMembership,
  RoomManifest,
  RoomObject,
  RoomObjectRealtimeInbound,
  RoomObjectRealtimeMessage
} from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import { forbidden } from "../errors.js";
import type { Repository } from "../repository.js";
import { RoomObjectGrabLock } from "./grab-lock.js";
import {
  assertCanTouchRoomObject,
  clampRoomObjectPose,
  clampRoomObjectScale,
  requireRoomObject
} from "./helpers.js";
import { buildRoomObjectGrabMessage, buildRoomObjectUpsertMessage } from "./realtime-outbox.js";

const PARAMETER_DEBOUNCE_MS = 200;

type ParameterDebounceState = {
  parameters: Record<string, unknown>;
  resolvers: Array<(messages: RoomObjectRealtimeMessage[]) => void>;
  timer: NodeJS.Timeout;
};

const parameterDebounceByObjectId = new Map<string, ParameterDebounceState>();

export type RoomObjectRealtimeDispatchContext = {
  repository: Repository;
  grabLock: RoomObjectGrabLock;
  config: AppConfig;
  roomId: string;
  manifest: RoomManifest;
  auth: AuthContext;
  membership?: ClassMembership | undefined;
  sentAt: number;
};


function grabExpiresAtIso(expiresAtMs: number) {
  return new Date(expiresAtMs).toISOString();
}

function buildGrabBroadcast(ctx: RoomObjectRealtimeDispatchContext, objectId: string, holderUserId: string, expiresAtMs: number) {
  return buildRoomObjectGrabMessage({
    roomId: ctx.roomId,
    objectId,
    holderUserId,
    expiresAt: grabExpiresAtIso(expiresAtMs),
    senderId: ctx.auth.userId,
    sentAt: ctx.sentAt
  });
}

function buildPoseBroadcast(
  ctx: RoomObjectRealtimeDispatchContext,
  input: { objectId: string; holderUserId: string; pose: RoomObject["pose"]; scale: number }
): RoomObjectRealtimeMessage {
  return {
    type: "room.object.pose.v1",
    roomId: ctx.roomId,
    objectId: input.objectId,
    holderUserId: input.holderUserId,
    pose: input.pose,
    scale: input.scale,
    sentAt: ctx.sentAt,
    senderId: ctx.auth.userId
  };
}

async function handleGrab(ctx: RoomObjectRealtimeDispatchContext, objectId: string) {
  const object = await requireRoomObject(ctx.repository, ctx.roomId, objectId);
  if (!ctx.membership) throw forbidden("Class membership required");
  await assertCanTouchRoomObject(ctx.repository, ctx.roomId, object, ctx.auth, ctx.membership);

  const existing = ctx.grabLock.get(objectId);
  if (existing && existing.holderUserId !== ctx.auth.userId) {
    return [buildGrabBroadcast(ctx, objectId, existing.holderUserId, existing.expiresAt)];
  }

  const grab = ctx.grabLock.claim({ objectId, roomId: ctx.roomId, holderUserId: ctx.auth.userId });
  return [buildGrabBroadcast(ctx, objectId, grab.holderUserId, grab.expiresAt)];
}

async function handlePose(
  ctx: RoomObjectRealtimeDispatchContext,
  input: { objectId: string; pose: RoomObject["pose"]; scale: number }
) {
  const grab = ctx.grabLock.get(input.objectId);
  if (!grab || grab.holderUserId !== ctx.auth.userId) {
    return [];
  }

  const object = await requireRoomObject(ctx.repository, ctx.roomId, input.objectId);
  const template = await ctx.repository.getRoomObjectTemplate(object.templateId);
  if (!template) return [];

  ctx.grabLock.touchPose(input.objectId);
  const pose = clampRoomObjectPose(ctx.manifest, input.pose);
  const scale = clampRoomObjectScale(input.scale, template);
  return [buildPoseBroadcast(ctx, { objectId: input.objectId, holderUserId: grab.holderUserId, pose, scale })];
}

async function handleRelease(
  ctx: RoomObjectRealtimeDispatchContext,
  input: { objectId: string; finalPose: RoomObject["pose"]; finalScale: number }
) {
  const grab = ctx.grabLock.get(input.objectId);
  if (!grab || grab.holderUserId !== ctx.auth.userId) {
    return [];
  }

  const object = await requireRoomObject(ctx.repository, ctx.roomId, input.objectId);
  const template = await ctx.repository.getRoomObjectTemplate(object.templateId);
  if (!template) return [];

  const pose = clampRoomObjectPose(ctx.manifest, input.finalPose);
  const scale = clampRoomObjectScale(input.finalScale, template);
  const updated = await ctx.repository.updateRoomObject(ctx.roomId, input.objectId, { pose, scale });
  ctx.grabLock.release(input.objectId);
  return [buildRoomObjectUpsertMessage({ roomId: ctx.roomId, object: updated, senderId: ctx.auth.userId, sentAt: ctx.sentAt })];
}

async function handleParameter(
  ctx: RoomObjectRealtimeDispatchContext,
  input: { objectId: string; parameters: Record<string, unknown> }
) {
  const object = await requireRoomObject(ctx.repository, ctx.roomId, input.objectId);
  if (!ctx.membership) throw forbidden("Class membership required");
  await assertCanTouchRoomObject(ctx.repository, ctx.roomId, object, ctx.auth, ctx.membership);

  return new Promise<RoomObjectRealtimeMessage[]>((resolve) => {
    const existing = parameterDebounceByObjectId.get(input.objectId);
    if (existing) {
      clearTimeout(existing.timer);
      existing.parameters = input.parameters;
      existing.resolvers.push(resolve);
      existing.timer = setTimeout(() => {
        void flushParameterDebounce(ctx, input.objectId);
      }, PARAMETER_DEBOUNCE_MS);
      return;
    }

    const state: ParameterDebounceState = {
      parameters: input.parameters,
      resolvers: [resolve],
      timer: setTimeout(() => {
        void flushParameterDebounce(ctx, input.objectId);
      }, PARAMETER_DEBOUNCE_MS)
    };
    parameterDebounceByObjectId.set(input.objectId, state);
  });
}

async function flushParameterDebounce(ctx: RoomObjectRealtimeDispatchContext, objectId: string) {
  const pending = parameterDebounceByObjectId.get(objectId);
  parameterDebounceByObjectId.delete(objectId);
  if (!pending) return;
  const updated = await ctx.repository.updateRoomObject(ctx.roomId, objectId, { parameters: pending.parameters });
  const messages = [
    buildRoomObjectUpsertMessage({ roomId: ctx.roomId, object: updated, senderId: ctx.auth.userId, sentAt: ctx.sentAt })
  ];
  pending.resolvers.forEach((resolver) => resolver(messages));
}

export async function dispatchRoomObjectRealtimeMessage(
  ctx: RoomObjectRealtimeDispatchContext,
  inbound: RoomObjectRealtimeInbound
): Promise<RoomObjectRealtimeMessage[]> {
  switch (inbound.type) {
    case "room.object.grab.v1":
      return handleGrab(ctx, inbound.objectId);
    case "room.object.pose.v1":
      return handlePose(ctx, inbound);
    case "room.object.release.v1":
      return handleRelease(ctx, inbound);
    case "room.object.parameter.v1":
      return handleParameter(ctx, inbound);
    default:
      return [];
  }
}

export async function forceReleaseRoomObjectGrab(input: {
  repository: Repository;
  grabLock: RoomObjectGrabLock;
  roomId: string;
  objectId: string;
  holderUserId: string;
  senderId: string;
  sentAt?: number;
}): Promise<RoomObjectRealtimeMessage[]> {
  const grab = input.grabLock.get(input.objectId);
  if (!grab || grab.holderUserId !== input.holderUserId) {
    return [];
  }
  input.grabLock.release(input.objectId);
  const object = await input.repository.getRoomObject(input.roomId, input.objectId);
  if (!object) return [];
  return [
    buildRoomObjectUpsertMessage({
      roomId: input.roomId,
      object,
      senderId: input.senderId,
      ...(input.sentAt !== undefined ? { sentAt: input.sentAt } : {})
    })
  ];
}

export function clearRoomObjectParameterDebounceForTests() {
  for (const entry of parameterDebounceByObjectId.values()) {
    clearTimeout(entry.timer);
    entry.resolvers.forEach((resolver) => resolver([]));
  }
  parameterDebounceByObjectId.clear();
}
