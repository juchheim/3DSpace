import { QualityLevelSchema, ViewModeSchema } from "@3dspace/contracts";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_E2E_DEV_AUTH === "true" ? "" : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export const CLIENT_TUNING = {
  defaultViewMode: ViewModeSchema.parse(process.env.DEFAULT_VIEW_MODE ?? "3d"),
  defaultQuality: QualityLevelSchema.parse(process.env.DEFAULT_3D_QUALITY ?? "low"),
  enableClassroomLessons: process.env.NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS === "true",
  enableBreakoutPods: process.env.NEXT_PUBLIC_ENABLE_BREAKOUT_PODS === "true",
  enableRoomObjects: process.env.NEXT_PUBLIC_ENABLE_ROOM_OBJECTS === "true",
  enableAvatarReactions: process.env.NEXT_PUBLIC_ENABLE_AVATAR_REACTIONS !== "false",
  enableHallPass: process.env.NEXT_PUBLIC_ENABLE_HALL_PASS === "true",
  enableWhisper: process.env.NEXT_PUBLIC_ENABLE_WHISPER === "true",
  enableWorldSkins: process.env.NEXT_PUBLIC_ENABLE_WORLD_SKINS === "true",
  enableStudentMediaPermissions: process.env.NEXT_PUBLIC_ENABLE_STUDENT_MEDIA_PERMISSIONS === "true"
};
