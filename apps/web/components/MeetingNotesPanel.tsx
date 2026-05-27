"use client";

import { useEffect, useMemo, useState } from "react";
import type { MeetingNotesSession } from "@3dspace/contracts";
import { downloadMeetingNotesArtifact } from "../lib/api";
import type { ApiIdentity } from "../lib/identity";
import { HudCard } from "./HudCard";

type MeetingNotesController = {
  sessions: MeetingNotesSession[];
  currentSessionId: string | null;
  currentSession: {
    id: string;
    status: MeetingNotesSession["status"];
    segments: Array<{ id: string; speakerUserId: string; startMs: number; text: string }>;
    errorMessage?: string | undefined;
  } | null;
  activeSession: MeetingNotesSession | null;
  loading: boolean;
  error: string;
  setCurrentSessionId(sessionId: string | null): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  resummarize(): Promise<void>;
  remove(sessionId: string): Promise<void>;
  download(sessionId: string, format: "txt" | "vtt" | "srt" | "md"): Promise<void>;
  copyTranscript(): Promise<void>;
  speakerLabel(participantId: string): string;
};

function relativeTimeLabel(startMs: number) {
  const totalSec = Math.max(0, Math.floor(startMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function MeetingNotesPanel({
  identity,
  roomId,
  controller
}: {
  identity: ApiIdentity;
  roomId: string;
  controller: MeetingNotesController;
}) {
  const [tab, setTab] = useState<"summary" | "transcript">("summary");
  const [summary, setSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const readySessionId = controller.currentSession?.status === "ready" ? controller.currentSession.id : null;

  useEffect(() => {
    if (!readySessionId || tab !== "summary") return;
    let cancelled = false;
    setSummaryLoading(true);
    void downloadMeetingNotesArtifact(identity, roomId, readySessionId, "md")
      .then((content) => {
        if (!cancelled) setSummary(content);
      })
      .catch(() => {
        if (!cancelled) setSummary("");
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identity, readySessionId, roomId, tab]);

  const history = useMemo(
    () => controller.sessions.filter((session) => session.status === "ready" || session.status === "error" || session.status === "cancelled"),
    [controller.sessions]
  );

  const badge =
    controller.activeSession?.status === "recording" ? "REC" :
    controller.activeSession?.status === "finalizing" ? "…" :
    history.length;

  return (
    <HudCard
      title="Meeting Notes"
      badge={badge}
      ariaLabel="Meeting notes"
      defaultCollapsed
      forceExpanded={Boolean(controller.activeSession)}
      hasAlert={Boolean(controller.error || controller.currentSession?.errorMessage)}
    >
      {controller.error ? <p className="meeting-notes-panel__error">{controller.error}</p> : null}

      {!controller.activeSession && !controller.currentSession ? (
        <div className="meeting-notes-panel">
          <p className="meeting-notes-panel__copy">Recording is off and no transcript is being captured.</p>
          <button type="button" className="button primary" disabled={controller.loading} onClick={() => void controller.start()}>
            {controller.loading ? "Starting…" : "Start meeting notes"}
          </button>
          {history.length > 0 ? (
            <div className="meeting-notes-panel__history">
              <p className="meeting-notes-panel__label">Previous sessions</p>
              {history.map((session) => (
                <div key={session.id} className="meeting-notes-panel__history-item">
                  <button type="button" className="button secondary" onClick={() => controller.setCurrentSessionId(session.id)}>
                    {new Date(session.startedAt).toLocaleString()}
                  </button>
                  {session.status === "ready" ? (
                    <button type="button" className="button secondary" onClick={() => void controller.download(session.id, "md")}>
                      Summary
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {controller.activeSession?.status === "recording" && controller.currentSession ? (
        <div className="meeting-notes-panel">
          <div className="meeting-notes-panel__status">
            <span className="meeting-notes-panel__rec-dot" />
            <span>Recording</span>
          </div>
          <div className="meeting-notes-panel__actions">
            <button type="button" className="button primary" disabled={controller.loading} onClick={() => void controller.stop()}>
              Stop meeting notes
            </button>
            <button type="button" className="button secondary" onClick={() => void controller.copyTranscript()}>
              Copy transcript so far
            </button>
          </div>
          <div className="meeting-notes-panel__transcript">
            {controller.currentSession.segments.length === 0 ? (
              <p className="meeting-notes-panel__copy">Listening for speech…</p>
            ) : controller.currentSession.segments.map((segment) => (
              <div key={segment.id} className="meeting-notes-panel__segment">
                <div className="meeting-notes-panel__segment-meta">
                  <strong>{controller.speakerLabel(segment.speakerUserId)}</strong>
                  <span>{relativeTimeLabel(segment.startMs)}</span>
                </div>
                <p>{segment.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {controller.currentSession?.status === "finalizing" ? (
        <div className="meeting-notes-panel">
          <p className="meeting-notes-panel__copy">Wrapping up and generating summary…</p>
          <div className="meeting-notes-panel__transcript">
            {controller.currentSession.segments.map((segment) => (
              <div key={segment.id} className="meeting-notes-panel__segment">
                <div className="meeting-notes-panel__segment-meta">
                  <strong>{controller.speakerLabel(segment.speakerUserId)}</strong>
                  <span>{relativeTimeLabel(segment.startMs)}</span>
                </div>
                <p>{segment.text}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {controller.currentSession?.status === "ready" ? (
        <div className="meeting-notes-panel">
          <div className="meeting-notes-panel__tabs">
            <button type="button" className={`button secondary${tab === "summary" ? " meeting-notes-panel__tab--active" : ""}`} onClick={() => setTab("summary")}>
              Summary
            </button>
            <button type="button" className={`button secondary${tab === "transcript" ? " meeting-notes-panel__tab--active" : ""}`} onClick={() => setTab("transcript")}>
              Transcript
            </button>
          </div>
          <div className="meeting-notes-panel__actions">
            <button type="button" className="button secondary" onClick={() => void controller.download(controller.currentSession!.id, "md")}>
              Download summary
            </button>
            <button type="button" className="button secondary" onClick={() => void controller.download(controller.currentSession!.id, "txt")}>
              Transcript .txt
            </button>
            <button type="button" className="button secondary" onClick={() => void controller.download(controller.currentSession!.id, "vtt")}>
              .vtt
            </button>
            <button type="button" className="button secondary" onClick={() => void controller.download(controller.currentSession!.id, "srt")}>
              .srt
            </button>
            <button type="button" className="button secondary" disabled={controller.loading} onClick={() => void controller.resummarize()}>
              Re-summarize
            </button>
            <button type="button" className="button secondary" onClick={() => void controller.remove(controller.currentSession!.id)}>
              Delete session
            </button>
          </div>
          {tab === "summary" ? (
            <div className="meeting-notes-panel__summary">
              {summaryLoading ? "Loading summary…" : summary || "Summary unavailable."}
            </div>
          ) : (
            <div className="meeting-notes-panel__transcript">
              {controller.currentSession.segments.map((segment) => (
                <div key={segment.id} className="meeting-notes-panel__segment">
                  <div className="meeting-notes-panel__segment-meta">
                    <strong>{controller.speakerLabel(segment.speakerUserId)}</strong>
                    <span>{relativeTimeLabel(segment.startMs)}</span>
                  </div>
                  <p>{segment.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {controller.currentSession?.status === "error" ? (
        <div className="meeting-notes-panel">
          <p className="meeting-notes-panel__error">{controller.currentSession.errorMessage ?? "Unable to generate meeting notes."}</p>
          <div className="meeting-notes-panel__actions">
            <button type="button" className="button secondary" disabled={controller.loading} onClick={() => void controller.resummarize()}>
              Retry
            </button>
            <button type="button" className="button secondary" onClick={() => controller.setCurrentSessionId(null)}>
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </HudCard>
  );
}
