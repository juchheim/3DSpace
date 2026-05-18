"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  RoomManifest,
  WallObject,
  WallObjectControlRequestSchema,
  WallObjectType
} from "@3dspace/contracts";
import type { z } from "zod";
import {
  controlWallObject,
  createAttachment,
  createAttachmentDownload,
  createWallObject,
  createWallShare,
  createWebResource,
  endWallShare,
  finalizeAttachment,
  listWallObjects,
  removeWallObject
} from "./api";
import { anchorHasOccupyingWallObject, createInitialPollState, readPollState } from "@3dspace/room-engine";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const ANCHOR_OCCUPIED_ERROR = "This display already has wall content. Remove it before adding something else.";

type PublishWallMessage = (message: RealtimeMessage) => void;

function fileTypeFor(file: File): "image" | "video" | "audio" {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  throw new Error("Choose an image, video, or audio file.");
}

function wallObjectTypeForFile(kind: "image" | "video" | "audio"): "image.file" | "video.file" | "audio.file" {
  if (kind === "image") return "image.file";
  if (kind === "video") return "video.file";
  return "audio.file";
}

function publishUpsert(publish: PublishWallMessage | undefined, roomId: string, object: WallObject, senderId: string) {
  publish?.({
    type: "wall.object.upsert.v1",
    roomId,
    object,
    sentAt: Date.now(),
    senderId
  });
}

function applyPlaybackControl(object: WallObject, control: z.infer<typeof WallObjectControlRequestSchema>): WallObject {
  const previous =
    object.state?.playback && typeof object.state.playback === "object"
      ? (object.state.playback as Record<string, unknown>)
      : {};
  const previousPosition = Number(previous.positionSeconds ?? 0);

  if (control.action === "play" || control.action === "pause") {
    const position =
      control.positionSeconds !== undefined ? control.positionSeconds : previousPosition;
    return {
      ...object,
      state: {
        ...object.state,
        playback: {
          status: control.action === "play" ? "playing" : "paused",
          positionSeconds: position,
          sentAt: Date.now(),
          rate: Number(previous.rate ?? 1),
          muted: Boolean(previous.muted)
        }
      }
    };
  }

  if (control.action === "seek") {
    return {
      ...object,
      state: {
        ...object.state,
        playback: {
          ...previous,
          status: "paused",
          positionSeconds: control.positionSeconds ?? 0,
          sentAt: Date.now()
        }
      }
    };
  }

  return object;
}

function applyPollControl(
  object: WallObject,
  control: z.infer<typeof WallObjectControlRequestSchema>,
  userId: string
): WallObject {
  const pollState = readPollState(object.state);

  if (control.action === "vote" && control.choiceId) {
    return {
      ...object,
      state: {
        ...object.state,
        poll: {
          ...pollState,
          votesByUserId: {
            ...pollState.votesByUserId,
            [userId]: control.choiceId
          }
        }
      }
    };
  }

  if (control.action === "close-poll") {
    return {
      ...object,
      state: {
        ...object.state,
        poll: {
          ...pollState,
          closed: true
        }
      }
    };
  }

  if (control.action === "reopen-poll") {
    return {
      ...object,
      state: {
        ...object.state,
        poll: {
          ...pollState,
          closed: false
        }
      }
    };
  }

  return object;
}

function publishRemove(publish: PublishWallMessage | undefined, roomId: string, objectId: string, senderId: string) {
  publish?.({
    type: "wall.object.remove.v1",
    roomId,
    objectId,
    sentAt: Date.now(),
    senderId
  });
}

export function useWallObjects(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  manifest?: RoomManifest | null | undefined;
  enabled: boolean;
  publish?: PublishWallMessage | undefined;
}) {
  const [objectsById, setObjectsById] = useState<Record<string, WallObject>>({});
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const wallObjects = useMemo(
    () =>
      Object.values(objectsById)
        .filter((object) => object.status !== "removed")
        .sort((a, b) => a.wallAnchorId.localeCompare(b.wallAnchorId) || a.placement.zIndex - b.placement.zIndex || a.createdAt.localeCompare(b.createdAt)),
    [objectsById]
  );

  const assertAnchorAvailable = useCallback(
    (anchorId: string) => {
      if (anchorHasOccupyingWallObject(wallObjects, anchorId)) {
        throw new Error(ANCHOR_OCCUPIED_ERROR);
      }
    },
    [wallObjects]
  );

  const refresh = useCallback(async () => {
    if (!input.enabled || !input.roomId) return;
    setLoading(true);
    setError("");
    try {
      const objects = await listWallObjects(input.identity, input.roomId);
      setObjectsById(Object.fromEntries(objects.map((object) => [object.id, object])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load wall objects.");
    } finally {
      setLoading(false);
    }
  }, [input.enabled, input.roomId, input.identity.userId, input.identity.displayName]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hydrateAssetUrls = useCallback(
    async (objects: WallObject[]) => {
      const roomId = input.roomId;
      if (!roomId) return;
      const pending = objects.filter((object) => object.source.kind === "asset");
      if (pending.length === 0) return;
      const entries = await Promise.all(
        pending.map(async (object) => {
          if (object.source.kind !== "asset") return undefined;
          const response = await createAttachmentDownload(input.identity, roomId, object.source.attachmentId);
          return [object.id, response.download.url] as const;
        })
      );
      setAssetUrls((current) => {
        const next = { ...current };
        let changed = false;
        for (const entry of entries) {
          if (entry && !next[entry[0]]) {
            next[entry[0]] = entry[1];
            changed = true;
          }
        }
        return changed ? next : current;
      });
    },
    [input.identity.userId, input.identity.displayName, input.roomId]
  );

  const assetObjectIds = useMemo(
    () =>
      wallObjects
        .filter((object) => object.source.kind === "asset")
        .map((object) => object.id)
        .join(","),
    [wallObjects]
  );

  useEffect(() => {
    if (!input.roomId || !assetObjectIds) return;
    let cancelled = false;
    void hydrateAssetUrls(wallObjects).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Unable to load wall media.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [assetObjectIds, hydrateAssetUrls, input.roomId, wallObjects]);

  const upsertLocal = useCallback((object: WallObject) => {
    setObjectsById((current) => {
      const existing = current[object.id];
      if (existing && existing.version > object.version) {
        return current;
      }
      // Only guard against same-version stale duplicates; newer API versions must win (e.g. seek reset to 0).
      if (existing?.type === "timer" && object.type === "timer" && existing.version === object.version) {
        const existingPlayback =
          existing.state?.playback && typeof existing.state.playback === "object"
            ? (existing.state.playback as Record<string, unknown>)
            : {};
        const incomingPlayback =
          object.state?.playback && typeof object.state.playback === "object"
            ? (object.state.playback as Record<string, unknown>)
            : {};
        const existingPosition = Number(existingPlayback.positionSeconds ?? 0);
        const incomingPosition = Number(incomingPlayback.positionSeconds ?? 0);
        if (incomingPosition < existingPosition) {
          return {
            ...current,
            [object.id]: {
              ...object,
              state: {
                ...object.state,
                playback: {
                  ...incomingPlayback,
                  positionSeconds: existingPosition,
                  status: incomingPlayback.status ?? existingPlayback.status
                }
              }
            }
          };
        }
      }
      return { ...current, [object.id]: object };
    });
  }, []);

  const createFileObject = useCallback(
    async (options: { anchorId: string; file: File; title: string; altText?: string | undefined; caption?: string | undefined }) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      assertAnchorAvailable(options.anchorId);
      const kind = fileTypeFor(options.file);
      const created = await createAttachment(input.identity, input.roomId, {
        wallAnchorId: options.anchorId,
        kind,
        fileName: options.file.name,
        contentType: options.file.type || "application/octet-stream",
        metadata: {
          sizeBytes: options.file.size,
          altText: options.altText,
          caption: options.caption
        }
      });
      await fetch(created.upload.url, {
        method: created.upload.method,
        headers: created.upload.headers,
        body: options.file
      }).then((response) => {
        if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
      });
      const finalized = await finalizeAttachment(input.identity, input.roomId, created.attachment.id, {
        sizeBytes: options.file.size,
        altText: options.altText,
        caption: options.caption
      });
      const object = await createWallObject(input.identity, input.roomId, {
        wallAnchorId: options.anchorId,
        type: wallObjectTypeForFile(kind),
        title: options.title || options.file.name,
        source: { kind: "asset", attachmentId: finalized.id },
        placement: { x: 0, y: 0, width: 1, height: 1, zIndex: Date.now() % 1000, fit: "contain" },
        state: { loaded: false },
        permissions: {},
        moderation: {},
        status: "active"
      });
      upsertLocal(object);
      publishUpsert(input.publish, input.roomId, object, input.identity.userId);
      const download = await createAttachmentDownload(input.identity, input.roomId, finalized.id);
      setAssetUrls((current) => ({ ...current, [object.id]: download.download.url }));
      return object;
    },
    [assertAnchorAvailable, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const createInlineObject = useCallback(
    async (options: { anchorId: string; type: Extract<WallObjectType, "note" | "timer" | "poll">; title: string; data: Record<string, unknown> }) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      assertAnchorAvailable(options.anchorId);
      const object = await createWallObject(input.identity, input.roomId, {
        wallAnchorId: options.anchorId,
        type: options.type,
        title: options.title,
        source: { kind: "inline", data: options.data },
        placement: { x: 0, y: 0, width: 1, height: 1, zIndex: Date.now() % 1000, fit: "contain" },
        state: options.type === "poll" ? createInitialPollState() : {},
        permissions: {},
        moderation: {},
        status: "active"
      });
      upsertLocal(object);
      publishUpsert(input.publish, input.roomId, object, input.identity.userId);
      return object;
    },
    [assertAnchorAvailable, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const createLinkObject = useCallback(
    async (options: { anchorId: string; url: string; title?: string | undefined; embedMode?: "link" | "iframe" | undefined }) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      assertAnchorAvailable(options.anchorId);
      const request: Parameters<typeof createWebResource>[2] = {
        wallAnchorId: options.anchorId,
        url: options.url,
        embedMode: options.embedMode ?? "link"
      };
      if (options.title !== undefined) request.title = options.title;
      const object = await createWebResource(input.identity, input.roomId, request);
      upsertLocal(object);
      publishUpsert(input.publish, input.roomId, object, input.identity.userId);
      return object;
    },
    [assertAnchorAvailable, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const createLiveShareObject = useCallback(
    async (options: { anchorId: string; type: "camera.live" | "microphone.live" | "screen.live" | "browser-tab.live"; title: string }) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      assertAnchorAvailable(options.anchorId);
      const response = await createWallShare(input.identity, input.roomId, {
        wallAnchorId: options.anchorId,
        type: options.type,
        title: options.title
      });
      upsertLocal(response.object);
      publishUpsert(input.publish, input.roomId, response.object, input.identity.userId);
      return response;
    },
    [assertAnchorAvailable, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const removeObject = useCallback(
    async (objectId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const object = await removeWallObject(input.identity, input.roomId, objectId);
      setObjectsById((current) => {
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      publishRemove(input.publish, input.roomId, objectId, input.identity.userId);
      return object;
    },
    [input.identity, input.publish, input.roomId]
  );

  const controlObject = useCallback(
    async (objectId: string, control: z.infer<typeof WallObjectControlRequestSchema>) => {
      if (!input.roomId) throw new Error("Room is not ready.");

      if (control.action === "play" || control.action === "pause" || control.action === "seek") {
        setObjectsById((current) => {
          const existing = current[objectId];
          if (!existing) return current;
          return { ...current, [objectId]: applyPlaybackControl(existing, control) };
        });
      }

      if (control.action === "vote" || control.action === "close-poll" || control.action === "reopen-poll") {
        setObjectsById((current) => {
          const existing = current[objectId];
          if (!existing) return current;
          return { ...current, [objectId]: applyPollControl(existing, control, input.identity.userId) };
        });
      }

      const object = await controlWallObject(input.identity, input.roomId, objectId, control);
      upsertLocal(object);
      publishUpsert(input.publish, input.roomId, object, input.identity.userId);
      return object;
    },
    [input.identity, input.publish, input.roomId, upsertLocal]
  );

  const endShare = useCallback(
    async (objectId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const object = await endWallShare(input.identity, input.roomId, objectId);
      upsertLocal(object);
      input.publish?.({
        type: "wall.share.ended.v1",
        roomId: input.roomId,
        objectId,
        sentAt: Date.now(),
        senderId: input.identity.userId
      });
      return object;
    },
    [input.identity, input.publish, input.roomId, upsertLocal]
  );

  const handleRealtimeMessage = useCallback(
    (message: RealtimeMessage) => {
      if (!input.roomId || !("type" in message)) return false;
      if (message.type === "wall.object.upsert.v1" && message.roomId === input.roomId) {
        upsertLocal(message.object);
        return true;
      }
      if (message.type === "wall.object.remove.v1" && message.roomId === input.roomId) {
        setObjectsById((current) => {
          const next = { ...current };
          delete next[message.objectId];
          return next;
        });
        return true;
      }
      if (message.type === "wall.playback.state.v1" && message.roomId === input.roomId) {
        setObjectsById((current) => {
          const object = current[message.objectId];
          if (!object) return current;
          return {
            ...current,
            [message.objectId]: {
              ...object,
              state: {
                ...object.state,
                playback: {
                  status: message.status,
                  positionSeconds: message.positionSeconds,
                  sentAt: message.sentAt,
                  rate: message.rate,
                  muted: message.muted,
                  controlledByUserId: message.controlledByUserId
                }
              }
            }
          };
        });
        return true;
      }
      if (message.type === "wall.share.ended.v1" && message.roomId === input.roomId) {
        setObjectsById((current) => {
          const object = current[message.objectId];
          if (!object) return current;
          return {
            ...current,
            [message.objectId]: {
              ...object,
              status: "source_ended",
              state: { ...object.state, live: false }
            }
          };
        });
        return true;
      }
      if (message.type === "wall.moderation.state.v1" && message.roomId === input.roomId) {
        setObjectsById((current) => {
          const object = current[message.objectId];
          if (!object) return current;
          return {
            ...current,
            [message.objectId]: {
              ...object,
              status: message.status
            }
          };
        });
        return true;
      }
      return false;
    },
    [input.roomId, upsertLocal]
  );

  return {
    wallObjects,
    assetUrls,
    loading,
    error,
    setError,
    refresh,
    createFileObject,
    createInlineObject,
    createLinkObject,
    createLiveShareObject,
    removeObject,
    controlObject,
    endShare,
    handleRealtimeMessage
  };
}
