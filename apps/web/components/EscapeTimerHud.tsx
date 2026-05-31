"use client";

import { useEffect, useState } from "react";
import type { EscapeSession } from "@3dspace/contracts";
import {
  escapeSessionRemainingSec,
  formatEscapeCountdown
} from "../lib/useEscapeSession";

export function EscapeTimerHud({
  session,
  isAuthor,
  busy,
  onStart,
  onReset
}: {
  session: EscapeSession | null;
  isAuthor: boolean;
  busy: boolean;
  onStart: () => void;
  onReset: () => void;
}) {
  const [remainingSec, setRemainingSec] = useState<number | null>(() =>
    escapeSessionRemainingSec(session)
  );

  useEffect(() => {
    setRemainingSec(escapeSessionRemainingSec(session));
    if (session?.status !== "running") return;
    const id = window.setInterval(() => {
      setRemainingSec(escapeSessionRemainingSec(session));
    }, 250);
    return () => window.clearInterval(id);
  }, [session]);

  if (!session) return null;

  const statusLabel =
    session.status === "running"
      ? remainingSec !== null
        ? formatEscapeCountdown(remainingSec)
        : "—"
      : session.status === "won"
        ? "Escaped!"
        : session.status === "ended"
          ? "Ended"
          : "Not started";

  return (
    <div className="escape-timer-hud" role="status" aria-live="polite">
      <strong>Timer</strong>
      <span className={`escape-timer-hud__time escape-timer-hud__time--${session.status}`}>{statusLabel}</span>
      {isAuthor ? (
        <div className="escape-timer-hud__actions">
          {session.status === "idle" || session.status === "won" || session.status === "ended" ? (
            <button type="button" className="hud-btn hud-btn-pri" disabled={busy} onClick={onStart}>
              {busy ? "…" : "Start session"}
            </button>
          ) : null}
          {session.status === "running" || session.status === "won" ? (
            <button type="button" className="hud-btn" disabled={busy} onClick={onReset}>
              {busy ? "…" : "Reset puzzle"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
