import { anchorAcceptsWallObjectType, anchorHasOccupyingWallObject, type WallAnchorCreateOption } from "@3dspace/room-engine";
import type { DynamicWallAnchor, RoomManifest, RoomType, WallObjectType } from "@3dspace/contracts";
import { badRequest, conflict } from "../errors.js";
import type { Repository } from "../repository.js";

type RoomWallAnchor = RoomManifest["wallAnchors"][number] | DynamicWallAnchor;

export function requireAnchorAcceptsType(anchors: readonly RoomWallAnchor[], wallAnchorId: string, type: WallObjectType) {
  const anchor = anchors.find((candidate) => candidate.id === wallAnchorId);
  if (!anchor) throw badRequest("wallAnchorId does not exist in room manifest");
  if (!anchorAcceptsWallObjectType(anchor, type)) {
    throw badRequest(`Wall anchor does not accept ${type}`);
  }
  return anchor;
}

export async function listRoomWallAnchors(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>
) {
  if (!manifest) return [];
  if (room.type !== "free-for-all") return manifest.wallAnchors;
  const dynamicAnchors = await repository.listDynamicWallAnchorsForRoom(room.id);
  return [...manifest.wallAnchors, ...dynamicAnchors];
}

export async function assertAnchorExists(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  wallAnchorId: string
) {
  const anchors = await listRoomWallAnchors(repository, room, manifest);
  if (!anchors.some((candidate) => candidate.id === wallAnchorId)) {
    throw badRequest("wallAnchorId does not exist in room manifest");
  }
}

export async function assertAnchorAcceptsType(
  repository: Repository,
  room: { id: string; type: RoomType },
  manifest: Awaited<ReturnType<Repository["getActiveManifest"]>>,
  wallAnchorId: string,
  type: WallObjectType
) {
  const anchors = await listRoomWallAnchors(repository, room, manifest);
  return requireAnchorAcceptsType(anchors, wallAnchorId, type);
}

export async function assertAnchorAvailableForNewObject(repository: Repository, roomId: string, wallAnchorId: string) {
  const objects = await repository.listWallObjects(roomId, { anchorId: wallAnchorId, includeRemoved: true });
  if (anchorHasOccupyingWallObject(objects, wallAnchorId)) {
    throw conflict("This display already has wall content. Remove it before adding something else.");
  }
}

export type { RoomWallAnchor, WallAnchorCreateOption };
