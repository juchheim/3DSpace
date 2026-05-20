import { QualityLevelSchema, ViewModeSchema } from "@3dspace/contracts";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080").replace(/\/$/, "");
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";
export const CLERK_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_E2E_DEV_AUTH === "true" ? "" : process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";

export const CLIENT_TUNING = {
  defaultViewMode: ViewModeSchema.parse(process.env.DEFAULT_VIEW_MODE ?? "3d"),
  defaultQuality: QualityLevelSchema.parse(process.env.DEFAULT_3D_QUALITY ?? "low"),
  enableClassroomLessons: process.env.NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS === "true"
};
