"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Pose,
  RoomObject,
  RoomObjectRealtimeMessage,
  RoomObjectTouchPolicy,
  RoomObjectTouchRequestSchema,
  UpdateRoomObjectRequestSchema
} from "@3dspace/contracts";
import type { z } from "zod";
import {
  createRoomObject,
  deleteRoomObject,
  dispatchRoomObjectRealtime,
  listRoomObjects,
  resetRoomObject,
  setRoomObjectTouch,
  updateRoomObject
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

const REFRESH_INTERVAL_MS = 30_000;
const POSE_SEND_INTERVAL_MS = 1000 / 15;
const PARAMETER_SEND_DEBOUNCE_MS = 200;

type PublishRoomObjectMessage = (message: RealtimeMessage) => void;

type GrabState = {
  holderUserId: string;
  expiresAt: string;
};

type OptimisticOverride = {
  pose: Pose;
  scale: number;
};

type UpdateRoomObjectPatch = z.infer<typeof UpdateRoomObjectRequestSchema>;
type SetTouchInput = z.infer<typeof RoomObjectTouchRequestSchema>;

function mergeRoomObject(existing: RoomObject | undefined, incoming: RoomObject) {
  if (!existing) return incoming;
  if (existing.updatedAt > incoming.updatedAt) return existing;
  return incoming;
}

function publishMessages(publish: PublishRoomObjectMessage | undefined, messages: RoomObjectRealtimeMessage[]) {
  for (const message of messages) {
    publish?.(message);
  }
}

export function useRoomObjects(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishRoomObjectMessage | undefined;
}) {
  const [objectsById, setObjectsById] = useState<Record<string, RoomObject>>({});
  const [grabsById, setGrabsById] = useState<Record<string, GrabState>>({});
  const [optimisticOverrides, setOptimisticOverrides] = useState<Record<string, OptimisticOverride>>({});
  const [myActiveGrabObjectId, setMyActiveGrabObjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const parameterTimersRef = useRef(new Map<string, number>());
  const poseSentAtRef = useRef(new Map<string, number>());
  const myActiveGrabRef = useRef<string | null>(null);
  myActiveGrabRef.current = myActiveGrabObjectId;

  const clearLocalGrabState = useCallback((objectId: string) => {
    setGrabsById((current) => {
      if (!(objectId in current)) return current;
      const next = { ...current };
      delete next[objectId];
      return next;
    });
    setOptimisticOverrides((current) => {
      if (!(objectId in current)) return current;
      const next = { ...current };
      delete next[objectId];
      return next;
    });
    setMyActiveGrabObjectId((current) => (current === objectId ? null : current));
  }, []);

  const upsertLocal = useCallback((object: RoomObject) => {
    setObjectsById((current) => {
      const merged = mergeRoomObject(current[object.id], object);
      if (merged === current[object.id]) return current;
      return { ...current, [object.id]: merged };
    });
  }, []);

  const applyRealtimeMessage = useCallback(
    (message: RoomObjectRealtimeMessage) => {
      if (!input.roomId || message.roomId !== input.roomId) return false;

      if (message.type === "room.object.upsert.v1") {
        upsertLocal(message.object);
        clearLocalGrabState(message.object.id);
        return true;
      }

      if (message.type === "room.object.remove.v1") {
        setObjectsById((current) => {
          if (!(message.objectId in current)) return current;
          const next = { ...current };
          delete next[message.objectId];
          return next;
        });
        clearLocalGrabState(message.objectId);
        return true;
      }

      if (message.type === "room.object.touch.v1") {
        setObjectsById((current) => {
          const existing = current[message.objectId];
          if (!existing) return current;
          return {
            ...current,
            [message.objectId]: {
              ...existing,
              touchPolicy: message.touchPolicy,
              grantedUserIds: message.grantedUserIds,
              grantedGroupIds: message.grantedGroupIds
            }
          };
        });
        return true;
      }

      if (message.type === "room.object.grab.v1") {
        setGrabsById((current) => ({
          ...current,
          [message.objectId]: { holderUserId: message.holderUserId, expiresAt: message.expiresAt }
        }));
        if (message.holderUserId === input.identity.userId) {
          setMyActiveGrabObjectId(message.objectId);
        }
        return true;
      }

      if (message.type === "room.object.pose.v1") {
        if (!(myActiveGrabRef.current === message.objectId && message.holderUserId === input.identity.userId)) {
          setObjectsById((current) => {
            const existing = current[message.objectId];
            if (!existing) return current;
            return {
              ...current,
              [message.objectId]: {
                ...existing,
                pose: message.pose,
                scale: message.scale
              }
            };
          });
        }
        return true;
      }

      if (message.type === "room.object.release.v1") {
        setObjectsById((current) => {
          const existing = current[message.objectId];
          if (!existing) return current;
          return {
            ...current,
            [message.objectId]: {
              ...existing,
              pose: message.finalPose,
              scale: message.finalScale
            }
          };
        });
        clearLocalGrabState(message.objectId);
        return true;
      }

      return false;
    },
    [clearLocalGrabState, input.identity.userId, input.roomId, upsertLocal]
  );

  const applyRealtimeMessages = useCallback(
    (messages: RoomObjectRealtimeMessage[]) => {
      for (const message of messages) {
        applyRealtimeMessage(message);
      }
    },
    [applyRealtimeMessage]
  );

  const refresh = useCallback(
    async (options?: { showLoading?: boolean }) => {
      if (!input.enabled || !input.roomId) {
        setObjectsById({});
        setGrabsById({});
        setOptimisticOverrides({});
        setMyActiveGrabObjectId(null);
        setError("");
        setLoading(false);
        return [];
      }

      const showLoading = options?.showLoading ?? true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const objects = await listRoomObjects(input.identity, input.roomId);
        setObjectsById((current) => {
          const next: Record<string, RoomObject> = {};
          for (const object of objects) {
            next[object.id] = mergeRoomObject(current[object.id], object);
          }
          return next;
        });
        return objects;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load room objects.");
        return [];
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [input.enabled, input.identity, input.roomId]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh({ showLoading: false });
    }, REFRESH_INTERVAL_MS);
    const onFocus = () => {
      void refresh({ showLoading: false });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [input.enabled, input.roomId, refresh]);

  useEffect(() => {
    return () => {
      for (const timer of parameterTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      parameterTimersRef.current.clear();
    };
  }, []);

  const instantiate = useCallback(
    async (templateId: string, pose?: Pose) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await createRoomObject(input.identity, input.roomId, { templateId, ...(pose ? { pose } : {}) });
      upsertLocal(result.object);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.object;
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const update = useCallback(
    async (objectId: string, patch: UpdateRoomObjectPatch) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await updateRoomObject(input.identity, input.roomId, objectId, patch);
      upsertLocal(result.object);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.object;
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const remove = useCallback(
    async (objectId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await deleteRoomObject(input.identity, input.roomId, objectId);
      setObjectsById((current) => {
        if (!(objectId in current)) return current;
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      clearLocalGrabState(objectId);
      publishMessages(input.publish, result.realtimeMessages);
    },
    [clearLocalGrabState, input.identity, input.publish, input.roomId]
  );

  const beginGrab = useCallback(
    async (objectId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const messages = await dispatchRoomObjectRealtime(input.identity, input.roomId, {
        type: "room.object.grab.v1",
        objectId
      });
      applyRealtimeMessages(messages);
      const granted = messages.some((message) => message.type === "room.object.grab.v1" && message.holderUserId === input.identity.userId);
      if (granted) {
        publishMessages(input.publish, messages);
      }
      return granted;
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId]
  );

  const publishPose = useCallback(
    (objectId: string, pose: Pose, scale: number) => {
      if (!input.roomId) return;
      setOptimisticOverrides((current) => ({
        ...current,
        [objectId]: { pose, scale }
      }));

      const now = performance.now();
      const lastSentAt = poseSentAtRef.current.get(objectId) ?? 0;
      if (now - lastSentAt < POSE_SEND_INTERVAL_MS) return;
      poseSentAtRef.current.set(objectId, now);

      void dispatchRoomObjectRealtime(input.identity, input.roomId, {
        type: "room.object.pose.v1",
        objectId,
        pose,
        scale
      }).then((messages) => {
        applyRealtimeMessages(messages);
        publishMessages(input.publish, messages);
      }).catch((err) => {
        setError(err instanceof Error ? err.message : "Unable to sync room object pose.");
      });
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId]
  );

  const endGrab = useCallback(
    async (objectId: string, finalPose: Pose, finalScale: number) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const messages = await dispatchRoomObjectRealtime(input.identity, input.roomId, {
        type: "room.object.release.v1",
        objectId,
        finalPose,
        finalScale
      });
      clearLocalGrabState(objectId);
      applyRealtimeMessages(messages);
      publishMessages(input.publish, messages);
    },
    [applyRealtimeMessages, clearLocalGrabState, input.identity, input.publish, input.roomId]
  );

  const setTouch = useCallback(
    async (objectId: string, touchPolicy: RoomObjectTouchPolicy, grants: { userIds?: string[]; groupIds?: string[] } = {}) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await setRoomObjectTouch(input.identity, input.roomId, objectId, {
        touchPolicy,
        userIds: grants.userIds ?? [],
        groupIds: grants.groupIds ?? []
      } satisfies SetTouchInput);
      upsertLocal(result.object);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.object;
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const reset = useCallback(
    async (objectId: string) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      const result = await resetRoomObject(input.identity, input.roomId, objectId);
      upsertLocal(result.object);
      clearLocalGrabState(objectId);
      applyRealtimeMessages(result.realtimeMessages);
      publishMessages(input.publish, result.realtimeMessages);
      return result.object;
    },
    [applyRealtimeMessages, clearLocalGrabState, input.identity, input.publish, input.roomId, upsertLocal]
  );

  const setParameters = useCallback(
    async (objectId: string, parameters: Record<string, unknown>) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setObjectsById((current) => {
        const existing = current[objectId];
        if (!existing) return current;
        return {
          ...current,
          [objectId]: {
            ...existing,
            parameters
          }
        };
      });

      const existingTimer = parameterTimersRef.current.get(objectId);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const timer = window.setTimeout(() => {
        parameterTimersRef.current.delete(objectId);
        void dispatchRoomObjectRealtime(input.identity, input.roomId!, {
          type: "room.object.parameter.v1",
          objectId,
          parameters
        }).then((messages) => {
          applyRealtimeMessages(messages);
          publishMessages(input.publish, messages);
        }).catch((err) => {
          setError(err instanceof Error ? err.message : "Unable to sync room object parameters.");
        });
      }, PARAMETER_SEND_DEBOUNCE_MS);

      parameterTimersRef.current.set(objectId, timer);
    },
    [applyRealtimeMessages, input.identity, input.publish, input.roomId]
  );

  const objects = useMemo(() => {
    return Object.values(objectsById)
      .filter((object) => object.status !== "archived")
      .map((object) => {
        const override = optimisticOverrides[object.id];
        return override ? { ...object, pose: override.pose, scale: override.scale } : object;
      })
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [objectsById, optimisticOverrides]);

  const grabs = useMemo(() => new Map(Object.entries(grabsById)), [grabsById]);

  return {
    objects,
    objectsById,
    grabs,
    myActiveGrab: myActiveGrabObjectId ? { objectId: myActiveGrabObjectId } : null,
    loading,
    error,
    setError,
    refresh,
    handleRealtimeMessage: (message: RealtimeMessage) => {
      if (!("type" in message) || !message.type.startsWith("room.object.")) return false;
      return applyRealtimeMessage(message as RoomObjectRealtimeMessage);
    },
    actions: {
      instantiate,
      update,
      remove,
      beginGrab,
      publishPose,
      endGrab,
      setTouch,
      reset,
      setParameters
    }
  };
}
