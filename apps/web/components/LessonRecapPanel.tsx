"use client";

import { useCallback, useEffect, useState } from "react";
import type { LessonRecap } from "@3dspace/contracts";
import { downloadLessonRecapCsv, fetchLessonRecap } from "../lib/api";
import type { ApiIdentity } from "../lib/identity";

function formatAverage(value: number | undefined) {
  if (value == null) return null;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatTimestamp(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function LessonRecapPanel({
  identity,
  roomId,
  runId,
  onClose
}: {
  identity: ApiIdentity;
  roomId: string;
  runId: string;
  onClose: () => void;
}) {
  const [recap, setRecap] = useState<LessonRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void fetchLessonRecap(identity, roomId, runId)
      .then((data) => {
        if (!cancelled) setRecap(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setRecap(null);
          setError(err instanceof Error ? err.message : "Could not load lesson recap.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, roomId, runId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const csv = await downloadLessonRecapCsv(identity, roomId, runId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `recap-${runId}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setDownloadError(err instanceof Error ? err.message : "Could not download CSV.");
    } finally {
      setDownloading(false);
    }
  }, [identity, roomId, runId]);

  const endedLabel = formatTimestamp(recap?.endedAt);
  const exitConfidence = formatAverage(recap?.exitTicket?.confidenceAverage);

  return (
    <div className="lesson-recap-backdrop" role="presentation" onClick={onClose}>
      <div
        className="lesson-recap-modal hud-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Lesson recap"
        data-testid="lesson-recap-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="lesson-recap-header">
          <div>
            <p className="lesson-recap-kicker">Lesson recap</p>
            <h2>{recap?.title ?? "Lesson"}</h2>
            {endedLabel ? <p className="lesson-recap-meta">Ended {endedLabel}</p> : null}
          </div>
          <button type="button" className="lesson-recap-close" aria-label="Close recap" onClick={onClose}>
            ×
          </button>
        </header>

        {loading ? <p className="lesson-recap-status">Loading recap...</p> : null}
        {error ? <p className="lesson-recap-error">{error}</p> : null}

        {!loading && !error && recap ? (
          <div className="lesson-recap-body">
            <section className="lesson-recap-stats" aria-label="Summary">
              <div className="lesson-recap-stat">
                <span className="lesson-recap-stat-label">Attendance</span>
                <strong data-testid="lesson-recap-attendance">{recap.attendance.total}</strong>
              </div>
              {recap.exitTicket ? (
                <>
                  <div className="lesson-recap-stat">
                    <span className="lesson-recap-stat-label">Exit ticket</span>
                    <strong data-testid="lesson-recap-exit-ratio">
                      {recap.exitTicket.submittedCount} / {recap.exitTicket.expectedCount}
                    </strong>
                  </div>
                  {exitConfidence != null ? (
                    <div className="lesson-recap-stat">
                      <span className="lesson-recap-stat-label">Avg confidence</span>
                      <strong data-testid="lesson-recap-confidence-avg">{exitConfidence}</strong>
                    </div>
                  ) : null}
                </>
              ) : null}
            </section>

            {recap.privateChecks.length > 0 ? (
              <section className="lesson-recap-section" aria-label="Private checks">
                <h3>Checks</h3>
                <ul className="lesson-recap-check-list">
                  {recap.privateChecks.map((check) => {
                    const avg = formatAverage(check.confidenceAverage);
                    return (
                      <li key={check.checkId}>
                        <span className="lesson-recap-check-question">{check.question}</span>
                        <span className="lesson-recap-check-meta">
                          {check.responseCount} response{check.responseCount === 1 ? "" : "s"}
                          {avg != null ? ` · avg ${avg}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {recap.exitTicket && recap.exitTicket.reflections.length > 0 ? (
              <section className="lesson-recap-section" aria-label="Exit ticket reflections">
                <h3>Reflections</h3>
                <ul className="lesson-recap-reflections" data-testid="lesson-recap-reflections">
                  {recap.exitTicket.reflections.map((reflection) => (
                    <li key={`${reflection.userId}-${reflection.submittedAt}`}>
                      <div className="lesson-recap-reflection-head">
                        <strong>{reflection.displayName}</strong>
                        {reflection.confidence != null ? (
                          <span className="lesson-recap-reflection-confidence">Confidence {reflection.confidence}</span>
                        ) : null}
                      </div>
                      <p className="lesson-recap-reflection-answer">{reflection.answer}</p>
                      {reflection.whatsNextChoiceId ? (
                        <p className="lesson-recap-reflection-meta">Next: {reflection.whatsNextChoiceId}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : recap.exitTicket ? (
              <p className="lesson-recap-empty">No exit-ticket reflections yet.</p>
            ) : null}

            <footer className="lesson-recap-footer">
              <button
                type="button"
                className="hud-btn"
                data-testid="lesson-recap-download-csv"
                disabled={downloading}
                onClick={() => void handleDownload()}
              >
                {downloading ? "Downloading..." : "Download CSV"}
              </button>
              {downloadError ? <p className="lesson-recap-error">{downloadError}</p> : null}
            </footer>
          </div>
        ) : null}
      </div>
    </div>
  );
}
