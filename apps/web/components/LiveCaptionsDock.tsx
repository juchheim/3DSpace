"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { useLiveCaptions } from "../lib/useLiveCaptions";

type LiveCaptionsController = ReturnType<typeof useLiveCaptions>;

function formatRelativeTime(startMs: number) {
  const totalSec = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function LiveCaptionsDock({
  controller,
  speakerLabel,
  selfParticipantId
}: {
  controller: LiveCaptionsController;
  speakerLabel: (participantId: string) => string;
  selfParticipantId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const linesRef = useRef<HTMLDivElement | null>(null);
  const prevLineCountRef = useRef(controller.lines.length);

  const contributorNames = useMemo(
    () => Array.from(controller.contributors).map((id) => speakerLabel(id)),
    [controller.contributors, speakerLabel]
  );

  const displayRows = useMemo(() => {
    const rows: Array<{
      key: string;
      participantId: string;
      text: string;
      startMs: number;
      sentAt: number;
      interim?: boolean;
    }> = controller.lines.map((line) => ({
      key: line.id,
      participantId: line.participantId,
      text: line.text,
      startMs: line.startMs,
      sentAt: line.sentAt,
      interim: false
    }));

    for (const [participantId, interim] of controller.interimByParticipant.entries()) {
      if (participantId === selfParticipantId && !controller.sharing) continue;
      rows.push({
        key: `interim:${participantId}:${interim.chunkId}`,
        participantId,
        text: interim.text,
        startMs: 0,
        sentAt: interim.sentAt,
        interim: true
      });
    }

    rows.sort((a, b) => a.sentAt - b.sentAt || a.participantId.localeCompare(b.participantId));
    return rows;
  }, [controller.interimByParticipant, controller.lines, controller.sharing, selfParticipantId]);

  useEffect(() => {
    if (controller.live) controller.setDockOpen(true);
  }, [controller.live, controller.setDockOpen]);

  useEffect(() => {
    if (controller.lines.length <= prevLineCountRef.current) {
      prevLineCountRef.current = controller.lines.length;
      return;
    }
    prevLineCountRef.current = controller.lines.length;
    const node = linesRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth"
    });
  }, [controller.lines.length, displayRows.length]);

  if (!controller.dockOpen && !controller.live) {
    return (
      <div className="room-captions-dock room-captions-dock--idle">
        <button
          type="button"
          className="room-captions-dock__peek hud-btn"
          onClick={() => controller.setDockOpen(true)}
        >
          CC · Off
        </button>
      </div>
    );
  }

  const visibleContributorLabel = contributorNames.length === 0
    ? null
    : contributorNames.length <= 3
      ? contributorNames.join(", ")
      : `${contributorNames.slice(0, 3).join(", ")} +${contributorNames.length - 3}`;

  return (
    <section
      className={`room-captions-dock${expanded ? "" : " room-captions-dock--collapsed"}${controller.live ? " room-captions-dock--live" : ""}`}
      aria-label="Live captions"
    >
      <div className="room-captions-dock__bar">
        <span className={`room-captions-dock__cc-badge${controller.live ? " room-captions-dock__cc-badge--live" : ""}`}>CC</span>
        {visibleContributorLabel ? (
          <span className="room-captions-dock__contributors">Captioning: {visibleContributorLabel}</span>
        ) : controller.sharing ? (
          <span className="room-captions-dock__contributors">
            {controller.listening ? "Listening…" : "Starting speech recognition…"}
          </span>
        ) : (
          <span className="room-captions-dock__contributors room-captions-dock__contributors--muted">No active captioners</span>
        )}
        <div className="room-captions-dock__actions">
          {expanded ? (
            <button type="button" className="hud-btn room-captions-dock__action" onClick={() => void controller.copyVisible()}>
              Copy
            </button>
          ) : null}
          <button
            type="button"
            className={`hud-btn room-captions-dock__action${controller.sharing ? " hud-btn--active" : ""}`}
            disabled={!controller.supported}
            title={controller.supported ? "Share your speech as captions" : "Chrome or Edge required to share captions"}
            onClick={() => controller.toggleSharing()}
          >
            {controller.sharing ? "Stop sharing" : "Share my captions"}
          </button>
          <button
            type="button"
            className="hud-btn room-captions-dock__action room-captions-dock__expand"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "▾" : "▴"}
          </button>
        </div>
      </div>

      {!controller.supported ? (
        <p className="room-captions-dock__note">Chrome or Edge required to share captions. You can still read captions from others.</p>
      ) : null}
      {controller.error ? <p className="room-captions-dock__error">{controller.error}</p> : null}

      <div
        ref={linesRef}
        className="room-captions-dock__lines"
        role="log"
        aria-live="polite"
      >
        {displayRows.length === 0 ? (
          <p className="room-captions-dock__empty">
            {controller.sharing
              ? controller.listening
                ? "Speak clearly — captions appear here as you talk."
                : "Waiting for speech recognition to start…"
              : controller.contributors.size > 0
                ? "Waiting for speech…"
                : "Turn on your mic, then click Share my captions."}
          </p>
        ) : (
          displayRows.map((row, index) => {
            const prev = index > 0 ? displayRows[index - 1] : null;
            const showSpeaker = !prev
              || prev.participantId !== row.participantId
              || row.sentAt - prev.sentAt > 8000;
            return (
              <div
                key={row.key}
                className={`room-captions-dock__line${row.interim ? " room-captions-dock__line--interim" : ""}`}
              >
                <span className="room-captions-dock__time">{formatRelativeTime(row.startMs)}</span>
                {showSpeaker ? (
                  <span className="room-captions-dock__speaker">{speakerLabel(row.participantId)}</span>
                ) : (
                  <span className="room-captions-dock__speaker room-captions-dock__speaker--spacer" aria-hidden="true" />
                )}
                <span className="room-captions-dock__text">{row.text}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
