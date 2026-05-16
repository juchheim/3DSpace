import mongoose, { type Connection, Schema, type Model } from "mongoose";
import type { ClassMembership, ClassRecord, Invite, Role, RoomManifest, RoomRecord, User, WallAttachment } from "@3dspace/contracts";
import type { AuthContext } from "../auth";
import { notFound } from "../errors";
import { avatarFor, inviteCode, newId, nowIso, type Repository, type RoomEventRecord, type RoomSettings } from "../repository";

type Models = {
  User: Model<any>;
  Class: Model<any>;
  ClassMembership: Model<any>;
  Invite: Model<any>;
  Room: Model<any>;
  RoomManifest: Model<any>;
  WallAttachment: Model<any>;
  RoomEvent: Model<any>;
  RoomSession: Model<any>;
};

function entity<T>(doc: unknown) {
  return doc as T;
}

function entities<T>(docs: unknown) {
  return docs as T[];
}

export async function connectMongo(uri: string, dbName: string) {
  const connection = await mongoose.createConnection(uri, { dbName }).asPromise();
  return connection;
}

export function createModels(connection: Connection): Models {
  const userSchema = new Schema({
    id: { type: String, required: true, unique: true },
    externalAuthId: { type: String, required: true, index: true },
    displayName: { type: String, required: true },
    avatar: { color: String, initials: String },
    createdAt: String,
    updatedAt: String
  });

  const classSchema = new Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    teacherUserId: { type: String, required: true, index: true },
    createdAt: String,
    updatedAt: String
  });

  const membershipSchema = new Schema({
    id: { type: String, required: true, unique: true },
    classId: { type: String, required: true },
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    role: { type: String, required: true, enum: ["teacher", "student"] },
    status: { type: String, required: true, enum: ["active", "invited", "removed"] },
    createdAt: String,
    updatedAt: String
  });
  membershipSchema.index({ classId: 1, userId: 1 }, { unique: true });

  const inviteSchema = new Schema({
    id: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    classId: { type: String, required: true, index: true },
    roomId: { type: String },
    role: { type: String, required: true, enum: ["teacher", "student"] },
    expiresAt: String,
    usedAt: String,
    createdByUserId: { type: String, required: true },
    createdAt: String
  });

  const roomSchema = new Schema({
    id: { type: String, required: true, unique: true },
    classId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    activeManifestVersion: Number,
    settings: Schema.Types.Mixed,
    createdAt: String,
    updatedAt: String
  });

  const manifestSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true },
    version: { type: Number, required: true },
    manifest: { type: Schema.Types.Mixed, required: true },
    createdAt: String
  });
  manifestSchema.index({ roomId: 1, version: 1 }, { unique: true });

  const attachmentSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true },
    wallAnchorId: { type: String, required: true },
    kind: { type: String, required: true, enum: ["image", "video", "audio", "future"] },
    fileName: String,
    contentType: String,
    storageKey: String,
    status: { type: String, required: true, enum: ["pending_upload", "ready", "rejected"] },
    publicUrl: String,
    metadata: Schema.Types.Mixed,
    createdByUserId: String,
    createdAt: String,
    updatedAt: String
  });
  attachmentSchema.index({ roomId: 1, wallAnchorId: 1 });

  const eventSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true, index: true },
    type: String,
    payload: Schema.Types.Mixed,
    createdByUserId: String,
    createdAt: String
  });

  const sessionSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true, index: true },
    participantIdentity: { type: String, required: true },
    userId: String,
    role: String,
    joinedAt: { type: Date, required: true },
    lastSeenAt: { type: Date, required: true }
  });
  sessionSchema.index({ roomId: 1, participantIdentity: 1 }, { unique: true });
  sessionSchema.index({ roomId: 1, lastSeenAt: 1 });

  return {
    User: connection.model("User", userSchema),
    Class: connection.model("Class", classSchema),
    ClassMembership: connection.model("ClassMembership", membershipSchema),
    Invite: connection.model("Invite", inviteSchema),
    Room: connection.model("Room", roomSchema),
    RoomManifest: connection.model("RoomManifest", manifestSchema),
    WallAttachment: connection.model("WallAttachment", attachmentSchema),
    RoomEvent: connection.model("RoomEvent", eventSchema),
    RoomSession: connection.model("RoomSession", sessionSchema)
  };
}

export class MongoRepository implements Repository {
  private models: Models;

  constructor(private connection: Connection) {
    this.models = createModels(connection);
  }

  async close() {
    await this.connection.close();
  }

  async ensureUser(auth: AuthContext): Promise<User> {
    const time = nowIso();
    const user = await this.models.User.findOneAndUpdate(
      { id: auth.userId },
      {
        $set: { displayName: auth.displayName, updatedAt: time },
        $setOnInsert: {
          id: auth.userId,
          externalAuthId: auth.userId,
          avatar: avatarFor(auth.displayName),
          createdAt: time
        }
      },
      { upsert: true, new: true, lean: true }
    );
    return entity<User>(user);
  }

  async getUser(userId: string) {
    return entity<User | undefined>(await this.models.User.findOne({ id: userId }).lean());
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
    await this.models.Class.create(record);
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
    const memberships = entities<ClassMembership>(await this.models.ClassMembership.find({ userId, status: "active" }).lean());
    const classIds = memberships.map((membership) => membership.classId);
    return entities<ClassRecord>(await this.models.Class.find({ $or: [{ id: { $in: classIds } }, { teacherUserId: userId }] }).lean());
  }

  async getClass(classId: string) {
    return entity<ClassRecord | undefined>(await this.models.Class.findOne({ id: classId }).lean());
  }

  async updateClass(classId: string, input: { name?: string }) {
    const record = await this.models.Class.findOneAndUpdate(
      { id: classId },
      { $set: { ...input, updatedAt: nowIso() } },
      { new: true, lean: true }
    );
    if (!record) throw notFound("Class not found");
    return entity<ClassRecord>(record);
  }

  async getMembership(classId: string, userId: string) {
    return entity<ClassMembership | undefined>(await this.models.ClassMembership.findOne({ classId, userId }).lean());
  }

  async listMemberships(classId: string) {
    return entities<ClassMembership>(await this.models.ClassMembership.find({ classId }).lean());
  }

  async upsertMembership(input: {
    classId: string;
    userId: string;
    displayName: string;
    role: Role;
    status: "active" | "invited" | "removed";
  }) {
    const time = nowIso();
    const record = await this.models.ClassMembership.findOneAndUpdate(
      { classId: input.classId, userId: input.userId },
      {
        $set: { displayName: input.displayName, role: input.role, status: input.status, updatedAt: time },
        $setOnInsert: { id: newId("member"), classId: input.classId, userId: input.userId, createdAt: time }
      },
      { upsert: true, new: true, lean: true }
    );
    return entity<ClassMembership>(record);
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
    await this.models.Invite.create(record);
    return record;
  }

  async getInvite(code: string) {
    return entity<Invite | undefined>(await this.models.Invite.findOne({ code: code.toUpperCase() }).lean());
  }

  async markInviteUsed(code: string) {
    const record = await this.models.Invite.findOneAndUpdate({ code: code.toUpperCase() }, { $set: { usedAt: nowIso() } }, { new: true, lean: true });
    if (!record) throw notFound("Invite not found");
    return entity<Invite>(record);
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
    await this.models.Room.create(room);
    await this.saveManifest(input.manifest);
    return { room, manifest: input.manifest };
  }

  async listRoomsForUser(userId: string) {
    const classes = await this.listClassesForUser(userId);
    return entities<RoomRecord>(await this.models.Room.find({ classId: { $in: classes.map((record) => record.id) } }).lean());
  }

  async getRoom(roomId: string) {
    return entity<RoomRecord | undefined>(await this.models.Room.findOne({ id: roomId }).lean());
  }

  async deleteRoom(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) throw notFound("Room not found");
    await Promise.all([
      this.models.Room.deleteOne({ id: roomId }),
      this.models.RoomManifest.deleteMany({ roomId }),
      this.models.WallAttachment.deleteMany({ roomId }),
      this.models.RoomEvent.deleteMany({ roomId }),
      this.models.RoomSession.deleteMany({ roomId }),
      this.models.Invite.deleteMany({ roomId })
    ]);
  }

  async updateRoom(roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }) {
    const room = await this.getRoom(roomId);
    if (!room) throw notFound("Room not found");
    const record = await this.models.Room.findOneAndUpdate(
      { id: roomId },
      {
        $set: {
          name: input.name ?? room.name,
          settings: input.settings ? { ...room.settings, ...input.settings } : room.settings,
          updatedAt: nowIso()
        }
      },
      { new: true, lean: true }
    );
    return entity<RoomRecord>(record);
  }

  async getActiveManifest(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) return undefined;
    const record = await this.models.RoomManifest.findOne({ roomId, version: room.activeManifestVersion }).lean();
    return record ? ((record as any).manifest as RoomManifest) : undefined;
  }

  async saveManifest(manifest: RoomManifest) {
    await this.models.RoomManifest.findOneAndUpdate(
      { roomId: manifest.roomId, version: manifest.version },
      {
        $set: { manifest, createdAt: manifest.createdAt },
        $setOnInsert: { id: manifest.id, roomId: manifest.roomId, version: manifest.version }
      },
      { upsert: true }
    );
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
    await this.models.WallAttachment.create(record);
    return record;
  }

  async listAttachments(roomId: string) {
    return entities<WallAttachment>(await this.models.WallAttachment.find({ roomId }).lean());
  }

  async getAttachment(roomId: string, attachmentId: string) {
    return entity<WallAttachment | undefined>(await this.models.WallAttachment.findOne({ roomId, id: attachmentId }).lean());
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
    await this.models.RoomEvent.create(record);
    return record;
  }

  async recordRoomSession(input: { roomId: string; participantIdentity: string; userId: string; role: Role; maxParticipants: number }) {
    const now = new Date();
    const cutoff = new Date(Date.now() - 90_000);
    const existing = await this.models.RoomSession.findOne({ roomId: input.roomId, participantIdentity: input.participantIdentity }).lean();
    const activeCount = await this.models.RoomSession.countDocuments({ roomId: input.roomId, lastSeenAt: { $gte: cutoff } });
    if (!existing && activeCount >= input.maxParticipants) {
      return activeCount + 1;
    }
    await this.models.RoomSession.findOneAndUpdate(
      { roomId: input.roomId, participantIdentity: input.participantIdentity },
      {
        $set: { lastSeenAt: now, userId: input.userId, role: input.role },
        $setOnInsert: { id: newId("session"), roomId: input.roomId, participantIdentity: input.participantIdentity, joinedAt: now }
      },
      { upsert: true }
    );
    return this.models.RoomSession.countDocuments({ roomId: input.roomId, lastSeenAt: { $gte: cutoff } });
  }
}
