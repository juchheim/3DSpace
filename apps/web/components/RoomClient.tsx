"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarAppearance, AvatarReactionMessage, AvatarReactionSlug, AvatarStateMessage, Role, RoomManifest, RoomSessionResponse, ViewMode, WallObject } from "@3dspace/contracts";
import { AvatarAppearanceMessageSchema, AvatarReactionMessageSchema, ParticipantAudioModeMessageSchema } from "@3dspace/contracts";
import { computeGroupMemberPosition, createAvatarState, floorYFromZ, unprojectPointFrom2D } from "@3dspace/room-engine";
import { joinRoom, listClassMembers, patchAvatarAppearance, postRoomEvent } from "../lib/api";
import { CLIENT_TUNING } from "../lib/config";
import { pickDisplayName } from "../lib/displayName";
import { useAvatarMovement } from "../lib/useAvatarMovement";
import { useAvatarAppearance } from "../lib/useAvatarAppearance";
import { useAvatarReactions } from "../lib/useAvatarReactions";
import { useAudioModes } from "../lib/useAudioModes";
import { DEFAULT_APPEARANCE } from "./BlockyAvatar";
import { useThirdPersonCamera } from "../lib/useThirdPersonCamera";
import { useLocalMedia } from "../lib/useLocalMedia";
import { useDisplayMedia } from "../lib/useDisplayMedia";
import { useWallObjects } from "../lib/useWallObjects";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { navigateToLobby } from "../lib/navigateToLobby";
import { normalizeRoomManifest } from "../lib/manifest";
import { createRealtimeClient, type RealtimeClient, type RealtimeMessage } from "../lib/realtime";
import { useSpatialAudio } from "../lib/useSpatialAudio";
import { isBoardGrantActive } from "../lib/classroomGrants";
import { AnchorPanel } from "./AnchorPanel";
import { AuthGate } from "../lib/auth";
import { ClassroomPanel } from "./ClassroomPanel";
import { FocusPanel } from "./FocusPanel";
import { GroupsPanel } from "./GroupsPanel";
import { PrivateChecksPanel } from "./PrivateChecksPanel";
import { MediaControls } from "./MediaControls";
import { MovementPad } from "./MovementPad";
import { RoomView2D } from "./RoomView2D";
import { BoardAccessSidePanel } from "./BoardAccessSidePanel";
import { activeGrantMap, Roster, StudentDetailPanel } from "./Roster";
import { useClassroomState } from "../lib/useClassroomState";
import { useLessonRun } from "../lib/useLessonRun";
import { LessonAuthoringPanel } from "./LessonAuthoringPanel";
import { LessonRunControls } from "./LessonRunControls";
import { LessonStudentCallout } from "./LessonStudentCallout";
import { LessonTimelinePanel } from "./LessonTimelinePanel";
import { AvatarEditorPanel } from "./AvatarEditorPanel";

const RoomView3D = dynamic(() => import("./RoomView3D").then((module) => module.RoomView3D), {
  ssr: false,
  loading: () => <div className="fallback-view">Loading the 3D room...</div>
});

function isActiveLiveWallObject(object: WallObject) {
  return object.type.endsWith(".live") && object.status === "active";
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua);
}

async function warmSafariLiveKitPermissions() {
  if (!isSafariBrowser()) return;
  if (!navigator.mediaDevices?.getUserMedia) return;

  const attempts: Array<{ kind: "audio" | "video"; constraints: MediaStreamConstraints }> = [
    { kind: "audio", constraints: { audio: true, video: false } },
    { kind: "video", constraints: { audio: false, video: true } }
  ];

  for (const attempt of attempts) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(attempt.constraints);
      stream.getTracks().forEach((track) => track.stop());
      console.log("[LiveKit Safari permission warmup]", { result: "granted", kind: attempt.kind });
      return;
    } catch (error) {
      console.warn("[LiveKit Safari permission warmup]", {
        result: "failed",
        kind: attempt.kind,
        error: error instanceof Error ? error.name : "unknown"
      });
    }
  }
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
  const [firstPerson, setFirstPerson] = useState(false);
  useEffect(() => {
    if (viewMode !== "3d") setFirstPerson(false);
  }, [viewMode]);
  useEffect(() => {
    if (viewMode !== "3d") return;
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (e.code === "KeyV") setFirstPerson((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode]);
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [manifest, setManifest] = useState<RoomManifest | null>(null);
  const [participants, setParticipants] = useState<Record<string, ParticipantView>>({});
  const [status, setStatus] = useState("Connecting...");
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const realtimeGenerationRef = useRef(0);
  const avatarStateRef = useRef<AvatarStateMessage | null>(null);
  const memberNamesRef = useRef(new Map<string, string>());
  const localAppearanceRef = useRef<AvatarAppearance>(DEFAULT_APPEARANCE);
  const seenParticipantsRef = useRef(new Set<string>());
  const { receiveAppearance, setLocalAppearance, getAppearance } = useAvatarAppearance();
  const { receive: receiveReaction, drop: dropReaction, getReaction, log } = useAvatarReactions();
  const { receive: receiveAudioMode, drop: dropAudioMode, all: audioModes } = useAudioModes();
  const [whisperMode, setWhisperMode] = useState<"normal" | "whisper">("normal");
  const whisperModeRef = useRef(whisperMode);
  whisperModeRef.current = whisperMode;
  const displayNameRef = useRef(identity.displayName);
  displayNameRef.current = identity.displayName;
  const media = useLocalMedia(session?.tuning.media);
  const priorHallpassMicRef = useRef<boolean | null>(null);
  const micEnabledRef = useRef(media.microphoneEnabled);
  micEnabledRef.current = media.microphoneEnabled;
  const displayMedia = useDisplayMedia();
  const camera = useThirdPersonCamera({ viewMode });
  const occupiedSpawnPositions = useMemo(
    () => Object.values(participants).filter((participant) => participant.id !== session?.participantId).map((participant) => participant.state.position),
    [participants, session?.participantId]
  );
  const [remoteWallMedia, setRemoteWallMedia] = useState<Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>>({});
  const [localWallMedia, setLocalWallMedia] = useState<Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }>>({});
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [helpBoardAccessUserId, setHelpBoardAccessUserId] = useState("");
  const [positioningGroupId, setPositioningGroupId] = useState("");
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [localDraftAppearance, setLocalDraftAppearance] = useState<AvatarAppearance | null>(null);
  const [waveTriggered, setWaveTriggered] = useState(false);
  const [hallpassBusy, setHallpassBusy] = useState(false);
  const [hallpassElapsedSeconds, setHallpassElapsedSeconds] = useState(0);
  const waveTriggeredRef = useRef(false);
  waveTriggeredRef.current = waveTriggered;
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
  const role = session?.role ?? identity.role;
  const lesson = useLessonRun({
    state: classroom.state,
    loading: classroom.loading,
    error: classroom.error,
    role,
    runAction: classroom.runAction
  });
  const wallRealtimeHandlerRef = useRef(wall.handleRealtimeMessage);
  wallRealtimeHandlerRef.current = wall.handleRealtimeMessage;
  const classroomRealtimeHandlerRef = useRef(classroom.handleRealtimeMessage);
  classroomRealtimeHandlerRef.current = classroom.handleRealtimeMessage;
  camera.lockedRef.current = classroom.state?.spotlight?.mode === "force";

  const myActiveHallpass = useMemo(() => {
    return (classroom.state?.helpRequests ?? []).find(
      (r) => r.userId === identity.userId && r.kind === "hallpass" && (r.status === "raised" || r.status === "acknowledged")
    ) ?? null;
  }, [classroom.state?.helpRequests, identity.userId]);

  const myTodayPassCount = useMemo(() => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    return (classroom.state?.helpRequests ?? []).filter(
      (r) => r.userId === identity.userId && r.kind === "hallpass" && r.status === "closed" && typeof r.returnedAt === "string" && r.returnedAt.startsWith(todayPrefix)
    ).length;
  }, [classroom.state?.helpRequests, identity.userId]);

  const lockedPosition = useMemo(() => {
    if (myActiveHallpass?.status === "acknowledged" && manifest?.hallpassHoldingZone) {
      const zone = manifest.hallpassHoldingZone;
      return { x: (zone.minX + zone.maxX) / 2, y: 0, z: (zone.minZ + zone.maxZ) / 2 };
    }
    const userId = session?.participantId ?? identity.userId;
    const group = classroom.state?.groups.find(
      (g) => g.status === "active" && g.hold?.enabled && g.hold.mode === "hard" && g.targetPosition && g.memberUserIds.includes(userId)
    );
    if (!group?.targetPosition) return null;
    const memberIndex = group.memberUserIds.indexOf(userId);
    return computeGroupMemberPosition(group.targetPosition, memberIndex);
  }, [myActiveHallpass?.status, manifest?.hallpassHoldingZone, classroom.state?.groups, session?.participantId, identity.userId]);

  useEffect(() => {
    if (myActiveHallpass?.status === "acknowledged") {
      if (priorHallpassMicRef.current === null) {
        priorHallpassMicRef.current = micEnabledRef.current;
      }
      media.setMicrophoneEnabled(false);
    } else if (priorHallpassMicRef.current !== null) {
      media.setMicrophoneEnabled(priorHallpassMicRef.current);
      priorHallpassMicRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myActiveHallpass?.status, media.setMicrophoneEnabled]);

  useEffect(() => {
    if (myActiveHallpass?.status !== "acknowledged" || !myActiveHallpass.approvedAt) {
      setHallpassElapsedSeconds(0);
      return;
    }
    const start = new Date(myActiveHallpass.approvedAt).getTime();
    setHallpassElapsedSeconds(Math.floor((Date.now() - start) / 1000));
    const id = window.setInterval(() => setHallpassElapsedSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [myActiveHallpass?.status, myActiveHallpass?.approvedAt]);

  function formatElapsed(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

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
    },
    lockedPosition
  });

  const lookAtFocus = useCallback(
    (anchorId: string) => {
      if (!manifest) return;
      const anchor = manifest.wallAnchors.find((a) => a.id === anchorId);
      if (!anchor) return;
      const pos = avatarStateRef.current?.position;
      if (!pos) return;
      camera.yawRef.current = Math.atan2(anchor.position.x - pos.x, anchor.position.z - pos.z);
    },
    [manifest, camera.yawRef]
  );

  // Force mode: snap camera to the spotlight anchor on activation
  const spotlight = classroom.state?.spotlight;
  useEffect(() => {
    if (spotlight?.mode !== "force" || !spotlight.anchorId || !manifest) return;
    const anchor = manifest.wallAnchors.find((a) => a.id === spotlight.anchorId);
    if (!anchor) return;
    const pos = avatarStateRef.current?.position;
    if (!pos) return;
    camera.yawRef.current = Math.atan2(anchor.position.x - pos.x, anchor.position.z - pos.z);
  }, [spotlight?.anchorId, spotlight?.mode, manifest, camera.yawRef]);

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
    const client = realtimeRef.current;
    realtimeRef.current = null;
    void client?.close();
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
        const initialAppearance = nextSession.avatarAppearance ?? DEFAULT_APPEARANCE;
        localAppearanceRef.current = initialAppearance;
        setLocalAppearance(nextSession.participantId, initialAppearance);
        setSession({ ...nextSession, manifest: normalizedManifest });
        setManifest(normalizedManifest);
        setStatus("Joined room. Connecting to LiveKit...");
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
    const generation = ++realtimeGenerationRef.current;

    function handleMessage(message: RealtimeMessage) {
      if (wallRealtimeHandlerRef.current(message)) return;
      if (classroomRealtimeHandlerRef.current(message)) return;
      if (message.type.startsWith("wall.")) return;

      if (message.type === "participant.leave.v1") {
        dropReaction(message.participantId);
        dropAudioMode(message.participantId);
        setParticipants((current) => {
          const next = { ...current };
          delete next[message.participantId];
          return next;
        });
        return;
      }

      if (message.type === "participant.audio-mode.v1") {
        const parsed = ParticipantAudioModeMessageSchema.safeParse(message);
        if (parsed.success) receiveAudioMode(parsed.data);
        return;
      }

      if (message.type === "participant.presence.v1") {
        if (!seenParticipantsRef.current.has(message.participantId)) {
          seenParticipantsRef.current.add(message.participantId);
          realtimeRef.current?.publish({
            type: "avatar.appearance.v1",
            participantId: activeSession.participantId,
            appearance: localAppearanceRef.current,
          });
        }
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

      if (message.type === "avatar.appearance.v1") {
        const parsed = AvatarAppearanceMessageSchema.safeParse(message);
        if (parsed.success) {
          receiveAppearance(parsed.data.participantId, parsed.data.appearance);
        }
        return;
      }

      if (message.type === "avatar.reaction.v1") {
        const parsed = AvatarReactionMessageSchema.safeParse(message);
        if (parsed.success) receiveReaction(parsed.data);
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

    seenParticipantsRef.current = new Set();
    setStatus("Connecting to LiveKit...");
    void warmSafariLiveKitPermissions()
      .then(() =>
        createRealtimeClient({
          roomId,
          session,
          displayName: displayNameRef.current,
          isStale: () => generation !== realtimeGenerationRef.current,
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
        })
      )
      .then((client) => {
        if (generation !== realtimeGenerationRef.current) {
          void client.close();
          return;
        }
        realtimeRef.current = client;
        client.publish({
          type: "participant.presence.v1",
          participantId: session.participantId,
          displayName: displayNameRef.current,
          role: session.role
        });
        client.publish({
          type: "avatar.appearance.v1",
          participantId: session.participantId,
          appearance: localAppearanceRef.current,
        });
        client.syncParticipants();
      })
      .catch((error) => {
        if (generation !== realtimeGenerationRef.current) return;
        const message = error instanceof Error ? error.message : "Unable to connect to LiveKit.";
        setError(message);
        setStatus(message);
      });

    return () => {
      realtimeGenerationRef.current += 1;
      const client = realtimeRef.current;
      realtimeRef.current = null;
      void client?.close();
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
      const state = avatarStateRef.current;
      if (!state) return;
      const waving = waveTriggeredRef.current || undefined;
      realtimeRef.current?.publish(waving ? { ...state, waving } : state);
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
          (object) => {
            if (object.type !== "camera.live") return false;
            if (object.source.kind !== "livekit-track") return false;
            if (object.source.participantId !== session.participantId) return false;
            const terminalStatus = object.status === "removed" || object.status === "source_ended" || object.status === "failed" || object.status === "rejected";
            return !terminalStatus;
          }
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

  useEffect(() => {
    if (selectedStudentId && !participantList.some((p) => p.id === selectedStudentId)) {
      setSelectedStudentId("");
    }
    if (helpBoardAccessUserId && !participantList.some((p) => p.id === helpBoardAccessUserId)) {
      setHelpBoardAccessUserId("");
    }
  }, [helpBoardAccessUserId, participantList, selectedStudentId]);

  const activeBoardGrant = useMemo(
    () =>
      (classroom.state?.boardAccessGrants ?? []).find(
        (grant) => grant.userId === identity.userId && isBoardGrantActive(grant)
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
        const participantTrackType = object.type === "camera.live" || object.type === "microphone.live";
        const terminalStatus = object.status === "removed" || object.status === "source_ended" || object.status === "failed" || object.status === "rejected";
        if (!participantTrackType || terminalStatus) {
          if (next[object.id]) {
            next[object.id] = { ...(next[object.id] ?? {}), videoStream: null, audioStream: null };
          }
          continue;
        }
        // camera.live and microphone.live in non-terminal states: fall through to use participant streams
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
          wallMediaStreams,
          audioModes
        }
      : { participants: participantList }
  );

  const getAudioMode = useCallback((id: string) => audioModes.get(id), [audioModes]);

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

  const whisperAllowed = classroom.state?.whisper?.allowed === true;
  const whisperSuggested =
    whisperAllowed &&
    role === "student" &&
    lesson.currentStep?.kind === "group-work" &&
    classroom.state?.whisper?.autoEnableInGroupWork === true &&
    whisperMode === "normal";

  const toggleWhisper = useCallback(() => {
    if (!session || role === "teacher") return;
    const maxRadius = classroom.state?.whisper?.maxRadiusMeters ?? 3;
    const nextMode: "normal" | "whisper" = whisperModeRef.current === "normal" ? "whisper" : "normal";
    setWhisperMode(nextMode);
    const msg = {
      type: "participant.audio-mode.v1" as const,
      participantId: session.participantId,
      mode: nextMode,
      radiusMeters: Math.min(3, maxRadius)
    };
    receiveAudioMode(msg);
    realtimeRef.current?.publish(msg);
    if (nextMode === "whisper") {
      void postRoomEvent(identity, session.room.id, "whisper.toggled.v1", {
        participantId: session.participantId,
        displayName: identity.displayName,
        radiusMeters: msg.radiusMeters
      }).catch(() => undefined);
    }
  }, [session, role, classroom.state?.whisper?.maxRadiusMeters, receiveAudioMode, identity]);

  // Auto-revert to normal when teacher disallows whisper mid-session
  useEffect(() => {
    if (!session || role === "teacher") return;
    if (classroom.state?.whisper?.allowed !== false || whisperModeRef.current !== "whisper") return;
    const msg = { type: "participant.audio-mode.v1" as const, participantId: session.participantId, mode: "normal" as const, radiusMeters: 3 };
    setWhisperMode("normal");
    receiveAudioMode(msg);
    realtimeRef.current?.publish(msg);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom.state?.whisper?.allowed, session?.participantId, role]);

  const fireReaction = useCallback(
    (slug: AvatarReactionSlug) => {
      if (!session) return;
      const msg: AvatarReactionMessage = {
        type: "avatar.reaction.v1",
        participantId: session.participantId,
        reaction: slug,
        expiresAt: new Date(Date.now() + 2500).toISOString()
      };
      receiveReaction(msg);
      realtimeRef.current?.publish(msg);
    },
    [session, receiveReaction]
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

  const avatarColor = role === "teacher" ? "#c07834" : "#389060";
  const initials = identity.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";
  const roomName = session?.room.name ?? "Joining...";

  const activeHelpRequestUserIds = useMemo(() => {
    const reqs = classroom.state?.helpRequests ?? [];
    return new Set(reqs.filter((r) => r.status === "raised" || r.status === "acknowledged").map((r) => r.userId));
  }, [classroom.state?.helpRequests]);
  const spotlightActive = Boolean(classroom.state?.spotlight);
  const studentGroup = role === "student"
    ? (classroom.state?.groups ?? []).find((g) => g.memberUserIds.includes(identity.userId))
    : null;
  const handRaised = role === "student"
    ? Boolean(classroom.activeHelpRequest)
    : false;
  const studentQuickCheckActive =
    role === "student" &&
    (lesson.run?.status === "running" || lesson.run?.status === "paused") &&
    lesson.currentStep?.kind === "private-check";
  const detailPanelOpen = Boolean(helpBoardAccessUserId || selectedStudentId);
  const avatarEditorLocked =
    classroom.state?.lessonRun?.status === "running" &&
    classroom.state?.avatarEditorLocked === true;

  // Effective appearance: use draft for local participant when editor is open
  const localParticipantIdForAppearance = session?.participantId;
  function effectiveGetAppearance(id: string): AvatarAppearance {
    if (id === localParticipantIdForAppearance && localDraftAppearance !== null) {
      return localDraftAppearance;
    }
    return getAppearance(id);
  }

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
            getAppearance={effectiveGetAppearance}
            getReaction={(id) => getReaction(id)?.reaction}
            getAudioMode={getAudioMode}
            activeHelpRequestUserIds={activeHelpRequestUserIds}
            onSelfClick={() => setAvatarEditorOpen(true)}
            localWaveTriggered={waveTriggered}
            onLocalWaveComplete={() => setWaveTriggered(false)}
            quality={session.room.settings.defaultQuality}
            cameraYawRef={camera.yawRef}
            cameraPitchRef={camera.pitchRef}
            bindCamera={camera.bind}
            firstPerson={firstPerson}
            hallpassZone={manifest.hallpassHoldingZone}
            onMoveToPoint={(point) => {
              if (camera.consumeClickSuppress()) return;
              if (positioningGroupId) {
                void classroom.runAction({
                  type: "update-group",
                  groupId: positioningGroupId,
                  targetPosition: { x: point.x, y: manifest ? floorYFromZ(manifest, point.z) : 0, z: point.z },
                  hold: { enabled: true, mode: "hard", radiusMeters: 2 }
                }).then(() => setPositioningGroupId(""));
              } else {
                movement.moveTo3DPoint(point);
              }
            }}
            wallObjects={wall.wallObjects}
            assetUrls={wall.assetUrls}
            wallMediaStreams={wallMediaStreams}
            canManageWallObjects={session.role === "teacher"}
            currentUserId={identity.userId}
            classroomGroups={classroom.state?.groups ?? []}
            privateChecks={classroom.state?.privateChecks ?? []}
            spotlight={classroom.state?.spotlight}
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
            hallpassZone={manifest.hallpassHoldingZone}
            onMoveToPoint={(point) => {
              if (positioningGroupId && manifest) {
                const worldPos = unprojectPointFrom2D(manifest, point);
                void classroom.runAction({
                  type: "update-group",
                  groupId: positioningGroupId,
                  targetPosition: { x: worldPos.x, y: floorYFromZ(manifest, worldPos.z), z: worldPos.z },
                  hold: { enabled: true, mode: "hard", radiusMeters: 2 }
                }).then(() => setPositioningGroupId(""));
              } else {
                movement.moveTo2DPoint(point);
              }
            }}
            wallObjects={wall.wallObjects}
            assetUrls={wall.assetUrls}
            wallMediaStreams={wallMediaStreams}
            classroomGroups={classroom.state?.groups ?? []}
            privateChecks={classroom.state?.privateChecks ?? []}
            spotlight={classroom.state?.spotlight}
            positioningMode={Boolean(positioningGroupId)}
            getReaction={(id) => getReaction(id)?.reaction}
            getAudioMode={getAudioMode}
          />
        )}
      </div>

      {/* Top HUD bar */}
      <header className="room-hud-top">
        <button type="button" className="room-exit-btn" disabled={leaving} onClick={leaveForLobby}>
          {leaving ? "Leaving..." : "← Lobby"}
        </button>
        <div className="room-hud-top-sep" />
        <span className="room-hud-name">{roomName}</span>
        <span className="room-hud-meta">{role} · {status}</span>
        <div className="room-hud-top-fill" />
        <div className="room-hud-top-sep" />
        <div className="toggle" aria-label="View mode">
          <button aria-pressed={viewMode === "3d"} onClick={() => setViewMode("3d")} disabled={!manifest}>
            3D
          </button>
          <button aria-pressed={viewMode === "2d"} onClick={() => setViewMode("2d")} disabled={!manifest?.capabilities.twoDAnalog}>
            2D
          </button>
        </div>
        {viewMode === "3d" ? (
          <div className="toggle" aria-label="Camera mode" title="First-person view (V)">
            <button aria-pressed={firstPerson} onClick={() => setFirstPerson((prev) => !prev)} disabled={!manifest}>
              1P
            </button>
          </div>
        ) : null}
      </header>

      {/* Left HUD: context status + identity + media controls + d-pad */}
      <div className="room-hud-left">
        {/* Teacher: spotlight active indicator */}
        {role === "teacher" && spotlightActive ? (
          <div className="hud-panel hud-ctx-panel">
            <div className="hud-ctx-card">
              <span className="hud-ctx-lbl">Focus active</span>
              <span className="hud-ctx-val">
                {classroom.state?.spotlight?.anchorId ?? "Board"}
              </span>
              <span className="hud-ctx-sub">
                {classroom.state?.spotlight?.mode === "force"
                  ? "Force — camera locked"
                  : classroom.state?.spotlight?.mode === "guide"
                  ? "Guide — look-at prompted"
                  : "Highlight — board indicated"}
              </span>
            </div>
          </div>
        ) : null}

        {/* Student: group + hand status */}
        {role === "student" ? (
          <div className="hud-panel">
            {studentGroup ? (
              <div className="hud-ctx-card" style={{ borderBottom: handRaised ? "1px solid rgba(255,255,255,0.08)" : undefined }}>
                <span className="hud-ctx-lbl" style={{ color: studentGroup.color ?? "#4678b4" }}>My Group</span>
                <span className="hud-ctx-val">
                  <span className="hud-ctx-dot" style={{ background: studentGroup.color ?? "#4678b4" }} />
                  {studentGroup.label} · {studentGroup.memberUserIds.length} members
                </span>
              </div>
            ) : null}
            {handRaised ? (
              <div className="hud-ctx-card">
                <span className="hud-ctx-lbl acc">Hand raised</span>
                <span className="hud-ctx-sub">Waiting for your teacher</span>
              </div>
            ) : null}
            {CLIENT_TUNING.enableHallPass && session?.room.settings.hallpass.enabled ? (() => {
              const hp = session.room.settings.hallpass;
              const periodLimitReached = !myActiveHallpass && hp.perPeriodLimit > 0 && myTodayPassCount >= hp.perPeriodLimit;
              return (
                <div className="hud-ctx-card">
                  {myActiveHallpass?.status === "acknowledged" ? (
                    <div className="hallpass-hud-row">
                      <span className="hud-ctx-lbl">Hall pass · {formatElapsed(hallpassElapsedSeconds)}</span>
                      <button
                        type="button"
                        className="hud-btn hallpass-btn--out"
                        disabled={hallpassBusy}
                        onClick={() => {
                          setHallpassBusy(true);
                          void classroom.runAction({ type: "return-from-hallpass", requestId: myActiveHallpass.id })
                            .catch(() => undefined)
                            .finally(() => setHallpassBusy(false));
                        }}
                      >
                        🚪 I'm back
                      </button>
                    </div>
                  ) : periodLimitReached ? (
                    <p className="hud-ctx-sub" style={{ fontSize: "10px" }}>You've reached today's hall-pass limit.</p>
                  ) : (
                    <button
                      type="button"
                      className="hud-btn"
                      disabled={hallpassBusy || Boolean(myActiveHallpass)}
                      onClick={() => {
                        setHallpassBusy(true);
                        void classroom.runAction({ type: "request-hallpass" })
                          .catch(() => undefined)
                          .finally(() => setHallpassBusy(false));
                      }}
                    >
                      {myActiveHallpass?.status === "raised" ? "🚪 Pending..." : "🚪 Step out"}
                    </button>
                  )}
                </div>
              );
            })() : null}
          </div>
        ) : null}

        {/* Identity + media controls + avatar editor button */}
        <div className="hud-panel">
          <div className="hud-id-card">
            <div className="hud-av" style={{ background: avatarColor }}>{initials}</div>
            <div className="hud-id-text">
              <div className="hud-id-name">{identity.displayName}</div>
              <div className="hud-id-sub">{role} · {roomName}</div>
            </div>
          </div>
          <MediaControls media={media} />
          {viewMode === "3d" ? (
            <div className="avatar-editor__hud-row">
              <button
                className={`avatar-editor__hud-btn${avatarEditorOpen ? " avatar-editor__hud-btn--active" : ""}${avatarEditorLocked ? " avatar-editor__hud-btn--locked" : ""}`}
                onClick={() => setAvatarEditorOpen(prev => !prev)}
                aria-pressed={avatarEditorOpen}
                aria-label={avatarEditorLocked ? "Avatar editing paused during lesson" : "Edit your avatar"}
                disabled={avatarEditorLocked}
              >
                {avatarEditorLocked ? "🔒 Avatar" : "👤 Avatar"}
              </button>
            </div>
          ) : null}
          {media.permissionText ? <p className="hud-permission" style={{ padding: "4px 9px", fontSize: "9.5px", color: "var(--hud-tx-m)" }}>{media.permissionText}</p> : null}
        </div>

        {/* Reactions */}
        {CLIENT_TUNING.enableAvatarReactions ? (
          <div className="hud-panel">
            <div className="hud-reactions" aria-label="Reactions">
              {(["thumbs-up", "confused", "question", "me", "pause", "celebrate"] as const).map((slug) => (
                <button
                  key={slug}
                  type="button"
                  aria-label={slug}
                  disabled={!!classroom.state?.reactionsLocked}
                  onClick={() => fireReaction(slug)}
                >
                  {slug === "thumbs-up" ? "👍" : slug === "confused" ? "😕" : slug === "question" ? "❓" : slug === "me" ? "🙋" : slug === "pause" ? "🤚" : "🎉"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* Whisper toggle (students only, when allowed) */}
        {CLIENT_TUNING.enableWhisper && role === "student" && whisperAllowed ? (
          <div className="hud-panel">
            <button
              type="button"
              className={`hud-btn${whisperMode === "whisper" ? " hud-btn--active" : ""}${whisperSuggested ? " hud-btn--glow" : ""}`}
              onClick={toggleWhisper}
            >
              {whisperMode === "whisper" ? "🔇 Whisper on" : "🔊 Normal"}
            </button>
            {whisperSuggested ? <p className="hud-ctx-sub" style={{ fontSize: "10px", padding: "2px 0" }}>Suggested for group work</p> : null}
          </div>
        ) : null}

        {/* D-pad */}
        <div className="hud-panel dpad-card">
          <MovementPad onVector={movement.setTouchVector} />
        </div>
      </div>

      {/* Right HUD: unified collapsible panel */}
      <aside className="room-hud-right" aria-label="Room details">
        <div className="hud-panel">
          {CLIENT_TUNING.enableClassroomLessons && role === "student" ? (
            <LessonStudentCallout
              run={lesson.run}
              currentStep={lesson.currentStep}
              state={classroom.state}
              manifest={manifest}
              currentUserId={identity.userId}
            />
          ) : null}
          <Roster
            participants={participantList}
            classroomState={classroom.state}
            role={role}
            selectedStudentId={selectedStudentId}
            onSelectStudent={(id) => {
              setHelpBoardAccessUserId("");
              setSelectedStudentId(id);
            }}
          />
          <ClassroomPanel
            role={role}
            state={classroom.state}
            loading={classroom.loading}
            error={classroom.error}
            activeHelpRequest={classroom.activeHelpRequest}
            manifest={manifest}
            currentUserId={identity.userId}
            boardAccessUserId={helpBoardAccessUserId}
            reactionLog={log}
            hallpassSettings={session?.room.settings.hallpass}
            onOpenBoardAccess={(userId) => {
              setSelectedStudentId("");
              setHelpBoardAccessUserId((current) => (current === userId ? "" : userId));
            }}
            onRunAction={async (action) => {
              await classroom.runAction(action);
            }}
          />
          {CLIENT_TUNING.enableClassroomLessons && role === "teacher" ? (
            <>
              <LessonRunControls
                run={lesson.run}
                currentStep={lesson.currentStep}
                nextStep={lesson.nextStep}
                loading={lesson.loading}
                error={lesson.error}
                runAction={lesson.runAction}
                avatarEditorLocked={avatarEditorLocked}
                onToggleAvatarLock={() => void classroom.runAction({
                  type: "set-avatar-editor-locked",
                  locked: !avatarEditorLocked
                })}
              />
              {!lesson.run ? (
                <LessonAuthoringPanel
                  run={lesson.run}
                  state={classroom.state}
                  manifest={manifest}
                  participants={participantList.map((participant) => ({
                    id: participant.id,
                    displayName: participant.displayName,
                    role: participant.role
                  }))}
                  loading={lesson.loading}
                  error={lesson.error}
                  runAction={lesson.runAction}
                  stepStatus={lesson.stepStatus}
                />
              ) : null}
              <LessonTimelinePanel run={lesson.run} />
            </>
          ) : null}
          <PrivateChecksPanel
            role={role}
            state={classroom.state}
            loading={classroom.loading}
            currentUserId={identity.userId}
            manifest={manifest}
            forceExpanded={studentQuickCheckActive}
            onRunAction={async (action) => {
              await classroom.runAction(action);
            }}
          />
          <GroupsPanel
            role={role}
            state={classroom.state}
            loading={classroom.loading}
            participants={participantList}
            currentUserId={identity.userId}
            positioningGroupId={positioningGroupId}
            {...(manifest ? { manifestAnchors: manifest.wallAnchors } : {})}
            onRunAction={async (action) => {
              await classroom.runAction(action);
            }}
            onEnterPositioningMode={(groupId) => setPositioningGroupId(groupId)}
            onCancelPositioning={() => setPositioningGroupId("")}
          />
          <FocusPanel
            role={role}
            state={classroom.state}
            loading={classroom.loading}
            manifest={manifest}
            currentUserId={identity.userId}
            onRunAction={async (action) => {
              await classroom.runAction(action);
            }}
            onLookAtFocus={lookAtFocus}
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
        </div>
      </aside>
      {CLIENT_TUNING.enableClassroomLessons && role === "teacher" && lesson.run ? (
        <aside
          className={`room-hud-right-secondary${detailPanelOpen ? " room-hud-right-secondary--stacked" : ""}`}
          aria-label="Lesson script"
          data-testid="lesson-script-dock"
        >
          <div className="hud-panel">
            <LessonAuthoringPanel
              run={lesson.run}
              state={classroom.state}
              manifest={manifest}
              participants={participantList.map((participant) => ({
                id: participant.id,
                displayName: participant.displayName,
                role: participant.role
              }))}
              loading={lesson.loading}
              error={lesson.error}
              runAction={lesson.runAction}
              stepStatus={lesson.stepStatus}
            />
          </div>
        </aside>
      ) : null}
      {(() => {
        if (helpBoardAccessUserId && manifest && classroom.state) {
          const helpStudent = participantList.find((p) => p.id === helpBoardAccessUserId) ?? null;
          const helpRequest =
            classroom.state.helpRequests.find(
              (r) => r.userId === helpBoardAccessUserId && (r.status === "raised" || r.status === "acknowledged")
            ) ?? null;
          if (helpStudent) {
            return (
              <BoardAccessSidePanel
                key={`help-board-${helpStudent.id}`}
                userId={helpStudent.id}
                displayName={helpStudent.displayName}
                helpRequest={helpRequest}
                activeGrants={activeGrantMap(classroom.state).get(helpStudent.id) ?? []}
                manifest={manifest}
                error={classroom.error}
                onRunAction={async (action) => {
                  await classroom.runAction(action);
                }}
                onClose={() => setHelpBoardAccessUserId("")}
              />
            );
          }
        }

        const selectedStudent = selectedStudentId ? participantList.find((p) => p.id === selectedStudentId) ?? null : null;
        const helpRequest = selectedStudent && classroom.state
          ? (classroom.state.helpRequests.find(
              (r) => r.userId === selectedStudent.id && (r.status === "raised" || r.status === "acknowledged")
            ) ?? null)
          : null;
        const studentActiveGrants = selectedStudent && classroom.state
          ? (activeGrantMap(classroom.state).get(selectedStudent.id) ?? [])
          : [];
        return selectedStudent && manifest ? (
          <StudentDetailPanel
            key={selectedStudent.id}
            participant={selectedStudent}
            helpRequest={helpRequest}
            activeGrants={studentActiveGrants}
            manifest={manifest}
            error={classroom.error}
            onRunAction={async (action) => { await classroom.runAction(action); }}
            onClose={() => setSelectedStudentId("")}
          />
        ) : null;
      })()}
      {avatarEditorOpen && session ? (
        <AvatarEditorPanel
          savedAppearance={localAppearanceRef.current}
          onSave={async (appearance) => {
            await patchAvatarAppearance(identity, appearance);
            localAppearanceRef.current = appearance;
            setLocalAppearance(session.participantId, appearance);
            publishRealtime({
              type: "avatar.appearance.v1",
              participantId: session.participantId,
              appearance,
            });
          }}
          onDraftChange={(draft) => setLocalDraftAppearance(draft)}
          onClose={() => {
            setAvatarEditorOpen(false);
            setLocalDraftAppearance(null);
          }}
          onTriggerWave={() => setWaveTriggered(true)}
          waveActive={waveTriggered}
          locked={avatarEditorLocked}
        />
      ) : null}
    </main>
  );
}
