import type { RoomObject, RoomObjectRealtimeMessage } from "@3dspace/contracts";

export function buildRoomObjectUpsertMessage(input: {
  roomId: string;
  object: RoomObject;
  senderId: string;
  sentAt?: number | undefined;
}): Extract<RoomObjectRealtimeMessage, { type: "room.object.upsert.v1" }> {
  const sentAt = input.sentAt ?? Date.now();
  return {
    type: "room.object.upsert.v1",
    roomId: input.roomId,
    object: input.object,
    sentAt,
    senderId: input.senderId
  };
}

export function buildRoomObjectRemoveMessage(input: {
  roomId: string;
  objectId: string;
  senderId: string;
  sentAt?: number;
}): Extract<RoomObjectRealtimeMessage, { type: "room.object.remove.v1" }> {
  return {
    type: "room.object.remove.v1",
    roomId: input.roomId,
    objectId: input.objectId,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildRoomObjectTouchMessage(input: {
  roomId: string;
  object: RoomObject;
  senderId: string;
  sentAt?: number;
}): Extract<RoomObjectRealtimeMessage, { type: "room.object.touch.v1" }> {
  return {
    type: "room.object.touch.v1",
    roomId: input.roomId,
    objectId: input.object.id,
    touchPolicy: input.object.touchPolicy,
    grantedUserIds: input.object.grantedUserIds,
    grantedGroupIds: input.object.grantedGroupIds,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}

export function buildRoomObjectGrabMessage(input: {
  roomId: string;
  objectId: string;
  holderUserId: string;
  expiresAt: string;
  senderId: string;
  sentAt?: number;
}): Extract<RoomObjectRealtimeMessage, { type: "room.object.grab.v1" }> {
  return {
    type: "room.object.grab.v1",
    roomId: input.roomId,
    objectId: input.objectId,
    holderUserId: input.holderUserId,
    expiresAt: input.expiresAt,
    sentAt: input.sentAt ?? Date.now(),
    senderId: input.senderId
  };
}
