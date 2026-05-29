"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RoomSessionResponse,
  SharedBrowserControlLease,
  SharedBrowserKeyEvent,
  SharedBrowserPointerEvent,
  SharedBrowserSession,
  SharedBrowserSessionStatus,
  WallObject
} from "@3dspace/contracts";
import {
  getSharedBrowserSession as getSharedBrowserSessionApi,
  navigateSharedBrowser as navigateSharedBrowserApi,
  resumeSharedBrowser as resumeSharedBrowserApi,
  sendSharedBrowserInput as sendSharedBrowserInputApi,
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
  queuePointer(objectId: string, event: SharedBrowserPointerEvent): void;
  queueKey(objectId: string, event: SharedBrowserKeyEvent): void;
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
      return;
    }
    const ids = new Set(browserObjects.map((object) => object.id));
    setBoards((current) => {
      const next = { ...current };
      for (const key of Object.keys(next)) {
        if (!ids.has(key)) delete next[key];
      }
      return next;
    });
    for (const object of browserObjects) {
      if (!boards[object.id]) void hydrateBoard(object);
    }
  }, [boards, browserObjects, hydrateBoard, input.enabled]);

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
      patchBoard(objectId, fromSession(result.session));
    } catch (error) {
      patchBoard(objectId, { error: error instanceof Error ? error.message : "Unable to resume." });
      throw error;
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  // Batch pointer/keyboard input and flush on a throttled cadence so a drag (or
  // even idle hover) does not fire one request per mousemove. We coalesce queued
  // events and POST at most once per MIN_FLUSH_INTERVAL_MS (~16 Hz), which keeps
  // the realtime endpoint from being saturated while staying responsive.
  const queueRef = useRef<Record<string, { pointer: SharedBrowserPointerEvent[]; keyboard: SharedBrowserKeyEvent[] }>>({});
  const frameRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastFlushRef = useRef(0);
  const MIN_FLUSH_INTERVAL_MS = 60;

  const flushInput = useCallback(() => {
    frameRef.current = null;
    timerRef.current = null;
    lastFlushRef.current = Date.now();
    if (!input.roomId) {
      queueRef.current = {};
      return;
    }
    const pending = queueRef.current;
    queueRef.current = {};
    for (const [objectId, batch] of Object.entries(pending)) {
      if (batch.pointer.length === 0 && batch.keyboard.length === 0) continue;
      void sendSharedBrowserInputApi(input.identity, input.roomId, objectId, batch)
        .then((result) => {
          publishMessages(result.realtimeMessages);
          if (result.session) patchBoard(objectId, fromSession(result.session));
        })
        .catch(() => undefined);
    }
  }, [input.identity, input.roomId, patchBoard, publishMessages]);

  const scheduleFlush = useCallback(() => {
    if (typeof window === "undefined") return;
    if (frameRef.current !== null || timerRef.current !== null) return;
    const elapsed = Date.now() - lastFlushRef.current;
    if (elapsed >= MIN_FLUSH_INTERVAL_MS) {
      frameRef.current = window.requestAnimationFrame(flushInput);
    } else {
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        frameRef.current = window.requestAnimationFrame(flushInput);
      }, MIN_FLUSH_INTERVAL_MS - elapsed);
    }
  }, [flushInput]);

  const queuePointer = useCallback((objectId: string, event: SharedBrowserPointerEvent) => {
    const batch = queueRef.current[objectId] ?? { pointer: [], keyboard: [] };
    batch.pointer.push(event);
    queueRef.current[objectId] = batch;
    scheduleFlush();
  }, [scheduleFlush]);

  const queueKey = useCallback((objectId: string, event: SharedBrowserKeyEvent) => {
    const batch = queueRef.current[objectId] ?? { pointer: [], keyboard: [] };
    batch.keyboard.push(event);
    queueRef.current[objectId] = batch;
    scheduleFlush();
  }, [scheduleFlush]);

  useEffect(() => () => {
    if (typeof window === "undefined") return;
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

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

    // history + pointer carry no durable state for the board; they are consumed
    // by the live view (Phase 5/6) but acknowledged here so they stop dispatch.
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
    queuePointer,
    queueKey,
    handleRealtimeMessage
  } satisfies SharedBrowserController;
}
