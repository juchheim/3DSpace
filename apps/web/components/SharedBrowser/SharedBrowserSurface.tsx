"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from "react";
import type { SharedBrowserKeyEvent, SharedBrowserPointerEvent, WallObject } from "@3dspace/contracts";
import type { ApiIdentity } from "../../lib/identity";
import type { SharedBrowserBoardState, SharedBrowserController } from "../../lib/useSharedBrowser";
import { useSharedBrowserVideo } from "./useSharedBrowserVideo";

function StreamVideo({ stream, className }: { stream: MediaStream; className?: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline muted className={className} />;
}

function activeLeaseUserId(board: SharedBrowserBoardState) {
  const lease = board.controlLease;
  if (!lease) return null;
  const expiresAt = Date.parse(lease.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return null;
  return lease.userId;
}

function normalizeUrl(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function pointerButton(button: number): "left" | "middle" | "right" {
  if (button === 1) return "middle";
  if (button === 2) return "right";
  return "left";
}

function normalizedPoint(event: ReactPointerEvent | ReactWheelEvent, element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const x = rect.width > 0 ? Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1) : 0.5;
  const y = rect.height > 0 ? Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) : 0.5;
  return { x, y };
}

function mapKey(key: string) {
  switch (key) {
    case " ":
      return "Space";
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
    case "Backspace":
    case "Delete":
    case "Enter":
    case "Escape":
    case "Home":
    case "End":
    case "PageUp":
    case "PageDown":
    case "Insert":
    case "Tab":
      return key;
    default:
      return key.length === 1 ? key : key;
  }
}

function keyboardEventFromKeyDown(event: ReactKeyboardEvent): SharedBrowserKeyEvent | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (event.key.length === 1) {
    return { kind: "char", key: event.key, text: event.key, at: Date.now() };
  }
  return { kind: "down", key: mapKey(event.key), at: Date.now() };
}

function keyboardEventFromKeyUp(event: ReactKeyboardEvent): SharedBrowserKeyEvent | null {
  if (event.metaKey || event.ctrlKey || event.altKey || event.key.length === 1) return null;
  return { kind: "up", key: mapKey(event.key), at: Date.now() };
}

export function SharedBrowserSummary({
  board,
  compact = false
}: {
  board: SharedBrowserBoardState;
  compact?: boolean;
}) {
  const leaseDisplay = board.controlLease?.displayName ?? null;

  return (
    <div className={`shared-browser-summary${compact ? " shared-browser-summary--compact" : ""}`}>
      <p className="shared-browser-summary__status">
        {board.status === "paused"
          ? "Paused"
          : board.status === "starting"
          ? "Starting"
          : board.status === "error"
          ? "Error"
          : "Active"}
        {leaseDisplay ? ` · ${leaseDisplay} has control` : " · Room-owned"}
      </p>
      <p className="shared-browser-summary__url">{board.currentUrl || "No page loaded yet."}</p>
      {board.error ? <p className="shared-browser-summary__error">{board.error}</p> : null}
      {board.title ? <p className="shared-browser-summary__title">{board.title}</p> : null}
    </div>
  );
}

export function SharedBrowserSurface({
  object,
  board,
  controller,
  identity,
  roomId,
  currentUserId,
  compact = false,
  surface = false,
  videoStream
}: {
  object: WallObject;
  board: SharedBrowserBoardState;
  controller: SharedBrowserController;
  identity: ApiIdentity;
  roomId: string;
  currentUserId?: string;
  compact?: boolean;
  surface?: boolean;
  videoStream?: MediaStream | null;
}) {
  const [urlValue, setUrlValue] = useState(board.currentUrl);
  const [submitting, setSubmitting] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const leaseUserId = activeLeaseUserId(board);
  const hasLease = Boolean(currentUserId && leaseUserId === currentUserId);
  const isJpegFallback = board.status === "active" && !videoStream && !board.session?.livekit?.trackSid;
  const { jpegUrl, jpegLoading } = useSharedBrowserVideo({
    identity,
    roomId,
    objectId: object.id,
    enabled: isJpegFallback
  });

  useEffect(() => {
    setUrlValue(board.currentUrl);
  }, [board.currentUrl]);

  useEffect(() => {
    if (!hasLease) return;
    const interval = window.setInterval(() => {
      void controller.controlLease(object.id, "renew").catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [controller, hasLease, object.id]);

  const driverLabel = useMemo(() => {
    const lease = board.controlLease;
    if (!lease) return "No one";
    const expiresAt = Date.parse(lease.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "No one";
    return lease.displayName;
  }, [board.controlLease]);

  const submitNavigate = async () => {
    const nextUrl = normalizeUrl(urlValue);
    if (!nextUrl) return;
    setSubmitting(true);
    try {
      await controller.navigate(object.id, nextUrl);
      setUrlValue(nextUrl);
    } finally {
      setSubmitting(false);
    }
  };

  const emitPointer = (payload: Omit<SharedBrowserPointerEvent, "at">) => {
    controller.queuePointer(object.id, { ...payload, at: Date.now() });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "move", ...point });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    viewportRef.current.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "down", ...point, button: pointerButton(event.button) });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "up", ...point, button: pointerButton(event.button) });
  };

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    event.preventDefault();
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "wheel", ...point, deltaX: event.deltaX, deltaY: event.deltaY });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasLease) return;
    const next = keyboardEventFromKeyDown(event);
    if (!next) return;
    event.preventDefault();
    controller.queueKey(object.id, next);
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!hasLease) return;
    const next = keyboardEventFromKeyUp(event);
    if (!next) return;
    event.preventDefault();
    controller.queueKey(object.id, next);
  };

  if (compact && !surface) {
    return <SharedBrowserSummary board={board} compact />;
  }

  return (
    <div className={`shared-browser-surface${surface ? " shared-browser-surface--board" : ""}`}>
      <div className="shared-browser-toolbar">
        <div className="shared-browser-toolbar__nav">
          <button type="button" className="secondary" onClick={() => void controller.history(object.id, "back")} disabled={board.loading || board.status === "starting"}>
            Back
          </button>
          <button type="button" className="secondary" onClick={() => void controller.history(object.id, "forward")} disabled={board.loading || board.status === "starting"}>
            Forward
          </button>
          <button type="button" className="secondary" onClick={() => void controller.history(object.id, "refresh")} disabled={board.loading || board.status === "starting"}>
            Refresh
          </button>
          {board.status === "paused" ? (
            <button type="button" className="secondary" onClick={() => void controller.resume(object.id)}>
              Resume
            </button>
          ) : null}
        </div>
        <div className="shared-browser-toolbar__url">
          <input
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") {
                event.preventDefault();
                void submitNavigate();
              }
            }}
            placeholder="https://example.com"
            aria-label="Shared browser URL"
          />
          <button type="button" className="secondary" onClick={() => void submitNavigate()} disabled={submitting || !urlValue.trim()}>
            Go
          </button>
        </div>
        <div className="shared-browser-toolbar__lease">
          <button
            type="button"
            className={`secondary${hasLease ? " shared-browser-toolbar__lease-btn--active" : ""}`}
            onClick={() => void controller.controlLease(object.id, hasLease ? "release" : "take")}
          >
            {hasLease ? "Release control" : "Take control"}
          </button>
          {board.currentUrl ? (
            <a href={board.currentUrl} target="_blank" rel="noreferrer" className="shared-browser-toolbar__external">
              Open
            </a>
          ) : null}
        </div>
      </div>

      <div
        ref={viewportRef}
        className={`shared-browser-viewport${hasLease ? " shared-browser-viewport--active" : ""}`}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
      >
        {videoStream ? <StreamVideo stream={videoStream} className="shared-browser-viewport__video" /> : null}
        {!videoStream && jpegUrl ? <img src={jpegUrl} alt={board.title || object.title} className="shared-browser-viewport__image" /> : null}
        {!videoStream && !jpegUrl ? (
          <div className="shared-browser-viewport__placeholder">
            <strong>{board.status === "paused" ? "Browser paused" : board.loading ? "Connecting…" : "Waiting for video"}</strong>
            <span>
              {board.error ||
                (jpegLoading
                  ? "Receiving JPEG fallback frames."
                  : board.currentUrl || "The room-owned browser will appear here.")}
            </span>
          </div>
        ) : null}
        {!hasLease ? <div className="shared-browser-viewport__hint">Take control to type. Pointer input is shared.</div> : null}
      </div>

      <div className="shared-browser-status">
        <span>{board.title || object.title}</span>
        <span>{board.status === "active" ? "Active" : board.status === "paused" ? "Paused" : board.status}</span>
        <span>{driverLabel} {driverLabel === "No one" ? "has" : "has"} control</span>
      </div>
      {!surface ? <SharedBrowserSummary board={board} /> : null}
    </div>
  );
}
