import mongoose, { type Connection, Schema, type Model } from "mongoose";
import type {
  AvatarAppearance,
  ClassroomState,
  ClassMembership,
  ClassRecord,
  Invite,
  Role,
  RoomManifest,
  RoomObject,
  RoomObjectStatus,
  RoomObjectTemplate,
  RoomRecord,
  User,
  WallAttachment,
  WallObject,
  WallObjectStatus
} from "@3dspace/contracts";
import type { AuthContext } from "../auth.js";
import { conflict, notFound } from "../errors.js";
import {
  avatarFor,
  createDefaultClassroomState,
  inviteCode,
  newId,
  normalizeRoomRecord,
  nowIso,
  type Repository,
  type RoomEventRecord,
  type RoomSettings
} from "../repository.js";

type Models = {
  User: Model<any>;
  Class: Model<any>;
  ClassMembership: Model<any>;
  Invite: Model<any>;
  Room: Model<any>;
  RoomManifest: Model<any>;
  ClassroomState: Model<any>;
  WallAttachment: Model<any>;
  WallObject: Model<any>;
  RoomObjectTemplate: Model<any>;
  RoomObject: Model<any>;
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
    avatar: {
      color: String,
      initials: String,
      appearance: {
        hairTop: String, hairFront: String, headSide: String,
        hairBack: String, faceSkin: String, faceAccent: String,
        collar: String, shirtFront: String, shirtBelly: String,
        shirtBack: String, shirtSide: String, shoulderTop: String,
        shoulderCap: String, sleeve: String, hand: String,
        thigh: String, shin: String, legSide: String,
        legBack: String, shoeTop: String, shoeToe: String,
        shoeSide: String, shoeSole: String,
      }
    },
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

  const wallObjectSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true },
    wallAnchorId: { type: String, required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    description: String,
    source: { type: Schema.Types.Mixed, required: true },
    placement: { type: Schema.Types.Mixed, required: true },
    state: { type: Schema.Types.Mixed, default: {} },
    permissions: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      required: true,
      enum: ["draft", "pending_upload", "pending_moderation", "active", "paused", "source_ended", "failed", "removed", "rejected"]
    },
    moderation: { type: Schema.Types.Mixed, default: {} },
    createdByUserId: { type: String, required: true },
    updatedByUserId: { type: String, required: true },
    createdAt: String,
    updatedAt: String,
    version: { type: Number, required: true }
  });
  wallObjectSchema.index({ roomId: 1, status: 1 });
  wallObjectSchema.index({ roomId: 1, wallAnchorId: 1 });
  wallObjectSchema.index({ roomId: 1, updatedAt: -1 });
  wallObjectSchema.index({ roomId: 1, type: 1, status: 1 });

  const roomObjectTemplateSchema = new Schema({
    id: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    displayName: String,
    category: String,
    description: String,
    assetUrl: String,
    thumbnailUrl: String,
    defaultPose: Schema.Types.Mixed,
    defaultScale: Number,
    defaultColorTintHex: String,
    defaultParameters: Schema.Types.Mixed,
    parameterSchemaJson: String,
    recommendedTouchPolicy: String,
    kinematic: Boolean,
    ownerClassId: String,
    source: String,
    license: String,
    attribution: String,
    renderer: String,
    proceduralId: String,
    exportable: Boolean,
    fileSizeBytes: Number,
    triangleCount: Number,
    createdAt: String,
    archivedAt: String
  });
  roomObjectTemplateSchema.index({ source: 1, ownerClassId: 1 });

  const roomObjectSchema = new Schema({
    id: { type: String, required: true, unique: true },
    roomId: { type: String, required: true },
    templateId: String,
    displayName: String,
    pose: Schema.Types.Mixed,
    scale: Number,
    colorTintHex: String,
    parameters: Schema.Types.Mixed,
    touchPolicy: String,
    grantedUserIds: { type: [String], default: [] },
    grantedGroupIds: { type: [String], default: [] },
    status: { type: String, required: true, enum: ["active", "locked", "archived"], index: true },
    createdByUserId: String,
    createdAt: String,
    updatedAt: String
  });
  roomObjectSchema.index({ roomId: 1, status: 1 });

  const classroomStateSchema = new Schema({
    roomId: { type: String, required: true, unique: true },
    version: { type: Number, required: true },
    helpRequests: { type: [Schema.Types.Mixed], default: [] },
    boardAccessGrants: { type: [Schema.Types.Mixed], default: [] },
    privateChecks: { type: [Schema.Types.Mixed], default: [] },
    groups: { type: [Schema.Types.Mixed], default: [] },
    spotlight: { type: Schema.Types.Mixed, default: null },
    lessonRun: { type: Schema.Types.Mixed, default: null },
    avatarEditorLocked: { type: Boolean, default: false },
    reactionsLocked: { type: Boolean, default: false },
    podsRuntime: {
      type: new Schema(
        {
          podsEnabled: { type: Boolean, default: false },
          broadcastFromUserIds: { type: [String], default: [] }
        },
        { _id: false }
      ),
      default: { podsEnabled: false, broadcastFromUserIds: [] }
    },
    whisper: { type: Schema.Types.Mixed },
    createdAt: String,
    updatedAt: String
  });
  classroomStateSchema.index({ roomId: 1 }, { unique: true });

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
    ClassroomState: connection.model("ClassroomState", classroomStateSchema),
    WallAttachment: connection.model("WallAttachment", attachmentSchema),
    WallObject: connection.model("WallObject", wallObjectSchema),
    RoomObjectTemplate: connection.model("RoomObjectTemplate", roomObjectTemplateSchema),
    RoomObject: connection.model("RoomObject", roomObjectSchema),
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

  async updateUserAvatarAppearance(userId: string, appearance: AvatarAppearance): Promise<User> {
    const time = nowIso();
    const user = await this.models.User.findOneAndUpdate(
      { id: userId },
      { $set: { "avatar.appearance": appearance, updatedAt: time } },
      { new: true, lean: true }
    );
    if (!user) throw notFound("User not found");
    return entity<User>(user);
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

  async listInvitesForRoom(roomId: string) {
    return entities<Invite>(
      await this.models.Invite.find({ roomId }).sort({ createdAt: -1 }).lean()
    );
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
    return entities<RoomRecord>(await this.models.Room.find({ classId: { $in: classes.map((record) => record.id) } }).lean()).map(
      normalizeRoomRecord
    );
  }

  async getRoom(roomId: string) {
    const room = entity<RoomRecord | undefined>(await this.models.Room.findOne({ id: roomId }).lean());
    return room ? normalizeRoomRecord(room) : undefined;
  }

  async deleteRoom(roomId: string) {
    const room = await this.getRoom(roomId);
    if (!room) throw notFound("Room not found");
    await Promise.all([
      this.models.Room.deleteOne({ id: roomId }),
      this.models.RoomManifest.deleteMany({ roomId }),
      this.models.ClassroomState.deleteMany({ roomId }),
      this.models.WallAttachment.deleteMany({ roomId }),
      this.models.WallObject.deleteMany({ roomId }),
      this.models.RoomObject.deleteMany({ roomId }),
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
    return normalizeRoomRecord(entity<RoomRecord>(record));
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

  async getClassroomState(roomId: string) {
    const existing = entity<ClassroomState | undefined>(await this.models.ClassroomState.findOne({ roomId }).lean());
    if (existing) return existing;
    const state = createDefaultClassroomState(roomId);
    await this.models.ClassroomState.create(state);
    return state;
  }

  async updateClassroomState(roomId: string, input: { state: ClassroomState; expectedVersion?: number }) {
    const existing = await this.getClassroomState(roomId);
    if (input.expectedVersion && input.expectedVersion !== existing.version) {
      throw conflict("Classroom state version conflict");
    }
    const record = await this.models.ClassroomState.findOneAndUpdate(
      { roomId, version: input.expectedVersion ?? existing.version },
      {
        $set: {
          ...input.state,
          roomId,
          version: existing.version + 1,
          createdAt: existing.createdAt,
          updatedAt: nowIso()
        }
      },
      { new: true, lean: true }
    );
    if (!record) throw conflict("Classroom state version conflict");
    return entity<ClassroomState>(record);
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

  async updateAttachment(roomId: string, attachmentId: string, input: { status?: WallAttachment["status"] | undefined; metadata?: Record<string, unknown> | undefined }) {
    const existing = await this.getAttachment(roomId, attachmentId);
    if (!existing) throw notFound("Attachment not found");
    const record = await this.models.WallAttachment.findOneAndUpdate(
      { roomId, id: attachmentId },
      {
        $set: {
          status: input.status ?? existing.status,
          metadata: input.metadata ? { ...existing.metadata, ...input.metadata } : existing.metadata,
          updatedAt: nowIso()
        }
      },
      { new: true, lean: true }
    );
    return entity<WallAttachment>(record);
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
    await this.models.WallObject.create(record);
    return record;
  }

  async listWallObjects(roomId: string, filter: { status?: WallObjectStatus | undefined; anchorId?: string | undefined; includeRemoved?: boolean | undefined } = {}) {
    const query: Record<string, unknown> = { roomId };
    if (!filter.includeRemoved) query.status = { $ne: "removed" };
    if (filter.status) query.status = filter.status;
    if (filter.anchorId) query.wallAnchorId = filter.anchorId;
    return entities<WallObject>(await this.models.WallObject.find(query).sort({ updatedAt: -1 }).lean());
  }

  async getWallObject(roomId: string, objectId: string) {
    return entity<WallObject | undefined>(await this.models.WallObject.findOne({ roomId, id: objectId }).lean());
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
    const record = await this.models.WallObject.findOneAndUpdate(
      { roomId, id: objectId },
      {
        $set: {
          ...patch,
          updatedAt: nowIso(),
          version: existing.version + 1
        }
      },
      { new: true, lean: true }
    );
    return entity<WallObject>(record);
  }

  async softRemoveWallObject(roomId: string, objectId: string, input: { updatedByUserId: string; expectedVersion?: number | undefined }) {
    return this.updateWallObject(roomId, objectId, { updatedByUserId: input.updatedByUserId, expectedVersion: input.expectedVersion, status: "removed" });
  }

  async upsertBuiltinRoomObjectTemplates(templates: RoomObjectTemplate[]) {
    const time = nowIso();
    for (const template of templates) {
      const { createdAt, archivedAt: _archivedAt, ...fields } = template;
      await this.models.RoomObjectTemplate.findOneAndUpdate(
        { slug: template.slug },
        {
          $set: fields,
          $unset: { archivedAt: "" },
          $setOnInsert: { createdAt: createdAt || time }
        },
        { upsert: true, new: true, lean: true }
      );
    }
  }

  async listRoomObjectTemplatesVisibleTo(userId: string) {
    const classes = await this.listClassesForUser(userId);
    const classIds = classes.map((record) => record.id);
    const query = {
      archivedAt: { $exists: false },
      $or: [{ source: "builtin" }, { ownerClassId: { $in: classIds } }]
    };
    const docs = await this.models.RoomObjectTemplate.find(query).sort({ displayName: 1 }).lean();
    return entities<RoomObjectTemplate>(docs);
  }

  async getRoomObjectTemplate(templateId: string) {
    const doc = await this.models.RoomObjectTemplate.findOne({ id: templateId, archivedAt: { $exists: false } }).lean();
    return entity<RoomObjectTemplate | undefined>(doc);
  }

  async archiveRoomObjectTemplate(templateId: string) {
    const existing = entity<RoomObjectTemplate | undefined>(
      await this.models.RoomObjectTemplate.findOne({ id: templateId }).lean()
    );
    if (!existing) throw notFound("Room object template not found");
    if (existing.source === "builtin") throw conflict("Built-in templates cannot be archived");
    await this.models.RoomObjectTemplate.findOneAndUpdate({ id: templateId }, { $set: { archivedAt: nowIso() } });
    return existing;
  }

  async listRoomObjectsForRoom(roomId: string, filter: { status?: RoomObjectStatus | undefined } = {}) {
    const query: Record<string, unknown> = { roomId };
    if (filter.status) {
      query.status = filter.status;
    } else {
      query.status = { $ne: "archived" };
    }
    return entities<RoomObject>(await this.models.RoomObject.find(query).sort({ updatedAt: -1 }).lean());
  }

  async getRoomObject(roomId: string, objectId: string) {
    return entity<RoomObject | undefined>(await this.models.RoomObject.findOne({ roomId, id: objectId }).lean());
  }

  async createRoomObject(input: Omit<RoomObject, "id" | "createdAt" | "updatedAt">) {
    const time = nowIso();
    const record: RoomObject = {
      ...input,
      id: newId("robj"),
      createdAt: time,
      updatedAt: time
    };
    await this.models.RoomObject.create(record);
    return record;
  }

  async updateRoomObject(
    roomId: string,
    objectId: string,
    patch: Partial<Omit<RoomObject, "id" | "roomId" | "createdAt" | "createdByUserId">>
  ) {
    const existing = await this.getRoomObject(roomId, objectId);
    if (!existing) throw notFound("Room object not found");
    const record = await this.models.RoomObject.findOneAndUpdate(
      { roomId, id: objectId },
      { $set: { ...patch, updatedAt: nowIso() } },
      { new: true, lean: true }
    );
    return entity<RoomObject>(record);
  }

  async removeRoomObject(roomId: string, objectId: string) {
    return this.updateRoomObject(roomId, objectId, { status: "archived" });
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
