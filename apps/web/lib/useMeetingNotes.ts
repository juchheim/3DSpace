"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  MeetingNotesDownloadFormat,
  MeetingNotesSegment,
  MeetingNotesSession,
  MeetingNotesSessionDetail
} from "@3dspace/contracts";
import {
  ApiError,
  deleteMeetingNotesSession,
  downloadMeetingNotesArtifact,
  fetchMeetingNotesSession,
  listMeetingNotesSessions,
  resummarizeMeetingNotesSession,
  startMeetingNotesSession,
  updateMeetingNotesSession,
  uploadMeetingNotesAudioChunk
} from "./api";
import type { ApiIdentity } from "./identity";
import type { RealtimeMessage } from "./realtime";

type PublishMessage = (message: RealtimeMessage) => void;

type ParticipantAudioInput = {
  participantId: string;
  displayName: string;
  microphoneStream?: MediaStream | null | undefined;
};

type RecorderState = {
  recorder: MediaRecorder;
  stream: MediaStream;
  lastAbsoluteAt: number;
};

function describeAudioStream(stream: MediaStream) {
  return stream.getAudioTracks().map((track) => ({
    id: track.id,
    label: track.label,
    enabled: track.enabled,
    muted: track.muted,
    readyState: track.readyState
  }));
}

function supportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4"
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
}

function mergeSession(sessions: MeetingNotesSession[], session: MeetingNotesSession) {
  const next = sessions.filter((candidate) => candidate.id !== session.id);
  next.unshift(session);
  next.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return next;
}

function mergeSegment(segments: MeetingNotesSegment[], incoming: MeetingNotesSegment) {
  const next = segments.filter((segment) => segment.id !== incoming.id);
  next.push(incoming);
  next.sort((a, b) => a.startMs - b.startMs || a.speakerUserId.localeCompare(b.speakerUserId));
  return next;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const slice = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function useMeetingNotes(input: {
  identity: ApiIdentity;
  roomId?: string | null | undefined;
  roomName?: string | null | undefined;
  enabled: boolean;
  participants: ParticipantAudioInput[];
  publish?: PublishMessage | undefined;
}) {
  const [sessions, setSessions] = useState<MeetingNotesSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<MeetingNotesSessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const recordersRef = useRef(new Map<string, RecorderState>());
  const pendingUploadsRef = useRef(new Set<Promise<void>>());
  const stoppingRef = useRef(false);

  const refreshSessions = useCallback(async () => {
    if (!input.enabled || !input.roomId) return;
    const result = await listMeetingNotesSessions(input.identity, input.roomId);
    setSessions(result.sessions);
    const active = result.sessions.find((session) => session.status === "starting" || session.status === "recording" || session.status === "finalizing");
    if (!currentSessionId && active) {
      setCurrentSessionId(active.id);
    }
  }, [currentSessionId, input.enabled, input.identity, input.roomId]);

  const refreshCurrentSession = useCallback(async (sessionId: string) => {
    if (!input.enabled || !input.roomId) return;
    const detail = await fetchMeetingNotesSession(input.identity, input.roomId, sessionId);
    setCurrentSession(detail);
    setSessions((existing) => mergeSession(existing, detail));
  }, [input.enabled, input.identity, input.roomId]);

  useEffect(() => {
    if (!input.enabled || !input.roomId) return;
    void refreshSessions().catch(() => undefined);
    const interval = window.setInterval(() => {
      void refreshSessions().catch(() => undefined);
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [input.enabled, input.roomId, refreshSessions]);

  useEffect(() => {
    if (!currentSessionId || !input.enabled || !input.roomId) {
      setCurrentSession(null);
      return;
    }
    void refreshCurrentSession(currentSessionId).catch(() => undefined);
  }, [currentSessionId, input.enabled, input.roomId, refreshCurrentSession]);

  useEffect(() => {
    if (!currentSessionId || currentSession?.status !== "recording" || !input.enabled) return;
    const interval = window.setInterval(() => {
      void refreshCurrentSession(currentSessionId).catch(() => undefined);
    }, 8_000);
    return () => window.clearInterval(interval);
  }, [currentSession?.status, currentSessionId, input.enabled, refreshCurrentSession]);

  const publishRealtimeMessages = useCallback((messages: RealtimeMessage[]) => {
    for (const message of messages) input.publish?.(message);
  }, [input.publish]);

  const handleRealtimeMessage = useCallback((message: RealtimeMessage) => {
    if (!input.roomId || !("roomId" in message) || message.roomId !== input.roomId) return false;
    if (message.type === "room.meeting-notes.started.v1") {
      setSessions((existing) => mergeSession(existing, message.session));
      setCurrentSessionId(message.sessionId);
      setCurrentSession((existing) => existing?.id === message.sessionId ? { ...existing, ...message.session } : ({
        ...message.session,
        segments: []
      }));
      return true;
    }
    if (message.type === "room.meeting-notes.ended.v1" || message.type === "room.meeting-notes.summary-ready.v1") {
      setSessions((existing) => mergeSession(existing, message.session));
      setCurrentSession((existing) => existing?.id === message.sessionId ? { ...existing, ...message.session } : existing);
      return true;
    }
    if (message.type === "room.meeting-notes.error.v1") {
      setCurrentSession((existing) => existing?.id === message.sessionId ? { ...existing, status: "error", errorMessage: message.errorMessage } : existing);
      return true;
    }
    if (message.type === "room.meeting-notes.segment.v1") {
      setCurrentSession((existing) => {
        if (!existing || existing.id !== message.sessionId) return existing;
        return {
          ...existing,
          segments: mergeSegment(existing.segments, message.segment)
        };
      });
      return true;
    }
    return false;
  }, [input.roomId]);

  const start = useCallback(async () => {
    if (!input.roomId) throw new Error("Room is not ready.");
    setLoading(true);
    setError("");
    stoppingRef.current = false;
    try {
      const result = await startMeetingNotesSession(input.identity, input.roomId);
      console.info("[meeting-notes] Session started", {
        roomId: input.roomId,
        sessionId: result.session.id,
        startedByUserId: result.session.startedByUserId
      });
      setSessions((existing) => mergeSession(existing, result.session));
      setCurrentSessionId(result.session.id);
      setCurrentSession({ ...result.session, segments: [] });
      publishRealtimeMessages(result.realtimeMessages as RealtimeMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start meeting notes.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [input.identity, input.roomId, publishRealtimeMessages]);

  const stopAndFlushRecorders = useCallback(async () => {
    const states = Array.from(recordersRef.current.values());
    console.info("[meeting-notes] Stopping recorders before finalizing", {
      recorderCount: states.length,
      pendingUploads: pendingUploadsRef.current.size
    });
    recordersRef.current.clear();
    if (states.length === 0) {
      if (pendingUploadsRef.current.size > 0) {
        await Promise.allSettled(Array.from(pendingUploadsRef.current));
      }
      return;
    }

    const stopPromises = states.map((state) => {
      if (state.recorder.state === "inactive") return Promise.resolve();
      return new Promise<void>((resolve) => {
        state.recorder.addEventListener("stop", () => resolve(), { once: true });
        state.recorder.stop();
      });
    });

    await Promise.all(stopPromises);
    if (pendingUploadsRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingUploadsRef.current));
    }
    console.info("[meeting-notes] Recorder flush complete", {
      pendingUploads: pendingUploadsRef.current.size
    });
  }, []);

  const stop = useCallback(async () => {
    if (!input.roomId || !currentSessionId) throw new Error("Meeting notes are not active.");
    setLoading(true);
    setError("");
    stoppingRef.current = true;
    try {
      await stopAndFlushRecorders();
      const result = await updateMeetingNotesSession(input.identity, input.roomId, currentSessionId, "stop");
      setSessions((existing) => mergeSession(existing, result.session));
      await refreshCurrentSession(currentSessionId);
      publishRealtimeMessages(result.realtimeMessages as RealtimeMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to stop meeting notes.");
      throw err;
    } finally {
      stoppingRef.current = false;
      setLoading(false);
    }
  }, [currentSessionId, input.identity, input.roomId, publishRealtimeMessages, refreshCurrentSession, stopAndFlushRecorders]);

  const resummarize = useCallback(async () => {
    if (!input.roomId || !currentSessionId) throw new Error("Meeting notes are not ready.");
    setLoading(true);
    setError("");
    try {
      const result = await resummarizeMeetingNotesSession(input.identity, input.roomId, currentSessionId);
      setSessions((existing) => mergeSession(existing, result.session));
      await refreshCurrentSession(currentSessionId);
      publishRealtimeMessages(result.realtimeMessages as RealtimeMessage[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to regenerate summary.");
      throw err;
    } finally {
      setLoading(false);
    }
  }, [currentSessionId, input.identity, input.roomId, publishRealtimeMessages, refreshCurrentSession]);

  const remove = useCallback(async (sessionId: string) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    await deleteMeetingNotesSession(input.identity, input.roomId, sessionId);
    setSessions((existing) => existing.filter((session) => session.id !== sessionId));
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setCurrentSession(null);
    }
  }, [currentSessionId, input.identity, input.roomId]);

  const download = useCallback(async (sessionId: string, format: MeetingNotesDownloadFormat) => {
    if (!input.roomId) throw new Error("Room is not ready.");
    const content = await downloadMeetingNotesArtifact(input.identity, input.roomId, sessionId, format);
    const ext = format;
    const roomSlug = (input.roomName ?? "meeting-notes").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadTextFile(`meeting-notes-${roomSlug}-${sessionId}.${ext}`, content, format === "md" ? "text/markdown" : "text/plain");
  }, [input.identity, input.roomId, input.roomName]);

  const copyTranscript = useCallback(async () => {
    const transcript = currentSession?.segments.map((segment) => segment.text).join("\n");
    if (!transcript) return;
    await navigator.clipboard.writeText(transcript);
  }, [currentSession?.segments]);

  const activeSession = useMemo(() => {
    if (currentSession && (currentSession.status === "starting" || currentSession.status === "recording" || currentSession.status === "finalizing")) {
      return currentSession;
    }
    return sessions.find((session) => session.status === "starting" || session.status === "recording" || session.status === "finalizing") ?? null;
  }, [currentSession, sessions]);

  const speakerLabel = useCallback((participantId: string) => {
    return input.participants.find((participant) => participant.participantId === participantId)?.displayName ?? participantId;
  }, [input.participants]);

  useEffect(() => {
    const shouldCapture =
      Boolean(input.enabled && input.roomId && activeSession?.status === "recording" && activeSession.startedByUserId === input.identity.userId);
    const desired = new Map(
      (shouldCapture ? input.participants : [])
        .filter((participant) => participant.microphoneStream && participant.microphoneStream.getAudioTracks().length > 0)
        .map((participant) => [participant.participantId, participant])
    );

    for (const [participantId, state] of recordersRef.current.entries()) {
      const nextParticipant = desired.get(participantId);
      if (!nextParticipant || nextParticipant.microphoneStream !== state.stream) {
        console.info("[meeting-notes] Stopping recorder for participant", {
          participantId,
          reason: nextParticipant ? "stream-changed" : "stream-missing",
          recorderState: state.recorder.state
        });
        if (state.recorder.state !== "inactive") state.recorder.stop();
        recordersRef.current.delete(participantId);
      }
    }

    if (!shouldCapture || !activeSession || !input.roomId) return;

    const sessionStartMs = new Date(activeSession.startedAt).getTime();
    const mimeType = supportedRecorderMimeType();

    for (const [participantId, participant] of desired.entries()) {
      const stream = participant.microphoneStream!;
      const existing = recordersRef.current.get(participantId);
      if (existing && existing.stream === stream) continue;
      if (typeof MediaRecorder === "undefined") continue;
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      console.info("[meeting-notes] Starting recorder for participant", {
        roomId: input.roomId,
        sessionId: activeSession.id,
        participantId,
        mimeType: mimeType ?? recorder.mimeType,
        tracks: describeAudioStream(stream)
      });
      const recorderState: RecorderState = {
        recorder,
        stream,
        lastAbsoluteAt: Date.now()
      };
      recorder.ondataavailable = (event) => {
        if (!event.data || event.data.size === 0 || !input.roomId) return;
        const chunkStartedAt = recorderState.lastAbsoluteAt;
        const chunkEndedAt = Date.now();
        recorderState.lastAbsoluteAt = chunkEndedAt;
        console.info("[meeting-notes] Uploading audio chunk", {
          roomId: input.roomId,
          sessionId: activeSession.id,
          participantId,
          bytes: event.data.size,
          mimeType: event.data.type || mimeType || "audio/webm",
          durationMs: Math.max(0, chunkEndedAt - chunkStartedAt),
          recorderState: recorder.state
        });
        const uploadPromise = event.data.arrayBuffer()
          .then((buffer) => uploadMeetingNotesAudioChunk(input.identity, input.roomId!, activeSession.id, {
            participantId,
            startedAtMs: Math.max(0, chunkStartedAt - sessionStartMs),
            endedAtMs: Math.max(0, chunkEndedAt - sessionStartMs),
            mimeType: event.data.type || mimeType || "audio/webm",
            audioBase64: base64FromBytes(new Uint8Array(buffer))
          }))
          .then((result) => {
            const segment = result.segment;
            console.info("[meeting-notes] Audio chunk upload accepted", {
              roomId: input.roomId,
              sessionId: activeSession.id,
              participantId,
              hasSegment: Boolean(segment),
              textLength: segment?.text.length ?? 0
            });
            if (segment) {
              setCurrentSession((existingSession) => {
                if (!existingSession || existingSession.id !== activeSession.id) return existingSession;
                return {
                  ...existingSession,
                  segments: mergeSegment(existingSession.segments, segment)
                };
              });
            }
            publishRealtimeMessages(result.realtimeMessages as RealtimeMessage[]);
          })
          .catch((err) => {
            if (err instanceof ApiError && err.statusCode === 409 && stoppingRef.current) {
              console.info("[meeting-notes] Ignored audio upload race during stop", {
                roomId: input.roomId,
                sessionId: activeSession.id,
                participantId,
                statusCode: err.statusCode
              });
              return;
            }
            console.error("[meeting-notes] Audio chunk upload failed", {
              roomId: input.roomId,
              sessionId: activeSession.id,
              participantId,
              error: err instanceof Error ? err.message : String(err),
              statusCode: err instanceof ApiError ? err.statusCode : undefined,
              code: err instanceof ApiError ? err.code : undefined
            });
            setError(err instanceof Error ? err.message : "Unable to upload meeting notes audio.");
          })
          .finally(() => {
            pendingUploadsRef.current.delete(uploadPromise);
          });
        pendingUploadsRef.current.add(uploadPromise);
      };
      recorder.start(4_000);
      recordersRef.current.set(participantId, recorderState);
    }
  }, [activeSession, input.enabled, input.identity, input.participants, input.roomId, publishRealtimeMessages]);

  useEffect(() => {
    return () => {
      for (const state of recordersRef.current.values()) {
        if (state.recorder.state !== "inactive") state.recorder.stop();
      }
      recordersRef.current.clear();
    };
  }, []);

  return {
    sessions,
    currentSessionId,
    currentSession,
    activeSession,
    loading,
    error,
    setCurrentSessionId,
    handleRealtimeMessage,
    start,
    stop,
    resummarize,
    remove,
    download,
    copyTranscript,
    speakerLabel,
    refresh: refreshSessions
  };
}
