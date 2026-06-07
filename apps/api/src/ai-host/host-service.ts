import { RoomAiHostSchema, type RoomAiHost } from "@3dspace/contracts";
import { badRequest } from "../errors.js";
import { newId, nowIso } from "../repository.js";
import { displayNameContainsProfanity } from "./profanity.js";

const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}\s-]*[\p{L}\p{N}])?$/u;

export function normalizeAiHostDisplayName(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3 || trimmed.length > 24) {
    throw badRequest("Display name must be 3–24 characters after trimming");
  }
  if (!DISPLAY_NAME_PATTERN.test(trimmed)) {
    throw badRequest(
      "Display name may only contain letters, numbers, spaces, and hyphens, and must start and end with a letter or number"
    );
  }
  if (displayNameContainsProfanity(trimmed)) {
    throw badRequest("Display name is not allowed");
  }
  return trimmed;
}

export function createAiHostRecord(input: {
  roomId: string;
  displayName: string;
  avatar?: RoomAiHost["avatar"] | undefined;
  position: RoomAiHost["position"];
  rotationY?: number | undefined;
  createdByUserId: string;
}): RoomAiHost {
  const now = nowIso();
  return RoomAiHostSchema.parse({
    id: newId("aihost"),
    roomId: input.roomId,
    displayName: normalizeAiHostDisplayName(input.displayName),
    avatar: input.avatar ?? "lp",
    position: input.position,
    rotationY: input.rotationY ?? 0,
    createdByUserId: input.createdByUserId,
    createdAt: now,
    updatedAt: now
  });
}

export function patchAiHostRecord(
  host: RoomAiHost,
  patch: {
    displayName?: string | undefined;
    avatar?: RoomAiHost["avatar"] | undefined;
    position?: RoomAiHost["position"] | undefined;
    rotationY?: number | undefined;
  }
): RoomAiHost {
  const updatedAt = nowIso();
  return RoomAiHostSchema.parse({
    ...host,
    ...(patch.displayName !== undefined
      ? { displayName: normalizeAiHostDisplayName(patch.displayName) }
      : {}),
    ...(patch.avatar !== undefined ? { avatar: patch.avatar } : {}),
    ...(patch.position !== undefined ? { position: patch.position } : {}),
    ...(patch.rotationY !== undefined ? { rotationY: patch.rotationY } : {}),
    updatedAt
  });
}
