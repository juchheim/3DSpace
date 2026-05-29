"use client";

import { useEffect, useMemo, useState } from "react";
import type { WallObject } from "@3dspace/contracts";
import type { SharedBrowserBoardState, SharedBrowserController } from "../../lib/useSharedBrowser";

export function activeSharedBrowserLeaseUserId(board: SharedBrowserBoardState) {
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

export function useSharedBrowserControls(
  object: WallObject,
  board: SharedBrowserBoardState,
  controller: SharedBrowserController,
  currentUserId?: string
) {
  const [urlValue, setUrlValue] = useState(board.currentUrl);
  const [submitting, setSubmitting] = useState(false);
  const [leaseBusy, setLeaseBusy] = useState(false);
  const leaseUserId = activeSharedBrowserLeaseUserId(board);
  const hasLease = Boolean(currentUserId && leaseUserId === currentUserId);

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

  const controlChip = hasLease
    ? "You have control"
    : driverLabel === "No one"
    ? "Open to control"
    : `${driverLabel} in control`;

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
    } finally {
      setLeaseBusy(false);
    }
  };

  return {
    urlValue,
    setUrlValue,
    submitting,
    leaseBusy,
    hasLease,
    controlChip,
    submitNavigate,
    toggleLease
  };
}

export function SharedBrowserControls({
  object,
  board,
  controller,
  currentUserId,
  compact = false
}: {
  object: WallObject;
  board: SharedBrowserBoardState;
  controller: SharedBrowserController;
  currentUserId?: string;
  compact?: boolean;
}) {
  const {
    urlValue,
    setUrlValue,
    submitting,
    leaseBusy,
    hasLease,
    controlChip,
    submitNavigate,
    toggleLease
  } = useSharedBrowserControls(object, board, controller, currentUserId);

  const navDisabled = board.status === "starting";

  return (
    <div className={`shared-browser-surface${compact ? " shared-browser-surface--board" : ""} shared-browser-surface--controls-only`}>
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

      <div className={`shared-browser-chip${hasLease ? " shared-browser-chip--owned" : ""}`}>
        <span className={`shared-browser-chip__dot shared-browser-chip__dot--${board.status}`} />
        {controlChip}
      </div>
    </div>
  );
}
