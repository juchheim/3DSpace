import type { WallObjectStatus, WallObjectType } from "@3dspace/contracts";

type WallAnchorLike = {
  metadata: Record<string, unknown>;
};

export type WallAnchorCreateOption =
  | "file"
  | "whiteboard"
  | "note"
  | "timer"
  | "poll"
  | "link"
  | "camera"
  | "microphone"
  | "screen";

function readAnchorAccepts(anchor: WallAnchorLike): string[] {
  const accepts = anchor.metadata.accepts;
  if (!Array.isArray(accepts)) return [];
  return accepts.map(String);
}

export function fileKindForWallObjectType(type: WallObjectType): "image" | "video" | "audio" | undefined {
  if (type === "image.file") return "image";
  if (type === "video.file") return "video";
  if (type === "audio.file") return "audio";
  return undefined;
}

export function baseAcceptedKind(type: WallObjectType): string {
  return fileKindForWallObjectType(type) ?? type.split(".")[0] ?? type;
}

export function anchorAcceptsWallObjectType(anchor: WallAnchorLike, type: WallObjectType): boolean {
  const accepts = readAnchorAccepts(anchor);
  if (accepts.length === 0 || accepts.includes(type) || accepts.includes("future")) return true;
  return accepts.includes(baseAcceptedKind(type));
}

export function anchorSupportsCreateOption(anchor: WallAnchorLike, option: WallAnchorCreateOption): boolean {
  switch (option) {
    case "file":
      return (
        anchorAcceptsWallObjectType(anchor, "image.file") ||
        anchorAcceptsWallObjectType(anchor, "video.file") ||
        anchorAcceptsWallObjectType(anchor, "audio.file")
      );
    case "note":
      return anchorAcceptsWallObjectType(anchor, "note");
    case "whiteboard":
      return anchorAcceptsWallObjectType(anchor, "whiteboard");
    case "timer":
      return anchorAcceptsWallObjectType(anchor, "timer");
    case "poll":
      return anchorAcceptsWallObjectType(anchor, "poll");
    case "link":
      return anchorAcceptsWallObjectType(anchor, "web.link");
    case "camera":
      return anchorAcceptsWallObjectType(anchor, "camera.live");
    case "microphone":
      return anchorAcceptsWallObjectType(anchor, "microphone.live");
    case "screen":
      return anchorAcceptsWallObjectType(anchor, "screen.live") || anchorAcceptsWallObjectType(anchor, "browser-tab.live");
    default:
      return false;
  }
}

const FILE_ACCEPT_BY_KIND: Record<"image" | "video" | "audio", string> = {
  image: "image/png,image/jpeg,image/webp",
  video: "video/mp4,video/webm",
  audio: "audio/mpeg,audio/mp4,audio/wav,audio/webm"
};

export function isOccupyingWallObjectStatus(status: WallObjectStatus): boolean {
  return status !== "removed" && status !== "rejected" && status !== "failed";
}

export function anchorHasOccupyingWallObject(
  objects: ReadonlyArray<{ wallAnchorId: string; status: WallObjectStatus }>,
  wallAnchorId: string
): boolean {
  return objects.some((object) => object.wallAnchorId === wallAnchorId && isOccupyingWallObjectStatus(object.status));
}

export function fileInputAcceptForAnchor(anchor: WallAnchorLike): string {
  const kinds: Array<"image" | "video" | "audio"> = [];
  if (anchorAcceptsWallObjectType(anchor, "image.file")) kinds.push("image");
  if (anchorAcceptsWallObjectType(anchor, "video.file")) kinds.push("video");
  if (anchorAcceptsWallObjectType(anchor, "audio.file")) kinds.push("audio");
  return kinds.map((kind) => FILE_ACCEPT_BY_KIND[kind]).join(",");
}
