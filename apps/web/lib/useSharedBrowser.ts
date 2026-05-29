"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RoomSessionResponse,
  SharedBrowserControlLease,
  SharedBrowserSession,
  SharedBrowserSessionStatus,
  WallObject
} from "@3dspace/contracts";
import {
  getSharedBrowserSession as getSharedBrowserSessionApi,
  navigateSharedBrowser as navigateSharedBrowserApi,
  refreshSharedBrowserEmbed as refreshSharedBrowserEmbedApi,
  resumeSharedBrowser as resumeSharedBrowserApi,
  sharedBrowserControlLease as sharedBrowserControlLeaseApi,
  sharedBrowserHistory as sharedBrowserHistoryApi
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

export type SharedBrowserBoardState = {
  loading: boolean;
  error: string;
  session: SharedBrowserSession | null;
  currentUrl: string;
  title: string;
  status: SharedBrowserSessionStatus;
  controlLease: SharedBrowserControlLease | null;
};

export type SharedBrowserController = {
  boards: Record<string, SharedBrowserBoardState>;
  getBoard(objectId: string): SharedBrowserBoardState;
  navigate(objectId: string, url: string): Promise<void>;
  history(objectId: string, action: "back" | "forward" | "refresh"): Promise<void>;
  controlLease(objectId: string, action: "take" | "release" | "renew"): Promise<void>;
  resume(objectId: string): Promise<void>;
  refreshEmbed(objectId: string): Promise<void>;
  handleRealtimeMessage(message: RealtimeMessage): boolean;
};

const EMPTY_BOARD: SharedBrowserBoardState = {
  loading: false,
  error: "",
  session: null,
  currentUrl: "",
  title: "",
  status: "starting",
  controlLease: null
};

function fromSession(session: SharedBrowserSession): Partial<SharedBrowserBoardState> {
  return {
    session,
    currentUrl: session.currentUrl,
    title: session.title,
    status: session.status,
    controlLease: session.controlLease ?? null,
    error: session.status === "error" ? (session.errorMessage ?? "Shared browser is unavailable.") : ""
  };
}

export function useSharedBrowser(input: {
  identity: ApiIdentity;
  roomId?: string | undefined;
  session?: RoomSessionResponse | null | undefined;
  wallObjects: WallObject[];
  enabled: boolean;
  publish?: ((message: RealtimeMessage) => void) | undefined;
}) {
  const [boards, setBoards] = useState<Record<string, SharedBrowserBoardState>>({});
  const startedHydrationRef = useRef(new Set<string>());
  const publishRef = useRef(input.publish);
  publishRef.current = input.publish;

  const browserObjects = useMemo(
    () => input.wallObjects.filter((object) => object.type === "web.browser.shared" && object.status !== "removed"),
    [input.wallObjects]
  );

  const patchBoard = useCallback((objectId: string, patch: Partial<SharedBrowserBoardState>) => {
    setBoards((current) => ({
      ...current,
      [objectId]: { ...(current[objectId] ?? EMPTY_BOARD), ...patch }
    }));
  }, []);

  const publishMessages = useCallback((messages: RealtimeMessage[]) => {
    for (const message of messages) publishRef.current?.(message);
  }, []);

  const hydrateBoard = useCallback(async (object: WallObject) => {
    if (!input.enabled || !input.roomId) return;
    patchBoard(object.id, { loading: true, error: "" });
    try {
      const result = await getSharedBrowserSessionApi(input.identity, input.roomId, object.id);
      patchBoard(object.id, { loading: false, error: "", ...fromSession(result.session) });
    } catch (error) {
      patchBoard(object.id, {
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load shared browser."
      });
    }
  }, [input.enabled, input.identity, input.roomId, patchBoard]);

  useEffect(() => {
    if (!input.enabled) {
      setBoards({});
      startedHydrationRef.current.clear();
      return;
    }
    const ids = new Set(browserObjects.map((object) => object.id));
    setBoards((current) => {
      let changed = false;
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (!ids.has(key)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
    for (const id of [...startedHydrationRef.current]) {
      if (!ids.has(id)) startedHydrationRef.current.delete(id);
    }
    for (const object of browserObjects) {
      if (startedHydrationRef.current.has(object.id)) continue;
      startedHydrationRef.current.add(object.id);
      void hydrateBoard(object);
    }
  }, [browserObjects, hydrateBoard, input.enabled]);

  const getBoard = useCallback((objectId: string) => boards[objectId] ?? EMPTY_BOARD, [boards]);

  const navigate = useCallback(async (objectId: string, url: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    patchBoard(objectId, { error: "" });
    try {
      const result = await navigateSharedBrowserApi(input.identity, input.roomId, objectId, url);
      publishMessages(result.realtimeMessages);
      patchBoard(objectId, fromSession(result.session));
    } catch (error) {
      patchBoard(objectId, { error: error instanceof Error ? error.message : "Unable to navigate." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  const history = useCallback(async (objectId: string, action: "back" | "forward" | "refresh") => {
    if (!input.roomId) throw new Error("Room is not ready.");
    try {
      const result = await sharedBrowserHistoryApi(input.identity, input.roomId, objectId, action);
      publishMessages(result.realtimeMessages);
      patchBoard(objectId, fromSession(result.session));
    } catch (error) {
      patchBoard(objectId, { error: error instanceof Error ? error.message : "Unable to update history." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  const controlLease = useCallback(async (objectId: string, action: "take" | "release" | "renew") => {
    if (!input.roomId) throw new Error("Room is not ready.");
    try {
      const result = await sharedBrowserControlLeaseApi(input.identity, input.roomId, objectId, action);
      publishMessages(result.realtimeMessages);
      patchBoard(objectId, fromSession(result.session));
    } catch (error) {
      patchBoard(objectId, { error: error instanceof Error ? error.message : "Unable to update control." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  const resume = useCallback(async (objectId: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    try {
      const result = await resumeSharedBrowserApi(input.identity, input.roomId, objectId);
      publishMessages(result.realtimeMessages);
      patchBoard(objectId, { loading: false, ...fromSession(result.session) });
    } catch (error) {
      patchBoard(objectId, { loading: false, error: error instanceof Error ? error.message : "Unable to resume." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  const refreshEmbed = useCallback(async (objectId: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    try {
      const result = await refreshSharedBrowserEmbedApi(input.identity, input.roomId, objectId);
      patchBoard(objectId, fromSession(result.session));
    } catch (error) {
      patchBoard(objectId, { error: error instanceof Error ? error.message : "Unable to refresh embed." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage) => {
    if (!input.roomId) return false;
    if (!message.type.startsWith("room.shared-browser.")) return false;
    if (!("roomId" in message) || message.roomId !== input.roomId) return false;

    if (message.type === "room.shared-browser.state.v1") {
      patchBoard(message.wallObjectId, {
        currentUrl: message.currentUrl,
        title: message.title,
        status: message.status,
        ...(message.controlLease !== undefined ? { controlLease: message.controlLease } : {})
      });
      return true;
    }

    if (message.type === "room.shared-browser.session.v1") {
      patchBoard(message.wallObjectId, { status: message.status });
      return true;
    }

    if (message.type === "room.shared-browser.navigate.v1") {
      patchBoard(message.wallObjectId, { currentUrl: message.url });
      return true;
    }

    if (message.type === "room.shared-browser.control-lease.v1") {
      patchBoard(message.wallObjectId, { controlLease: message.controlLease });
      return true;
    }

    if (message.type === "room.shared-browser.history.v1" || message.type === "room.shared-browser.pointer.v1") {
      return true;
    }

    return false;
  }, [input.roomId, patchBoard]);

  return {
    boards,
    getBoard,
    navigate,
    history,
    controlLease,
    resume,
    refreshEmbed,
    handleRealtimeMessage
  } satisfies SharedBrowserController;
}
