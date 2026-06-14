"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { translationLanguageLabel } from "@3dspace/contracts";
import type { useTranslation } from "../lib/useTranslation";

type TranslationController = ReturnType<typeof useTranslation>;

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

export function TranslationDock({
  controller,
  speakerLabel,
  selfParticipantId
}: {
  controller: TranslationController;
  speakerLabel: (participantId: string) => string;
  selfParticipantId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showOriginalSet, setShowOriginalSet] = useState<Set<string>>(() => new Set());
  const linesRef = useRef<HTMLDivElement | null>(null);
  const prevLineCountRef = useRef(controller.lines.length);

  const displayRows = useMemo(() => {
    return [...controller.lines].sort((a, b) => a.sentAt - b.sentAt || a.participantId.localeCompare(b.participantId));
  }, [controller.lines]);

  useEffect(() => {
    if (controller.lines.length <= prevLineCountRef.current) {
      prevLineCountRef.current = controller.lines.length;
      return;
    }
    prevLineCountRef.current = controller.lines.length;
    const node = linesRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [controller.lines.length]);

  const handleReset = () => {
    setExpanded(false);
    controller.resetDock();
  };

  const toggleOriginal = (id: string) => {
    setShowOriginalSet((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const statusText = controller.sharing
    ? controller.listening
      ? "Listening…"
      : "Activating…"
    : "Active";

  return (
    <section
      className={`translation-dock${expanded ? " translation-dock--expanded" : " translation-dock--collapsed"}${controller.sharing ? " translation-dock--live" : ""}`}
      aria-label="Live translation"
    >
      <div className="translation-dock__bar">
        <div className="translation-dock__bar-start">
          <span
            className={`translation-dock__dot${controller.sharing ? " translation-dock__dot--live" : ""}`}
            aria-hidden="true"
          />
          <span className="translation-dock__title">Translation</span>
          <span className={`translation-dock__status${controller.sharing ? "" : " translation-dock__status--muted"}`}>
            {statusText}
          </span>
        </div>

        <div className="translation-dock__bar-end">
          {!controller.supported ? null : (
            <button
              type="button"
              className={`translation-dock__share-btn${controller.sharing ? " translation-dock__share-btn--live" : ""}`}
              onClick={() => controller.toggleSharing()}
            >
              {controller.sharing ? "Stop" : "Share speech"}
            </button>
          )}
          {displayRows.length > 0 ? (
            <button
              type="button"
              className="translation-dock__action"
              onClick={() => controller.clearLines()}
            >
              Clear
            </button>
          ) : null}
          {expanded ? (
            <button
              type="button"
              className="translation-dock__action"
              onClick={() => void controller.copyVisible()}
            >
              Copy
            </button>
          ) : null}
          <button
            type="button"
            className="translation-dock__action translation-dock__action--icon"
            aria-label={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "▴" : "▾"}
          </button>
          <button
            type="button"
            className="translation-dock__action translation-dock__action--icon"
            aria-label="Close translation dock"
            onClick={handleReset}
          >
            ✕
          </button>
        </div>
      </div>

      {!controller.supported ? (
        <p className="translation-dock__note">
          Speech sharing requires Chrome or Edge. You can still read others' translations.
        </p>
      ) : null}
      {controller.error ? <p className="translation-dock__error">{controller.error}</p> : null}

      <div ref={linesRef} className="translation-dock__lines" role="log" aria-live="polite">
        {displayRows.length === 0 ? (
          <p className="translation-dock__empty">
            {controller.sharing
              ? controller.listening
                ? "Speak clearly — your words will appear here."
                : "Activating speech recognition…"
              : "When others share speech, their translations appear here."}
          </p>
        ) : (
          displayRows.map((row, index) => {
            const prev = index > 0 ? displayRows[index - 1] : null;
            const showSpeaker = !prev
              || prev.participantId !== row.participantId
              || row.sentAt - prev.sentAt > 8000;
            const isOwnLine = row.participantId === selfParticipantId;
            const showingOriginal = showOriginalSet.has(row.id);
            const textToShow = showingOriginal ? row.sourceText : row.displayText;
            return (
              <div
                key={row.id}
                className={`translation-dock__line${row.pending ? " translation-dock__line--pending" : ""}${isOwnLine ? " translation-dock__line--own" : ""}`}
              >
                <span className="translation-dock__time">{formatRelativeTime(row.startMs)}</span>
                {showSpeaker ? (
                  <span className="translation-dock__speaker">{speakerLabel(row.participantId)}</span>
                ) : (
                  <span className="translation-dock__speaker translation-dock__speaker--spacer" aria-hidden="true" />
                )}
                <span className="translation-dock__text">
                  {row.pending ? <span className="translation-dock__pending-ellipsis">{textToShow} …</span> : textToShow}
                </span>
                {row.translatedFrom && !isOwnLine ? (
                  <span className="translation-dock__meta">
                    <span className="translation-dock__source-lang">
                      from {translationLanguageLabel(row.translatedFrom)}
                    </span>
                    <span className="translation-dock__meta-sep" aria-hidden="true">·</span>
                    <button
                      type="button"
                      className="translation-dock__toggle-original"
                      onClick={() => toggleOriginal(row.id)}
                    >
                      {showingOriginal ? "show translation" : "show original"}
                    </button>
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
