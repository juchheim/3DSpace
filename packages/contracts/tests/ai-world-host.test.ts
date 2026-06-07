import { describe, expect, it } from "vitest";
import {
  CreateRoomAiHostRequestSchema,
  DismissRoomAiHostQuerySchema,
  getRoomTypeFeatureFlags,
  parseRoomSettings,
  PatchRoomAiHostRequestSchema,
  RoomAiHostChatMessageSchema,
  RoomAiHostDismissedMessageV1Schema,
  RoomAiHostFileRemovedMessageV1Schema,
  RoomAiHostFileSchema,
  RoomAiHostFileUpdatedMessageV1Schema,
  RoomAiHostRealtimeMessageSchema,
  RoomAiHostSchema,
  RoomAiHostUpdatedMessageV1Schema,
  SendRoomAiHostChatRequestSchema
} from "../src/index";

describe("AI World Host (contracts)", () => {
  it("enables aiWorldHost only for free-for-all", () => {
    expect(getRoomTypeFeatureFlags("free-for-all").aiWorldHost).toBe(true);
    expect(getRoomTypeFeatureFlags("classroom").aiWorldHost).toBe(false);
    expect(getRoomTypeFeatureFlags("escape-room").aiWorldHost).toBe(false);
    expect(getRoomTypeFeatureFlags("workforce-training").aiWorldHost).toBe(false);
  });

  it("defaults aiWorldHost room settings", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });
    expect(settings.aiWorldHost.enabled).toBe(true);
    expect(settings.aiWorldHost.maxFilesPerRoom).toBe(10);
    expect(settings.aiWorldHost.maxFileSizeBytes).toBe(5_000_000);
    expect(settings.aiWorldHost.maxMessagesPerUserPerHour).toBe(60);
    expect(settings.aiWorldHost.maxContextMessages).toBe(20);
    expect(settings.aiWorldHost.allowedMimeTypes).toEqual([
      "application/pdf",
      "text/plain",
      "text/markdown"
    ]);
  });

  it("allows disabling aiWorldHost in room settings (escape-room shape)", () => {
    const settings = parseRoomSettings({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true,
      aiWorldHost: {
        enabled: false,
        maxFilesPerRoom: 10,
        maxFileSizeBytes: 5_000_000,
        maxMessagesPerUserPerHour: 60,
        maxContextMessages: 20,
        allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
      }
    });
    expect(settings.aiWorldHost.enabled).toBe(false);
  });

  it("parses RoomAiHost and related entities", () => {
    const now = new Date().toISOString();
    const host = RoomAiHostSchema.parse({
      id: "host-1",
      roomId: "room-1",
      displayName: "Chip",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      createdByUserId: "user-1",
      createdAt: now,
      updatedAt: now
    });
    expect(host.displayName).toBe("Chip");
    // Hosts created before the avatar field default to LP.
    expect(host.avatar).toBe("lp");

    const legacy = RoomAiHostSchema.parse({
      id: "host-2",
      roomId: "room-2",
      displayName: "Chip",
      avatar: "sprocket-bot",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      createdByUserId: "user-1",
      createdAt: now,
      updatedAt: now
    });
    expect(legacy.avatar).toBe("lp");

    const file = RoomAiHostFileSchema.parse({
      id: "file-1",
      roomId: "room-1",
      uploadedByUserId: "user-1",
      originalFileName: "notes.txt",
      contentType: "text/plain",
      sizeBytes: 42,
      storageKey: "ai-host/room-1/file-1",
      status: "ready",
      createdAt: now,
      updatedAt: now
    });
    expect(file.status).toBe("ready");

    const message = RoomAiHostChatMessageSchema.parse({
      id: "msg-1",
      roomId: "room-1",
      userId: "user-1",
      mode: "build-help",
      role: "user",
      content: "How do I place a ramp?",
      createdAt: now
    });
    expect(message.mode).toBe("build-help");
  });

  it("validates summon, patch, dismiss query, and chat requests", () => {
    CreateRoomAiHostRequestSchema.parse({
      displayName: "Guide Bot",
      position: { x: 1, y: 0, z: 2 }
    });

    const summonWithAvatar = CreateRoomAiHostRequestSchema.parse({
      displayName: "Guide",
      avatar: "lp",
      position: { x: 1, y: 0, z: 2 }
    });
    expect(summonWithAvatar.avatar).toBe("lp");

    PatchRoomAiHostRequestSchema.parse({ displayName: "Renamed" });
    expect(PatchRoomAiHostRequestSchema.parse({ avatar: "lp" }).avatar).toBe("lp");
    // Legacy avatar slugs normalize to lp on read.
    expect(
      RoomAiHostSchema.parse({
        id: "host-legacy",
        roomId: "room-legacy",
        displayName: "Chip",
        avatar: "retro-robot",
        position: { x: 0, y: 0, z: 0 },
        rotationY: 0,
        createdByUserId: "user-1",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }).avatar
    ).toBe("lp");
    // An unknown avatar variant is rejected.
    expect(() => CreateRoomAiHostRequestSchema.parse({
      displayName: "Bad Bot",
      avatar: "mystery-bot",
      position: { x: 0, y: 0, z: 0 }
    })).toThrow();

    expect(DismissRoomAiHostQuerySchema.parse({}).deleteFiles).toBe(false);
    expect(DismissRoomAiHostQuerySchema.parse({ deleteFiles: "true" }).deleteFiles).toBe(true);

    SendRoomAiHostChatRequestSchema.parse({
      mode: "file-study",
      fileId: "file-1",
      content: "Summarize chapter 2",
      buildHelpContext: {
        buildModeEnabled: true,
        selectedTool: "ramp",
        pieceCount: 12,
        lastBuildRejectionReason: null
      }
    });

    expect(() =>
      CreateRoomAiHostRequestSchema.parse({
        displayName: "ab",
        position: { x: 0, y: 0, z: 0 }
      })
    ).toThrow();

    expect(() => PatchRoomAiHostRequestSchema.parse({})).toThrow();

    expect(() =>
      SendRoomAiHostChatRequestSchema.parse({
        mode: "file-study",
        content: "Missing file id"
      })
    ).toThrow();

    expect(() =>
      RoomAiHostChatMessageSchema.parse({
        id: "msg-2",
        roomId: "room-1",
        userId: "user-1",
        mode: "file-study",
        role: "user",
        content: "No file",
        createdAt: new Date().toISOString()
      })
    ).toThrow();
  });

  it("parses room.ai-host realtime messages and discriminated union", () => {
    const now = new Date().toISOString();
    const hostPayload = {
      id: "host-1",
      roomId: "room-1",
      displayName: "Chip",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      createdByUserId: "user-1",
      createdAt: now,
      updatedAt: now
    };
    const filePayload = {
      id: "file-1",
      roomId: "room-1",
      uploadedByUserId: "user-1",
      originalFileName: "notes.txt",
      contentType: "text/plain",
      sizeBytes: 42,
      storageKey: "ai-host/room-1/file-1",
      status: "ready" as const,
      createdAt: now,
      updatedAt: now
    };

    const updated = RoomAiHostUpdatedMessageV1Schema.parse({
      type: "room.ai-host.updated.v1",
      roomId: "room-1",
      host: hostPayload,
      sentAt: 1,
      senderId: "user-1"
    });
    expect(updated.type).toBe("room.ai-host.updated.v1");

    const dismissed = RoomAiHostDismissedMessageV1Schema.parse({
      type: "room.ai-host.dismissed.v1",
      roomId: "room-1",
      deleteFiles: true,
      sentAt: 2,
      senderId: "user-1"
    });
    expect(dismissed.type).toBe("room.ai-host.dismissed.v1");
    expect(dismissed.deleteFiles).toBe(true);

    const fileUpdated = RoomAiHostFileUpdatedMessageV1Schema.parse({
      type: "room.ai-host.file.updated.v1",
      roomId: "room-1",
      file: filePayload,
      sentAt: 3,
      senderId: "user-1"
    });
    expect(fileUpdated.file.status).toBe("ready");

    const fileRemoved = RoomAiHostFileRemovedMessageV1Schema.parse({
      type: "room.ai-host.file.removed.v1",
      roomId: "room-1",
      fileId: "file-1",
      sentAt: 4,
      senderId: "user-1"
    });
    expect(fileRemoved.fileId).toBe("file-1");

    for (const message of [updated, dismissed, fileUpdated, fileRemoved]) {
      expect(RoomAiHostRealtimeMessageSchema.parse(message).type).toBe(message.type);
    }
  });
});
