import { clampPositionToBounds, floorYFromZ } from "@3dspace/room-engine";
import {
  clampRoomObjectScaleValue,
  type ClassMembership,
  type Pose,
  type RoomManifest,
  type RoomObject,
  type RoomObjectTemplate,
  type RoomSettings
} from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import {
  roomObjectDisabled,
  roomObjectLimitReached,
  roomObjectLocked,
  roomObjectNotFound,
  roomObjectTouchDenied
} from "../errors.js";
import type { Repository } from "../repository.js";

const ROOM_OBJECT_BBOX_AXIS_METERS = 1.5;
const ROOM_OBJECT_MIN_HEIGHT_ABOVE_FLOOR_M = 0.05;
const ROOM_OBJECT_MAX_HEIGHT_ABOVE_FLOOR_M = 3;

export function assertRoomObjectsEnabled(config: AppConfig, room: { settings: RoomSettings }) {
  if (!config.tuning.enableRoomObjects || !room.settings.roomObjects.enabled) {
    throw roomObjectDisabled();
  }
}

export function roomObjectBboxAxisMeters(template: RoomObjectTemplate) {
  return Math.max(template.defaultScale * ROOM_OBJECT_BBOX_AXIS_METERS, 0.5);
}

export function clampRoomObjectScale(scale: number, template: RoomObjectTemplate) {
  return clampRoomObjectScaleValue(scale, template.defaultScale);
}

export function clampRoomObjectPose(manifest: RoomManifest, pose: Pose): Pose {
  const position = clampPositionToBounds(manifest, pose.position);
  const floorY = floorYFromZ(manifest, position.z);
  const minY = floorY + ROOM_OBJECT_MIN_HEIGHT_ABOVE_FLOOR_M;
  const maxY = floorY + ROOM_OBJECT_MAX_HEIGHT_ABOVE_FLOOR_M;
  return {
    ...pose,
    position: {
      ...position,
      y: Math.min(Math.max(pose.position.y, minY), maxY)
    },
    rotation: {
      yaw: pose.rotation.yaw,
      pitch: pose.rotation.pitch ?? 0,
      roll: pose.rotation.roll ?? 0
    }
  };
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

export function assertRoomObjectNotLocked(object: RoomObject) {
  if (object.status === "locked") {
    throw roomObjectLocked();
  }
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
