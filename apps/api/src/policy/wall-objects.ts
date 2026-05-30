import { fileKindForWallObjectType, isBoardGrantActive } from "@3dspace/room-engine";
import { getRoomTypeFeatureFlags, type ClassroomState, type RoomSettings, type RoomType, type WallAttachment, type WallObject, type WallObjectType } from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import { sanitizeClassroomState } from "../classroom/state.js";
import type { AppConfig } from "../config.js";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import type { Repository } from "../repository.js";

function liveTrackSourceForWallObjectType(type: WallObjectType) {
  if (type === "camera.live") return "camera" as const;
  if (type === "microphone.live") return "microphone" as const;
  if (type === "screen.live" || type === "browser-tab.live") return "screen_share" as const;
  return undefined;
}

export function wallObjectTypeForAttachmentKind(kind: WallAttachment["kind"]) {
  if (kind === "image") return "image.file" as const;
  if (kind === "video") return "video.file" as const;
  if (kind === "audio") return "audio.file" as const;
  return undefined;
}

export function isLiveWallObjectType(type: WallObjectType) {
  return Boolean(liveTrackSourceForWallObjectType(type));
}

export async function actorIsRoomTeacher(repository: Repository, roomId: string, auth: AuthContext) {
  const room = await repository.getRoom(roomId);
  if (!room) throw notFound("Room not found");
  const classRecord = await repository.getClass(room.classId);
  const membership = await repository.getMembership(room.classId, auth.userId);
  return { room, membership, teacher: membership?.role === "teacher" || classRecord?.teacherUserId === auth.userId };
}

function findApplicableBoardGrant(state: ClassroomState, input: { userId: string; wallAnchorId: string; type: WallObjectType }) {
  return state.boardAccessGrants.find(
    (grant) =>
      grant.userId === input.userId &&
      grant.wallAnchorId === input.wallAnchorId &&
      isBoardGrantActive(grant) &&
      grant.allowedObjectTypes.includes(input.type)
  );
}

export async function getApplicableBoardGrant(input: {
  repository: Repository;
  roomId: string;
  userId: string;
  wallAnchorId: string;
  type: WallObjectType;
}) {
  const state = sanitizeClassroomState(await input.repository.getClassroomState(input.roomId));
  return findApplicableBoardGrant(state, input);
}

export async function assertWallObjectCreatePolicy(input: {
  repository: Repository;
  config: AppConfig;
  room: { id: string; settings: RoomSettings };
  auth: AuthContext;
  wallAnchorId: string;
  type: WallObjectType;
}) {
  const { teacher } = await actorIsRoomTeacher(input.repository, input.room.id, input.auth);
  if (teacher) return { teacher, granted: false };

  const grant = await getApplicableBoardGrant({
    repository: input.repository,
    roomId: input.room.id,
    userId: input.auth.userId,
    wallAnchorId: input.wallAnchorId,
    type: input.type
  });
  const granted = Boolean(grant);

  if (input.room.settings.wallObjectCreation === "teacher-only" && !granted) throw forbidden("Teacher role required to create wall objects");
  const isFile = Boolean(fileKindForWallObjectType(input.type));
  const isLive = isLiveWallObjectType(input.type);
  if (isFile && !input.room.settings.allowStudentUploads && !granted) throw forbidden("Student wall uploads are disabled");
  if (isLive && !input.room.settings.allowLiveStudentShares && !granted) throw forbidden("Student live wall shares are disabled");
  return { teacher, granted };
}

export async function assertWallObjectManagePolicy(repository: Repository, roomId: string, auth: AuthContext, object: WallObject) {
  const { teacher } = await actorIsRoomTeacher(repository, roomId, auth);
  if (teacher) return { teacher };
  if (object.createdByUserId === auth.userId && ["draft", "pending_upload", "pending_moderation", "source_ended"].includes(object.status)) {
    return { teacher };
  }
  throw forbidden("Teacher role required to manage this wall object");
}

export async function assertWhiteboardWritePolicy(input: {
  repository: Repository;
  room: { id: string; type?: RoomType | string | null | undefined; settings: RoomSettings };
  auth: AuthContext;
  wallAnchorId: string;
}) {
  const { teacher } = await actorIsRoomTeacher(input.repository, input.room.id, input.auth);
  if (teacher) return { teacher, granted: false };
  if (input.room.type !== "classroom") return { teacher: false, granted: false };
  if (!input.room.settings.whiteboards.allowStudentDraw) {
    throw forbidden("Student whiteboard drawing is disabled");
  }

  const grant = await getApplicableBoardGrant({
    repository: input.repository,
    roomId: input.room.id,
    userId: input.auth.userId,
    wallAnchorId: input.wallAnchorId,
    type: "whiteboard"
  });
  if (!grant) throw forbidden("You do not have draw access to this whiteboard");
  return { teacher: false, granted: true };
}

export async function validateWallObjectSource(input: {
  repository: Repository;
  roomId: string;
  type: WallObjectType;
  source: WallObject["source"];
  requestedStatus: WallObject["status"];
}) {
  const fileKind = fileKindForWallObjectType(input.type);
  if (fileKind) {
    if (input.source.kind !== "asset") throw badRequest(`${input.type} requires an asset source`);
    const attachment = await input.repository.getAttachment(input.roomId, input.source.attachmentId);
    if (!attachment) throw badRequest("Wall object attachment source was not found");
    if (attachment.kind !== fileKind) throw badRequest("Wall object type does not match attachment kind");
    if (input.requestedStatus === "active" && attachment.status !== "ready") {
      throw conflict("Attachment must be finalized before it can become an active wall object");
    }
    return;
  }

  if (isLiveWallObjectType(input.type)) {
    if (input.source.kind !== "livekit-track") throw badRequest(`${input.type} requires a livekit-track source`);
    const expected = liveTrackSourceForWallObjectType(input.type);
    if (expected && input.source.trackSource !== expected) throw badRequest("Live wall object trackSource does not match type");
    return;
  }

  if (input.type === "web.link" || input.type === "web.embed") {
    if (input.source.kind !== "web-url") throw badRequest(`${input.type} requires a web-url source`);
    return;
  }

  if (input.type === "web.browser.shared") {
    if (input.source.kind !== "inline") throw badRequest("web.browser.shared requires an inline source");
    const startUrl = (input.source.data as { startUrl?: unknown }).startUrl;
    if (typeof startUrl !== "string" || startUrl.length === 0) {
      throw badRequest("web.browser.shared requires an inline source with a startUrl");
    }
    const parsed = new URL(startUrl);
    if (parsed.protocol !== "https:") throw badRequest("Only https:// URLs are allowed for wall web resources");
    return;
  }

  if (["note", "poll", "timer", "whiteboard"].includes(input.type)) {
    if (input.source.kind !== "inline") throw badRequest(`${input.type} requires an inline source`);
  }
}

export async function enforceWallObjectLimits(repository: Repository, room: { id: string; settings: RoomSettings }, type: WallObjectType) {
  const active = await repository.listWallObjects(room.id, { status: "active" });
  if (active.length >= room.settings.maxActiveWallObjects) {
    throw conflict("Room has reached the active wall object limit");
  }
  if (type === "whiteboard") {
    const activeWhiteboards = active.filter((object) => object.type === "whiteboard");
    if (activeWhiteboards.length >= room.settings.whiteboards.maxActivePerRoom) {
      throw conflict("Room has reached the active whiteboard limit");
    }
  }
  if (isLiveWallObjectType(type)) {
    const activeLive = active.filter((object) => isLiveWallObjectType(object.type));
    if (activeLive.length >= room.settings.maxActiveLiveShares) {
      throw conflict("Room has reached the active live wall share limit");
    }
  }
  if (type === "web.browser.shared") {
    const activeBrowsers = active.filter((object) => object.type === "web.browser.shared");
    if (activeBrowsers.length >= room.settings.sharedBrowsers.maxActivePerRoom) {
      throw conflict("Room has reached the active shared browser limit");
    }
  }
}

export function assertWallObjectsEnabled(room: { settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableWallObjects || !room.settings.enableWallObjects) {
    throw forbidden("Wall objects are disabled for this room");
  }
}

export function assertWhiteboardsEnabled(room: { type?: RoomType | string | null | undefined; settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableWhiteboards || !room.settings.whiteboards.enabled || !getRoomTypeFeatureFlags(room.type).whiteboards) {
    throw notFound("Whiteboards are unavailable for this room");
  }
}

export function assertSharedBrowsersEnabled(room: { type?: RoomType | string | null | undefined; settings: RoomSettings }, config: AppConfig) {
  if (!config.tuning.enableSharedBrowsers || !room.settings.sharedBrowsers.enabled || !getRoomTypeFeatureFlags(room.type).sharedBrowsers) {
    throw notFound("Shared browsers are unavailable for this room");
  }
}

export function validateAttachmentPolicy(config: AppConfig, body: { kind: WallAttachment["kind"]; contentType: string; metadata?: Record<string, unknown> }) {
  const sizeBytes = Number(body.metadata?.sizeBytes ?? 0);
  if (body.kind === "image") {
    if (!config.tuning.wallObjectAllowedImageTypes.includes(body.contentType)) throw badRequest("Image content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxImageBytes) throw badRequest("Image is larger than the configured wall object limit");
  }
  if (body.kind === "video") {
    if (!config.tuning.wallObjectAllowedVideoTypes.includes(body.contentType)) throw badRequest("Video content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxVideoBytes) throw badRequest("Video is larger than the configured wall object limit");
  }
  if (body.kind === "audio") {
    if (!config.tuning.wallObjectAllowedAudioTypes.includes(body.contentType)) throw badRequest("Audio content type is not allowed");
    if (sizeBytes > config.tuning.wallObjectMaxAudioBytes) throw badRequest("Audio is larger than the configured wall object limit");
  }
}

export { liveTrackSourceForWallObjectType };
