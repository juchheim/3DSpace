"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarStateMessage, Role, RoomManifest, RoomSessionResponse, ViewMode, WallObject } from "@3dspace/contracts";
import { createAvatarState } from "@3dspace/room-engine";
import { joinRoom, listClassMembers } from "../lib/api";
import { pickDisplayName } from "../lib/displayName";
import { useAvatarMovement } from "../lib/useAvatarMovement";
import { useThirdPersonCamera } from "../lib/useThirdPersonCamera";
import { useLocalMedia } from "../lib/useLocalMedia";
import { useDisplayMedia } from "../lib/useDisplayMedia";
import { useWallObjects } from "../lib/useWallObjects";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { navigateToLobby } from "../lib/navigateToLobby";
import { normalizeRoomManifest } from "../lib/manifest";
import { createRealtimeClient, type RealtimeClient, type RealtimeMessage } from "../lib/realtime";
import { useSpatialAudio } from "../lib/useSpatialAudio";
import { AnchorPanel } from "./AnchorPanel";
import { AuthGate } from "../lib/auth";
import { ClassroomPanel } from "./ClassroomPanel";
import { MediaControls } from "./MediaControls";
import { MovementPad } from "./MovementPad";
import { RoomView2D } from "./RoomView2D";
import { Roster } from "./Roster";
import { useClassroomState } from "../lib/useClassroomState";

const RoomView3D = dynamic(() => import("./RoomView3D").then((module) => module.RoomView3D), {
  ssr: false,
  loading: () => <div className="fallback-view">Loading the 3D room...</div>
});

function isActiveLiveWallObject(object: WallObject) {
  return object.type.endsWith(".live") && object.status === "active";
}

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
  const router = useRouter();
  const { identity, loaded: identityLoaded, clerkEnabled, signedIn } = usePersistentIdentity();
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [manifest, setManifest] = useState<RoomManifest | null>(null);
  const [participants, setParticipants] = useState<Record<string, ParticipantView>>({});
  const [status, setStatus] = useState("Connecting...");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const avatarStateRef = useRef<AvatarStateMessage | null>(null);
  const memberNamesRef = useRef(new Map<string, string>());
  const displayNameRef = useRef(identity.displayName);
  displayNameRef.current = identity.displayName;
  const media = useLocalMedia(session?.tuning.media);
  const displayMedia = useDisplayMedia();
  const camera = useThirdPersonCamera({ viewMode });
  const occupiedSpawnPositions = useMemo(
    () => Object.values(participants).filter((participant) => participant.id !== session?.participantId).map((participant) => participant.state.position),
    [participants, session?.participantId]
  );
  const movement = useAvatarMovement({
    manifest,
    participantId: session?.participantId ?? identity.userId,
    role: session?.role ?? identity.role,
    occupiedPositions: occupiedSpawnPositions,
    viewMode,
    cameraYawRef: camera.yawRef,
    media: {
      cameraEnabled: media.cameraEnabled,
      microphoneEnabled: media.microphoneEnabled,
      speaking: media.speaking
    }
  });
  const [remoteWallMedia, setRemoteWallMedia] = useState<Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>>({});
  const [localWallMedia, setLocalWallMedia] = useState<Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>>({});
  const publishRealtime = useCallback((message: RealtimeMessage) => {
    realtimeRef.current?.publish(message);
  }, []);
  const wall = useWallObjects({
    identity,
    roomId: session?.room.id ?? roomId,
    manifest,
    enabled: Boolean(session && manifest),
    publish: publishRealtime
  });
  const classroom = useClassroomState({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: Boolean(session),
    publish: publishRealtime
  });
  const wallRealtimeHandlerRef = useRef(wall.handleRealtimeMessage);
  wallRealtimeHandlerRef.current = wall.handleRealtimeMessage;
  const classroomRealtimeHandlerRef = useRef(classroom.handleRealtimeMessage);
  classroomRealtimeHandlerRef.current = classroom.handleRealtimeMessage;

  useEffect(() => {
    setManifest((current) => (current ? normalizeRoomManifest(current) : current));
    setSession((current) => (current ? { ...current, manifest: normalizeRoomManifest(current.manifest) } : current));
  }, []);

  useEffect(() => {
    if (!movement.avatarState) return;
    camera.yawRef.current = movement.avatarState.rotation.y;
  }, [movement.avatarState?.participantId]);

  const releaseMedia = media.release;
  const teardownSession = useCallback(() => {
    realtimeRef.current?.close();
    realtimeRef.current = null;
    releaseMedia();
    displayMedia.stop();
    setRemoteWallMedia({});
    setLocalWallMedia({});
  }, [displayMedia.stop, releaseMedia]);

  const leaveForLobby = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setStatus("Leaving room...");
    teardownSession();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        navigateToLobby(router);
      });
    });
  }, [leaving, router, teardownSession]);

  useEffect(() => {
    if (!identityLoaded) return;
    if (clerkEnabled && !signedIn) return;
    if (leaving) return;
    let cancelled = false;
    setStatus("Joining room...");
    setError("");
    joinRoom(identity, roomId, inviteCode ? { viewMode, inviteCode } : { viewMode })
      .then((nextSession) => {
        if (cancelled) return;
        const normalizedManifest = normalizeRoomManifest(nextSession.manifest);
        setSession({ ...nextSession, manifest: normalizedManifest });
        setManifest(normalizedManifest);
        setStatus("Room session ready.");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to join room.");
      });
    return () => {
      cancelled = true;
    };
  }, [identityLoaded, clerkEnabled, signedIn, identity.userId, roomId, inviteCode, leaving]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void listClassMembers(identity, session.room.classId)
      .then((members) => {
        if (cancelled) return;
        const nextNames = new Map(members.map((member) => [member.userId, member.displayName]));
        memberNamesRef.current = nextNames;
        setParticipants((current) => {
          const next = { ...current };
          for (const [participantId, participant] of Object.entries(next)) {
            next[participantId] = {
              ...participant,
              displayName: pickDisplayName(participantId, participant.displayName, nextNames.get(participantId))
            };
          }
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session?.room.classId, session?.participantId, identity.userId]);

  useEffect(() => {
    if (!session || leaving) return;
    const activeSession = session;
    let closed = false;

    function handleMessage(message: RealtimeMessage) {
      if (wallRealtimeHandlerRef.current(message)) return;
      if (classroomRealtimeHandlerRef.current(message)) return;
      if (message.type.startsWith("wall.")) return;

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
          const displayName = pickDisplayName(
            message.participantId,
            message.displayName,
            existing?.displayName,
            memberNamesRef.current.get(message.participantId)
          );
          if (!existing) {
            return {
              ...current,
              [message.participantId]: {
                id: message.participantId,
                displayName,
                role: message.role,
                local: false,
                state: createAvatarState({
                  manifest: activeSession.manifest,
                  participantId: message.participantId,
                  role: message.role,
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
              displayName,
              role: message.role,
              lastSeenAt: Date.now()
            }
          };
        });
        return;
      }

      if (message.type !== "avatar.state.v1") return;

      setParticipants((current) => {
        const existing = current[message.participantId];
        return {
          ...current,
          [message.participantId]: {
            ...existing,
            id: message.participantId,
            displayName: pickDisplayName(
              message.participantId,
              existing?.displayName,
              memberNamesRef.current.get(message.participantId)
            ),
            role: existing?.role ?? "student",
            local: false,
            state: message,
            lastSeenAt: Date.now()
          }
        };
      });
    }

    createRealtimeClient({
      roomId,
      session,
      displayName: displayNameRef.current,
      onMessage: handleMessage,
      onRemoteMedia(update) {
        if (update.wallObjectId) {
          setRemoteWallMedia((current) => ({
            ...current,
            [update.wallObjectId!]: {
              ...(current[update.wallObjectId!] ?? {}),
              ...(update.wallVideoStream !== undefined ? { videoStream: update.wallVideoStream } : {}),
              ...(update.wallAudioStream !== undefined ? { audioStream: update.wallAudioStream } : {})
            }
          }));
          return;
        }
        setParticipants((current) => {
          const existing =
            current[update.participantId] ??
            ({
              id: update.participantId,
              displayName: pickDisplayName(update.participantId, undefined, memberNamesRef.current.get(update.participantId)),
              role: "student",
              local: false,
              state: createAvatarState({
                manifest: activeSession.manifest,
                participantId: update.participantId,
                viewMode: activeSession.room.settings.defaultViewMode
              }),
              lastSeenAt: Date.now()
            } satisfies ParticipantView);
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
        displayName: displayNameRef.current,
        role: session.role
      });
      client.syncParticipants();
    });

    return () => {
      closed = true;
      realtimeRef.current?.close();
      realtimeRef.current = null;
    };
  }, [session?.participantId, roomId, leaving]);

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
  }, [session?.participantId, movement.avatarState, identity.displayName, media.cameraStream]);

  useEffect(() => {
    if (!session) return;
    setParticipants((current) => {
      const existing = current[session.participantId];
      if (!existing) return current;
      if (existing.microphoneStream === media.micStream) return current;
      return {
        ...current,
        [session.participantId]: {
          ...existing,
          microphoneStream: media.micStream,
          lastSeenAt: Date.now()
        }
      };
    });
  }, [session?.participantId, media.micStream]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(() => {
      if (avatarStateRef.current) realtimeRef.current?.publish(avatarStateRef.current);
    }, Math.max(60, 1000 / session.tuning.avatarSendHz));
    return () => window.clearInterval(interval);
  }, [session?.participantId, session?.tuning.avatarSendHz]);

  useEffect(() => {
    if (!session || leaving) return;
    const sync = () => {
      realtimeRef.current?.syncParticipants();
    };
    sync();
    const interval = window.setInterval(sync, 3_000);
    return () => window.clearInterval(interval);
  }, [session?.participantId, leaving]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const publish = () => {
      if (cancelled) return;
      void realtimeRef.current?.setLocalMedia({
        cameraStream: media.cameraStream,
        micStream: media.micStream
      });
    };
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(publish);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [media.cameraStream, media.micStream, session]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const cutoff = Date.now() - 30_000;
      setParticipants((current) =>
        Object.fromEntries(Object.entries(current).filter(([id, participant]) => participant.local || participant.lastSeenAt > cutoff || id === session?.participantId))
      );
    }, 4_000);
    return () => window.clearInterval(interval);
  }, [session?.participantId]);

  useEffect(() => {
    if (!session) return;
    const localCameraObjectIds = new Set(
      wall.wallObjects
        .filter(
          (object) =>
            isActiveLiveWallObject(object) &&
            object.type === "camera.live" &&
            object.source.kind === "livekit-track" &&
            object.source.participantId === session.participantId
        )
        .map((object) => object.id)
    );

    setLocalWallMedia((current) => {
      let next = current;
      for (const objectId of localCameraObjectIds) {
        if (current[objectId]?.videoStream === media.cameraStream) continue;
        if (next === current) next = { ...current };
        next[objectId] = { ...(next[objectId] ?? {}), videoStream: media.cameraStream };
      }
      for (const objectId of Object.keys(current)) {
        if (localCameraObjectIds.has(objectId)) {
          if (media.cameraStream) continue;
          if (next === current) next = { ...current };
          next[objectId] = { ...(next[objectId] ?? {}), videoStream: null };
          continue;
        }
        const object = wall.wallObjects.find((candidate) => candidate.id === objectId);
        if (object?.type !== "camera.live") continue;
        if (next === current) next = { ...current };
        delete next[objectId];
      }
      return next;
    });
  }, [media.cameraStream, session?.participantId, wall.wallObjects]);

  const participantList = useMemo(() => Object.values(participants), [participants]);
  const activeBoardGrant = useMemo(
    () =>
      (classroom.state?.boardAccessGrants ?? []).find(
        (grant) => grant.userId === identity.userId && grant.status === "active" && (!grant.expiresAt || Date.parse(grant.expiresAt) > Date.now())
      ) ?? null,
    [classroom.state?.boardAccessGrants, identity.userId]
  );
  const wallMediaStreams = useMemo(() => {
    const next: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }> = {
      ...remoteWallMedia,
      ...localWallMedia
    };
    for (const object of wall.wallObjects) {
      if (object.type.endsWith(".live") && !isActiveLiveWallObject(object)) {
        if (next[object.id]) {
          next[object.id] = { ...(next[object.id] ?? {}), videoStream: null, audioStream: null };
        }
        continue;
      }
      const source = object.source;
      if (source.kind !== "livekit-track") continue;
      const participant = participantList.find((candidate) => candidate.id === source.participantId);
      if (!participant) continue;
      if (object.type === "camera.live") {
        const existing = next[object.id] ?? {};
        next[object.id] = { ...existing, videoStream: existing.videoStream !== undefined ? existing.videoStream : (participant.cameraStream ?? null) };
      }
      if (object.type === "microphone.live") {
        const existing = next[object.id] ?? {};
        next[object.id] = { ...existing, audioStream: existing.audioStream !== undefined ? existing.audioStream : (participant.microphoneStream ?? null) };
      }
    }
    return next;
  }, [localWallMedia, participantList, remoteWallMedia, wall.wallObjects]);
  useSpatialAudio(
    session
      ? {
          participants: participantList,
          localParticipantId: session.participantId,
          config: session.tuning.spatialAudio,
          manifest: manifest ?? undefined,
          wallObjects: wall.wallObjects,
          wallMediaStreams
        }
      : { participants: participantList }
  );

  const createFileObject = useCallback(
    async (input: { anchorId: string; file: File; title: string; altText?: string | undefined; caption?: string | undefined }) => {
      await wall.createFileObject(input);
    },
    [wall.createFileObject]
  );

  const createNote = useCallback(
    async (input: { anchorId: string; title: string; text: string }) => {
      await wall.createInlineObject({ anchorId: input.anchorId, type: "note", title: input.title, data: { text: input.text } });
    },
    [wall.createInlineObject]
  );

  const createTimer = useCallback(
    async (input: { anchorId: string; title: string; seconds: number }) => {
      await wall.createInlineObject({ anchorId: input.anchorId, type: "timer", title: input.title, data: { seconds: input.seconds } });
    },
    [wall.createInlineObject]
  );

  const createPoll = useCallback(
    async (input: { anchorId: string; title: string; question: string; choices: string[] }) => {
      await wall.createInlineObject({ anchorId: input.anchorId, type: "poll", title: input.title, data: { question: input.question, choices: input.choices } });
    },
    [wall.createInlineObject]
  );

  const createLink = useCallback(
    async (input: { anchorId: string; title: string; url: string }) => {
      await wall.createLinkObject({ anchorId: input.anchorId, title: input.title, url: input.url });
    },
    [wall.createLinkObject]
  );

  const pinCamera = useCallback(
    async (anchorId: string) => {
      if (!media.cameraEnabled) media.setCameraEnabled(true);
      await media.waitForCameraStream();
      await wall.createLiveShareObject({ anchorId, type: "camera.live", title: "Pinned camera" });
    },
    [media.cameraEnabled, media.setCameraEnabled, media.waitForCameraStream, wall.createLiveShareObject]
  );

  const pinMicrophone = useCallback(
    async (anchorId: string) => {
      if (!media.microphoneEnabled) media.setMicrophoneEnabled(true);
      await wall.createLiveShareObject({ anchorId, type: "microphone.live", title: "Pinned microphone" });
    },
    [media.microphoneEnabled, media.setMicrophoneEnabled, wall.createLiveShareObject]
  );

  const shareScreen = useCallback(
    async (anchorId: string) => {
      const share = await wall.createLiveShareObject({ anchorId, type: "browser-tab.live", title: "Shared screen" });
      try {
        const stream = await displayMedia.start();
        const audioStream = stream.getAudioTracks().length > 0 ? new MediaStream(stream.getAudioTracks()) : null;
        setLocalWallMedia((current) => ({
          ...current,
          [share.object.id]: {
            videoStream: new MediaStream(stream.getVideoTracks()),
            audioStream
          }
        }));
        await realtimeRef.current?.setLocalWallShare({
          objectId: share.object.id,
          screenStream: stream,
          audioStream,
          publicationName: share.publicationName
        });
        stream.getTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            setLocalWallMedia((current) => {
              const next = { ...current };
              delete next[share.object.id];
              return next;
            });
            void realtimeRef.current?.setLocalWallShare({ objectId: share.object.id, screenStream: null });
            void wall.endShare(share.object.id).catch(() => undefined);
          });
        });
      } catch (err) {
        await wall.endShare(share.object.id).catch(() => undefined);
        throw err;
      }
    },
    [displayMedia, wall.createLiveShareObject, wall.endShare]
  );

  const stopShare = useCallback(
    async (objectId: string) => {
      displayMedia.stop();
      setLocalWallMedia((current) => {
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      setRemoteWallMedia((current) => {
        if (!current[objectId]) return current;
        const next = { ...current };
        delete next[objectId];
        return next;
      });
      await realtimeRef.current?.setLocalWallShare({ objectId, screenStream: null });
      await wall.endShare(objectId);
    },
    [displayMedia, wall.endShare]
  );

  const controlWallObject = useCallback(
    async (
      objectId: string,
      action: "play" | "pause" | "mute" | "unmute" | "seek" | "vote" | "close-poll" | "reopen-poll",
      positionSeconds?: number,
      choiceId?: string
    ) => {
      await wall.controlObject(objectId, {
        action,
        ...(positionSeconds !== undefined ? { positionSeconds } : {}),
        ...(choiceId ? { choiceId } : {})
      });
    },
    [wall.controlObject]
  );

  const moderateWallObject = useCallback(
    async (objectId: string, action: "approve" | "reject") => {
      await wall.controlObject(objectId, { action });
    },
    [wall.controlObject]
  );

  const exitToLobby = (label: string) => (
    <button type="button" className="button secondary" disabled={leaving} onClick={leaveForLobby}>
      {leaving ? "Leaving..." : label}
    </button>
  );

  if (error) {
    return (
      <main className="app-shell">
        <div className="panel stack">
          {exitToLobby("Back to lobby")}
          <div className="alert">{error}</div>
        </div>
      </main>
    );
  }

  if (identityLoaded && clerkEnabled && !signedIn) {
    return (
      <main className="app-shell">
        <div className="panel stack">
          {exitToLobby("Back to lobby")}
          <AuthGate />
          <div className="alert">Sign in to join this production room.</div>
        </div>
      </main>
    );
  }

  const role = session?.role ?? identity.role;

  return (
    <main className="app-shell room-shell">
      {/* Stage fills the full viewport */}
      <div className="room-stage" aria-label="Shared classroom">
        {leaving ? (
          <div className="fallback-view">Leaving...</div>
        ) : !manifest || !session ? (
          <div className="fallback-view">Joining...</div>
        ) : viewMode === "3d" ? (
          <RoomView3D
            manifest={manifest}
            participants={participantList}
            localParticipantId={session.participantId}
            quality={session.room.settings.defaultQuality}
            cameraYawRef={camera.yawRef}
            cameraPitchRef={camera.pitchRef}
            bindCamera={camera.bind}
            onMoveToPoint={(point) => {
              if (camera.consumeClickSuppress()) return;
              movement.moveTo3DPoint(point);
            }}
            wallObjects={wall.wallObjects}
            assetUrls={wall.assetUrls}
            wallMediaStreams={wallMediaStreams}
            canManageWallObjects={session.role === "teacher"}
            currentUserId={identity.userId}
            onWallObjectControl={controlWallObject}
            onWallObjectRemove={async (objectId) => {
              await wall.removeObject(objectId);
            }}
            onWallObjectStopShare={stopShare}
            onWallObjectModerate={moderateWallObject}
          />
        ) : (
          <RoomView2D
            manifest={manifest}
            participants={participantList}
            onMoveToPoint={movement.moveTo2DPoint}
            wallObjects={wall.wallObjects}
            assetUrls={wall.assetUrls}
            wallMediaStreams={wallMediaStreams}
          />
        )}
      </div>

      {/* Top HUD bar */}
      <header className="room-hud-top">
        <div className="room-hud-brand">
          <button type="button" className="room-exit-btn" disabled={leaving} onClick={leaveForLobby}>
            {leaving ? "Leaving..." : "← Lobby"}
          </button>
          <span className="room-hud-name">{session?.room.name ?? "Joining..."}</span>
          <span className="room-hud-meta">{role} · {status}</span>
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

      {/* Bottom-left HUD: media controls + movement pad */}
      <div className="room-hud-left">
        <div className="hud-card">
          <MediaControls media={media} />
          {media.permissionText ? <p className="hud-permission">{media.permissionText}</p> : null}
        </div>
        <div className="hud-card">
          <MovementPad onVector={movement.setTouchVector} />
        </div>
      </div>

      {/* Right HUD: roster + wall objects */}
      <aside className="room-hud-right" aria-label="Room details">
        <Roster participants={participantList} classroomState={classroom.state} />
        <ClassroomPanel
          role={role}
          state={classroom.state}
          loading={classroom.loading}
          error={classroom.error}
          activeHelpRequest={classroom.activeHelpRequest}
          manifest={manifest}
          currentUserId={identity.userId}
          onRunAction={async (action) => {
            await classroom.runAction(action);
          }}
        />
        {manifest && session ? (
          <AnchorPanel
            identity={identity}
            roomId={session.room.id}
            manifest={manifest}
            wallObjects={wall.wallObjects}
            assetUrls={wall.assetUrls}
            wallMediaStreams={wallMediaStreams}
            canCreate={session.role === "teacher" || session.room.settings.wallObjectCreation !== "teacher-only" || Boolean(activeBoardGrant)}
            canManage={session.role === "teacher"}
            role={session.role}
            activeBoardGrant={activeBoardGrant}
            loading={wall.loading}
            error={wall.error || displayMedia.error}
            onCreateFile={createFileObject}
            onCreateNote={createNote}
            onCreateTimer={createTimer}
            onCreatePoll={createPoll}
            onCreateLink={createLink}
            onPinCamera={pinCamera}
            onPinMicrophone={pinMicrophone}
            onShareScreen={shareScreen}
            onRemove={async (objectId) => {
              await wall.removeObject(objectId);
            }}
            onStopShare={stopShare}
            onControl={controlWallObject}
            onModerate={moderateWallObject}
          />
        ) : null}
      </aside>
    </main>
  );
}
