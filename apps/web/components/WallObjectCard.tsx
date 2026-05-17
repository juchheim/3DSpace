"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WallObject } from "@3dspace/contracts";
import {
  forceTimerElapsed,
  pushTimerElapsed,
  resetTimerRuntime,
  timerElapsedForResume
} from "../lib/timerRuntime";
import { useTimerRuntime } from "../lib/useTimerRuntime";

type WallObjectCardStyle = CSSProperties & { "--wall-object-fit": string };
type WallObjectControlAction = "play" | "pause" | "mute" | "unmute" | "seek";
type TimerPlaybackStatus = "idle" | "playing" | "paused" | "ended";

function typeLabel(type: WallObject["type"]) {
  return type.replace(".", " ");
}

function timerDurationSeconds(object: WallObject) {
  const data = object.source.kind === "inline" ? object.source.data : {};
  return Math.max(1, Number(data.seconds ?? data.durationSeconds ?? 300));
}

function parseSentAt(value: unknown) {
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric < 1e11 ? numeric * 1000 : numeric;
}

function readTimerPlayback(object: WallObject): { status: TimerPlaybackStatus; positionSeconds: number; sentAt?: number } {
  const playback = object.state?.playback;
  if (!playback || typeof playback !== "object") {
    return { status: "idle", positionSeconds: 0 };
  }

  const record = playback as Record<string, unknown>;
  const positionSeconds = Math.max(0, Number(record.positionSeconds ?? 0));
  const status = record.status;
  const sentAt = parseSentAt(record.sentAt);

  if (status === "playing" || status === "paused" || status === "ended") {
    return {
      status,
      positionSeconds,
      ...(sentAt !== undefined ? { sentAt } : {})
    };
  }

  if (positionSeconds > 0) {
    return {
      status: "paused",
      positionSeconds,
      ...(sentAt !== undefined ? { sentAt } : {})
    };
  }

  return { status: "idle", positionSeconds: 0 };
}

function formatTimerClock(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function StreamVideo({ stream, muted }: { stream: MediaStream; muted: boolean }) {
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

  return <video ref={videoRef} autoPlay playsInline muted={muted} />;
}

function StreamAudio({ stream }: { stream: MediaStream }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => undefined);
    return () => {
      if (audio.srcObject === stream) audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} autoPlay controls />;
}

function WallTimerDisplay({
  object,
  canManage,
  surface,
  onControl
}: {
  object: WallObject;
  canManage: boolean;
  surface: boolean;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number) => void;
}) {
  const durationSeconds = useMemo(() => timerDurationSeconds(object), [object]);
  const playback = useMemo(() => readTimerPlayback(object), [object.state]);
  const timerRuntime = useTimerRuntime(object.id);
  const elapsedSeconds = timerRuntime.elapsedSeconds;
  const [now, setNow] = useState(() => Date.now());
  const finishedRef = useRef(false);

  useEffect(() => {
    if (playback.status !== "playing") return;
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [playback.status]);

  useEffect(() => {
    if (playback.status === "playing" && playback.sentAt) {
      const next = Math.min(durationSeconds, playback.positionSeconds + (now - playback.sentAt) / 1000);
      pushTimerElapsed(object.id, next);
      return;
    }

    if (playback.status === "paused" || playback.status === "ended") {
      const serverPosition = Math.floor(playback.positionSeconds);
      if (serverPosition === 0) {
        forceTimerElapsed(object.id, 0);
      } else {
        pushTimerElapsed(object.id, serverPosition);
      }
    }
  }, [durationSeconds, now, object.id, playback.positionSeconds, playback.sentAt, playback.status]);

  const remainingSeconds = Math.max(0, durationSeconds - elapsedSeconds);
  const isRunning = playback.status === "playing";
  const isFinished = remainingSeconds <= 0 && elapsedSeconds >= durationSeconds;
  const statusLabel = isFinished ? "Time's up" : isRunning ? "Running" : playback.status === "paused" ? "Paused" : "Ready";
  const hasStarted = elapsedSeconds > 0 || playback.status === "paused" || playback.status === "ended";

  const canResume = !isFinished && (hasStarted || playback.status === "paused");

  const startOrResume = () => {
    if (playback.status === "playing") return;

    if (isFinished || playback.status === "ended") {
      resetTimerRuntime(object.id);
      void onControl?.(object.id, "play", 0);
      return;
    }

    const resumeAt = timerElapsedForResume(object.id, playback.positionSeconds);
    if (resumeAt > 0 || hasStarted || playback.status === "paused") {
      pushTimerElapsed(object.id, resumeAt);
      void onControl?.(object.id, "play", resumeAt);
      return;
    }

    void onControl?.(object.id, "play", 0);
  };

  const pause = () => {
    const position = timerElapsedForResume(object.id, playback.positionSeconds);
    pushTimerElapsed(object.id, position);
    void onControl?.(object.id, "pause", position);
  };

  const reset = async () => {
    resetTimerRuntime(object.id);
    finishedRef.current = false;
    await onControl?.(object.id, "seek", 0);
    if (isRunning) {
      await onControl?.(object.id, "pause", 0);
    }
  };

  useEffect(() => {
    if (!canManage || !isRunning || !isFinished || finishedRef.current) return;
    finishedRef.current = true;
    void onControl?.(object.id, "pause", durationSeconds);
  }, [canManage, durationSeconds, isFinished, isRunning, object.id, onControl]);

  return (
    <div className={`wall-object-card__timer${surface ? " wall-object-card__timer--surface" : ""}`}>
      <div className="wall-object-card__timer-readout" aria-live="polite">
        {formatTimerClock(remainingSeconds)}
      </div>
      <p className="wall-object-card__timer-status">{statusLabel}</p>
      {canManage ? (
        <div className="wall-object-card__timer-actions">
          {!isRunning ? (
            <button type="button" className="secondary" onClick={startOrResume}>
              {canResume ? "Resume" : isFinished ? "Restart" : "Start"}
            </button>
          ) : (
            <button type="button" className="secondary" onClick={pause}>
              Pause
            </button>
          )}
          <button type="button" className="secondary" onClick={() => void reset()}>
            Reset
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WallObjectContent({
  object,
  canManage,
  surface,
  assetUrl,
  videoStream,
  audioStream,
  onControl
}: {
  object: WallObject;
  canManage: boolean;
  surface: boolean;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number) => void;
}) {
  if (object.type === "timer") {
    return <WallTimerDisplay object={object} canManage={canManage} surface={surface} {...(onControl ? { onControl } : {})} />;
  }

  const data = object.source.kind === "inline" ? object.source.data : {};

  if (object.type === "note") {
    return <p className="wall-object-card__body">{String(data.text ?? object.description ?? "")}</p>;
  }

  if (object.type === "poll") {
    const question = String(data.question ?? object.title);
    const options = Array.isArray(data.options) ? data.options.map(String) : [];
    return (
      <div className="wall-object-card__body">
        <p>{question}</p>
        {options.length > 0 ? (
          <ul>
            {options.map((option) => (
              <li key={option}>{option}</li>
            ))}
          </ul>
        ) : null}
      </div>
    );
  }

  if ((object.type === "image.file" || object.type === "video.file") && assetUrl) {
    if (object.type === "image.file") {
      return <img src={assetUrl} alt={object.title} />;
    }
    return <video src={assetUrl} controls playsInline />;
  }

  if (object.type === "audio.file" && assetUrl) {
    return <audio src={assetUrl} controls />;
  }

  if (object.source.kind === "web-url") {
    if (object.type === "web.embed" && object.source.embedMode === "iframe") {
      return <iframe src={object.source.url} title={object.title} sandbox="allow-scripts allow-same-origin allow-presentation" />;
    }
    return (
      <a className="wall-object-link" href={object.source.url} target="_blank" rel="noreferrer">
        {object.title}
      </a>
    );
  }

  if (videoStream) {
    return <StreamVideo stream={videoStream} muted={object.type !== "microphone.live"} />;
  }

  if (audioStream) {
    return <StreamAudio stream={audioStream} />;
  }

  return <div className="wall-object-placeholder">{object.status === "pending_moderation" ? "Awaiting approval" : "Waiting for media"}</div>;
}

export function WallObjectCard({
  object,
  assetUrl,
  videoStream,
  audioStream,
  compact = false,
  surface = false,
  canManage = false,
  onRemove,
  onStopShare,
  onControl,
  onModerate
}: {
  object: WallObject;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  compact?: boolean;
  surface?: boolean;
  canManage?: boolean;
  onRemove?: (objectId: string) => void;
  onStopShare?: (objectId: string) => void;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number) => void;
  onModerate?: (objectId: string, action: "approve" | "reject") => void;
}) {
  const live = object.type.endsWith(".live") && object.status === "active";
  const fit = object.placement.fit === "stretch" ? "fill" : object.placement.fit;
  const style = useMemo<WallObjectCardStyle>(() => ({ "--wall-object-fit": fit }), [fit]);
  const body = useMemo(
    () => (
      <WallObjectContent
        object={object}
        canManage={canManage}
        surface={surface}
        assetUrl={assetUrl}
        videoStream={videoStream}
        audioStream={audioStream}
        {...(onControl ? { onControl } : {})}
      />
    ),
    [assetUrl, audioStream, canManage, object, onControl, surface, videoStream]
  );

  return (
    <article
      className={`wall-object-card${compact ? " wall-object-card--compact" : ""}${surface ? " wall-object-card--surface" : ""}`}
      data-wall-object-id={object.id}
      data-wall-object-type={object.type}
      style={style}
    >
      <header className="wall-object-card__header">
        <strong>{object.title}</strong>
        <span className="wall-object-card__badges">
          <span className="badge">{typeLabel(object.type)}</span>
          {live ? <span className="badge">Live</span> : null}
          {object.status === "pending_moderation" ? <span className="badge">Pending</span> : null}
        </span>
      </header>
      <div className="wall-object-card__media">{body}</div>
      {canManage && !(surface && object.type === "timer") ? (
        <footer className="wall-object-card__actions">
          {object.type.endsWith(".live") && live ? (
            <button type="button" className="secondary" onClick={() => onStopShare?.(object.id)}>
              Stop share
            </button>
          ) : null}
          {object.status === "pending_moderation" ? (
            <>
              <button type="button" className="secondary" onClick={() => void onModerate?.(object.id, "approve")}>
                Approve
              </button>
              <button type="button" className="secondary" onClick={() => void onModerate?.(object.id, "reject")}>
                Reject
              </button>
            </>
          ) : null}
          <button type="button" className="secondary" onClick={() => void onRemove?.(object.id)}>
            Remove
          </button>
        </footer>
      ) : null}
    </article>
  );
}