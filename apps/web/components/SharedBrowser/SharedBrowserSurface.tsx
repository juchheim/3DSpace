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
  const [leaseBusy, setLeaseBusy] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pointerDownRef = useRef(false);
  const lastMoveSentRef = useRef(0);
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

  const toggleLease = async () => {
    if (leaseBusy) return;
    setLeaseBusy(true);
    try {
      await controller.controlLease(object.id, hasLease ? "release" : "take");
    } catch {
      // Errors surface through board.error; the button re-enables either way.
    } finally {
      setLeaseBusy(false);
    }
  };

  const emitPointer = (payload: Omit<SharedBrowserPointerEvent, "at">) => {
    if (board.status !== "active") return;
    controller.queuePointer(object.id, { ...payload, at: Date.now() });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    if (!pointerDownRef.current) return;
    // Throttle drag moves so we do not flood the realtime endpoint while keeping
    // pointer-down/up, wheel, and keyboard actions immediate.
    const now = Date.now();
    if (now - lastMoveSentRef.current < 45) return;
    lastMoveSentRef.current = now;
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "move", ...point });
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    viewportRef.current.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerDownRef.current = true;
    const point = normalizedPoint(event, viewportRef.current);
    emitPointer({ kind: "down", ...point, button: pointerButton(event.button) });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!viewportRef.current) return;
    pointerDownRef.current = false;
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

  const navDisabled = board.status === "starting";
  const controlChip = hasLease
    ? "You have control"
    : driverLabel === "No one"
    ? "Open to control"
    : `${driverLabel} in control`;

  return (
    <div className={`shared-browser-surface${surface ? " shared-browser-surface--board" : ""}`}>
      <div className="shared-browser-bar">
        <div className="shared-browser-bar__nav">
          <button
            type="button"
            className="hud-btn shared-browser-bar__icon"
            title="Back"
            aria-label="Back"
            onClick={() => void controller.history(object.id, "back")}
            disabled={navDisabled}
          >
            ‹
          </button>
          <button
            type="button"
            className="hud-btn shared-browser-bar__icon"
            title="Forward"
            aria-label="Forward"
            onClick={() => void controller.history(object.id, "forward")}
            disabled={navDisabled}
          >
            ›
          </button>
          <button
            type="button"
            className="hud-btn shared-browser-bar__icon"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => void controller.history(object.id, "refresh")}
            disabled={navDisabled}
          >
            ⟳
          </button>
        </div>
        <form
          className="shared-browser-bar__url"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNavigate();
          }}
        >
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
            placeholder="Search or enter address"
            aria-label="Shared browser URL"
            spellCheck={false}
          />
          <button type="submit" className="hud-btn shared-browser-bar__go" disabled={submitting || !urlValue.trim()}>
            Go
          </button>
        </form>
        <div className="shared-browser-bar__actions">
          <button
            type="button"
            className={`hud-btn${hasLease ? " hud-btn--active" : ""}`}
            onClick={() => void toggleLease()}
            disabled={leaseBusy}
          >
            {hasLease ? "Release" : "Take control"}
          </button>
          {board.currentUrl ? (
            <a href={board.currentUrl} target="_blank" rel="noreferrer" className="shared-browser-bar__open" title="Open in a new tab">
              Open ↗
            </a>
          ) : null}
        </div>
      </div>

      {board.status === "paused" ? (
        <button type="button" className="hud-btn shared-browser-notice shared-browser-notice--resume" onClick={() => void controller.resume(object.id)}>
          Browser paused — resume
        </button>
      ) : null}
      {board.error ? <p className="shared-browser-notice shared-browser-notice--error">{board.error}</p> : null}

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
            <strong>
              {board.status === "paused"
                ? "Browser not started"
                : board.loading
                ? "Connecting…"
                : "Waiting for video"}
            </strong>
            <span>
              {board.error ||
                (board.status === "paused"
                  ? "Tap Resume or Go to start the room browser."
                  : jpegLoading
                  ? "Receiving fallback frames…"
                  : board.currentUrl || "The room-owned browser will appear here.")}
            </span>
          </div>
        ) : null}
        <div className={`shared-browser-chip${hasLease ? " shared-browser-chip--owned" : ""}`}>
          <span className={`shared-browser-chip__dot shared-browser-chip__dot--${board.status}`} />
          {controlChip}
        </div>
        {!hasLease ? <div className="shared-browser-viewport__hint">Take control to type</div> : null}
      </div>
    </div>
  );
}
