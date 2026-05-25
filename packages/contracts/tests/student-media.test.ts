import { describe, expect, it } from "vitest";
import {
  ClassroomActionSchema,
  ClassroomSetStudentMediaAccessActionSchema,
  ClassroomSetStudentMediaGlobalActionSchema,
  ClassroomStateSchema,
  parseRoomSettings,
  RoomSettingsSchema
} from "../src/index";

const BASE_SETTINGS = {
  maxParticipants: 30,
  defaultViewMode: "3d" as const,
  defaultQuality: "low" as const,
  enable2DAnalog: true,
  enableWallAttachments: true
};

const BASE_STATE = {
  roomId: "room-1",
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe("student media contracts", () => {
  describe("RoomSettings.studentMedia defaults", () => {
    it("defaults to both media enabled when field is absent", () => {
      const settings = RoomSettingsSchema.parse(BASE_SETTINGS);
      expect(settings.studentMedia.camerasEnabled).toBe(true);
      expect(settings.studentMedia.microphonesEnabled).toBe(true);
    });

    it("parseRoomSettings on a legacy object (no studentMedia field) defaults to both enabled", () => {
      const settings = parseRoomSettings(BASE_SETTINGS);
      expect(settings.studentMedia.camerasEnabled).toBe(true);
      expect(settings.studentMedia.microphonesEnabled).toBe(true);
    });

    it("preserves explicit false values", () => {
      const settings = RoomSettingsSchema.parse({
        ...BASE_SETTINGS,
        studentMedia: { camerasEnabled: false, microphonesEnabled: false }
      });
      expect(settings.studentMedia.camerasEnabled).toBe(false);
      expect(settings.studentMedia.microphonesEnabled).toBe(false);
    });
  });

  describe("ClassroomState.studentMediaRuntime", () => {
    it("is undefined by default (optional field)", () => {
      const state = ClassroomStateSchema.parse(BASE_STATE);
      expect(state.studentMediaRuntime).toBeUndefined();
    });

    it("parses when provided with full shape", () => {
      const state = ClassroomStateSchema.parse({
        ...BASE_STATE,
        studentMediaRuntime: {
          camerasEnabled: false,
          microphonesEnabled: true,
          cameraEnabledUserIds: ["user-1"],
          microphoneEnabledUserIds: []
        }
      });
      expect(state.studentMediaRuntime?.camerasEnabled).toBe(false);
      expect(state.studentMediaRuntime?.microphonesEnabled).toBe(true);
      expect(state.studentMediaRuntime?.cameraEnabledUserIds).toEqual(["user-1"]);
      expect(state.studentMediaRuntime?.microphoneEnabledUserIds).toEqual([]);
    });

    it("applies per-field defaults when studentMediaRuntime is provided as empty object", () => {
      const state = ClassroomStateSchema.parse({ ...BASE_STATE, studentMediaRuntime: {} });
      expect(state.studentMediaRuntime?.camerasEnabled).toBe(true);
      expect(state.studentMediaRuntime?.microphonesEnabled).toBe(true);
      expect(state.studentMediaRuntime?.cameraEnabledUserIds).toEqual([]);
      expect(state.studentMediaRuntime?.microphoneEnabledUserIds).toEqual([]);
    });
  });

  describe("ClassroomSetStudentMediaGlobalActionSchema", () => {
    it("parses a camera disable action", () => {
      const action = ClassroomSetStudentMediaGlobalActionSchema.parse({
        type: "set-student-media-global",
        medium: "camera",
        enabled: false
      });
      expect(action.type).toBe("set-student-media-global");
      expect(action.medium).toBe("camera");
      expect(action.enabled).toBe(false);
    });

    it("parses a microphone enable action", () => {
      const action = ClassroomSetStudentMediaGlobalActionSchema.parse({
        type: "set-student-media-global",
        medium: "microphone",
        enabled: true
      });
      expect(action.medium).toBe("microphone");
      expect(action.enabled).toBe(true);
    });

    it("rejects unknown medium values", () => {
      expect(() =>
        ClassroomSetStudentMediaGlobalActionSchema.parse({
          type: "set-student-media-global",
          medium: "screen",
          enabled: false
        })
      ).toThrow();
    });

    it("is part of the ClassroomActionSchema discriminated union", () => {
      const action = ClassroomActionSchema.parse({
        type: "set-student-media-global",
        medium: "camera",
        enabled: true
      });
      expect(action.type).toBe("set-student-media-global");
    });
  });

  describe("ClassroomSetStudentMediaAccessActionSchema", () => {
    it("parses a per-student camera allow action", () => {
      const action = ClassroomSetStudentMediaAccessActionSchema.parse({
        type: "set-student-media-access",
        userId: "user-42",
        medium: "camera",
        enabled: true
      });
      expect(action.type).toBe("set-student-media-access");
      expect(action.userId).toBe("user-42");
      expect(action.medium).toBe("camera");
      expect(action.enabled).toBe(true);
    });

    it("rejects missing userId", () => {
      expect(() =>
        ClassroomSetStudentMediaAccessActionSchema.parse({
          type: "set-student-media-access",
          medium: "microphone",
          enabled: false
        })
      ).toThrow();
    });

    it("rejects empty userId", () => {
      expect(() =>
        ClassroomSetStudentMediaAccessActionSchema.parse({
          type: "set-student-media-access",
          userId: "",
          medium: "microphone",
          enabled: false
        })
      ).toThrow();
    });

    it("is part of the ClassroomActionSchema discriminated union", () => {
      const action = ClassroomActionSchema.parse({
        type: "set-student-media-access",
        userId: "user-1",
        medium: "microphone",
        enabled: false
      });
      expect(action.type).toBe("set-student-media-access");
    });
  });
});
