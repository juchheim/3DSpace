"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CommitWhiteboardStrokeRequestSchema,
  RoomSessionResponse,
  WallObject,
  WhiteboardPoint,
  WhiteboardRealtimeMessage,
  WhiteboardStroke
} from "@3dspace/contracts";
import type { z } from "zod";
import {
  clearWhiteboard as clearWhiteboardApi,
  commitWhiteboardStroke as commitWhiteboardStrokeApi,
  eraseWhiteboardStrokes as eraseWhiteboardStrokesApi,
  listWhiteboardStrokes as listWhiteboardStrokesApi,
  requestWhiteboardSnapshot as requestWhiteboardSnapshotApi
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

type CommitStrokeInput = z.infer<typeof CommitWhiteboardStrokeRequestSchema>;

type InProgressRemoteStroke = {
  strokeId: string;
  authorUserId: string;
  tool: WhiteboardStroke["tool"];
  color: string;
  thickness: number;
  points: WhiteboardPoint[];
  text?: WhiteboardStroke["text"];
  updatedAt: number;
};

type RemoteCursorState = {
  authorUserId: string;
  x: number;
  y: number;
  visible: boolean;
  updatedAt: number;
};

export type WhiteboardBoardState = {
  loading: boolean;
  error: string;
  strokes: WhiteboardStroke[];
  inProgressRemote: Record<string, InProgressRemoteStroke>;
  remoteCursors: Record<string, RemoteCursorState>;
  clearVersion: number;
  strokeCount: number;
};

export type WhiteboardController = {
  boards: Record<string, WhiteboardBoardState>;
  getBoard(objectId: string): WhiteboardBoardState;
  commitStroke(objectId: string, stroke: CommitStrokeInput): Promise<WhiteboardStroke>;
  eraseStrokes(objectId: string, strokeIds: string[]): Promise<string[]>;
  clear(objectId: string): Promise<void>;
  requestSnapshot(objectId: string): Promise<void>;
  publishStrokeDelta(objectId: string, message: Omit<Extract<WhiteboardRealtimeMessage, { type: "room.whiteboard.stroke-delta.v1" }>, "roomId">): void;
  publishCursor(objectId: string, message: Omit<Extract<WhiteboardRealtimeMessage, { type: "room.whiteboard.cursor.v1" }>, "roomId">): void;
  handleRealtimeMessage(message: RealtimeMessage): boolean;
};

const EMPTY_BOARD: WhiteboardBoardState = {
  loading: false,
  error: "",
  strokes: [],
  inProgressRemote: {},
  remoteCursors: {},
  clearVersion: 0,
  strokeCount: 0
};

function sortStrokes(strokes: WhiteboardStroke[]) {
  return [...strokes].sort((a, b) => a.z - b.z || a.createdAt.localeCompare(b.createdAt));
}

function mergeStrokes(strokes: WhiteboardStroke[]) {
  const next = new Map<string, WhiteboardStroke>();
  for (const stroke of strokes) next.set(stroke.id, stroke);
  return sortStrokes([...next.values()]);
}

async function loadSnapshotStrokes(snapshotDownloadUrl: string | null): Promise<WhiteboardStroke[]> {
  if (!snapshotDownloadUrl) return [];
  const response = await fetch(snapshotDownloadUrl);
  if (!response.ok) throw new Error(`Snapshot download failed with ${response.status}`);
  const payload = await response.json();
  const strokes = Array.isArray(payload) ? payload : Array.isArray(payload?.strokes) ? payload.strokes : [];
  return strokes as WhiteboardStroke[];
}

function pruneEphemeral(board: WhiteboardBoardState): WhiteboardBoardState {
  const now = Date.now();
  const remoteCursors = Object.fromEntries(
    Object.entries(board.remoteCursors).filter(([, cursor]) => now - cursor.updatedAt < 1_500)
  );
  const inProgressRemote = Object.fromEntries(
    Object.entries(board.inProgressRemote).filter(([, stroke]) => now - stroke.updatedAt < 5_000)
  );
  if (
    Object.keys(remoteCursors).length === Object.keys(board.remoteCursors).length &&
    Object.keys(inProgressRemote).length === Object.keys(board.inProgressRemote).length
  ) {
    return board;
  }
  return {
    ...board,
    remoteCursors,
    inProgressRemote
  };
}

export function useWhiteboards(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  session?: RoomSessionResponse | null | undefined;
  wallObjects: WallObject[];
  enabled: boolean;
  publish?: ((message: RealtimeMessage) => void) | undefined;
}) {
  const [boards, setBoards] = useState<Record<string, WhiteboardBoardState>>({});
  const startedHydrationRef = useRef(new Set<string>());

  const whiteboardObjects = useMemo(
    () => input.wallObjects.filter((object) => object.type === "whiteboard" && object.status !== "removed"),
    [input.wallObjects]
  );

  const hydrateBoard = useCallback(async (object: WallObject) => {
    if (!input.enabled || !input.roomId) return;
    setBoards((current) => ({
      ...current,
      [object.id]: {
        ...(current[object.id] ?? EMPTY_BOARD),
        loading: true,
        error: ""
      }
    }));
    try {
      const payload = await listWhiteboardStrokesApi(input.identity, input.roomId, object.id);
      const snapshotStrokes = await loadSnapshotStrokes(payload.snapshotDownloadUrl);
      const strokes = mergeStrokes([...snapshotStrokes, ...payload.strokes]);
      setBoards((current) => ({
        ...current,
        [object.id]: {
          ...(current[object.id] ?? EMPTY_BOARD),
          loading: false,
          error: "",
          strokes,
          clearVersion: payload.clearVersion,
          strokeCount: payload.strokeCount
        }
      }));
    } catch (error) {
      setBoards((current) => ({
        ...current,
        [object.id]: {
          ...(current[object.id] ?? EMPTY_BOARD),
          loading: false,
          error: error instanceof Error ? error.message : "Unable to load whiteboard."
        }
      }));
    }
  }, [input.enabled, input.identity, input.roomId]);

  useEffect(() => {
    if (!input.enabled) {
      setBoards({});
      startedHydrationRef.current.clear();
      return;
    }
    const whiteboardIds = new Set(whiteboardObjects.map((object) => object.id));
    setBoards((current) => {
      let changed = false;
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (!whiteboardIds.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    for (const id of [...startedHydrationRef.current]) {
      if (!whiteboardIds.has(id)) startedHydrationRef.current.delete(id);
    }
    for (const object of whiteboardObjects) {
      if (startedHydrationRef.current.has(object.id)) continue;
      startedHydrationRef.current.add(object.id);
      void hydrateBoard(object);
    }
  }, [hydrateBoard, input.enabled, whiteboardObjects]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBoards((current) => {
        let changed = false;
        const next: Record<string, WhiteboardBoardState> = {};
        for (const [objectId, board] of Object.entries(current)) {
          const pruned = pruneEphemeral(board);
          if (pruned !== board) changed = true;
          next[objectId] = pruned;
        }
        return changed ? next : current;
      });
    }, 400);
    return () => window.clearInterval(timer);
  }, []);

  const getBoard = useCallback((objectId: string) => boards[objectId] ?? EMPTY_BOARD, [boards]);

  const commitStroke = useCallback(async (objectId: string, stroke: CommitStrokeInput) => {
    const roomId = input.roomId;
    if (!roomId) throw new Error("Room is not ready.");
    const object = whiteboardObjects.find((candidate) => candidate.id === objectId);
    if (!object) throw new Error("Whiteboard not found.");
    let optimistic!: WhiteboardStroke;
    setBoards((current) => {
      const board = current[objectId] ?? EMPTY_BOARD;
      optimistic = {
        id: stroke.id,
        roomId,
        wallObjectId: objectId,
        authorUserId: input.identity.userId,
        tool: stroke.tool,
        color: stroke.color,
        thickness: stroke.thickness,
        points: stroke.points,
        ...(stroke.text ? { text: stroke.text } : {}),
        z: (board.strokes.at(-1)?.z ?? -1) + 1,
        clearVersion: stroke.clearVersion,
        createdAt: new Date().toISOString()
      };
      return {
        ...current,
        [objectId]: {
          ...board,
          error: "",
          strokes: mergeStrokes([...board.strokes, optimistic]),
          strokeCount: board.strokeCount + 1
        }
      };
    });
    try {
      const result = await commitWhiteboardStrokeApi(input.identity, roomId, objectId, stroke);
      for (const message of result.realtimeMessages) input.publish?.(message);
      setBoards((current) => {
        const board = current[objectId] ?? EMPTY_BOARD;
        const strokes = mergeStrokes([...board.strokes.filter((entry) => entry.id !== stroke.id), result.stroke]);
        return {
          ...current,
          [objectId]: {
            ...board,
            strokes,
            clearVersion: result.stroke.clearVersion,
            strokeCount: strokes.length
          }
        };
      });
      return result.stroke;
    } catch (error) {
      setBoards((current) => {
        const board = current[objectId] ?? EMPTY_BOARD;
        return {
          ...current,
          [objectId]: {
            ...board,
            strokes: board.strokes.filter((entry) => entry.id !== stroke.id),
            strokeCount: Math.max(0, board.strokeCount - 1),
            error: error instanceof Error ? error.message : "Unable to commit stroke."
          }
        };
      });
      throw error;
    }
  }, [input.identity, input.publish, input.roomId, whiteboardObjects]);

  const eraseStrokes = useCallback(async (objectId: string, strokeIds: string[]) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    let previous: WhiteboardStroke[] = [];
    setBoards((current) => {
      const board = current[objectId] ?? EMPTY_BOARD;
      previous = board.strokes;
      return {
        ...current,
        [objectId]: {
          ...board,
          error: "",
          strokes: board.strokes.filter((stroke) => !strokeIds.includes(stroke.id)),
          strokeCount: Math.max(0, board.strokeCount - strokeIds.length)
        }
      };
    });
    try {
      const result = await eraseWhiteboardStrokesApi(input.identity, input.roomId, objectId, strokeIds);
      for (const message of result.realtimeMessages) input.publish?.(message);
      return result.erasedIds;
    } catch (error) {
      setBoards((current) => ({
        ...current,
        [objectId]: {
          ...(current[objectId] ?? EMPTY_BOARD),
          strokes: previous,
          strokeCount: previous.length,
          error: error instanceof Error ? error.message : "Unable to erase strokes."
        }
      }));
      throw error;
    }
  }, [input.identity, input.publish, input.roomId]);

  const clear = useCallback(async (objectId: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    let previous = EMPTY_BOARD;
    setBoards((current) => {
      previous = current[objectId] ?? EMPTY_BOARD;
      return {
        ...current,
        [objectId]: {
          ...(current[objectId] ?? EMPTY_BOARD),
          error: "",
          strokes: [],
          inProgressRemote: {},
          strokeCount: 0
        }
      };
    });
    try {
      const result = await clearWhiteboardApi(input.identity, input.roomId, objectId);
      for (const message of result.realtimeMessages) input.publish?.(message);
      setBoards((current) => ({
        ...current,
        [objectId]: {
          ...(current[objectId] ?? EMPTY_BOARD),
          clearVersion: result.clearVersion,
          strokes: [],
          inProgressRemote: {},
          strokeCount: 0
        }
      }));
    } catch (error) {
      setBoards((current) => ({
        ...current,
        [objectId]: {
          ...previous,
          error: error instanceof Error ? error.message : "Unable to clear whiteboard."
        }
      }));
      throw error;
    }
  }, [input.identity, input.publish, input.roomId]);

  const requestSnapshot = useCallback(async (objectId: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    const result = await requestWhiteboardSnapshotApi(input.identity, input.roomId, objectId);
    for (const message of result.realtimeMessages) input.publish?.(message);
  }, [input.identity, input.publish, input.roomId]);

  const publishStrokeDelta = useCallback<WhiteboardController["publishStrokeDelta"]>((objectId, message) => {
    if (!input.roomId) return;
    input.publish?.({ ...message, roomId: input.roomId });
  }, [input.publish, input.roomId]);

  const publishCursor = useCallback<WhiteboardController["publishCursor"]>((objectId, message) => {
    if (!input.roomId) return;
    input.publish?.({ ...message, roomId: input.roomId });
  }, [input.publish, input.roomId]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage) => {
    if (!input.roomId) return false;
    if (!message.type.startsWith("room.whiteboard.")) return false;
    if (!("roomId" in message) || message.roomId !== input.roomId) return false;

      if (message.type === "room.whiteboard.stroke-commit.v1") {
        setBoards((current) => {
          const board = current[message.wallObjectId] ?? EMPTY_BOARD;
          const nextPreview = { ...board.inProgressRemote };
          delete nextPreview[message.stroke.id];
          const strokes = mergeStrokes([...board.strokes.filter((stroke) => stroke.id !== message.stroke.id), message.stroke]);
          return {
            ...current,
            [message.wallObjectId]: {
              ...board,
              strokes,
              inProgressRemote: nextPreview,
              clearVersion: message.stroke.clearVersion,
              strokeCount: strokes.length
            }
          };
        });
        return true;
      }

      if (message.type === "room.whiteboard.stroke-erase.v1") {
        setBoards((current) => {
          const board = current[message.wallObjectId] ?? EMPTY_BOARD;
          const strokes = board.strokes.filter((stroke) => !message.strokeIds.includes(stroke.id));
          return {
            ...current,
            [message.wallObjectId]: {
              ...board,
              strokes,
              strokeCount: strokes.length
            }
          };
        });
      return true;
    }

    if (message.type === "room.whiteboard.cleared.v1") {
      setBoards((current) => ({
        ...current,
        [message.wallObjectId]: {
          ...(current[message.wallObjectId] ?? EMPTY_BOARD),
          strokes: [],
          inProgressRemote: {},
          clearVersion: message.clearVersion,
          strokeCount: 0
        }
      }));
      return true;
    }

    if (message.type === "room.whiteboard.stroke-delta.v1") {
      setBoards((current) => {
        const board = current[message.wallObjectId] ?? EMPTY_BOARD;
        const existing = board.inProgressRemote[message.strokeId];
        return {
          ...current,
          [message.wallObjectId]: {
            ...board,
            inProgressRemote: {
              ...board.inProgressRemote,
              [message.strokeId]: {
                strokeId: message.strokeId,
                authorUserId: message.authorUserId,
                tool: message.tool,
                color: message.color,
                thickness: message.thickness,
                points: [...(existing?.points ?? []), ...message.deltaPoints],
                ...(message.text ? { text: message.text } : {}),
                updatedAt: Date.now()
              }
            }
          }
        };
      });
      return true;
    }

    if (message.type === "room.whiteboard.cursor.v1") {
      setBoards((current) => {
        const board = current[message.wallObjectId] ?? EMPTY_BOARD;
        return {
          ...current,
          [message.wallObjectId]: {
            ...board,
            remoteCursors: {
              ...board.remoteCursors,
              [message.authorUserId]: {
                authorUserId: message.authorUserId,
                x: message.x,
                y: message.y,
                visible: message.visible,
                updatedAt: Date.now()
              }
            }
          }
        };
      });
      return true;
    }

    if (message.type === "room.whiteboard.snapshot-ready.v1") {
      return true;
    }

    return false;
  }, [input.roomId]);

  return {
    boards,
    getBoard,
    commitStroke,
    eraseStrokes,
    clear,
    requestSnapshot,
    publishStrokeDelta,
    publishCursor,
    handleRealtimeMessage
  } satisfies WhiteboardController;
}
