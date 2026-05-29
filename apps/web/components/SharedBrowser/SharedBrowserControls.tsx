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

  const navDisabled = board.status === "starting" || board.status === "paused";

  return (
    <div className="sb-wall-controls" data-testid="shared-browser-toolbar">
      <div className="sb-wall-toolbar">
        <div className="sb-wall-toolbar__nav">
          <button
            type="button"
            className="sb-wall-toolbar__btn"
            title="Back"
            aria-label="Back"
            onClick={() => void controller.history(object.id, "back")}
            disabled={navDisabled}
          >
            ‹
          </button>
          <button
            type="button"
            className="sb-wall-toolbar__btn"
            title="Forward"
            aria-label="Forward"
            onClick={() => void controller.history(object.id, "forward")}
            disabled={navDisabled}
          >
            ›
          </button>
          <button
            type="button"
            className="sb-wall-toolbar__btn"
            title="Reload"
            aria-label="Reload"
            onClick={() => void controller.history(object.id, "refresh")}
            disabled={navDisabled}
          >
            ⟳
          </button>
        </div>
        <form
          className="sb-wall-toolbar__address"
          onSubmit={(event) => {
            event.preventDefault();
            void submitNavigate();
          }}
        >
          <span
            className={`sb-wall-toolbar__status sb-wall-toolbar__status--${board.status}`}
            title={controlChip}
            aria-label={controlChip}
          />
          <input
            value={urlValue}
            onChange={(event) => setUrlValue(event.target.value)}
            placeholder="Search or enter address"
            aria-label="Shared browser URL"
            spellCheck={false}
          />
          <button type="submit" className="sb-wall-toolbar__go" disabled={submitting || !urlValue.trim()}>
            Go
          </button>
        </form>
        <div className="sb-wall-toolbar__actions">
          {board.status === "paused" ? (
            <button
              type="button"
              data-testid="shared-browser-resume"
              className="sb-wall-toolbar__lease sb-wall-toolbar__lease--resume"
              onClick={() => void controller.resume(object.id)}
            >
              Start browser
            </button>
          ) : (
            <button
              type="button"
              className={`sb-wall-toolbar__lease${hasLease ? " is-active" : ""}`}
              onClick={() => void toggleLease()}
              disabled={leaseBusy}
            >
              {hasLease ? "Release" : "Take control"}
            </button>
          )}
          {board.currentUrl ? (
            <a
              href={board.currentUrl}
              target="_blank"
              rel="noreferrer"
              className="sb-wall-toolbar__open"
              title="Open in a new tab"
              aria-label="Open in a new tab"
            >
              ↗
            </a>
          ) : null}
        </div>
      </div>
      {board.error && board.status !== "paused" ? (
        <p className="sb-wall-controls__error">{board.error}</p>
      ) : null}
    </div>
  );
}
