import type {
  CommitWhiteboardStrokeRequestSchema,
  WallObject,
  WhiteboardPoint,
  WhiteboardStroke,
  WhiteboardTool,
  WhiteboardWallObjectState
} from "@3dspace/contracts";
import { WhiteboardWallObjectStateSchema } from "@3dspace/contracts";
import type { z } from "zod";
import { badRequest } from "../errors.js";

export type CommitWhiteboardStrokeRequest = z.infer<typeof CommitWhiteboardStrokeRequestSchema>;

const SHAPE_TOOLS = new Set<WhiteboardTool>(["line", "rectangle", "ellipse", "arrow"]);
const FREEHAND_TOOLS = new Set<WhiteboardTool>(["pen", "highlighter", "eraser"]);

export function readWhiteboardState(object: Pick<WallObject, "state"> | { state?: Record<string, unknown> | undefined }): WhiteboardWallObjectState {
  return WhiteboardWallObjectStateSchema.parse(object.state ?? {});
}

export function validateWhiteboardStrokeInput(
  input: CommitWhiteboardStrokeRequest,
  limits: { maxPointsPerStroke: number }
) {
  if (input.points.length > limits.maxPointsPerStroke) {
    throw badRequest(`Whiteboard stroke exceeds ${limits.maxPointsPerStroke} points`);
  }

  if (FREEHAND_TOOLS.has(input.tool)) {
    if (input.text) throw badRequest("Text payload is only valid for text strokes");
    return;
  }

  if (SHAPE_TOOLS.has(input.tool)) {
    if (input.points.length !== 2) {
      throw badRequest(`${input.tool} whiteboard strokes require exactly two points`);
    }
    if (input.text) throw badRequest("Text payload is only valid for text strokes");
    return;
  }

  if (input.tool === "text") {
    if (input.points.length !== 1) throw badRequest("Text whiteboard strokes require exactly one anchor point");
    if (!input.text?.value.trim()) throw badRequest("Text whiteboard strokes require text content");
    return;
  }

  throw badRequest("Unsupported whiteboard tool");
}

export function whiteboardPointBounds(points: WhiteboardPoint[]) {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { minX, minY, maxX, maxY };
}

export function normalizedWhiteboardStateUpdate(input: {
  object: WallObject;
  strokeCount: number;
  clearVersion?: number;
  snapshot?: { storageKey: string; snapshotZ: number } | null;
  resetSnapshot?: boolean;
  now: string;
}): Record<string, unknown> {
  const current = readWhiteboardState(input.object);
  return {
    ...input.object.state,
    strokeCount: input.strokeCount,
    lastUpdatedAt: input.now,
    clearVersion: input.clearVersion ?? current.clearVersion,
    ...(input.snapshot
      ? {
          snapshotKey: input.snapshot.storageKey,
          snapshotZ: input.snapshot.snapshotZ
        }
      : input.resetSnapshot || input.clearVersion !== undefined
        ? {
            snapshotKey: undefined,
            snapshotZ: undefined
          }
        : {})
  };
}

export function stampedWhiteboardStroke(input: {
  roomId: string;
  wallObjectId: string;
  authorUserId: string;
  z: number;
  createdAt: string;
  clearVersion: number;
  stroke: CommitWhiteboardStrokeRequest;
}): WhiteboardStroke {
  return {
    id: input.stroke.id,
    roomId: input.roomId,
    wallObjectId: input.wallObjectId,
    authorUserId: input.authorUserId,
    tool: input.stroke.tool,
    color: input.stroke.color,
    thickness: input.stroke.thickness,
    points: input.stroke.points,
    ...(input.stroke.text ? { text: input.stroke.text } : {}),
    z: input.z,
    clearVersion: input.clearVersion,
    createdAt: input.createdAt
  };
}
