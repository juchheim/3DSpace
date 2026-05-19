import { anchorAcceptsWallObjectType } from "@3dspace/room-engine";
import type { ClassroomBoardAccessGrant, RoomManifest, WallObjectType } from "@3dspace/contracts";

export type SupportedBoardGrantType = Extract<
  WallObjectType,
  "image.file" | "video.file" | "audio.file" | "note" | "camera.live" | "microphone.live" | "browser-tab.live"
>;

export const BOARD_GRANT_TYPE_OPTIONS: Array<{
  type: SupportedBoardGrantType;
  label: string;
  description: string;
}> = [
  { type: "image.file", label: "Image upload", description: "" },
  { type: "video.file", label: "Video upload", description: "" },
  { type: "audio.file", label: "Audio upload", description: "" },
  { type: "note", label: "Sticky note", description: "" },
  { type: "camera.live", label: "Camera", description: "" },
  { type: "microphone.live", label: "Microphone", description: "" },
  { type: "browser-tab.live", label: "Screen share", description: "" }
];

export const BOARD_GRANT_PRESETS: Array<{
  id: "work" | "live" | "all";
  label: string;
  description: string;
  includes: SupportedBoardGrantType[];
}> = [
  {
    id: "work",
    label: "Work share",
    description: "Uploads plus a note.",
    includes: ["image.file", "video.file", "audio.file", "note"]
  },
  {
    id: "live",
    label: "Live share",
    description: "Camera, mic, and screen.",
    includes: ["camera.live", "microphone.live", "browser-tab.live"]
  },
  {
    id: "all",
    label: "Everything",
    description: "All supported options on this board.",
    includes: ["image.file", "video.file", "audio.file", "note", "camera.live", "microphone.live", "browser-tab.live"]
  }
];

const BOARD_GRANT_TYPE_LABELS = new Map<SupportedBoardGrantType, string>(
  BOARD_GRANT_TYPE_OPTIONS.map((option) => [option.type, option.label])
);

export function isBoardGrantActive(grant: ClassroomBoardAccessGrant, now = Date.now()) {
  if (grant.status !== "active") return false;
  if (!grant.expiresAt) return true;
  const expiresAt = Date.parse(grant.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function allowedBoardGrantTypesForAnchor(manifest: RoomManifest | null | undefined, anchorId: string): SupportedBoardGrantType[] {
  const anchor = manifest?.wallAnchors.find((candidate) => candidate.id === anchorId);
  if (!anchor) return [];
  const next: SupportedBoardGrantType[] = [];
  if (anchorAcceptsWallObjectType(anchor, "image.file")) next.push("image.file");
  if (anchorAcceptsWallObjectType(anchor, "video.file")) next.push("video.file");
  if (anchorAcceptsWallObjectType(anchor, "audio.file")) next.push("audio.file");
  if (anchorAcceptsWallObjectType(anchor, "note")) next.push("note");
  if (anchorAcceptsWallObjectType(anchor, "camera.live")) next.push("camera.live");
  if (anchorAcceptsWallObjectType(anchor, "microphone.live")) next.push("microphone.live");
  if (anchorAcceptsWallObjectType(anchor, "browser-tab.live") || anchorAcceptsWallObjectType(anchor, "screen.live")) {
    next.push("browser-tab.live");
  }
  return next;
}

export function isSupportedBoardGrantType(type: WallObjectType): type is SupportedBoardGrantType {
  return BOARD_GRANT_TYPE_LABELS.has(type as SupportedBoardGrantType);
}

export function getBoardGrantTypeLabel(type: WallObjectType) {
  return BOARD_GRANT_TYPE_LABELS.get(type as SupportedBoardGrantType) ?? type;
}

export function summarizeBoardGrantTypes(types: readonly WallObjectType[]) {
  const labels = BOARD_GRANT_TYPE_OPTIONS.flatMap((option) => (types.includes(option.type) ? [option.label] : []));
  return labels.length > 0 ? labels.join(", ") : "No share types selected";
}
