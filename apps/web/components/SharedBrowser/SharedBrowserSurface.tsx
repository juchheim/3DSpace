"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { WallObject } from "@3dspace/contracts";
import type { ApiIdentity } from "../../lib/identity";
import { CLIENT_TUNING } from "../../lib/config";
import { useDocumentVisible } from "../../lib/visibility";
import type { SharedBrowserBoardState, SharedBrowserController } from "../../lib/useSharedBrowser";
import { DEFAULT_SHARED_BROWSER_FRAME_SIZE } from "./hyperbeamFrameCanvas";
import { useHyperbeamEmbed, type HyperbeamVideoMode } from "./useHyperbeamEmbed";

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
  currentUserId,
  compact = false,
  surface = false,
  hyperbeamVideoMode = "dom",
  hyperbeamEmbedVisible = true,
  displayAspectRatio
}: {
  object: WallObject;
  board: SharedBrowserBoardState;
  controller: SharedBrowserController;
  identity?: ApiIdentity;
  roomId?: string;
  currentUserId?: string;
  compact?: boolean;
  surface?: boolean;
  /** `frame` on 3D wall boards (canvas + frameCb); `dom` on 2D map and panels. */
  hyperbeamVideoMode?: HyperbeamVideoMode;
  /** When false, tears down the Hyperbeam client (off-screen board, background tab, etc.). */
  hyperbeamEmbedVisible?: boolean;
  /** Board display aspect (width / height) for 3D wall surfaces; drives VM resize and viewport layout. */
  displayAspectRatio?: number;
}) {
  const tabVisible = useDocumentVisible();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [urlValue, setUrlValue] = useState(board.currentUrl);
  const [submitting, setSubmitting] = useState(false);
  const [leaseBusy, setLeaseBusy] = useState(false);
  const leaseUserId = activeLeaseUserId(board);
  const hasLease = Boolean(currentUserId && leaseUserId === currentUserId);
  const embedUrl = board.session?.hyperbeam?.embedUrl ?? null;
  const embedEnabled =
    board.status === "active" && Boolean(embedUrl) && !board.loading && hyperbeamEmbedVisible && tabVisible;
  const frameSize = board.session?.viewport ?? DEFAULT_SHARED_BROWSER_FRAME_SIZE;
  const useFrameVideo = hyperbeamVideoMode === "frame" && surface;

  const hyperbeam = useHyperbeamEmbed({
    embedUrl,
    enabled: embedEnabled,
    hasControl: hasLease,
    videoMode: useFrameVideo ? "frame" : "dom",
    frameSize,
    ...(displayAspectRatio !== undefined ? { displayAspectRatio } : {}),
    playoutDelay: CLIENT_TUNING.sharedBrowserHyperbeamPlayoutDelay,
    onDisconnect: (reason) => {
      if (reason === "unauthorized" || reason === "inactive") {
        void controller.refreshEmbed(object.id).catch(() => undefined);
      }
    }
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

  useEffect(() => {
    if (!hasLease) return;
    viewportRef.current?.focus({ preventScroll: true });
  }, [hasLease]);

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

  if (compact && !surface) {
    return <SharedBrowserSummary board={board} compact />;
  }

  const navDisabled = board.status === "starting";
  const controlChip = hasLease
    ? "You have control"
    : driverLabel === "No one"
    ? "Open to control"
    : `${driverLabel} in control`;

  const showPlaceholder =
    board.status === "paused" ||
    board.loading ||
    !embedUrl ||
    hyperbeam.status === "loading" ||
    hyperbeam.status === "error";

  const viewportMessage =
    board.error ||
    hyperbeam.error ||
    (board.status === "paused"
      ? "Tap Resume or Go to start the room browser."
      : board.loading
      ? "Starting session…"
      : hyperbeam.status === "loading"
      ? "Connecting to Hyperbeam…"
      : !embedUrl
      ? "Navigate or resume to start the shared browser."
      : null);

  const viewportAspectRatio =
    displayAspectRatio && displayAspectRatio > 0
      ? `${displayAspectRatio}`
      : frameSize.width > 0 && frameSize.height > 0
      ? `${frameSize.width} / ${frameSize.height}`
      : "16 / 9";

  return (
    <div
      className={`shared-browser-surface${surface ? " shared-browser-surface--board" : ""}`}
      data-shared-browser-id={object.id}
    >
      <audio ref={hyperbeam.audioRef} className="shared-browser-viewport__audio" autoPlay playsInline />

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
        <button
          type="button"
          data-testid="shared-browser-resume"
          className="hud-btn shared-browser-notice shared-browser-notice--resume"
          onClick={() => void controller.resume(object.id)}
        >
          Browser paused — resume
        </button>
      ) : null}
      {board.error && board.status !== "paused" ? (
        <p className="shared-browser-notice shared-browser-notice--error">{board.error}</p>
      ) : null}

      <div
        ref={viewportRef}
        data-testid="shared-browser-viewport"
        tabIndex={hasLease ? 0 : -1}
        className={`shared-browser-viewport${hasLease ? " shared-browser-viewport--active" : ""}${useFrameVideo ? " shared-browser-viewport--frame" : ""}`}
        style={{ aspectRatio: viewportAspectRatio }}
      >
        {useFrameVideo ? (
          <canvas
            ref={hyperbeam.canvasRef}
            className="shared-browser-viewport__canvas"
            width={frameSize.width}
            height={frameSize.height}
            aria-hidden={showPlaceholder}
          />
        ) : null}

        <div
          ref={hyperbeam.containerRef}
          className={`shared-browser-viewport__embed${useFrameVideo ? " shared-browser-viewport__embed--input-layer" : ""}${showPlaceholder ? " shared-browser-viewport__embed--hidden" : ""}`}
          aria-hidden={useFrameVideo ? true : showPlaceholder}
        />

        {showPlaceholder ? (
          <div className="shared-browser-viewport__placeholder shared-browser-viewport__placeholder--overlay">
            <strong>
              {board.status === "paused"
                ? "Browser not started"
                : board.loading || hyperbeam.status === "loading"
                ? "Connecting…"
                : hyperbeam.status === "error"
                ? "Connection lost"
                : "Waiting for browser"}
            </strong>
            {viewportMessage ? <span>{viewportMessage}</span> : null}
            {embedUrl && board.status === "active" && hyperbeam.status === "error" ? (
              <button
                type="button"
                className="hud-btn shared-browser-notice shared-browser-notice--resume"
                onClick={() => void controller.refreshEmbed(object.id)}
              >
                Refresh embed
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={`shared-browser-chip${hasLease ? " shared-browser-chip--owned" : ""}`}>
          <span className={`shared-browser-chip__dot shared-browser-chip__dot--${board.status}`} />
          {controlChip}
        </div>
        {!hasLease && embedEnabled && hyperbeam.status === "connected" && !useFrameVideo ? (
          <div className="shared-browser-viewport__hint">Take control to type</div>
        ) : null}
        {!hasLease && embedEnabled && hyperbeam.status === "connected" && useFrameVideo ? (
          <div className="shared-browser-viewport__hint">Take control to interact</div>
        ) : null}
      </div>
    </div>
  );
}
