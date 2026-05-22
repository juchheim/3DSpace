import { roomObjectScaleBounds, type Pose, type Role, type RoomManifest, type RoomObject, type RoomObjectTemplate, type Vector3 } from "@3dspace/contracts";
import { clampPositionToBounds } from "@3dspace/room-engine";
import { ROOM_OBJECT_PROCEDURALS } from "../components/roomObjectProcedurals";

const POSITION_GRID_M = 0.25;
const ROTATION_STEP_RAD = Math.PI / 12;

/** v1 district-demo hero — only this template is selectable in the teacher toolbar. */
export const ROOM_OBJECT_HERO_SLUG = "water-molecule";

export function isRoomObjectTemplatePlaceable(template: RoomObjectTemplate) {
  if (template.renderer === "procedural") {
    return Boolean(template.proceduralId && template.proceduralId in ROOM_OBJECT_PROCEDURALS);
  }
  return Boolean(template.assetUrl);
}

/** Phase 7: hero-only toolbar until additional builtins ship. */
export function isRoomObjectTemplateSelectableInV1(template: RoomObjectTemplate) {
  return template.slug === ROOM_OBJECT_HERO_SLUG && isRoomObjectTemplatePlaceable(template);
}

export function canTouchRoomObject(input: {
  object: RoomObject;
  userId: string;
  role: Role;
  memberGroupIds: string[];
}) {
  if (input.role === "teacher") return true;
  if (input.object.touchPolicy === "all-class") return true;
  if (input.object.touchPolicy === "granted") {
    return (
      input.object.grantedUserIds.includes(input.userId) ||
      input.object.grantedGroupIds.some((groupId) => input.memberGroupIds.includes(groupId))
    );
  }
  return false;
}

export function buildSpawnPoseInFront(input: {
  manifest: RoomManifest;
  avatarPosition: Vector3;
  avatarYaw: number;
  template: RoomObjectTemplate;
}): Pose {
  const forwardX = Math.sin(input.avatarYaw);
  const forwardZ = Math.cos(input.avatarYaw);
  const position = clampPositionToBounds(input.manifest, {
    x: input.avatarPosition.x + forwardX * 0.5,
    y: input.template.defaultPose.position.y,
    z: input.avatarPosition.z + forwardZ * 0.5
  });
  return {
    position,
    rotation: {
      ...input.template.defaultPose.rotation,
      yaw: input.avatarYaw
    }
  };
}

export function snapPosition(manifest: RoomManifest, position: Vector3, bypassSnap: boolean): Vector3 {
  if (bypassSnap) return clampPositionToBounds(manifest, position);
  const snapped = {
    x: Math.round(position.x / POSITION_GRID_M) * POSITION_GRID_M,
    y: position.y,
    z: Math.round(position.z / POSITION_GRID_M) * POSITION_GRID_M
  };
  return clampPositionToBounds(manifest, snapped);
}

export function snapYaw(yaw: number, bypassSnap: boolean) {
  if (bypassSnap) return yaw;
  return Math.round(yaw / ROTATION_STEP_RAD) * ROTATION_STEP_RAD;
}

export function scaleBounds(templateDefaultScale: number) {
  return roomObjectScaleBounds(templateDefaultScale);
}

export function snapScale(value: number, templateDefaultScale: number, bypassSnap: boolean) {
  const { min, max, step } = scaleBounds(templateDefaultScale);
  const clamped = Math.min(Math.max(value, min), max);
  if (bypassSnap) return clamped;
  return Math.min(Math.max(Math.round(clamped / step) * step, min), max);
}

export function parameterSummary(parameters: Record<string, unknown>) {
  const parts: string[] = [];
  if (typeof parameters.modelStyle === "string") {
    parts.push(parameters.modelStyle === "space-filling" ? "space-filling" : "ball & stick");
  }
  if (parameters.bondAngleVisible === true) parts.push("bond angle on");
  if (typeof parameters.palette === "string" && parameters.palette !== "cpk") {
    parts.push(`${parameters.palette} palette`);
  }
  return parts.length ? parts.join(" · ") : "";
}
