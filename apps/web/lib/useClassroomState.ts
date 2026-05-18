"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ClassroomAction, ClassroomState } from "@3dspace/contracts";
import { getClassroomState, runClassroomAction } from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

type PublishClassroomMessage = (message: RealtimeMessage) => void;

function sortRequests(state: ClassroomState) {
  return {
    ...state,
    helpRequests: [...state.helpRequests].sort((left, right) => {
      const leftPriority = left.status === "raised" ? 0 : left.status === "acknowledged" ? 1 : 2;
      const rightPriority = right.status === "raised" ? 0 : right.status === "acknowledged" ? 1 : 2;
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
  };
}

export function useClassroomState(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  enabled: boolean;
  publish?: PublishClassroomMessage | undefined;
}) {
  const [state, setState] = useState<ClassroomState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const versionRef = useRef<number>(0);

  const applyState = useCallback((next: ClassroomState) => {
    const sorted = sortRequests(next);
    versionRef.current = sorted.version;
    setState(sorted);
  }, []);

  const refresh = useCallback(async () => {
    if (!input.enabled || !input.roomId) return null;
    setLoading(true);
    setError("");
    try {
      const next = await getClassroomState(input.identity, input.roomId);
      applyState(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load classroom state.");
      return null;
    } finally {
      setLoading(false);
    }
  }, [applyState, input.enabled, input.identity, input.roomId]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) {
      setState(null);
      setError("");
      setLoading(false);
      versionRef.current = 0;
      return;
    }
    void refresh();
  }, [input.enabled, input.roomId, refresh]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [input.enabled, input.roomId, refresh]);

  const runAction = useCallback(
    async (action: ClassroomAction) => {
      if (!input.roomId) throw new Error("Room is not ready.");
      setError("");
      try {
        const next = await runClassroomAction(input.identity, input.roomId, action);
        applyState(next);
        input.publish?.({
          type: "classroom.state.changed.v1",
          roomId: input.roomId,
          version: next.version,
          sentAt: Date.now(),
          senderId: input.identity.userId
        });
        return next;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to update classroom state.";
        setError(message);
        throw err;
      }
    },
    [applyState, input.identity, input.publish, input.roomId]
  );

  const handleRealtimeMessage = useCallback(
    (message: RealtimeMessage) => {
      if (!input.roomId) return false;
      if (message.type === "classroom.state.changed.v1" && message.roomId === input.roomId) {
        if (message.version > versionRef.current) {
          void refresh();
        }
        return true;
      }
      if (message.type === "classroom.state.v1" && message.roomId === input.roomId) {
        if (message.state.version >= versionRef.current) {
          applyState(message.state);
        }
        return true;
      }
      return false;
    },
    [applyState, input.roomId, refresh]
  );

  const activeHelpRequest = useMemo(
    () => state?.helpRequests.find((request) => request.status === "raised" || request.status === "acknowledged") ?? null,
    [state]
  );

  return {
    state,
    loading,
    error,
    refresh,
    runAction,
    handleRealtimeMessage,
    activeHelpRequest
  };
}
