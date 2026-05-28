"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { WallObject } from "@3dspace/contracts";
import {
  normalizePollInlineData,
  pollTotalVotes,
  pollVoteCounts,
  readPollState,
  type PollChoice
} from "@3dspace/room-engine";
import {
  forceTimerElapsed,
  pushTimerElapsed,
  resetTimerRuntime,
  timerElapsedForResume
} from "../lib/timerRuntime";
import { useTimerRuntime } from "../lib/useTimerRuntime";
import type { WhiteboardController } from "../lib/useWhiteboards";
import { WhiteboardSurface } from "./Whiteboard/WhiteboardSurface";

type WallObjectCardStyle = CSSProperties & { "--wall-object-fit": string };
export type WallObjectControlAction =
  | "play"
  | "pause"
  | "mute"
  | "unmute"
  | "seek"
  | "vote"
  | "close-poll"
  | "reopen-poll";
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

function StreamVideo({ stream, muted, className }: { stream: MediaStream; muted: boolean; className?: string }) {
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

  return <video ref={videoRef} autoPlay playsInline muted={muted} className={className} />;
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

function WhiteboardSummary({ object, canWrite }: { object: WallObject; canWrite: boolean }) {
  const strokeCount = Number(object.state?.strokeCount ?? 0);
  const lastUpdatedAt = typeof object.state?.lastUpdatedAt === "string" ? object.state.lastUpdatedAt : null;

  return (
    <div className="wall-object-whiteboard-summary">
      <p className="wall-object-card__body">
        Collaborative whiteboard on this board.
        <br />
        {strokeCount} stroke{strokeCount === 1 ? "" : "s"}.
      </p>
      <p className="wall-object-whiteboard-summary__meta">
        {canWrite ? "Draw on the wall surface to edit." : "Read-only."}
        {lastUpdatedAt ? ` Updated ${new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.` : ""}
      </p>
    </div>
  );
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

function pollChoiceLetter(index: number) {
  return String.fromCharCode(65 + index);
}

/** 3D board note — parchment-styled surface that scales text to fill the board. */
function WallNoteBoard({ text, title }: { text: string; title: string }) {
  const displayText = text || title;
  const len = Math.max(1, displayText.length);
  // Continuous scale: sqrt(29.5 / len) fills ~70% of the 506×249 visual-px board at the base font.
  // Base --wall-surface-font-size ≈ 140px CSS (= 70px visual after the 1/2× mount scale).
  const fontScale = Math.min(1.0, Math.max(0.18, Math.sqrt(29.5 / len)));
  return (
    <div
      className="wall-object-card__body wall-note-board"
      style={{ "--note-font-scale": fontScale } as CSSProperties}
    >
      <p className="wall-note-board__text">{displayText}</p>
    </div>
  );
}

/** 3D board poll — separate from sidebar poll markup/CSS for a simple fill-the-board layout. */
function WallPollBoard({
  question,
  title,
  choices,
  counts,
  totalVotes,
  showResults,
  canVote,
  myVote,
  onVote
}: {
  question: string;
  title: string;
  choices: PollChoice[];
  counts: Record<string, number>;
  totalVotes: number;
  showResults: boolean;
  canVote: boolean;
  myVote: string | undefined;
  onVote: (choice: PollChoice) => void;
}) {
  const boardStyle = useMemo(
    () => ({ "--poll-n": choices.length } as CSSProperties),
    [choices.length]
  );

  return (
    <div className="wall-object-card__body wall-poll-board" style={boardStyle}>
      <p className="wall-poll-board__question">{question || title}</p>
      <div className="wall-poll-board__choices" role={canVote && !showResults ? "group" : undefined} aria-label="Poll choices">
        {choices.map((choice, index) => {
          const letter = pollChoiceLetter(index);
          const count = counts[choice.id] ?? 0;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = myVote === choice.id;
          const rowClass = `wall-poll-board__row${selected ? " wall-poll-board__row--selected" : ""}`;

          if (canVote && !showResults) {
            return (
              <button
                key={choice.id}
                type="button"
                className={`${rowClass} wall-poll-board__row--button`}
                data-index={index}
                onClick={() => onVote(choice)}
              >
                <span className="wall-poll-board__letter" aria-hidden>
                  {letter}
                </span>
                <span className="wall-poll-board__label">{choice.label}</span>
              </button>
            );
          }

          return (
            <div key={choice.id} className={rowClass} data-index={index}>
              <span className="wall-poll-board__letter" aria-hidden>
                {letter}
              </span>
              <span className="wall-poll-board__label">{choice.label}</span>
              {showResults ? (
                <span className="wall-poll-board__pct" aria-label={`${percent} percent`}>
                  {percent}%
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {showResults ? (
        <p className="wall-poll-board__total">
          {totalVotes} vote{totalVotes === 1 ? "" : "s"}
        </p>
      ) : null}
    </div>
  );
}

function WallPollDisplay({
  object,
  canManage,
  currentUserId,
  surface = false,
  onControl
}: {
  object: WallObject;
  canManage: boolean;
  currentUserId?: string | undefined;
  surface?: boolean;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number, choiceId?: string) => void;
}) {
  const data = object.source.kind === "inline" ? object.source.data : {};
  const { question, choices } = useMemo(() => normalizePollInlineData(data), [data]);
  const pollState = useMemo(() => readPollState(object.state), [object.state]);
  const counts = useMemo(() => pollVoteCounts(choices, pollState.votesByUserId), [choices, pollState.votesByUserId]);
  const totalVotes = useMemo(() => pollTotalVotes(pollState.votesByUserId), [pollState.votesByUserId]);
  const myVote = currentUserId ? pollState.votesByUserId[currentUserId] : undefined;
  const canVote = object.status === "active" && !pollState.closed && Boolean(currentUserId) && Boolean(onControl);
  const showResults = canManage || pollState.closed || Boolean(myVote);
  const kicker = pollState.closed ? "Poll closed" : canVote ? "Tap your answer" : "Live poll";

  const vote = (choice: PollChoice) => {
    if (!canVote || myVote === choice.id) return;
    void onControl?.(object.id, "vote", undefined, choice.id);
  };

  if (surface) {
    return (
      <WallPollBoard
        question={question}
        title={object.title}
        choices={choices}
        counts={counts}
        totalVotes={totalVotes}
        showResults={showResults}
        canVote={canVote}
        myVote={myVote}
        onVote={vote}
      />
    );
  }

  return (
    <div
      className="wall-object-card__body wall-object-poll"
      data-choice-count={choices.length}
      data-poll-closed={pollState.closed ? "true" : "false"}
      data-show-results={showResults ? "true" : "false"}
    >
      <div className="wall-object-poll__header">
        <p className="wall-object-poll__kicker">{kicker}</p>
        <p className="wall-object-poll__question">{question || object.title}</p>
        {!surface && pollState.closed ? <p className="wall-object-poll__status">Poll closed</p> : null}
      </div>
      <div className="wall-object-poll__choices" role={canVote ? "group" : undefined} aria-label="Poll choices">
        {choices.map((choice, index) => {
          const count = counts[choice.id] ?? 0;
          const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const selected = myVote === choice.id;
          const letter = pollChoiceLetter(index);

          if (showResults) {
            return (
              <div
                key={choice.id}
                className={`wall-object-poll__result${selected ? " wall-object-poll__result--selected" : ""}`}
                data-choice-index={index}
              >
                <span className="wall-object-poll__letter" aria-hidden>
                  {letter}
                </span>
                <div className="wall-object-poll__result-main">
                  <div className="wall-object-poll__result-row">
                    <div className="wall-object-poll__result-choice">{choice.label}</div>
                    <div className="wall-object-poll__result-stats" aria-label={`${count} votes, ${percent} percent`}>
                      <span className="wall-object-poll__result-count">
                        <span className="wall-object-poll__result-count-value">{count}</span>
                        <span className="wall-object-poll__result-count-label"> vote{count === 1 ? "" : "s"}</span>
                      </span>
                      <span className="wall-object-poll__result-sep" aria-hidden>
                        ·
                      </span>
                      <span className="wall-object-poll__result-percent">{percent}%</span>
                    </div>
                  </div>
                  <div className="wall-object-poll__bar" aria-hidden>
                    <div className="wall-object-poll__bar-fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <span className="wall-object-poll__result-hero" aria-hidden>
                  {percent}%
                </span>
              </div>
            );
          }

          return (
            <button
              key={choice.id}
              type="button"
              className={`wall-object-poll__choice${selected ? " wall-object-poll__choice--selected" : ""}`}
              data-choice-index={index}
              disabled={!canVote}
              onClick={() => vote(choice)}
            >
              <span className="wall-object-poll__letter" aria-hidden>
                {letter}
              </span>
              <span className="wall-object-poll__choice-label">{choice.label}</span>
            </button>
          );
        })}
      </div>
      <div className="wall-object-poll__footer">
        {showResults ? <p className="wall-object-poll__total">{totalVotes} vote{totalVotes === 1 ? "" : "s"}</p> : null}
        {canManage && onControl ? (
          <div className="wall-object-poll__manage">
            {pollState.closed ? (
              <button type="button" className="secondary" onClick={() => void onControl(object.id, "reopen-poll")}>
                Reopen poll
              </button>
            ) : (
              <button type="button" className="secondary" onClick={() => void onControl(object.id, "close-poll")}>
                Close poll
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function WallObjectContent({
  object,
  canManage,
  currentUserId,
  surface,
  assetUrl,
  videoStream,
  audioStream,
  onControl,
  whiteboardController,
  whiteboardParticipantNames,
  canWriteWhiteboard
}: {
  object: WallObject;
  canManage: boolean;
  currentUserId?: string | undefined;
  surface: boolean;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number, choiceId?: string) => void;
  whiteboardController?: WhiteboardController | undefined;
  whiteboardParticipantNames?: Record<string, string> | undefined;
  canWriteWhiteboard?: ((object: WallObject) => boolean) | undefined;
}) {
  if (object.type === "whiteboard" && whiteboardController && currentUserId) {
    if (!surface) {
      return <WhiteboardSummary object={object} canWrite={canWriteWhiteboard ? canWriteWhiteboard(object) : canManage} />;
    }
    return (
      <WhiteboardSurface
        object={object}
        board={whiteboardController.getBoard(object.id)}
        controller={whiteboardController}
        currentUserId={currentUserId}
        canManage={canManage}
        canWrite={canWriteWhiteboard ? canWriteWhiteboard(object) : canManage}
        interactive={surface}
        showToolbar
        {...(whiteboardParticipantNames ? { participantNames: whiteboardParticipantNames } : {})}
      />
    );
  }

  if (object.type === "timer") {
    return <WallTimerDisplay object={object} canManage={canManage} surface={surface} {...(onControl ? { onControl } : {})} />;
  }

  const data = object.source.kind === "inline" ? object.source.data : {};

  if (object.type === "note") {
    const text = String(data.text ?? object.description ?? "");
    if (surface) {
      return <WallNoteBoard text={text} title={object.title} />;
    }
    return <p className="wall-object-card__body wall-note-display">{text}</p>;
  }

  if (object.type === "poll") {
    return (
      <WallPollDisplay
        object={object}
        canManage={canManage}
        currentUserId={currentUserId}
        surface={surface}
        {...(onControl ? { onControl } : {})}
      />
    );
  }

  if ((object.type === "image.file" || object.type === "video.file") && assetUrl) {
    if (object.type === "image.file") {
      return (
        <img
          src={assetUrl}
          alt={object.title}
          decoding="async"
          className={surface ? "wall-object-board-image" : undefined}
        />
      );
    }
    if (surface) {
      return <video src={assetUrl} autoPlay playsInline muted loop className="wall-object-card__media-fill" />;
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

  const terminalLiveStatus = object.status === "removed" || object.status === "source_ended" || object.status === "failed" || object.status === "rejected";
  // Camera and microphone shares reuse the participant's existing track and don't require server confirmation to show.
  const participantTrackType = object.type === "camera.live" || object.type === "microphone.live";
  const liveShareActive = !object.type.endsWith(".live") || object.status === "active" || (participantTrackType && !terminalLiveStatus);

  if (videoStream && liveShareActive) {
    return (
      <StreamVideo
        stream={videoStream}
        muted={object.type !== "microphone.live"}
        {...(surface ? { className: "wall-object-card__media-fill" } : {})}
      />
    );
  }

  if (audioStream && liveShareActive) {
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
  currentUserId,
  onRemove,
  onStopShare,
  onControl,
  whiteboardController,
  whiteboardParticipantNames,
  canWriteWhiteboard,
  onModerate,
  onFullscreen,
  hideHeader = false
}: {
  object: WallObject;
  assetUrl?: string | undefined;
  videoStream?: MediaStream | null | undefined;
  audioStream?: MediaStream | null | undefined;
  compact?: boolean;
  surface?: boolean;
  canManage?: boolean;
  currentUserId?: string | undefined;
  onRemove?: (objectId: string) => void;
  onStopShare?: (objectId: string) => void;
  onControl?: (objectId: string, action: WallObjectControlAction, positionSeconds?: number, choiceId?: string) => void;
  whiteboardController?: WhiteboardController | undefined;
  whiteboardParticipantNames?: Record<string, string> | undefined;
  canWriteWhiteboard?: ((object: WallObject) => boolean) | undefined;
  onModerate?: (objectId: string, action: "approve" | "reject") => void;
  onFullscreen?: (objectId: string) => void;
  hideHeader?: boolean;
}) {
  const live = object.type.endsWith(".live") && object.status === "active";
  const fit = object.placement.fit === "stretch" ? "fill" : object.placement.fit;
  const style = useMemo<WallObjectCardStyle>(() => ({ "--wall-object-fit": fit }), [fit]);
  const body = useMemo(
    () => (
      <WallObjectContent
        object={object}
        canManage={canManage}
        currentUserId={currentUserId}
        surface={surface}
        assetUrl={assetUrl}
        videoStream={videoStream}
        audioStream={audioStream}
        whiteboardController={whiteboardController}
        whiteboardParticipantNames={whiteboardParticipantNames}
        canWriteWhiteboard={canWriteWhiteboard}
        {...(onControl ? { onControl } : {})}
      />
    ),
    [assetUrl, audioStream, canManage, canWriteWhiteboard, currentUserId, object, onControl, surface, videoStream, whiteboardController, whiteboardParticipantNames]
  );

  return (
    <article
      className={`wall-object-card${compact ? " wall-object-card--compact" : ""}${surface ? " wall-object-card--surface" : ""}`}
      data-wall-object-id={object.id}
      data-wall-object-type={object.type}
      style={style}
    >
      {surface && onFullscreen ? (
        <button
          type="button"
          className="wall-object-fullscreen-btn"
          onClick={() => onFullscreen(object.id)}
          aria-label="View fullscreen"
          title="View fullscreen"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
            <path d="M1 4V1h3M9 4V1H6M1 6v3h3M9 6v3H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      ) : null}
      {hideHeader ? null : (
        <header className="wall-object-card__header">
          <strong>{object.title}</strong>
          <span className="wall-object-card__badges">
            <span className="badge">{typeLabel(object.type)}</span>
            {live ? <span className="badge">Live</span> : null}
            {object.status === "pending_moderation" ? <span className="badge">Pending</span> : null}
          </span>
        </header>
      )}
      <div className="wall-object-card__media">{body}</div>
      {canManage && !(surface && (object.type === "timer" || object.type === "poll" || object.type === "whiteboard")) ? (
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
