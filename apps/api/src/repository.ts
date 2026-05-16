import crypto from "node:crypto";
import type {
  ClassMembership,
  ClassRecord,
  Invite,
  Role,
  RoomManifest,
  RoomRecord,
  RoomSettingsSchema,
  User,
  WallAttachment
} from "@3dspace/contracts";
import type { z } from "zod";
import type { AuthContext } from "./auth";
import { notFound } from "./errors";

export type RoomSettings = z.infer<typeof RoomSettingsSchema>;

export type RoomEventRecord = {
  id: string;
  roomId: string;
  type: string;
  payload: Record<string, unknown>;
  createdByUserId: string;
  createdAt: string;
};

export type Repository = {
  close(): Promise<void>;
  ensureUser(auth: AuthContext): Promise<User>;
  getUser(userId: string): Promise<User | undefined>;
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
  markInviteUsed(code: string): Promise<Invite>;
  createRoom(input: { classId: string; name: string; settings: RoomSettings; manifest: RoomManifest }): Promise<{ room: RoomRecord; manifest: RoomManifest }>;
  listRoomsForUser(userId: string): Promise<RoomRecord[]>;
  getRoom(roomId: string): Promise<RoomRecord | undefined>;
  updateRoom(roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }): Promise<RoomRecord>;
  getActiveManifest(roomId: string): Promise<RoomManifest | undefined>;
  saveManifest(manifest: RoomManifest): Promise<RoomManifest>;
  createAttachment(input: Omit<WallAttachment, "id" | "createdAt" | "updatedAt" | "status">): Promise<WallAttachment>;
  listAttachments(roomId: string): Promise<WallAttachment[]>;
  getAttachment(roomId: string, attachmentId: string): Promise<WallAttachment | undefined>;
  recordRoomEvent(input: { roomId: string; type: string; payload: Record<string, unknown>; createdByUserId: string }): Promise<RoomEventRecord>;
  recordRoomSession(input: { roomId: string; participantIdentity: string; userId: string; role: Role; maxParticipants: number }): Promise<number>;
};

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
  private attachments = new Map<string, WallAttachment>();
  private roomEvents = new Map<string, RoomEventRecord>();
  private activeSessions = new Map<string, { roomId: string; participantIdentity: string; lastSeenAt: number }>();

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

  async markInviteUsed(code: string) {
    const existing = this.invites.get(code.toUpperCase());
    if (!existing) throw notFound("Invite not found");
    const updated = { ...existing, usedAt: nowIso() };
    this.invites.set(existing.code, updated);
    return updated;
  }

  async createRoom(input: { classId: string; name: string; settings: RoomSettings; manifest: RoomManifest }) {
    const time = nowIso();
    const room: RoomRecord = {
      id: input.manifest.roomId,
      classId: input.classId,
      name: input.name,
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
    return Array.from(this.rooms.values()).filter((room) => classIds.has(room.classId));
  }

  async getRoom(roomId: string) {
    return this.rooms.get(roomId);
  }

  async updateRoom(roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }) {
    const room = this.rooms.get(roomId);
    if (!room) throw notFound("Room not found");
    const updated: RoomRecord = {
      ...room,
      name: input.name ?? room.name,
      settings: input.settings ? { ...room.settings, ...input.settings } : room.settings,
      updatedAt: nowIso()
    };
    this.rooms.set(roomId, updated);
    return updated;
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

  async recordRoomSession(input: { roomId: string; participantIdentity: string; userId: string; role: Role; maxParticipants: number }) {
    const sessionKey = `${input.roomId}:${input.participantIdentity}`;
    const cutoff = Date.now() - 90_000;
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
}
