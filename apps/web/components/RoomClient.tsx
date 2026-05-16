"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AvatarStateMessage, Role, RoomManifest, RoomSessionResponse, ViewMode } from "@3dspace/contracts";
import { createAvatarState } from "@3dspace/room-engine";
import { joinRoom } from "../lib/api";
import { useAvatarMovement } from "../lib/useAvatarMovement";
import { useLocalMedia } from "../lib/useLocalMedia";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { createRealtimeClient, type RealtimeClient, type RealtimeMessage } from "../lib/realtime";
import { useSpatialAudio } from "../lib/useSpatialAudio";
import { AnchorPanel } from "./AnchorPanel";
import { AuthGate } from "../lib/auth";
import { MediaControls } from "./MediaControls";
import { MovementPad } from "./MovementPad";
import { RoomView2D } from "./RoomView2D";
import { Roster } from "./Roster";

const RoomView3D = dynamic(() => import("./RoomView3D").then((module) => module.RoomView3D), {
  ssr: false,
  loading: () => <div className="fallback-view">Loading the 3D room...</div>
});

export type ParticipantView = {
  id: string;
  displayName: string;
  role: Role;
  local: boolean;
  state: AvatarStateMessage;
  cameraStream?: MediaStream | null | undefined;
  microphoneStream?: MediaStream | null | undefined;
  lastSeenAt: number;
};

export function RoomClient({ roomId, inviteCode }: { roomId: string; inviteCode?: string }) {
  const { identity, loaded: identityLoaded, clerkEnabled, signedIn } = usePersistentIdentity();
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [manifest, setManifest] = useState<RoomManifest | null>(null);
  const [participants, setParticipants] = useState<Record<string, ParticipantView>>({});
  const [status, setStatus] = useState("Connecting...");
  const [error, setError] = useState("");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const avatarStateRef = useRef<AvatarStateMessage | null>(null);
  const media = useLocalMedia(session?.tuning.media);
  const movement = useAvatarMovement({
    manifest,
    participantId: session?.participantId ?? identity.userId,
    viewMode,
    media: {
      cameraEnabled: media.cameraEnabled,
      microphoneEnabled: media.microphoneEnabled,
      speaking: media.speaking
    }
  });

  useEffect(() => {
    if (!identityLoaded) return;
    if (clerkEnabled && !signedIn) return;
    let cancelled = false;
    setStatus("Joining room...");
    setError("");
    joinRoom(identity, roomId, inviteCode ? { viewMode, inviteCode } : { viewMode })
      .then((nextSession) => {
        if (cancelled) return;
        setSession(nextSession);
        setManifest(nextSession.manifest);
        setStatus("Room session ready.");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to join room.");
      });
    return () => {
      cancelled = true;
    };
  }, [identityLoaded, clerkEnabled, signedIn, identity.userId, identity.displayName, roomId, inviteCode]);

  useEffect(() => {
    if (!session) return;
    const activeSession = session;
    let closed = false;

    function handleMessage(message: RealtimeMessage) {
      if (message.type === "participant.leave.v1") {
        setParticipants((current) => {
          const next = { ...current };
          delete next[message.participantId];
          return next;
        });
        return;
      }

      if (message.type === "participant.presence.v1") {
        setParticipants((current) => {
          const existing = current[message.participantId];
          if (!existing) {
            return {
              ...current,
              [message.participantId]: {
                id: message.participantId,
                displayName: message.displayName,
                role: message.role,
                local: false,
                state: createAvatarState({
                  manifest: activeSession.manifest,
                  participantId: message.participantId,
                  viewMode: activeSession.room.settings.defaultViewMode
                }),
                lastSeenAt: Date.now()
              }
            };
          }
          return {
            ...current,
            [message.participantId]: {
              ...existing,
              displayName: message.displayName,
              role: message.role,
              lastSeenAt: Date.now()
            }
          };
        });
        return;
      }

      setParticipants((current) => ({
        ...current,
        [message.participantId]: {
          id: message.participantId,
          displayName: current[message.participantId]?.displayName ?? message.participantId,
          role: current[message.participantId]?.role ?? "student",
          local: false,
          state: message,
          lastSeenAt: Date.now()
        }
      }));
    }

    createRealtimeClient({
      roomId,
      session,
      displayName: identity.displayName,
      onMessage: handleMessage,
      onRemoteMedia(update) {
        setParticipants((current) => {
          const existing = current[update.participantId];
          if (!existing) return current;
          const nextParticipant: ParticipantView = {
            ...existing,
            state: {
              ...existing.state,
              media: {
                cameraEnabled: update.cameraStream !== undefined ? Boolean(update.cameraStream) : Boolean(existing.state.media?.cameraEnabled),
                microphoneEnabled:
                  update.microphoneStream !== undefined ? Boolean(update.microphoneStream) : Boolean(existing.state.media?.microphoneEnabled),
                speaking: Boolean(existing.state.media?.speaking)
              }
            },
            lastSeenAt: Date.now()
          };
          if (update.cameraStream !== undefined) nextParticipant.cameraStream = update.cameraStream;
          if (update.microphoneStream !== undefined) nextParticipant.microphoneStream = update.microphoneStream;
          return {
            ...current,
            [update.participantId]: nextParticipant
          };
        });
      },
      onStatus: setStatus
    }).then((client) => {
      if (closed) {
        client.close();
        return;
      }
      realtimeRef.current = client;
      client.publish({
        type: "participant.presence.v1",
        participantId: session.participantId,
        displayName: identity.displayName,
        role: session.role
      });
    });

    return () => {
      closed = true;
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };
  }, [session?.participantId, roomId, identity.displayName]);

  useEffect(() => {
    if (!session || !movement.avatarState) return;
    avatarStateRef.current = movement.avatarState;
    setParticipants((current) => ({
      ...current,
      [session.participantId]: {
        id: session.participantId,
        displayName: identity.displayName,
        role: session.role,
        local: true,
        state: movement.avatarState!,
        cameraStream: media.cameraStream,
        microphoneStream: media.micStream,
        lastSeenAt: Date.now()
      }
    }));
  }, [session?.participantId, movement.avatarState, identity.displayName, media.cameraStream, media.micStream]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      if (avatarStateRef.current) realtimeRef.current?.publish(avatarStateRef.current);
    }, Math.max(60, 1000 / session.tuning.avatarSendHz));
    return () => window.clearInterval(interval);
  }, [session?.participantId, session?.tuning.avatarSendHz]);

  useEffect(() => {
    void realtimeRef.current?.setLocalMedia({
      cameraStream: media.cameraStream,
      micStream: media.micStream
    });
  }, [media.cameraStream, media.micStream]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 12_000;
      setParticipants((current) =>
        Object.fromEntries(Object.entries(current).filter(([id, participant]) => participant.local || participant.lastSeenAt > cutoff || id === session?.participantId))
      );
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [session?.participantId]);

  const participantList = useMemo(() => Object.values(participants), [participants]);
  useSpatialAudio(
    session
      ? {
          participants: participantList,
          localParticipantId: session.participantId,
          config: session.tuning.spatialAudio
        }
      : { participants: participantList }
  );

  if (error) {
    return (
      <main className="app-shell">
        <div className="panel stack">
          <Link href="/" className="button secondary">Back to lobby</Link>
          <div className="alert">{error}</div>
        </div>
      </main>
    );
  }

  if (identityLoaded && clerkEnabled && !signedIn) {
    return (
      <main className="app-shell">
        <div className="panel stack">
          <Link href="/" className="button secondary">Back to lobby</Link>
          <AuthGate />
          <div className="alert">Sign in to join this production room.</div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="room-layout">
        <aside className="side-panel stack" aria-label="Session controls">
          <Link href="/" className="button secondary">Lobby</Link>
          <MediaControls media={media} />
          <MovementPad onVector={movement.setTouchVector} />
          <p className="small">{media.permissionText}</p>
        </aside>

        <section className="room-main">
          <header className="room-topbar">
            <div>
              <p className="eyebrow">{session?.role ?? identity.role}</p>
              <h1 className="room-title">{session?.room.name ?? "Joining room"}</h1>
              <p className="small">{status}</p>
            </div>
            <div className="toggle" aria-label="View mode">
              <button aria-pressed={viewMode === "3d"} onClick={() => setViewMode("3d")} disabled={!manifest}>
                3D
              </button>
              <button aria-pressed={viewMode === "2d"} onClick={() => setViewMode("2d")} disabled={!manifest?.capabilities.twoDAnalog}>
                2D
              </button>
            </div>
          </header>

          <div className="room-stage" aria-label="Shared classroom">
            {!manifest || !session ? (
              <div className="fallback-view">Joining the classroom...</div>
            ) : viewMode === "3d" ? (
              <RoomView3D
                manifest={manifest}
                participants={participantList}
                localParticipantId={session.participantId}
                quality={session.room.settings.defaultQuality}
                onMoveToPoint={movement.moveTo3DPoint}
              />
            ) : (
              <RoomView2D manifest={manifest} participants={participantList} onMoveToPoint={movement.moveTo2DPoint} />
            )}
          </div>

          <p className="small">
            Keyboard movement: WASD or arrow keys. Touch movement: use the movement pad. Switch views without leaving the session.
          </p>
        </section>

        <aside className="side-panel stack" aria-label="Room details">
          <Roster participants={participantList} />
          {manifest && session ? <AnchorPanel identity={identity} roomId={session.room.id} manifest={manifest} /> : null}
        </aside>
      </section>
    </main>
  );
}
