import crypto from "node:crypto";
import {
  parseRoomSettings,
  type AiObjectJob,
  type AvatarAppearance,
  type ClassroomState,
  type ClassMembership,
  type ClassRecord,
  type DynamicWallAnchor,
  type Invite,
  type MeetingNotesSegment,
  type MeetingNotesSession,
  type Role,
  type RoomManifest,
  type RoomRecord,
  type SharedBrowserSession,
  type WhiteboardSnapshot,
  type WhiteboardStroke,
  type RoomSettingsSchema,
  type RoomType,
  type User,
  type WallAttachment,
  type BuildPiece,
  type BuildPieceEdge,
  type BuildPieceKind,
  type BuildPieceMaterial,
  type BuildPieceRotation,
  type RoomObject,
  type RoomObjectStatus,
  type RoomObjectTemplate,
  type WallObject,
  type WallObjectStatus,
  type WorldSkin
} from "@3dspace/contracts";
import { buildPieceStableId } from "@3dspace/room-engine";
import type { z } from "zod";
import type { AuthContext } from "./auth.js";
import { conflict, notFound } from "./errors.js";

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

/** Patch for shared browser session rows; supports clearing nested runtime fields. */
export type SharedBrowserSessionPatch = Partial<SharedBrowserSession> & {
  unsetHyperbeam?: boolean;
  unsetLivekit?: boolean;
  unsetControlLease?: boolean;
};

export function normalizeRoomRecord(room: RoomRecord): RoomRecord {
  return { ...room, settings: parseRoomSettings(room.settings) };
}

export type RoomEventRecord = {
  id: string;
  roomId: string;
  type: string;
  payload: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
};

export function createDefaultClassroomState(roomId: string): ClassroomState {
  const time = nowIso();
  return {
    roomId,
    version: 1,
    helpRequests: [],
    boardAccessGrants: [],
    privateChecks: [],
    groups: [],
    spotlight: null,
    lessonRun: null,
    podsRuntime: {
      podsEnabled: false,
      broadcastFromUserIds: []
    },
    createdAt: time,
    updatedAt: time
  };
}

export type Repository = {
  close(): Promise<void>;
  ensureUser(auth: AuthContext): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
  updateUserAvatarAppearance(userId: string, appearance: AvatarAppearance): Promise<User>;
  createClass(input: { name: string; teacher: AuthContext }): Promise<ClassRecord>;
  listClassesForUser(userId: string): Promise<ClassRecord[]>;
  getClass(classId: string): Promise<ClassRecord | undefined>;
  updateClass(classId: string, input: { name?: string }): Promise<ClassRecord>;
  getMembership(classId: string, userId: string): Promise<ClassMembership | undefined>;
  listMemberships(classId: string): Promise<ClassMembership[]>;
  upsertMembership(input: {
    classId: string;
    userId: string;
    displayName: string;
    role: Role;
    status: "active" | "invited" | "removed";
  }): Promise<ClassMembership>;
  createInvite(input: {
    classId: string;
    roomId?: string;
    role: Role;
    expiresAt?: string;
    createdByUserId: string;
  }): Promise<Invite>;
  getInvite(code: string): Promise<Invite | undefined>;
  listInvitesForRoom(roomId: string): Promise<Invite[]>;
  markInviteUsed(code: string): Promise<Invite>;
  createRoom(input: { classId: string; name: string; type?: RoomType; settings: RoomSettings; manifest: RoomManifest }): Promise<{ room: RoomRecord; manifest: RoomManifest }>;
  listRoomsForUser(userId: string): Promise<RoomRecord[]>;
  getRoom(roomId: string): Promise<RoomRecord | undefined>;
  updateRoom(roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }): Promise<RoomRecord>;
  deleteRoom(roomId: string): Promise<void>;
  getActiveManifest(roomId: string): Promise<RoomManifest | undefined>;
  saveManifest(manifest: RoomManifest): Promise<RoomManifest>;
  getClassroomState(roomId: string): Promise<ClassroomState>;
  updateClassroomState(roomId: string, input: { state: ClassroomState; expectedVersion?: number }): Promise<ClassroomState>;
  createAttachment(input: Omit<WallAttachment, "id" | "createdAt" | "updatedAt" | "status">): Promise<WallAttachment>;
  listAttachments(roomId: string): Promise<WallAttachment[]>;
  getAttachment(roomId: string, attachmentId: string): Promise<WallAttachment | undefined>;
  updateAttachment(roomId: string, attachmentId: string, input: { status?: WallAttachment["status"] | undefined; metadata?: Record<string, unknown> | undefined }): Promise<WallAttachment>;
  createWallObject(input: Omit<WallObject, "id" | "createdAt" | "updatedAt" | "version">): Promise<WallObject>;
  listWallObjects(roomId: string, filter?: { status?: WallObjectStatus | undefined; anchorId?: string | undefined; includeRemoved?: boolean | undefined }): Promise<WallObject[]>;
  getWallObject(roomId: string, objectId: string): Promise<WallObject | undefined>;
  updateWallObject(
    roomId: string,
    objectId: string,
    input: Partial<Omit<WallObject, "id" | "roomId" | "createdAt" | "createdByUserId" | "version">> & { updatedByUserId: string; expectedVersion?: number | undefined }
  ): Promise<WallObject>;
  softRemoveWallObject(roomId: string, objectId: string, input: { updatedByUserId: string; expectedVersion?: number | undefined }): Promise<WallObject>;
  appendWhiteboardStroke(input: WhiteboardStroke): Promise<WhiteboardStroke>;
  listWhiteboardStrokes(roomId: string, wallObjectId: string, filter?: { sinceZ?: number | undefined }): Promise<WhiteboardStroke[]>;
  eraseWhiteboardStrokes(roomId: string, wallObjectId: string, strokeIds: string[]): Promise<string[]>;
  clearWhiteboard(roomId: string, wallObjectId: string): Promise<void>;
  upsertWhiteboardSnapshot(input: WhiteboardSnapshot): Promise<WhiteboardSnapshot>;
  latestWhiteboardSnapshot(roomId: string, wallObjectId: string): Promise<WhiteboardSnapshot | undefined>;
  upsertBuiltinWorldSkins(skins: WorldSkin[]): Promise<void>;
  listWorldSkins(): Promise<WorldSkin[]>;
  getWorldSkin(slug: string): Promise<WorldSkin | undefined>;
  upsertBuiltinRoomObjectTemplates(templates: RoomObjectTemplate[]): Promise<void>;
  listRoomObjectTemplatesVisibleTo(userId: string, roomType?: RoomType | undefined): Promise<RoomObjectTemplate[]>;
  getRoomObjectTemplate(templateId: string): Promise<RoomObjectTemplate | undefined>;
  createRoomObjectTemplate(input: Omit<RoomObjectTemplate, "id" | "createdAt">): Promise<RoomObjectTemplate>;
  archiveRoomObjectTemplate(templateId: string): Promise<RoomObjectTemplate>;
  listRoomObjectsForRoom(roomId: string, filter?: { status?: RoomObjectStatus | undefined }): Promise<RoomObject[]>;
  getRoomObject(roomId: string, objectId: string): Promise<RoomObject | undefined>;
  createRoomObject(input: Omit<RoomObject, "id" | "createdAt" | "updatedAt">): Promise<RoomObject>;
  updateRoomObject(
    roomId: string,
    objectId: string,
    patch: Partial<Omit<RoomObject, "id" | "roomId" | "createdAt" | "createdByUserId">>
  ): Promise<RoomObject>;
  removeRoomObject(roomId: string, objectId: string): Promise<RoomObject>;
  listBuildPiecesForRoom(roomId: string): Promise<BuildPiece[]>;
  findBuildPieceByPlacement(
    roomId: string,
    placement: {
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: BuildPieceEdge | undefined;
    }
  ): Promise<BuildPiece | undefined>;
  createBuildPiece(input: {
    roomId: string;
    kind: BuildPieceKind;
    cell: { ix: number; iz: number };
    level: number;
    edge?: BuildPieceEdge | undefined;
    rotation: BuildPieceRotation;
    materialId: BuildPieceMaterial;
    createdByUserId: string;
  }): Promise<BuildPiece>;
  createBuildPiecesBatch(
    inputs: Array<{
      roomId: string;
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: BuildPieceEdge | undefined;
      rotation: BuildPieceRotation;
      materialId: BuildPieceMaterial;
      createdByUserId: string;
    }>
  ): Promise<BuildPiece[]>;
  getBuildPiece(roomId: string, pieceId: string): Promise<BuildPiece | undefined>;
  removeBuildPiece(roomId: string, pieceId: string): Promise<BuildPiece>;
  countBuildPiecesForRoom(roomId: string): Promise<number>;
  countBuildPiecesForUser(roomId: string, userId: string): Promise<number>;
  deleteAllBuildPiecesForRoom(roomId: string): Promise<void>;
  recordRoomEvent(input: { roomId: string; type: string; payload: Record<string, unknown>; createdByUserId: string }): Promise<RoomEventRecord>;
  recordRoomSession(input: { roomId: string; participantIdentity: string; userId: string; role: Role; maxParticipants: number }): Promise<number>;
  countActiveRoomParticipants(roomId: string): Promise<number>;
  releaseRoomSession(roomId: string, participantIdentity: string): Promise<void>;
  listFreeForAllRooms(args: { classId?: string }): Promise<RoomRecord[]>;
  listDynamicWallAnchorsForRoom(roomId: string): Promise<DynamicWallAnchor[]>;
  countDynamicWallAnchorsForRoom(roomId: string): Promise<number>;
  createDynamicWallAnchor(input: DynamicWallAnchor): Promise<DynamicWallAnchor>;
  getDynamicWallAnchor(id: string): Promise<DynamicWallAnchor | undefined>;
  updateDynamicWallAnchor(id: string, patch: Partial<DynamicWallAnchor>): Promise<DynamicWallAnchor>;
  removeDynamicWallAnchor(id: string, roomId: string): Promise<void>;
  createMeetingNotesSession(input: MeetingNotesSession): Promise<MeetingNotesSession>;
  listMeetingNotesSessions(roomId: string): Promise<MeetingNotesSession[]>;
  getMeetingNotesSession(roomId: string, sessionId: string): Promise<MeetingNotesSession | undefined>;
  getActiveMeetingNotesSession(roomId: string): Promise<MeetingNotesSession | undefined>;
  updateMeetingNotesSession(roomId: string, sessionId: string, patch: Partial<MeetingNotesSession>): Promise<MeetingNotesSession>;
  deleteMeetingNotesSession(roomId: string, sessionId: string): Promise<void>;
  createMeetingNotesSegment(input: MeetingNotesSegment): Promise<MeetingNotesSegment>;
  listMeetingNotesSegments(sessionId: string): Promise<MeetingNotesSegment[]>;
  deleteMeetingNotesSegments(sessionId: string): Promise<void>;
  listAiObjectJobsForRoom(roomId: string, opts?: { limit?: number }): Promise<AiObjectJob[]>;
  countActiveAiObjectJobsForRoom(roomId: string): Promise<number>;
  countActiveAiObjectJobsForUser(roomId: string, userId: string): Promise<number>;
  countAiObjectJobsForUserSince(userId: string, sinceIso: string): Promise<number>;
  getAiObjectJob(id: string): Promise<AiObjectJob | undefined>;
  createAiObjectJob(input: AiObjectJob): Promise<AiObjectJob>;
  updateAiObjectJob(id: string, patch: Partial<AiObjectJob>): Promise<AiObjectJob>;
  deleteAiObjectJob(id: string, roomId: string): Promise<void>;
  listExpiredAiObjectJobs(beforeIso: string, limit: number): Promise<AiObjectJob[]>;
  createSharedBrowserSession(input: SharedBrowserSession): Promise<SharedBrowserSession>;
  getSharedBrowserSession(id: string): Promise<SharedBrowserSession | undefined>;
  getSharedBrowserSessionByWallObject(wallObjectId: string): Promise<SharedBrowserSession | undefined>;
  listSharedBrowserSessionsForRoom(roomId: string): Promise<SharedBrowserSession[]>;
  countActiveSharedBrowserSessionsForRoom(roomId: string): Promise<number>;
  updateSharedBrowserSession(id: string, patch: SharedBrowserSessionPatch): Promise<SharedBrowserSession>;
  deleteSharedBrowserSession(id: string): Promise<void>;
  listStaleSharedBrowserSessions(olderThanIso: string): Promise<SharedBrowserSession[]>;
  listLiveSharedBrowserSessions(): Promise<SharedBrowserSession[]>;
};

/** How long after the last heartbeat a room participant still counts as present. */
export const ROOM_SESSION_PRESENCE_MS = 90_000;

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 18)}`;
}

export function inviteCode() {
  return crypto.randomBytes(5).toString("base64url").toUpperCase();
}

export function avatarFor(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
  const palette = ["#eb5e28", "#2a9d8f", "#3d5a80", "#d00000", "#577590", "#f4a261"];
  const hash = Array.from(displayName).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return { initials, color: palette[hash % palette.length]! };
}

export class MemoryRepository implements Repository {
  private users = new Map<string, User>();
  private classes = new Map<string, ClassRecord>();
  private memberships = new Map<string, ClassMembership>();
  private invites = new Map<string, Invite>();
  private rooms = new Map<string, RoomRecord>();
  private manifests = new Map<string, RoomManifest>();
  private classroomStates = new Map<string, ClassroomState>();
  private attachments = new Map<string, WallAttachment>();
  private wallObjects = new Map<string, WallObject>();
  private whiteboardStrokes = new Map<string, WhiteboardStroke>();
  private whiteboardSnapshots = new Map<string, WhiteboardSnapshot>();
  private worldSkins = new Map<string, WorldSkin>();
  private roomObjectTemplates = new Map<string, RoomObjectTemplate & { archivedAt?: string }>();
  private roomObjects = new Map<string, RoomObject>();
  private buildPieces = new Map<string, BuildPiece>();
  private roomEvents = new Map<string, RoomEventRecord>();
  private activeSessions = new Map<string, { roomId: string; participantIdentity: string; lastSeenAt: number }>();
  private dynamicWallAnchors = new Map<string, DynamicWallAnchor>();
  private meetingNotesSessions = new Map<string, MeetingNotesSession>();
  private meetingNotesSegments = new Map<string, MeetingNotesSegment>();
  private aiObjectJobs = new Map<string, AiObjectJob>();
  private sharedBrowserSessions = new Map<string, SharedBrowserSession>();

  async close() {
    return;
  }

  async ensureUser(auth: AuthContext) {
    const existing = this.users.get(auth.userId);
    const time = nowIso();
    if (existing) {
      const updated: User = { ...existing, displayName: auth.displayName, updatedAt: time };
      this.users.set(auth.userId, updated);
      return updated;
    }

    const user: User = {
      id: auth.userId,
      externalAuthId: auth.userId,
      displayName: auth.displayName,
      avatar: avatarFor(auth.displayName),
      createdAt: time,
      updatedAt: time
    };
    this.users.set(user.id, user);
    return user;
  }

  async getUser(userId: string) {
    return this.users.get(userId);
  }

  async updateUserAvatarAppearance(userId: string, appearance: AvatarAppearance): Promise<User> {
    const existing = this.users.get(userId);
    if (!existing) throw notFound("User not found");
    const updated: User = {
      ...existing,
      avatar: { ...existing.avatar, appearance },
      updatedAt: nowIso()
    };
    this.users.set(userId, updated);
    return updated;
  }

  async createClass(input: { name: string; teacher: AuthContext }) {
    await this.ensureUser(input.teacher);
    const time = nowIso();
    const record: ClassRecord = {
      id: newId("class"),
      name: input.name,
      teacherUserId: input.teacher.userId,
      createdAt: time,
      updatedAt: time
    };
    this.classes.set(record.id, record);
    await this.upsertMembership({
      classId: record.id,
      userId: input.teacher.userId,
      displayName: input.teacher.displayName,
      role: "teacher",
      status: "active"
    });
    return record;
  }

  async listClassesForUser(userId: string) {
    const classIds = new Set(
      Array.from(this.memberships.values())
        .filter((membership) => membership.userId === userId && membership.status === "active")
        .map((membership) => membership.classId)
    );
    return Array.from(this.classes.values()).filter((record) => classIds.has(record.id) || record.teacherUserId === userId);
  }

  async getClass(classId: string) {
    return this.classes.get(classId);
  }

  async updateClass(classId: string, input: { name?: string }) {
    const existing = this.classes.get(classId);
    if (!existing) throw notFound("Class not found");
    const updated: ClassRecord = {
      ...existing,
      ...input,
      updatedAt: nowIso()
    };
    this.classes.set(classId, updated);
    return updated;
  }

  async getMembership(classId: string, userId: string) {
    return this.memberships.get(`${classId}:${userId}`);
  }

  async listMemberships(classId: string) {
    return Array.from(this.memberships.values()).filter((membership) => membership.classId === classId);
  }

  async upsertMembership(input: {
    classId: string;
    userId: string;
    displayName: string;
    role: Role;
    status: "active" | "invited" | "removed";
  }) {
    const key = `${input.classId}:${input.userId}`;
    const time = nowIso();
    const existing = this.memberships.get(key);
    const record: ClassMembership = {
      id: existing?.id ?? newId("member"),
      classId: input.classId,
      userId: input.userId,
      displayName: input.displayName,
      role: input.role,
      status: input.status,
      createdAt: existing?.createdAt ?? time,
      updatedAt: time
    };
    this.memberships.set(key, record);
    return record;
  }

  async createInvite(input: {
    classId: string;
    roomId?: string;
    role: Role;
    expiresAt?: string;
    createdByUserId: string;
  }) {
    const record: Invite = {
      id: newId("invite"),
      code: inviteCode(),
      classId: input.classId,
      role: input.role,
      createdByUserId: input.createdByUserId,
      createdAt: nowIso(),
      ...(input.roomId ? { roomId: input.roomId } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
    };
    this.invites.set(record.code, record);
    return record;
  }

  async getInvite(code: string) {
    return this.invites.get(code.toUpperCase());
  }

  async listInvitesForRoom(roomId: string) {
    return [...this.invites.values()]
      .filter((invite) => invite.roomId === roomId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async markInviteUsed(code: string) {
    const existing = this.invites.get(code.toUpperCase());
    if (!existing) throw notFound("Invite not found");
    const updated = { ...existing, usedAt: nowIso() };
    this.invites.set(existing.code, updated);
    return updated;
  }

  async createRoom(input: { classId: string; name: string; type?: RoomType; settings: RoomSettings; manifest: RoomManifest }) {
    const time = nowIso();
    const room: RoomRecord = {
      id: input.manifest.roomId,
      classId: input.classId,
      name: input.name,
      type: input.type ?? "classroom",
      activeManifestVersion: input.manifest.version,
      settings: input.settings,
      createdAt: time,
      updatedAt: time
    };
    this.rooms.set(room.id, room);
    this.manifests.set(`${room.id}:${input.manifest.version}`, input.manifest);
    return { room, manifest: input.manifest };
  }

  async listRoomsForUser(userId: string) {
    const classes = await this.listClassesForUser(userId);
    const classIds = new Set(classes.map((record) => record.id));
    return Array.from(this.rooms.values())
      .filter((room) => classIds.has(room.classId))
      .map(normalizeRoomRecord);
  }

  async getRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    return room ? normalizeRoomRecord(room) : undefined;
  }

  async updateRoom(roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }) {
    const room = this.rooms.get(roomId);
    if (!room) throw notFound("Room not found");
    const updated: RoomRecord = normalizeRoomRecord({
      ...room,
      name: input.name ?? room.name,
      settings: input.settings ? { ...room.settings, ...input.settings } : room.settings,
      updatedAt: nowIso()
    });
    this.rooms.set(roomId, updated);
    return updated;
  }

  async deleteRoom(roomId: string) {
    if (!this.rooms.has(roomId)) throw notFound("Room not found");
    this.rooms.delete(roomId);
    for (const [key, manifest] of this.manifests.entries()) {
      if (manifest.roomId === roomId) this.manifests.delete(key);
    }
    for (const [id, attachment] of this.attachments.entries()) {
      if (attachment.roomId === roomId) this.attachments.delete(id);
    }
    for (const [id, object] of this.wallObjects.entries()) {
      if (object.roomId === roomId) this.wallObjects.delete(id);
    }
    for (const [id, stroke] of this.whiteboardStrokes.entries()) {
      if (stroke.roomId === roomId) this.whiteboardStrokes.delete(id);
    }
    for (const [key, snapshot] of this.whiteboardSnapshots.entries()) {
      if (snapshot.roomId === roomId) this.whiteboardSnapshots.delete(key);
    }
    for (const [id, object] of this.roomObjects.entries()) {
      if (object.roomId === roomId) this.roomObjects.delete(id);
    }
    for (const [id, piece] of this.buildPieces.entries()) {
      if (piece.roomId === roomId) this.buildPieces.delete(id);
    }
    this.classroomStates.delete(roomId);
    for (const [id, event] of this.roomEvents.entries()) {
      if (event.roomId === roomId) this.roomEvents.delete(id);
    }
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.roomId === roomId) this.activeSessions.delete(key);
    }
    for (const [code, invite] of this.invites.entries()) {
      if (invite.roomId === roomId) this.invites.delete(code);
    }
    for (const [id, session] of this.sharedBrowserSessions.entries()) {
      if (session.roomId === roomId) this.sharedBrowserSessions.delete(id);
    }
  }

  async getActiveManifest(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    return this.manifests.get(`${roomId}:${room.activeManifestVersion}`);
  }

  async saveManifest(manifest: RoomManifest) {
    this.manifests.set(`${manifest.roomId}:${manifest.version}`, manifest);
    return manifest;
  }

  async getClassroomState(roomId: string) {
    const existing = this.classroomStates.get(roomId);
    if (existing) return existing;
    const state = createDefaultClassroomState(roomId);
    this.classroomStates.set(roomId, state);
    return state;
  }

  async updateClassroomState(roomId: string, input: { state: ClassroomState; expectedVersion?: number }) {
    const existing = await this.getClassroomState(roomId);
    if (input.expectedVersion && input.expectedVersion !== existing.version) {
      throw conflict("Classroom state version conflict");
    }
    const updated: ClassroomState = {
      ...input.state,
      roomId,
      version: existing.version + 1,
      createdAt: existing.createdAt,
      updatedAt: nowIso()
    };
    this.classroomStates.set(roomId, updated);
    return updated;
  }

  async createAttachment(input: Omit<WallAttachment, "id" | "createdAt" | "updatedAt" | "status">) {
    const time = nowIso();
    const record: WallAttachment = {
      ...input,
      id: newId("attachment"),
      status: "pending_upload",
      createdAt: time,
      updatedAt: time
    };
    this.attachments.set(record.id, record);
    return record;
  }

  async listAttachments(roomId: string) {
    return Array.from(this.attachments.values()).filter((attachment) => attachment.roomId === roomId);
  }

  async getAttachment(roomId: string, attachmentId: string) {
    const attachment = this.attachments.get(attachmentId);
    return attachment?.roomId === roomId ? attachment : undefined;
  }

  async updateAttachment(roomId: string, attachmentId: string, input: { status?: WallAttachment["status"] | undefined; metadata?: Record<string, unknown> | undefined }) {
    const existing = await this.getAttachment(roomId, attachmentId);
    if (!existing) throw notFound("Attachment not found");
    const updated: WallAttachment = {
      ...existing,
      status: input.status ?? existing.status,
      metadata: input.metadata ? { ...existing.metadata, ...input.metadata } : existing.metadata,
      updatedAt: nowIso()
    };
    this.attachments.set(attachmentId, updated);
    return updated;
  }

  async createWallObject(input: Omit<WallObject, "id" | "createdAt" | "updatedAt" | "version">) {
    const time = nowIso();
    const record: WallObject = {
      ...input,
      id: newId("wallobj"),
      createdAt: time,
      updatedAt: time,
      version: 1
    };
    this.wallObjects.set(record.id, record);
    return record;
  }

  async listWallObjects(roomId: string, filter: { status?: WallObjectStatus | undefined; anchorId?: string | undefined; includeRemoved?: boolean | undefined } = {}) {
    return Array.from(this.wallObjects.values()).filter((object) => {
      if (object.roomId !== roomId) return false;
      if (!filter.includeRemoved && object.status === "removed") return false;
      if (filter.status && object.status !== filter.status) return false;
      if (filter.anchorId && object.wallAnchorId !== filter.anchorId) return false;
      return true;
    });
  }

  async getWallObject(roomId: string, objectId: string) {
    const object = this.wallObjects.get(objectId);
    return object?.roomId === roomId ? object : undefined;
  }

  async updateWallObject(
    roomId: string,
    objectId: string,
    input: Partial<Omit<WallObject, "id" | "roomId" | "createdAt" | "createdByUserId" | "version">> & { updatedByUserId: string; expectedVersion?: number | undefined }
  ) {
    const existing = await this.getWallObject(roomId, objectId);
    if (!existing) throw notFound("Wall object not found");
    if (input.expectedVersion && input.expectedVersion !== existing.version) {
      throw conflict("Wall object version conflict");
    }
    const { expectedVersion: _expectedVersion, ...patch } = input;
    const updated: WallObject = {
      ...existing,
      ...patch,
      roomId,
      id: objectId,
      createdAt: existing.createdAt,
      createdByUserId: existing.createdByUserId,
      updatedAt: nowIso(),
      version: existing.version + 1
    };
    this.wallObjects.set(objectId, updated);
    return updated;
  }

  async softRemoveWallObject(roomId: string, objectId: string, input: { updatedByUserId: string; expectedVersion?: number | undefined }) {
    return this.updateWallObject(roomId, objectId, { updatedByUserId: input.updatedByUserId, expectedVersion: input.expectedVersion, status: "removed" });
  }

  async appendWhiteboardStroke(input: WhiteboardStroke) {
    this.whiteboardStrokes.set(input.id, input);
    return input;
  }

  async listWhiteboardStrokes(roomId: string, wallObjectId: string, filter: { sinceZ?: number | undefined } = {}) {
    return Array.from(this.whiteboardStrokes.values())
      .filter((stroke) => stroke.roomId === roomId && stroke.wallObjectId === wallObjectId && (filter.sinceZ === undefined || stroke.z > filter.sinceZ))
      .sort((a, b) => a.z - b.z || a.createdAt.localeCompare(b.createdAt));
  }

  async eraseWhiteboardStrokes(roomId: string, wallObjectId: string, strokeIds: string[]) {
    const erased: string[] = [];
    for (const strokeId of strokeIds) {
      const existing = this.whiteboardStrokes.get(strokeId);
      if (!existing || existing.roomId !== roomId || existing.wallObjectId !== wallObjectId) continue;
      this.whiteboardStrokes.delete(strokeId);
      erased.push(strokeId);
    }
    return erased;
  }

  async clearWhiteboard(roomId: string, wallObjectId: string) {
    for (const [id, stroke] of this.whiteboardStrokes.entries()) {
      if (stroke.roomId === roomId && stroke.wallObjectId === wallObjectId) {
        this.whiteboardStrokes.delete(id);
      }
    }
    this.whiteboardSnapshots.delete(`${roomId}:${wallObjectId}`);
  }

  async upsertWhiteboardSnapshot(input: WhiteboardSnapshot) {
    this.whiteboardSnapshots.set(`${input.roomId}:${input.wallObjectId}`, input);
    return input;
  }

  async latestWhiteboardSnapshot(roomId: string, wallObjectId: string) {
    return this.whiteboardSnapshots.get(`${roomId}:${wallObjectId}`);
  }

  async upsertBuiltinWorldSkins(skins: WorldSkin[]) {
    const time = nowIso();
    for (const skin of skins) {
      const existing = Array.from(this.worldSkins.values()).find((entry) => entry.slug === skin.slug);
      const record: WorldSkin = {
        ...skin,
        createdAt: existing?.createdAt ?? skin.createdAt ?? time,
        updatedAt: time
      };
      this.worldSkins.set(record.id, record);
    }
  }

  async listWorldSkins(): Promise<WorldSkin[]> {
    return Array.from(this.worldSkins.values())
      .filter((skin) => skin.source === "builtin")
      .sort((a, b) => a.slug.localeCompare(b.slug));
  }

  async getWorldSkin(slug: string): Promise<WorldSkin | undefined> {
    return Array.from(this.worldSkins.values()).find((skin) => skin.slug === slug);
  }

  async upsertBuiltinRoomObjectTemplates(templates: RoomObjectTemplate[]) {
    const time = nowIso();
    for (const template of templates) {
      const existing = Array.from(this.roomObjectTemplates.values()).find((entry) => entry.slug === template.slug);
      const record = {
        ...template,
        ...(existing ? { createdAt: existing.createdAt } : { createdAt: template.createdAt || time })
      };
      this.roomObjectTemplates.set(record.id, record);
    }
  }

  async listRoomObjectTemplatesVisibleTo(userId: string, roomType?: RoomType | undefined) {
    const classes = await this.listClassesForUser(userId);
    const classIds = new Set(classes.map((record) => record.id));
    return Array.from(this.roomObjectTemplates.values()).filter((template) => {
      if (template.archivedAt) return false;
      if (template.source === "ai-generated") return false;
      if (roomType && !template.visibleRoomTypes.includes(roomType)) return false;
      if (template.source === "builtin") return true;
      return Boolean(template.ownerClassId && classIds.has(template.ownerClassId));
    });
  }

  async getRoomObjectTemplate(templateId: string) {
    const template = this.roomObjectTemplates.get(templateId);
    if (!template || template.archivedAt) return undefined;
    const { archivedAt: _archivedAt, ...rest } = template;
    return rest;
  }

  async createRoomObjectTemplate(input: Omit<RoomObjectTemplate, "id" | "createdAt">) {
    const duplicate = Array.from(this.roomObjectTemplates.values()).find((template) => template.slug === input.slug && !template.archivedAt);
    if (duplicate) throw conflict("Room object template slug already exists");
    const record: RoomObjectTemplate = {
      ...input,
      id: newId("rotpl"),
      createdAt: nowIso()
    };
    this.roomObjectTemplates.set(record.id, record);
    return record;
  }

  async archiveRoomObjectTemplate(templateId: string) {
    const template = this.roomObjectTemplates.get(templateId);
    if (!template) throw notFound("Room object template not found");
    if (template.source === "builtin") throw conflict("Built-in templates cannot be archived");
    const archived = { ...template, archivedAt: nowIso() };
    this.roomObjectTemplates.set(templateId, archived);
    const { archivedAt: _archivedAt, ...rest } = archived;
    return rest;
  }

  async listRoomObjectsForRoom(roomId: string, filter: { status?: RoomObjectStatus | undefined } = {}) {
    return Array.from(this.roomObjects.values()).filter((object) => {
      if (object.roomId !== roomId) return false;
      if (filter.status) return object.status === filter.status;
      return object.status !== "archived";
    });
  }

  async getRoomObject(roomId: string, objectId: string) {
    const object = this.roomObjects.get(objectId);
    return object?.roomId === roomId ? object : undefined;
  }

  async createRoomObject(input: Omit<RoomObject, "id" | "createdAt" | "updatedAt">) {
    const time = nowIso();
    const record: RoomObject = {
      ...input,
      id: newId("robj"),
      createdAt: time,
      updatedAt: time
    };
    this.roomObjects.set(record.id, record);
    return record;
  }

  async updateRoomObject(
    roomId: string,
    objectId: string,
    patch: Partial<Omit<RoomObject, "id" | "roomId" | "createdAt" | "createdByUserId">>
  ) {
    const existing = await this.getRoomObject(roomId, objectId);
    if (!existing) throw notFound("Room object not found");
    const updated: RoomObject = {
      ...existing,
      ...patch,
      id: objectId,
      roomId,
      createdAt: existing.createdAt,
      createdByUserId: existing.createdByUserId,
      updatedAt: nowIso()
    };
    this.roomObjects.set(objectId, updated);
    return updated;
  }

  async removeRoomObject(roomId: string, objectId: string) {
    return this.updateRoomObject(roomId, objectId, { status: "archived" });
  }

  async listBuildPiecesForRoom(roomId: string) {
    return Array.from(this.buildPieces.values())
      .filter((piece) => piece.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async findBuildPieceByPlacement(
    roomId: string,
    placement: {
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: BuildPieceEdge | undefined;
    }
  ) {
    return Array.from(this.buildPieces.values()).find(
      (piece) =>
        piece.roomId === roomId &&
        piece.kind === placement.kind &&
        piece.cell.ix === placement.cell.ix &&
        piece.cell.iz === placement.cell.iz &&
        piece.level === placement.level &&
        (piece.edge ?? undefined) === (placement.edge ?? undefined)
    );
  }

  async createBuildPiece(input: {
    roomId: string;
    kind: BuildPieceKind;
    cell: { ix: number; iz: number };
    level: number;
    edge?: BuildPieceEdge | undefined;
    rotation: BuildPieceRotation;
    materialId: BuildPieceMaterial;
    createdByUserId: string;
  }) {
    const time = nowIso();
    const id = buildPieceStableId({
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      edge: input.edge
    });
    const existing = this.buildPieces.get(id);
    const record: BuildPiece = {
      id,
      roomId: input.roomId,
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      ...(input.edge ? { edge: input.edge } : {}),
      rotation: input.rotation,
      materialId: input.materialId,
      createdByUserId: existing?.createdByUserId ?? input.createdByUserId,
      createdAt: existing?.createdAt ?? time
    };
    this.buildPieces.set(id, record);
    return record;
  }

  async createBuildPiecesBatch(
    inputs: Array<{
      roomId: string;
      kind: BuildPieceKind;
      cell: { ix: number; iz: number };
      level: number;
      edge?: BuildPieceEdge | undefined;
      rotation: BuildPieceRotation;
      materialId: BuildPieceMaterial;
      createdByUserId: string;
    }>
  ) {
    const pieces: BuildPiece[] = [];
    for (const input of inputs) {
      pieces.push(await this.createBuildPiece(input));
    }
    return pieces;
  }

  async getBuildPiece(roomId: string, pieceId: string) {
    const piece = this.buildPieces.get(pieceId);
    return piece?.roomId === roomId ? piece : undefined;
  }

  async removeBuildPiece(roomId: string, pieceId: string) {
    const existing = await this.getBuildPiece(roomId, pieceId);
    if (!existing) throw notFound("Build piece not found");
    this.buildPieces.delete(pieceId);
    return existing;
  }

  async countBuildPiecesForRoom(roomId: string) {
    return Array.from(this.buildPieces.values()).filter((piece) => piece.roomId === roomId).length;
  }

  async countBuildPiecesForUser(roomId: string, userId: string) {
    return Array.from(this.buildPieces.values()).filter(
      (piece) => piece.roomId === roomId && piece.createdByUserId === userId
    ).length;
  }

  async deleteAllBuildPiecesForRoom(roomId: string) {
    for (const [id, piece] of this.buildPieces.entries()) {
      if (piece.roomId === roomId) this.buildPieces.delete(id);
    }
  }

  async recordRoomEvent(input: { roomId: string; type: string; payload: Record<string, unknown>; createdByUserId: string }) {
    const record: RoomEventRecord = {
      id: newId("event"),
      roomId: input.roomId,
      type: input.type,
      payload: input.payload,
      createdByUserId: input.createdByUserId,
      createdAt: nowIso()
    };
    this.roomEvents.set(record.id, record);
    return record;
  }

  listRoomEvents(roomId: string): RoomEventRecord[] {
    return Array.from(this.roomEvents.values()).filter((e) => e.roomId === roomId);
  }

  async countActiveRoomParticipants(roomId: string): Promise<number> {
    const cutoff = Date.now() - ROOM_SESSION_PRESENCE_MS;
    return Array.from(this.activeSessions.values()).filter(
      (session) => session.roomId === roomId && session.lastSeenAt >= cutoff
    ).length;
  }

  async releaseRoomSession(roomId: string, participantIdentity: string): Promise<void> {
    this.activeSessions.delete(`${roomId}:${participantIdentity}`);
  }

  async recordRoomSession(input: { roomId: string; participantIdentity: string; userId: string; role: Role; maxParticipants: number }) {
    const sessionKey = `${input.roomId}:${input.participantIdentity}`;
    const cutoff = Date.now() - ROOM_SESSION_PRESENCE_MS;
    for (const [key, value] of this.activeSessions.entries()) {
      if (value.lastSeenAt < cutoff) this.activeSessions.delete(key);
    }
    const existing = this.activeSessions.get(sessionKey);
    const activeCount = Array.from(this.activeSessions.values()).filter((session) => session.roomId === input.roomId).length;
    if (!existing && activeCount >= input.maxParticipants) {
      return activeCount + 1;
    }
    this.activeSessions.set(sessionKey, {
      roomId: input.roomId,
      participantIdentity: input.participantIdentity,
      lastSeenAt: Date.now()
    });
    return Array.from(this.activeSessions.values()).filter((session) => session.roomId === input.roomId).length;
  }

  async listFreeForAllRooms(args: { classId?: string }): Promise<RoomRecord[]> {
    return Array.from(this.rooms.values()).filter(
      (r) => r.type === "free-for-all" && (!args.classId || r.classId === args.classId)
    );
  }

  async listDynamicWallAnchorsForRoom(roomId: string): Promise<DynamicWallAnchor[]> {
    return Array.from(this.dynamicWallAnchors.values()).filter((a) => a.roomId === roomId);
  }

  async countDynamicWallAnchorsForRoom(roomId: string): Promise<number> {
    return Array.from(this.dynamicWallAnchors.values()).filter((a) => a.roomId === roomId).length;
  }

  async createDynamicWallAnchor(input: DynamicWallAnchor): Promise<DynamicWallAnchor> {
    this.dynamicWallAnchors.set(input.id, input);
    return input;
  }

  async getDynamicWallAnchor(id: string): Promise<DynamicWallAnchor | undefined> {
    return this.dynamicWallAnchors.get(id);
  }

  async updateDynamicWallAnchor(id: string, patch: Partial<DynamicWallAnchor>): Promise<DynamicWallAnchor> {
    const existing = this.dynamicWallAnchors.get(id);
    if (!existing) throw new Error("DynamicWallAnchor not found: " + id);
    const updated = { ...existing, ...patch, updatedAt: nowIso() };
    this.dynamicWallAnchors.set(id, updated);
    return updated;
  }

  async removeDynamicWallAnchor(id: string, roomId: string): Promise<void> {
    const existing = this.dynamicWallAnchors.get(id);
    if (existing?.roomId === roomId) this.dynamicWallAnchors.delete(id);
  }

  async createMeetingNotesSession(input: MeetingNotesSession): Promise<MeetingNotesSession> {
    this.meetingNotesSessions.set(input.id, input);
    return input;
  }

  async listMeetingNotesSessions(roomId: string): Promise<MeetingNotesSession[]> {
    return Array.from(this.meetingNotesSessions.values())
      .filter((session) => session.roomId === roomId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  async getMeetingNotesSession(roomId: string, sessionId: string): Promise<MeetingNotesSession | undefined> {
    const session = this.meetingNotesSessions.get(sessionId);
    return session?.roomId === roomId ? session : undefined;
  }

  async getActiveMeetingNotesSession(roomId: string): Promise<MeetingNotesSession | undefined> {
    return Array.from(this.meetingNotesSessions.values()).find(
      (session) => session.roomId === roomId && (session.status === "starting" || session.status === "recording" || session.status === "finalizing")
    );
  }

  async updateMeetingNotesSession(roomId: string, sessionId: string, patch: Partial<MeetingNotesSession>): Promise<MeetingNotesSession> {
    const existing = await this.getMeetingNotesSession(roomId, sessionId);
    if (!existing) throw notFound("Meeting notes session not found");
    const updated = { ...existing, ...patch, roomId: existing.roomId, id: existing.id, updatedAt: nowIso() };
    this.meetingNotesSessions.set(sessionId, updated);
    return updated;
  }

  async deleteMeetingNotesSession(roomId: string, sessionId: string): Promise<void> {
    const existing = await this.getMeetingNotesSession(roomId, sessionId);
    if (!existing) return;
    this.meetingNotesSessions.delete(sessionId);
    await this.deleteMeetingNotesSegments(sessionId);
  }

  async createMeetingNotesSegment(input: MeetingNotesSegment): Promise<MeetingNotesSegment> {
    this.meetingNotesSegments.set(input.id, input);
    return input;
  }

  async listMeetingNotesSegments(sessionId: string): Promise<MeetingNotesSegment[]> {
    return Array.from(this.meetingNotesSegments.values())
      .filter((segment) => segment.sessionId === sessionId)
      .sort((a, b) => a.startMs - b.startMs || a.speakerUserId.localeCompare(b.speakerUserId));
  }

  async deleteMeetingNotesSegments(sessionId: string): Promise<void> {
    for (const [id, segment] of this.meetingNotesSegments.entries()) {
      if (segment.sessionId === sessionId) this.meetingNotesSegments.delete(id);
    }
  }

  async listAiObjectJobsForRoom(roomId: string, opts?: { limit?: number }): Promise<AiObjectJob[]> {
    const jobs = Array.from(this.aiObjectJobs.values())
      .filter((j) => j.roomId === roomId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? jobs.slice(0, opts.limit) : jobs;
  }

  async countActiveAiObjectJobsForRoom(roomId: string): Promise<number> {
    const active = new Set(["queued", "refining", "composing", "validating"]);
    return Array.from(this.aiObjectJobs.values()).filter((j) => j.roomId === roomId && active.has(j.status)).length;
  }

  async countActiveAiObjectJobsForUser(roomId: string, userId: string): Promise<number> {
    const active = new Set(["queued", "refining", "composing", "validating"]);
    return Array.from(this.aiObjectJobs.values()).filter(
      (j) => j.roomId === roomId && j.requestedByUserId === userId && active.has(j.status)
    ).length;
  }

  async countAiObjectJobsForUserSince(userId: string, sinceIso: string): Promise<number> {
    return Array.from(this.aiObjectJobs.values()).filter(
      (j) => j.requestedByUserId === userId && j.createdAt >= sinceIso
    ).length;
  }

  async getAiObjectJob(id: string): Promise<AiObjectJob | undefined> {
    return this.aiObjectJobs.get(id);
  }

  async createAiObjectJob(input: AiObjectJob): Promise<AiObjectJob> {
    this.aiObjectJobs.set(input.id, input);
    return input;
  }

  async updateAiObjectJob(id: string, patch: Partial<AiObjectJob>): Promise<AiObjectJob> {
    const existing = this.aiObjectJobs.get(id);
    if (!existing) throw notFound("AI object job not found");
    const updated = { ...existing, ...patch, id: existing.id, roomId: existing.roomId, updatedAt: nowIso() };
    this.aiObjectJobs.set(id, updated);
    return updated;
  }

  async deleteAiObjectJob(id: string, roomId: string): Promise<void> {
    const job = this.aiObjectJobs.get(id);
    if (job && job.roomId === roomId) this.aiObjectJobs.delete(id);
  }

  async listExpiredAiObjectJobs(beforeIso: string, limit: number): Promise<AiObjectJob[]> {
    const terminal = new Set(["ready", "error", "cancelled", "rejected"]);
    return Array.from(this.aiObjectJobs.values())
      .filter((j) => terminal.has(j.status) && j.finishedAt && j.finishedAt <= beforeIso)
      .sort((a, b) => (a.finishedAt ?? "").localeCompare(b.finishedAt ?? ""))
      .slice(0, limit);
  }

  async createSharedBrowserSession(input: SharedBrowserSession): Promise<SharedBrowserSession> {
    this.sharedBrowserSessions.set(input.id, input);
    return input;
  }

  async getSharedBrowserSession(id: string): Promise<SharedBrowserSession | undefined> {
    return this.sharedBrowserSessions.get(id);
  }

  async getSharedBrowserSessionByWallObject(wallObjectId: string): Promise<SharedBrowserSession | undefined> {
    return Array.from(this.sharedBrowserSessions.values()).find((s) => s.wallObjectId === wallObjectId);
  }

  async listSharedBrowserSessionsForRoom(roomId: string): Promise<SharedBrowserSession[]> {
    return Array.from(this.sharedBrowserSessions.values()).filter((s) => s.roomId === roomId);
  }

  async countActiveSharedBrowserSessionsForRoom(roomId: string): Promise<number> {
    const active = new Set(["starting", "active", "paused"]);
    return Array.from(this.sharedBrowserSessions.values()).filter(
      (s) => s.roomId === roomId && active.has(s.status)
    ).length;
  }

  async updateSharedBrowserSession(id: string, patch: SharedBrowserSessionPatch): Promise<SharedBrowserSession> {
    const existing = this.sharedBrowserSessions.get(id);
    if (!existing) throw notFound("Shared browser session not found");
    const { unsetHyperbeam, unsetLivekit, unsetControlLease, ...rest } = patch;
    const updated = { ...existing, ...rest } as SharedBrowserSession;
    if (unsetHyperbeam) delete (updated as { hyperbeam?: unknown }).hyperbeam;
    if (unsetLivekit) delete (updated as { livekit?: unknown }).livekit;
    if (unsetControlLease) delete (updated as { controlLease?: unknown }).controlLease;
    this.sharedBrowserSessions.set(id, updated);
    return updated;
  }

  async deleteSharedBrowserSession(id: string): Promise<void> {
    this.sharedBrowserSessions.delete(id);
  }

  async listStaleSharedBrowserSessions(olderThanIso: string): Promise<SharedBrowserSession[]> {
    const active = new Set(["starting", "active"]);
    return Array.from(this.sharedBrowserSessions.values()).filter(
      (s) => active.has(s.status) && s.lastInputAt <= olderThanIso
    );
  }

  async listLiveSharedBrowserSessions(): Promise<SharedBrowserSession[]> {
    const live = new Set(["starting", "active"]);
    return Array.from(this.sharedBrowserSessions.values()).filter((s) => live.has(s.status));
  }
}
