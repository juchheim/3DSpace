import type { FastifyRequest } from "fastify";
import { getRoomTypeFeatureFlags } from "@3dspace/contracts";
import { authenticate, type AuthContext } from "../auth.js";
import type { AppConfig } from "../config.js";
import { forbidden, notFound } from "../errors.js";
import type { Repository } from "../repository.js";
import { applyDefaultWallAnchorDimensions } from "@3dspace/room-engine";

export async function requireUser(request: FastifyRequest, config: AppConfig, repository: Repository) {
  const auth = await authenticate(request, config);
  await repository.ensureUser(auth);
  return auth;
}

export async function requireClassAccess(repository: Repository, classId: string, auth: AuthContext) {
  const record = await repository.getClass(classId);
  if (!record) throw notFound("Class not found");
  const membership = await repository.getMembership(classId, auth.userId);
  if (record.teacherUserId !== auth.userId && membership?.status !== "active") {
    throw forbidden("Class membership required");
  }
  return { record, membership };
}

export async function requireClassTeacher(repository: Repository, classId: string, auth: AuthContext) {
  const { record, membership } = await requireClassAccess(repository, classId, auth);
  if (record.teacherUserId !== auth.userId && membership?.role !== "teacher") {
    throw forbidden("Teacher role required");
  }
  return record;
}

export async function requireRoomAccess(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  const access = await requireClassAccess(repository, room.classId, auth);
  const manifest = await repository.getActiveManifest(room.id);
  if (!manifest) throw notFound("Room manifest not found");
  return { room, manifest: applyDefaultWallAnchorDimensions(manifest, room.type), membership: access.membership };
}

export async function requireRoomTeacher(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  await requireClassTeacher(repository, room.classId, auth);
  return room;
}

export async function assertMeetingNotesAvailable(repository: Repository, config: AppConfig, roomId: string, auth: AuthContext) {
  const { room } = await requireRoomAccess(repository, roomId, auth);
  if (!config.tuning.enableAiMeetingNotes) throw forbidden("AI meeting notes are disabled");
  if (!getRoomTypeFeatureFlags(room.type).aiMeetingNotes) throw forbidden("AI meeting notes are not available for this room type");
  if (!room.settings.aiMeetingNotes?.enabled) throw forbidden("AI meeting notes are disabled for this room");
  return room;
}

export function assertAiObjectsEnabled(room: { type: string; settings: { aiObjects?: { enabled?: boolean } } }, config: AppConfig) {
  if (!config.tuning.enableAiObjectGeneration) throw forbidden("AI object generation is disabled");
  if (!getRoomTypeFeatureFlags(room.type).aiObjects) throw forbidden("AI object generation is not available for this room type");
  if (room.settings.aiObjects?.enabled === false) throw forbidden("AI object generation is disabled for this room");
}
