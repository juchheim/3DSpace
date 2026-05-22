import { clampPositionToBounds } from "@3dspace/room-engine";
import type { ClassMembership, Pose, RoomManifest, RoomObject, RoomObjectTemplate, RoomSettings } from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import { roomObjectDisabled, roomObjectLimitReached, roomObjectNotFound, roomObjectTouchDenied } from "../errors.js";
import type { Repository } from "../repository.js";

const ROOM_OBJECT_BBOX_AXIS_METERS = 1.5;
const ROOM_OBJECT_MIN_SCALE = 0.25;

export function assertRoomObjectsEnabled(config: AppConfig, room: { settings: RoomSettings }) {
  if (!config.tuning.enableRoomObjects || !room.settings.roomObjects.enabled) {
    throw roomObjectDisabled();
  }
}

export function roomObjectBboxAxisMeters(template: RoomObjectTemplate) {
  return Math.max(template.defaultScale * ROOM_OBJECT_BBOX_AXIS_METERS, 0.5);
}

export function clampRoomObjectScale(scale: number, template: RoomObjectTemplate) {
  const axis = roomObjectBboxAxisMeters(template);
  const maxScale = 4 / axis;
  return Math.min(Math.max(scale, ROOM_OBJECT_MIN_SCALE), maxScale);
}

export function clampRoomObjectPose(manifest: RoomManifest, pose: Pose): Pose {
  const position = clampPositionToBounds(manifest, pose.position);
  return { ...pose, position };
}

export async function requireRoomObject(
  repository: Repository,
  roomId: string,
  objectId: string
): Promise<RoomObject> {
  const object = await repository.getRoomObject(roomId, objectId);
  if (!object || object.status === "archived") {
    throw roomObjectNotFound();
  }
  return object;
}

export async function assertCanTouchRoomObject(
  repository: Repository,
  roomId: string,
  object: RoomObject,
  auth: AuthContext,
  membership: ClassMembership
) {
  if (membership.role === "teacher") return;
  if (object.touchPolicy === "all-class") return;
  if (object.touchPolicy === "granted") {
    if (object.grantedUserIds.includes(auth.userId)) return;
    if (object.grantedGroupIds.length > 0) {
      const state = await repository.getClassroomState(roomId);
      const inGrantedGroup = state.groups.some(
        (group) => object.grantedGroupIds.includes(group.id) && group.memberUserIds.includes(auth.userId)
      );
      if (inGrantedGroup) return;
    }
  }
  throw roomObjectTouchDenied();
}

export async function enforceActiveRoomObjectCap(repository: Repository, room: { id: string; settings: RoomSettings }) {
  const active = await repository.listRoomObjectsForRoom(room.id, { status: "active" });
  if (active.length >= room.settings.roomObjects.maxActive) {
    throw roomObjectLimitReached();
  }
}

export function studentPatchKeysOnly(body: Record<string, unknown>) {
  const keys = Object.keys(body).filter((key) => body[key] !== undefined);
  return keys.every((key) => key === "pose" || key === "scale" || key === "parameters");
}
