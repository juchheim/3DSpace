import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CreateRoomObjectRequestSchema,
  parameterSchemaToJson,
  parseRoomObjectParameterSchemaJson,
  RoomObjectRealtimeMessageSchema,
  RoomObjectSchema,
  RoomObjectTemplateSchema,
  RoomSettingsSchema
} from "../src/index";

const here = dirname(fileURLToPath(import.meta.url));
const heroDraft = JSON.parse(
  readFileSync(join(here, "../../room-objects/catalog/hero-draft.json"), "utf8")
) as Record<string, unknown>;

describe("room object contracts", () => {
  it("extends room settings with roomObjects defaults", () => {
    const settings = RoomSettingsSchema.parse({
      maxParticipants: 30,
      defaultViewMode: "3d",
      defaultQuality: "medium",
      enable2DAnalog: true,
      enableWallAttachments: true
    });
    expect(settings.roomObjects.enabled).toBe(false);
    expect(settings.roomObjects.maxActive).toBe(8);
    expect(settings.roomObjects.defaultTouchPolicy).toBe("teacher-only");
  });

  it("parses hero-draft parameterSchema and round-trips parameterSchemaJson", () => {
    const map = parseRoomObjectParameterSchemaJson(
      parameterSchemaToJson(heroDraft.parameterSchema as never)
    );
    expect(map.modelStyle.type).toBe("enum");
    expect(map.bondAngleVisible.type).toBe("boolean");
    expect(map.palette.type).toBe("enum");
  });

  it("validates a procedural builtin template shaped like the Phase 0 hero", () => {
    const parameterSchemaJson = parameterSchemaToJson(heroDraft.parameterSchema as never);
    const template = RoomObjectTemplateSchema.parse({
      id: "tpl-water-molecule",
      slug: heroDraft.slug,
      displayName: heroDraft.displayName,
      category: heroDraft.category,
      description: heroDraft.description,
      thumbnailUrl: heroDraft.thumbnailUrl,
      defaultPose: heroDraft.defaultPose,
      defaultScale: heroDraft.defaultScale,
      defaultParameters: heroDraft.defaultParameters,
      parameterSchemaJson,
      recommendedTouchPolicy: heroDraft.recommendedTouchPolicy,
      kinematic: heroDraft.kinematic,
      source: heroDraft.source,
      license: heroDraft.license,
      attribution: heroDraft.attribution,
      renderer: heroDraft.renderer,
      proceduralId: heroDraft.proceduralId,
      exportable: heroDraft.exportable,
      fileSizeBytes: 0,
      triangleCount: 18600,
      createdAt: "2026-05-21T00:00:00.000Z"
    });
    expect(template.renderer).toBe("procedural");
    expect(template.proceduralId).toBe("water-molecule");
  });

  it("rejects procedural templates without proceduralId", () => {
    expect(() =>
      RoomObjectTemplateSchema.parse({
        id: "tpl-bad",
        slug: "bad",
        displayName: "Bad",
        category: "science",
        description: "x",
        thumbnailUrl: "/x.png",
        defaultPose: { position: { x: 0, y: 0, z: 0 }, rotation: { yaw: 0 } },
        parameterSchemaJson: "{}",
        renderer: "procedural",
        fileSizeBytes: 0,
        triangleCount: 0,
        createdAt: nowIso()
      })
    ).toThrow();
  });

  it("parses room object instance and create request", () => {
    const object = RoomObjectSchema.parse({
      id: "obj-1",
      roomId: "room-1",
      templateId: "tpl-water-molecule",
      displayName: "Water molecule (H₂O)",
      pose: { position: { x: 0, y: 1.1, z: 0 }, rotation: { yaw: 0 } },
      scale: 1,
      parameters: { modelStyle: "ball-and-stick", bondAngleVisible: true, palette: "cpk" },
      touchPolicy: "teacher-only",
      grantedUserIds: [],
      grantedGroupIds: [],
      status: "active",
      createdByUserId: "teacher-1",
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    expect(object.roomId).toBe("room-1");

    const createReq = CreateRoomObjectRequestSchema.parse({
      templateId: "tpl-water-molecule",
      touchPolicy: "granted"
    });
    expect(createReq.templateId).toBe("tpl-water-molecule");
  });

  it("parses room object realtime messages", () => {
    const upsert = RoomObjectRealtimeMessageSchema.parse({
      type: "room.object.upsert.v1",
      roomId: "room-1",
      object: {
        id: "obj-1",
        roomId: "room-1",
        templateId: "tpl-1",
        displayName: "Molecule",
        pose: { position: { x: 0, y: 1, z: 0 }, rotation: { yaw: 0 } },
        scale: 1,
        parameters: {},
        touchPolicy: "teacher-only",
        grantedUserIds: [],
        grantedGroupIds: [],
        status: "active",
        createdByUserId: "t1",
        createdAt: nowIso(),
        updatedAt: nowIso()
      },
      sentAt: 1,
      senderId: "t1"
    });
    expect(upsert.type).toBe("room.object.upsert.v1");

    const grab = RoomObjectRealtimeMessageSchema.parse({
      type: "room.object.grab.v1",
      roomId: "room-1",
      objectId: "obj-1",
      holderUserId: "student-1",
      expiresAt: "2026-05-21T12:00:30.000Z",
      sentAt: 2,
      senderId: "student-1"
    });
    expect(grab.type).toBe("room.object.grab.v1");
  });
});

function nowIso() {
  return new Date().toISOString();
}
