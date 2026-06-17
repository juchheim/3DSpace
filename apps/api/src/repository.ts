import crypto from "node:crypto";
import {
  getRoomTypeFeatureFlags,
  parseRoomSettings,
  type AiObjectJob,
  type AvatarAppearance,
  type AvatarBodySlug,
  type AvatarEquippedAccessories,
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
  type BuildLogicPiece,
  type BuildPiece,
  type BuildPieceEdge,
  type BuildPieceKind,
  type BuildPieceMaterial,
  type BuildPieceRotation,
  type ImageFloorTextureSpanCells,
  type PlacedWorldAsset,
  type PlacedCustomAsset,
  type CustomWorldAsset,
  type WorldAssetPlacementKind,
  type RoomLight,
  type RoomEnvironment,
  defaultRoomEnvironment,
  ROOM_LIGHT_MAX_PER_ROOM,
  ROOM_LIGHT_MAX_AREA,
  type LogicPieceKind,
  type EscapeSession,
  type RoomAiHost,
  type RoomAiHostChatMessage,
  type RoomAiHostChatMode,
  type RoomAiHostFile,
  type RoomAiHostFileChunk,
  type LogicState,
  type RoomObject,
  type RoomObjectStatus,
  type RoomObjectTemplate,
  type WallObject,
  type WallObjectStatus,
  type WorldSkin
} from "@3dspace/contracts";
import { buildPieceStableId, logicPieceStableId } from "@3dspace/room-engine";
import { defaultLogicConfig } from "./logic-pieces/helpers.js";
import type { z } from "zod";
import type { AuthContext } from "./auth.js";
import { aiHostExists, conflict, escapeSessionAlreadyRunning, escapeSessionNotRunning, notFound } from "./errors.js";

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

/** Patch for shared browser session rows; supports clearing nested runtime fields. */
export type SharedBrowserSessionPatch = Partial<SharedBrowserSession> & {
  unsetHyperbeam?: boolean;
  unsetLivekit?: boolean;
  unsetControlLease?: boolean;
};

export function normalizeRoomRecord(room: RoomRecord): RoomRecord {
  const settings = parseRoomSettings(room.settings);
  const flags = getRoomTypeFeatureFlags(room.type);
  const healedSettings =
    flags.aiMeetingNotes && settings.aiMeetingNotes.enabled === false
      ? { ...settings, aiMeetingNotes: { ...settings.aiMeetingNotes, enabled: true } }
      : settings;
  return { ...room, settings: healedSettings };
}

export type RoomEventRecord = {
  id: string;
  roomId: string;
  type: string;
  payload: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
};

export type OAuthStateRecord = {
  state: string;
  codeVerifier: string;
  returnTo: string;
  expiresAt: string;
  createdAt: string;
};

export type AuthExchangeCodeRecord = {
  code: string;
  userId: string;
  displayName: string;
  email?: string;
  expiresAt: string;
  createdAt: string;
  consumedAt?: string;
};

export type AuthRefreshSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  createdAt: string;
  rotatedFromId?: string;
  revokedAt?: string;
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
  createOAuthState(record: OAuthStateRecord): Promise<void>;
  consumeOAuthState(state: string): Promise<OAuthStateRecord | undefined>;
  createAuthExchangeCode(record: AuthExchangeCodeRecord): Promise<void>;
  consumeAuthExchangeCode(code: string): Promise<AuthExchangeCodeRecord | undefined>;
  createAuthRefreshSession(record: AuthRefreshSessionRecord): Promise<void>;
  getAuthRefreshSessionByTokenHash(tokenHash: string): Promise<AuthRefreshSessionRecord | undefined>;
  revokeAuthRefreshSession(sessionId: string, revokedAt: string): Promise<AuthRefreshSessionRecord | undefined>;
  updateUserAvatarAppearance(userId: string, appearance: AvatarAppearance): Promise<User>;
  clearUserAvatarAppearance(userId: string): Promise<User>;
  updateUserAvatarAccessories(userId: string, accessories: AvatarEquippedAccessories): Promise<User>;
  updateUserAvatarBody(userId: string, bodySlug: AvatarBodySlug): Promise<User>;
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
  /** Hide built-in catalog entries removed from `builtin.json` (seed-only; not the user archive API). */
  archiveRetiredBuiltinRoomObjectTemplates(activeSlugs: readonly string[]): Promise<void>;
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
  listWorldAssetsForRoom(roomId: string): Promise<PlacedWorldAsset[]>;
  createWorldAsset(input: {
    roomId: string;
    slug: string;
    position: { x: number; y: number; z: number };
    yaw: number;
    scale?: number;
    custom?: PlacedCustomAsset;
    placedByUserId: string;
  }): Promise<PlacedWorldAsset>;
  deleteWorldAsset(roomId: string, assetId: string): Promise<void>;
  listRoomLights(roomId: string): Promise<RoomLight[]>;
  createRoomLight(input: {
    roomId: string;
    type: RoomLight["type"];
    name?: string;
    position: RoomLight["position"];
    target?: RoomLight["target"];
    rotation?: RoomLight["rotation"];
    color: string;
    intensity: number;
    castShadow: boolean;
    distance?: number;
    decay?: number;
    angleDeg?: number;
    penumbra?: number;
    width?: number;
    height?: number;
    createdByUserId: string;
  }): Promise<RoomLight>;
  updateRoomLight(roomId: string, lightId: string, patch: Partial<Omit<RoomLight, "id" | "roomId" | "createdByUserId" | "createdAt">>): Promise<RoomLight | null>;
  deleteRoomLight(roomId: string, lightId: string): Promise<void>;
  getRoomEnvironment(roomId: string): Promise<RoomEnvironment>;
  setRoomEnvironment(roomId: string, patch: Partial<RoomEnvironment>): Promise<RoomEnvironment>;
  listCustomAssetsForOwner(ownerUserId: string): Promise<CustomWorldAsset[]>;
  createCustomAsset(input: {
    ownerUserId: string;
    displayName: string;
    glbStorageKey: string;
    glbUrl: string;
    thumbnailStorageKey: string;
    thumbnailUrl: string;
    placement: WorldAssetPlacementKind;
    objectRole?: CustomWorldAsset["objectRole"];
    scale?: number;
  }): Promise<CustomWorldAsset>;
  updateCustomAsset(
    ownerUserId: string,
    assetId: string,
    patch: { objectRole: CustomWorldAsset["objectRole"] | null }
  ): Promise<CustomWorldAsset | null>;
  deleteCustomAsset(ownerUserId: string, assetId: string): Promise<void>;
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
    textureStorageKey?: string | undefined;
    textureSpanCells?: ImageFloorTextureSpanCells | undefined;
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
      textureStorageKey?: string | undefined;
      textureSpanCells?: ImageFloorTextureSpanCells | undefined;
      createdByUserId: string;
    }>
  ): Promise<BuildPiece[]>;
  getBuildPiece(roomId: string, pieceId: string): Promise<BuildPiece | undefined>;
  removeBuildPiece(roomId: string, pieceId: string): Promise<BuildPiece>;
  countBuildPiecesForRoom(roomId: string): Promise<number>;
  countBuildPiecesForUser(roomId: string, userId: string): Promise<number>;
  deleteAllBuildPiecesForRoom(roomId: string): Promise<void>;
  listLogicPiecesForRoom(roomId: string): Promise<BuildLogicPiece[]>;
  createLogicPiece(input: {
    roomId: string;
    kind: LogicPieceKind;
    cell: { ix: number; iz: number };
    level: number;
    edge?: BuildPieceEdge | undefined;
    rotation: BuildPieceRotation;
    channelId?: string | undefined;
    linkId?: string | undefined;
    config?: BuildLogicPiece["config"] | undefined;
    createdByUserId: string;
  }): Promise<BuildLogicPiece>;
  updateLogicPiece(
    roomId: string,
    pieceId: string,
    patch: { channelId?: string | undefined; linkId?: string | undefined; config?: BuildLogicPiece["config"] | undefined }
  ): Promise<BuildLogicPiece>;
  getLogicPiece(roomId: string, pieceId: string): Promise<BuildLogicPiece | undefined>;
  removeLogicPiece(roomId: string, pieceId: string): Promise<BuildLogicPiece>;
  countLogicPiecesForRoom(roomId: string): Promise<number>;
  countLogicPiecesForUser(roomId: string, userId: string): Promise<number>;
  deleteAllLogicPiecesForRoom(roomId: string): Promise<void>;
  getLogicState(roomId: string): Promise<LogicState>;
  patchLogicState(
    roomId: string,
    patch: { channels?: LogicState["channels"] | undefined; nodes?: LogicState["nodes"] | undefined }
  ): Promise<LogicState>;
  resetLogicState(roomId: string): Promise<LogicState>;
  getEscapeSession(roomId: string): Promise<EscapeSession>;
  startEscapeSession(roomId: string, durationSec?: number): Promise<EscapeSession>;
  resetEscapeSession(roomId: string): Promise<EscapeSession>;
  markEscapeSessionWon(roomId: string): Promise<EscapeSession>;
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
  getAiHostByRoomId(roomId: string): Promise<RoomAiHost | null>;
  createAiHost(host: RoomAiHost): Promise<RoomAiHost>;
  updateAiHost(roomId: string, host: RoomAiHost): Promise<RoomAiHost>;
  deleteAiHost(roomId: string): Promise<void>;
  appendAiHostChatMessage(message: RoomAiHostChatMessage): Promise<RoomAiHostChatMessage>;
  listAiHostChatMessages(
    roomId: string,
    userId: string,
    opts?: { mode?: RoomAiHostChatMode | undefined; fileId?: string | undefined; limit?: number | undefined }
  ): Promise<RoomAiHostChatMessage[]>;
  deleteAiHostChatMessagesForFile(roomId: string, fileId: string): Promise<void>;
  listAiHostFiles(roomId: string): Promise<RoomAiHostFile[]>;
  getAiHostFile(roomId: string, fileId: string): Promise<RoomAiHostFile | null>;
  createAiHostFile(file: RoomAiHostFile): Promise<RoomAiHostFile>;
  updateAiHostFile(roomId: string, fileId: string, file: RoomAiHostFile): Promise<RoomAiHostFile>;
  deleteAiHostFile(roomId: string, fileId: string): Promise<void>;
  deleteAiHostFilesForRoom(roomId: string): Promise<void>;
  replaceAiHostFileChunks(roomId: string, fileId: string, chunks: RoomAiHostFileChunk[]): Promise<void>;
  listAiHostFileChunks(roomId: string, fileId: string): Promise<RoomAiHostFileChunk[]>;
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
  return { initials, color: palette[hash % palette.length]!, bodySlug: "azure-vanguard" as const };
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
  private worldAssets = new Map<string, PlacedWorldAsset>();
  private customAssets = new Map<string, CustomWorldAsset>();
  private logicPieces = new Map<string, BuildLogicPiece>();
  private logicStates = new Map<string, LogicState>();
  private escapeSessions = new Map<string, EscapeSession>();
  private roomEvents = new Map<string, RoomEventRecord>();
  private activeSessions = new Map<string, { roomId: string; participantIdentity: string; lastSeenAt: number }>();
  private dynamicWallAnchors = new Map<string, DynamicWallAnchor>();
  private meetingNotesSessions = new Map<string, MeetingNotesSession>();
  private meetingNotesSegments = new Map<string, MeetingNotesSegment>();
  private aiObjectJobs = new Map<string, AiObjectJob>();
  private sharedBrowserSessions = new Map<string, SharedBrowserSession>();
  private aiHostsByRoom = new Map<string, RoomAiHost>();
  private aiHostChatMessages: RoomAiHostChatMessage[] = [];
  private aiHostFilesByRoom = new Map<string, Map<string, RoomAiHostFile>>();
  private aiHostFileChunks = new Map<string, RoomAiHostFileChunk[]>();
  private oauthStates = new Map<string, OAuthStateRecord>();
  private authExchangeCodes = new Map<string, AuthExchangeCodeRecord>();
  private authRefreshSessions = new Map<string, AuthRefreshSessionRecord>();
  private roomLights = new Map<string, RoomLight>();
  private roomEnvironments = new Map<string, RoomEnvironment>();

  async close() {
    return;
  }

  async ensureUser(auth: AuthContext) {
    const existing = this.users.get(auth.userId);
    const time = nowIso();
    const authPatch = {
      ...(auth.email ? { email: auth.email } : {}),
      authProvider: auth.provider,
      ...(auth.lastLoginAt ? { lastLoginAt: auth.lastLoginAt } : {})
    };
    if (existing) {
      const updated: User = { ...existing, ...authPatch, displayName: auth.displayName, updatedAt: time };
      this.users.set(auth.userId, updated);
      return updated;
    }

    const user: User = {
      id: auth.userId,
      externalAuthId: auth.provider === "google" ? auth.userId.replace(/^google:/, "") : auth.userId,
      displayName: auth.displayName,
      ...authPatch,
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

  async createOAuthState(record: OAuthStateRecord) {
    this.oauthStates.set(record.state, record);
  }

  async consumeOAuthState(state: string) {
    const record = this.oauthStates.get(state);
    this.oauthStates.delete(state);
    if (!record || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
    return record;
  }

  async createAuthExchangeCode(record: AuthExchangeCodeRecord) {
    this.authExchangeCodes.set(record.code, record);
  }

  async consumeAuthExchangeCode(code: string) {
    const record = this.authExchangeCodes.get(code);
    if (!record || record.consumedAt || new Date(record.expiresAt).getTime() <= Date.now()) return undefined;
    const consumed = { ...record, consumedAt: nowIso() };
    this.authExchangeCodes.set(code, consumed);
    return consumed;
  }

  async createAuthRefreshSession(record: AuthRefreshSessionRecord) {
    this.authRefreshSessions.set(record.id, record);
  }

  async getAuthRefreshSessionByTokenHash(tokenHash: string) {
    for (const session of this.authRefreshSessions.values()) {
      if (session.tokenHash === tokenHash) return session;
    }
    return undefined;
  }

  async revokeAuthRefreshSession(sessionId: string, revokedAt: string) {
    const existing = this.authRefreshSessions.get(sessionId);
    if (!existing) return undefined;
    const updated = { ...existing, revokedAt };
    this.authRefreshSessions.set(sessionId, updated);
    return updated;
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

  async clearUserAvatarAppearance(userId: string): Promise<User> {
    const existing = this.users.get(userId);
    if (!existing) throw notFound("User not found");
    const updated: User = {
      ...existing,
      avatar: { ...existing.avatar, appearance: null },
      updatedAt: nowIso()
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateUserAvatarAccessories(userId: string, accessories: AvatarEquippedAccessories): Promise<User> {
    const existing = this.users.get(userId);
    if (!existing) throw notFound("User not found");
    const updated: User = {
      ...existing,
      avatar: { ...existing.avatar, accessories },
      updatedAt: nowIso()
    };
    this.users.set(userId, updated);
    return updated;
  }

  async updateUserAvatarBody(userId: string, bodySlug: AvatarBodySlug): Promise<User> {
    const existing = this.users.get(userId);
    if (!existing) throw notFound("User not found");
    const updated: User = {
      ...existing,
      avatar: { ...existing.avatar, bodySlug },
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
    for (const [id, piece] of this.logicPieces.entries()) {
      if (piece.roomId === roomId) this.logicPieces.delete(id);
    }
    this.logicStates.delete(roomId);
    this.escapeSessions.delete(roomId);
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
    this.aiHostsByRoom.delete(roomId);
    this.aiHostFilesByRoom.delete(roomId);
    for (const key of [...this.aiHostFileChunks.keys()]) {
      if (key.startsWith(`${roomId}:`)) this.aiHostFileChunks.delete(key);
    }
  }

  async getAiHostByRoomId(roomId: string) {
    return this.aiHostsByRoom.get(roomId) ?? null;
  }

  async createAiHost(host: RoomAiHost) {
    if (this.aiHostsByRoom.has(host.roomId)) throw aiHostExists();
    this.aiHostsByRoom.set(host.roomId, host);
    return host;
  }

  async updateAiHost(roomId: string, host: RoomAiHost) {
    if (!this.aiHostsByRoom.has(roomId)) throw notFound("AI world host not found");
    this.aiHostsByRoom.set(roomId, host);
    return host;
  }

  async deleteAiHost(roomId: string) {
    if (!this.aiHostsByRoom.delete(roomId)) throw notFound("AI world host not found");
  }

  async appendAiHostChatMessage(message: RoomAiHostChatMessage) {
    this.aiHostChatMessages.push(message);
    return message;
  }

  async listAiHostChatMessages(
    roomId: string,
    userId: string,
    opts?: { mode?: RoomAiHostChatMode | undefined; fileId?: string | undefined; limit?: number | undefined }
  ) {
    const filtered = this.aiHostChatMessages.filter(
      (message) =>
        message.roomId === roomId &&
        message.userId === userId &&
        (opts?.mode === undefined || message.mode === opts.mode) &&
        (opts?.fileId === undefined || message.fileId === opts.fileId)
    );
    const ordered = filtered.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (opts?.limit !== undefined && ordered.length > opts.limit) {
      return ordered.slice(ordered.length - opts.limit);
    }
    return ordered;
  }

  async deleteAiHostChatMessagesForFile(roomId: string, fileId: string) {
    this.aiHostChatMessages = this.aiHostChatMessages.filter(
      (message) => !(message.roomId === roomId && message.fileId === fileId)
    );
  }

  private aiHostFileChunkKey(roomId: string, fileId: string) {
    return `${roomId}:${fileId}`;
  }

  async listAiHostFiles(roomId: string) {
    const byId = this.aiHostFilesByRoom.get(roomId);
    if (!byId) return [];
    return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async getAiHostFile(roomId: string, fileId: string) {
    return this.aiHostFilesByRoom.get(roomId)?.get(fileId) ?? null;
  }

  async createAiHostFile(file: RoomAiHostFile) {
    let byId = this.aiHostFilesByRoom.get(file.roomId);
    if (!byId) {
      byId = new Map();
      this.aiHostFilesByRoom.set(file.roomId, byId);
    }
    if (byId.has(file.id)) throw conflict("Study file already registered");
    byId.set(file.id, file);
    return file;
  }

  async updateAiHostFile(roomId: string, fileId: string, file: RoomAiHostFile) {
    const byId = this.aiHostFilesByRoom.get(roomId);
    if (!byId?.has(fileId)) throw notFound("Study file not found");
    byId.set(fileId, file);
    return file;
  }

  async deleteAiHostFile(roomId: string, fileId: string) {
    const byId = this.aiHostFilesByRoom.get(roomId);
    if (!byId?.delete(fileId)) throw notFound("Study file not found");
    this.aiHostFileChunks.delete(this.aiHostFileChunkKey(roomId, fileId));
  }

  async deleteAiHostFilesForRoom(roomId: string) {
    const byId = this.aiHostFilesByRoom.get(roomId);
    if (!byId) return;
    for (const fileId of byId.keys()) {
      this.aiHostFileChunks.delete(this.aiHostFileChunkKey(roomId, fileId));
      this.aiHostChatMessages = this.aiHostChatMessages.filter(
        (message) => !(message.roomId === roomId && message.fileId === fileId)
      );
    }
    this.aiHostFilesByRoom.delete(roomId);
  }

  async replaceAiHostFileChunks(roomId: string, fileId: string, chunks: RoomAiHostFileChunk[]) {
    this.aiHostFileChunks.set(this.aiHostFileChunkKey(roomId, fileId), chunks);
  }

  async listAiHostFileChunks(roomId: string, fileId: string) {
    return this.aiHostFileChunks.get(this.aiHostFileChunkKey(roomId, fileId)) ?? [];
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

  async archiveRetiredBuiltinRoomObjectTemplates(activeSlugs: readonly string[]) {
    const active = new Set(activeSlugs);
    const time = nowIso();
    for (const template of this.roomObjectTemplates.values()) {
      if (template.source !== "builtin" || template.archivedAt || active.has(template.slug)) continue;
      this.roomObjectTemplates.set(template.id, { ...template, archivedAt: time });
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

  // Build piece ids (build:wall:ix,iz:level:edge) are only unique per room, so the map
  // must be keyed per room — otherwise the same grid slot in a second room clobbers (or
  // is blocked by) the first room's piece, mirroring the Mongo id_1 collision bug.
  private buildPieceKey(roomId: string, id: string) {
    return `${roomId}\u0000${id}`;
  }

  async listWorldAssetsForRoom(roomId: string) {
    return Array.from(this.worldAssets.values())
      .filter((a) => a.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createWorldAsset(input: {
    roomId: string;
    slug: string;
    position: { x: number; y: number; z: number };
    yaw: number;
    scale?: number;
    custom?: PlacedCustomAsset;
    placedByUserId: string;
  }): Promise<PlacedWorldAsset> {
    const id = `wa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const asset: PlacedWorldAsset = {
      id,
      roomId: input.roomId,
      slug: input.slug,
      position: input.position,
      yaw: input.yaw,
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
      ...(input.custom !== undefined ? { custom: input.custom } : {}),
      placedByUserId: input.placedByUserId,
      createdAt: new Date().toISOString()
    };
    this.worldAssets.set(id, asset);
    return asset;
  }

  async listCustomAssetsForOwner(ownerUserId: string) {
    return Array.from(this.customAssets.values())
      .filter((a) => a.ownerUserId === ownerUserId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createCustomAsset(input: {
    ownerUserId: string;
    displayName: string;
    glbStorageKey: string;
    glbUrl: string;
    thumbnailStorageKey: string;
    thumbnailUrl: string;
    placement: WorldAssetPlacementKind;
    objectRole?: CustomWorldAsset["objectRole"];
    scale?: number;
  }): Promise<CustomWorldAsset> {
    const id = `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const asset: CustomWorldAsset = {
      id,
      ownerUserId: input.ownerUserId,
      displayName: input.displayName,
      glbStorageKey: input.glbStorageKey,
      glbUrl: input.glbUrl,
      thumbnailStorageKey: input.thumbnailStorageKey,
      thumbnailUrl: input.thumbnailUrl,
      placement: input.placement,
      ...(input.objectRole ? { objectRole: input.objectRole } : {}),
      ...(input.scale !== undefined ? { scale: input.scale } : {}),
      createdAt: new Date().toISOString()
    };
    this.customAssets.set(id, asset);
    return asset;
  }

  async updateCustomAsset(
    ownerUserId: string,
    assetId: string,
    patch: { objectRole: CustomWorldAsset["objectRole"] | null }
  ): Promise<CustomWorldAsset | null> {
    const asset = this.customAssets.get(assetId);
    if (!asset || asset.ownerUserId !== ownerUserId) return null;
    const next: CustomWorldAsset = { ...asset };
    if (patch.objectRole == null) delete next.objectRole;
    else next.objectRole = patch.objectRole;
    this.customAssets.set(assetId, next);
    return next;
  }

  async deleteCustomAsset(ownerUserId: string, assetId: string) {
    const asset = this.customAssets.get(assetId);
    if (!asset || asset.ownerUserId !== ownerUserId) throw new Error("Custom asset not found");
    this.customAssets.delete(assetId);
  }

  async deleteWorldAsset(roomId: string, assetId: string) {
    const asset = this.worldAssets.get(assetId);
    if (!asset || asset.roomId !== roomId) throw new Error("World asset not found");
    this.worldAssets.delete(assetId);
  }

  async listRoomLights(roomId: string) {
    return [...this.roomLights.values()].filter((l) => l.roomId === roomId);
  }

  async createRoomLight(input: {
    roomId: string;
    type: RoomLight["type"];
    name?: string;
    position: RoomLight["position"];
    target?: RoomLight["target"];
    rotation?: RoomLight["rotation"];
    color: string;
    intensity: number;
    castShadow: boolean;
    distance?: number;
    decay?: number;
    angleDeg?: number;
    penumbra?: number;
    width?: number;
    height?: number;
    createdByUserId: string;
  }): Promise<RoomLight> {
    const existing = await this.listRoomLights(input.roomId);
    if (existing.length >= ROOM_LIGHT_MAX_PER_ROOM) {
      throw new Error("room-light-cap");
    }
    if (input.type === "area") {
      const areaCount = existing.filter((l) => l.type === "area").length;
      if (areaCount >= ROOM_LIGHT_MAX_AREA) throw new Error("room-light-area-cap");
    }
    const now = new Date().toISOString();
    const light: RoomLight = {
      id: `light-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      roomId: input.roomId,
      type: input.type,
      ...(input.name !== undefined ? { name: input.name } : {}),
      enabled: true,
      position: input.position,
      ...(input.target !== undefined ? { target: input.target } : {}),
      ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
      color: input.color,
      intensity: input.intensity,
      castShadow: input.castShadow,
      ...(input.distance !== undefined ? { distance: input.distance } : {}),
      ...(input.decay !== undefined ? { decay: input.decay } : {}),
      ...(input.angleDeg !== undefined ? { angleDeg: input.angleDeg } : {}),
      ...(input.penumbra !== undefined ? { penumbra: input.penumbra } : {}),
      ...(input.width !== undefined ? { width: input.width } : {}),
      ...(input.height !== undefined ? { height: input.height } : {}),
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    };
    this.roomLights.set(light.id, light);
    return light;
  }

  async updateRoomLight(roomId: string, lightId: string, patch: Partial<Omit<RoomLight, "id" | "roomId" | "createdByUserId" | "createdAt">>) {
    const existing = this.roomLights.get(lightId);
    if (!existing || existing.roomId !== roomId) return null;
    const updated: RoomLight = { ...existing, ...patch, updatedAt: new Date().toISOString() };
    this.roomLights.set(lightId, updated);
    return updated;
  }

  async deleteRoomLight(roomId: string, lightId: string) {
    const existing = this.roomLights.get(lightId);
    if (existing?.roomId === roomId) this.roomLights.delete(lightId);
  }

  async getRoomEnvironment(roomId: string) {
    return this.roomEnvironments.get(roomId) ?? defaultRoomEnvironment();
  }

  async setRoomEnvironment(roomId: string, patch: Partial<RoomEnvironment>) {
    const current = await this.getRoomEnvironment(roomId);
    const updated = { ...current, ...patch };
    this.roomEnvironments.set(roomId, updated);
    return updated;
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
    textureStorageKey?: string | undefined;
    textureSpanCells?: ImageFloorTextureSpanCells | undefined;
    createdByUserId: string;
  }) {
    const time = nowIso();
    const id = buildPieceStableId({
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      edge: input.edge
    });
    const key = this.buildPieceKey(input.roomId, id);
    const existing = this.buildPieces.get(key);
    const record: BuildPiece = {
      id,
      roomId: input.roomId,
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      ...(input.edge ? { edge: input.edge } : {}),
      rotation: input.rotation,
      materialId: input.materialId,
      ...(input.kind === "image-floor" && input.textureStorageKey
        ? { textureStorageKey: input.textureStorageKey }
        : {}),
      ...(input.kind === "image-floor" && input.textureSpanCells
        ? { textureSpanCells: input.textureSpanCells }
        : {}),
      createdByUserId: existing?.createdByUserId ?? input.createdByUserId,
      createdAt: existing?.createdAt ?? time
    };
    this.buildPieces.set(key, record);
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
      textureStorageKey?: string | undefined;
      textureSpanCells?: ImageFloorTextureSpanCells | undefined;
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
    return this.buildPieces.get(this.buildPieceKey(roomId, pieceId));
  }

  async removeBuildPiece(roomId: string, pieceId: string) {
    const existing = await this.getBuildPiece(roomId, pieceId);
    if (!existing) throw notFound("Build piece not found");
    this.buildPieces.delete(this.buildPieceKey(roomId, pieceId));
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

  private logicPieceKey(roomId: string, id: string) {
    return `${roomId}\u0000${id}`;
  }

  async listLogicPiecesForRoom(roomId: string) {
    return Array.from(this.logicPieces.values())
      .filter((piece) => piece.roomId === roomId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async createLogicPiece(input: {
    roomId: string;
    kind: LogicPieceKind;
    cell: { ix: number; iz: number };
    level: number;
    edge?: BuildPieceEdge | undefined;
    rotation: BuildPieceRotation;
    channelId?: string | undefined;
    linkId?: string | undefined;
    config?: BuildLogicPiece["config"] | undefined;
    createdByUserId: string;
  }) {
    const time = nowIso();
    const id = logicPieceStableId({
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      edge: input.edge
    });
    const key = this.logicPieceKey(input.roomId, id);
    const existing = this.logicPieces.get(key);
    const record: BuildLogicPiece = {
      id,
      roomId: input.roomId,
      kind: input.kind,
      cell: input.cell,
      level: input.level,
      ...(input.edge ? { edge: input.edge } : {}),
      rotation: input.rotation,
      ...(input.channelId ?? existing?.channelId ? { channelId: input.channelId ?? existing?.channelId } : {}),
      ...(input.linkId ?? existing?.linkId ? { linkId: input.linkId ?? existing?.linkId } : {}),
      config: input.config ?? existing?.config ?? defaultLogicConfig(),
      createdByUserId: existing?.createdByUserId ?? input.createdByUserId,
      createdAt: existing?.createdAt ?? time
    };
    this.logicPieces.set(key, record);
    return record;
  }

  async updateLogicPiece(
    roomId: string,
    pieceId: string,
    patch: { channelId?: string | undefined; linkId?: string | undefined; config?: BuildLogicPiece["config"] | undefined }
  ) {
    const existing = await this.getLogicPiece(roomId, pieceId);
    if (!existing) throw notFound("Logic piece not found");
    const record: BuildLogicPiece = {
      ...existing,
      ...(patch.channelId !== undefined ? { channelId: patch.channelId } : {}),
      ...(patch.linkId !== undefined ? { linkId: patch.linkId } : {}),
      ...(patch.config !== undefined ? { config: patch.config } : {})
    };
    this.logicPieces.set(this.logicPieceKey(roomId, pieceId), record);
    return record;
  }

  async getLogicPiece(roomId: string, pieceId: string) {
    return this.logicPieces.get(this.logicPieceKey(roomId, pieceId));
  }

  async removeLogicPiece(roomId: string, pieceId: string) {
    const existing = await this.getLogicPiece(roomId, pieceId);
    if (!existing) throw notFound("Logic piece not found");
    this.logicPieces.delete(this.logicPieceKey(roomId, pieceId));
    return existing;
  }

  async countLogicPiecesForRoom(roomId: string) {
    return Array.from(this.logicPieces.values()).filter((piece) => piece.roomId === roomId).length;
  }

  async countLogicPiecesForUser(roomId: string, userId: string) {
    return Array.from(this.logicPieces.values()).filter(
      (piece) => piece.roomId === roomId && piece.createdByUserId === userId
    ).length;
  }

  async deleteAllLogicPiecesForRoom(roomId: string) {
    for (const [key, piece] of this.logicPieces.entries()) {
      if (piece.roomId === roomId) this.logicPieces.delete(key);
    }
  }

  async getLogicState(roomId: string) {
    const existing = this.logicStates.get(roomId);
    if (existing) return existing;
    const state: LogicState = { roomId, channels: {}, nodes: {}, updatedAt: nowIso() };
    this.logicStates.set(roomId, state);
    return state;
  }

  async patchLogicState(
    roomId: string,
    patch: { channels?: LogicState["channels"] | undefined; nodes?: LogicState["nodes"] | undefined }
  ) {
    const current = await this.getLogicState(roomId);
    const state: LogicState = {
      roomId,
      channels:
        patch.channels !== undefined ? { ...current.channels, ...patch.channels } : current.channels,
      nodes: patch.nodes !== undefined ? { ...current.nodes, ...patch.nodes } : current.nodes,
      updatedAt: nowIso()
    };
    this.logicStates.set(roomId, state);
    return state;
  }

  async resetLogicState(roomId: string) {
    const state: LogicState = { roomId, channels: {}, nodes: {}, updatedAt: nowIso() };
    this.logicStates.set(roomId, state);
    return state;
  }

  private defaultEscapeSession(roomId: string): EscapeSession {
    return { roomId, status: "idle", startedAt: null, durationSec: 900, endedAt: null };
  }

  async getEscapeSession(roomId: string) {
    return this.escapeSessions.get(roomId) ?? this.defaultEscapeSession(roomId);
  }

  async startEscapeSession(roomId: string, durationSec?: number) {
    const current = await this.getEscapeSession(roomId);
    if (current.status === "running") throw escapeSessionAlreadyRunning();
    const session: EscapeSession = {
      roomId,
      status: "running",
      startedAt: nowIso(),
      durationSec: durationSec ?? current.durationSec,
      endedAt: null
    };
    this.escapeSessions.set(roomId, session);
    return session;
  }

  async resetEscapeSession(roomId: string) {
    const session = this.defaultEscapeSession(roomId);
    this.escapeSessions.set(roomId, session);
    return session;
  }

  async markEscapeSessionWon(roomId: string) {
    const current = await this.getEscapeSession(roomId);
    if (current.status !== "running") throw escapeSessionNotRunning();
    const session: EscapeSession = {
      ...current,
      status: "won",
      endedAt: nowIso()
    };
    this.escapeSessions.set(roomId, session);
    return session;
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
