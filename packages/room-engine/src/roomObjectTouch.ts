import type { Role, RoomObject } from "@3dspace/contracts";

export function canTouchRoomObject(input: {
  object: RoomObject;
  userId: string;
  role: Role;
  memberGroupIds: string[];
}) {
  if (input.role === "teacher") return true;
  if (input.object.touchPolicy === "all-class") return true;
  if (input.object.touchPolicy !== "granted") return false;
  return (
    input.object.grantedUserIds.includes(input.userId) ||
    input.object.grantedGroupIds.some((groupId) => input.memberGroupIds.includes(groupId))
  );
}
