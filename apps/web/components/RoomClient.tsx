"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AvatarAppearance, AvatarReactionMessage, AvatarReactionSlug, AvatarStateMessage, Role, RoomManifest, RoomObjectTemplate, RoomSessionResponse, ViewMode, WallObject, WorldSkinDayNightMode } from "@3dspace/contracts";
import { AvatarAppearanceMessageSchema, AvatarReactionMessageSchema, getRoomTypeFeatureFlags, ParticipantAudioModeMessageSchema, parseRoomSettings, RoomSkinMessageSchema } from "@3dspace/contracts";
import { computeGroupMemberPosition, createAvatarState, floorYFromZ, unprojectPointFrom2D } from "@3dspace/room-engine";
import {
  archiveRoomObjectTemplate,
  joinRoom,
  listClassMembers,
  patchAvatarAppearance,
  patchRoom,
  postRoomEvent,
  uploadRoomObjectGlb
} from "../lib/api";
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
import { useRoomObjects } from "../lib/useRoomObjects";
import { useRoomObjectTemplates } from "../lib/useRoomObjectTemplates";
import { useWorldSkin } from "../lib/useWorldSkin";
import { SkinLayer } from "./worldSkins/SkinLayer";
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
import { LessonRecapPanel } from "./LessonRecapPanel";
import { AvatarEditorPanel } from "./AvatarEditorPanel";
import { CopyRoomInviteButton } from "./CopyRoomInviteButton";
import { WallObjectContent } from "./WallObjectCard";
import { RoomObjectsToolbar } from "./RoomObjectsToolbar";
import { RoomObjectInspector } from "./RoomObjectInspector";
import { buildSpawnPoseInFront } from "../lib/roomObjectInteraction";
import { EnvironmentCard } from "./EnvironmentCard";
import { useDynamicWallAnchors } from "../lib/useDynamicWallAnchors";

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
  const [broadcastMode, setBroadcastMode] = useState<"normal" | "broadcast">("normal");
  const broadcastModeRef = useRef(broadcastMode);
  broadcastModeRef.current = broadcastMode;
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
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapRunId, setRecapRunId] = useState<string | null>(null);
  const [fullscreenObjectId, setFullscreenObjectId] = useState<string | null>(null);
  const prevLessonStatusRef = useRef<string | undefined>(undefined);
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
  const roomTypeFeatures = useMemo(() => getRoomTypeFeatureFlags(session?.room.type), [session?.room.type]);
  const classroom = useClassroomState({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: roomTypeFeatures.classroomState && Boolean(session),
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
  const roleLabels = useMemo(() => {
    switch (session?.room.type) {
      case "workforce-training":
        return { hostSingular: "Instructor", hostInitial: "I", guestSingular: "Trainee", guestPlural: "Trainees" };
      case "free-for-all":
        return { hostSingular: "Participant", hostInitial: "P", guestSingular: "Participant", guestPlural: "Participants" };
      default:
        return { hostSingular: "Teacher", hostInitial: "T", guestSingular: "Student", guestPlural: "Students" };
    }
  }, [session?.room.type]);
  const roomRoleLabel = role === "teacher" ? roleLabels.hostSingular : roleLabels.guestSingular;
  const roomTypeLabel =
    session?.room.type === "workforce-training" ? "Workforce Training" :
    session?.room.type === "free-for-all" ? "Free-for-All" :
    "Classroom";
  const dynamicBoards = useDynamicWallAnchors({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: roomTypeFeatures.dynamicBoards && Boolean(session)
  });
  const allWallAnchors = useMemo(
    () => [...(manifest?.wallAnchors ?? []), ...dynamicBoards.anchors],
    [manifest?.wallAnchors, dynamicBoards.anchors]
  );
  const hallpassZone = roomTypeFeatures.hallPass ? manifest?.hallpassHoldingZone : undefined;

  const parsedRoomSettings = useMemo(
    () => (session ? parseRoomSettings(session.room.settings) : null),
    [session?.room.settings]
  );
  const roomObjectsSettings = parsedRoomSettings?.roomObjects;
  const roomObjectsEnabled = CLIENT_TUNING.enableRoomObjects && roomObjectsSettings?.enabled === true;

  // World skin: realtime overrides layer on top of server-session values
  const [targetSkinId, setTargetSkinId] = useState<string | null | undefined>(undefined);
  const [targetDayNightMode, setTargetDayNightMode] = useState<WorldSkinDayNightMode | undefined>(undefined);
  const skinId = targetSkinId !== undefined ? targetSkinId : (parsedRoomSettings?.worldSkins?.skinId ?? null);
  const skinDayNightMode: WorldSkinDayNightMode = targetDayNightMode ?? (parsedRoomSettings?.worldSkins?.skinDayNightMode ?? "day");
  const activeSkin = useWorldSkin({
    identity,
    skinId: CLIENT_TUNING.enableWorldSkins ? skinId : null,
    dayNightMode: skinDayNightMode,
    enabled: CLIENT_TUNING.enableWorldSkins,
    identityReady: identityLoaded && (!clerkEnabled || signedIn)
  });

  // When no explicit skin is chosen for a workforce-training room, the default-theater
  // skin would bleed classroom assets (floor and panorama) into the space. Strip them
  // until the workforce-training room gets its own skin assets.
  const activeSkinForRoom = useMemo(() => {
    if (session?.room.type !== "workforce-training" || skinId !== null || !activeSkin.skin) {
      return activeSkin.skin;
    }
    const { floor: _floor, panoramaWall: _panorama, ...rest } = activeSkin.skin.overrides;
    return { ...activeSkin.skin, overrides: rest };
  }, [activeSkin.skin, session?.room.type, skinId]);
  // Local ambient gain: teacher slider gives immediate audio feedback while patchRoom debounces.
  const [localAmbientGain, setLocalAmbientGain] = useState<number | null>(null);
  const ambientDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roomObjectCustomUploadsEnabled = roomObjectsEnabled && roomObjectsSettings?.customUploadsEnabled === true;
  const roomObjectsTeacherToolbarVisible = CLIENT_TUNING.enableRoomObjects && role === "teacher" && Boolean(manifest);
  const roomObjectsGateSyncRef = useRef<string | null>(null);
  const [roomObjectsGateSyncing, setRoomObjectsGateSyncing] = useState(false);

  useEffect(() => {
    if (!CLIENT_TUNING.enableRoomObjects || role !== "teacher" || !session?.room.id || !roomObjectsSettings) return;
    if (roomObjectsSettings.enabled && roomObjectsSettings.customUploadsEnabled) return;

    const activeRoomId = session.room.id;
    if (roomObjectsGateSyncRef.current === activeRoomId) return;
    roomObjectsGateSyncRef.current = activeRoomId;
    setRoomObjectsGateSyncing(true);

    void patchRoom(identity, activeRoomId, {
      settings: {
        roomObjects: {
          ...roomObjectsSettings,
          enabled: true,
          customUploadsEnabled: true
        }
      }
    })
      .then((updated) => {
        const nextRoomObjects = parseRoomSettings(updated.settings).roomObjects;
        setSession((current) =>
          current?.room.id === activeRoomId
            ? {
                ...current,
                room: {
                  ...current.room,
                  settings: {
                    ...current.room.settings,
                    roomObjects: nextRoomObjects
                  }
                }
              }
            : current
        );
      })
      .catch(() => {
        roomObjectsGateSyncRef.current = null;
      })
      .finally(() => {
        setRoomObjectsGateSyncing(false);
      });
  }, [
    identity,
    role,
    roomObjectsSettings,
    session?.room.id
  ]);
  const roomObjectTemplates = useRoomObjectTemplates({
    identity,
    roomId: session?.room.id,
    classId: session?.room.classId,
    enabled: roomObjectsEnabled
  });
  const roomObjects = useRoomObjects({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: roomObjectsEnabled,
    publish: publishRealtime
  });
  const [selectedRoomObjectId, setSelectedRoomObjectId] = useState<string | null>(null);

  const openLessonRecap = useCallback((runId: string) => {
    setRecapRunId(runId);
    setRecapOpen(true);
  }, []);

  useEffect(() => {
    const status = classroom.state?.lessonRun?.status;
    const runId = classroom.state?.lessonRun?.id;
    const prev = prevLessonStatusRef.current;
    prevLessonStatusRef.current = status;
    if (!status || !runId || role !== "teacher") return;
    if ((prev === "running" || prev === "paused") && status === "ended") {
      openLessonRecap(runId);
    }
  }, [classroom.state?.lessonRun?.status, classroom.state?.lessonRun?.id, openLessonRecap, role]);
  const wallRealtimeHandlerRef = useRef(wall.handleRealtimeMessage);
  wallRealtimeHandlerRef.current = wall.handleRealtimeMessage;
  const roomObjectsRealtimeHandlerRef = useRef(roomObjects.handleRealtimeMessage);
  roomObjectsRealtimeHandlerRef.current = roomObjects.handleRealtimeMessage;
  const classroomRealtimeHandlerRef = useRef(classroom.handleRealtimeMessage);
  classroomRealtimeHandlerRef.current = classroom.handleRealtimeMessage;
  const dynamicBoardsRealtimeHandlerRef = useRef(dynamicBoards.handleRealtimeMessage);
  dynamicBoardsRealtimeHandlerRef.current = dynamicBoards.handleRealtimeMessage;
  camera.lockedRef.current = classroom.state?.spotlight?.mode === "force";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const debugWindow = window as Window & { __debug?: Record<string, unknown> };
    debugWindow.__debug = debugWindow.__debug ?? {};
    debugWindow.__debug.roomObjects = {
      enabled: roomObjectsEnabled,
      templatesStatus: roomObjectTemplates.status,
      templates: roomObjectTemplates.templates,
      objects: roomObjects.objects,
      objectsById: roomObjects.objectsById,
      grabs: roomObjects.grabs,
      myActiveGrab: roomObjects.myActiveGrab,
      refresh: roomObjects.refresh,
      refetchTemplates: roomObjectTemplates.refetch,
      actions: roomObjects.actions
    };
    debugWindow.__debug.worldSkin = activeSkin;
    return () => {
      if (debugWindow.__debug) {
        delete debugWindow.__debug.roomObjects;
        delete debugWindow.__debug.worldSkin;
      }
    };
  }, [
    activeSkin,
    roomObjects.actions,
    roomObjects.grabs,
    roomObjects.myActiveGrab,
    roomObjects.objects,
    roomObjects.objectsById,
    roomObjects.refresh,
    roomObjectsEnabled,
    roomObjectTemplates.refetch,
    roomObjectTemplates.status,
    roomObjectTemplates.templates
  ]);

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
    if (myActiveHallpass?.status === "acknowledged" && hallpassZone) {
      const zone = hallpassZone;
      return { x: (zone.minX + zone.maxX) / 2, y: 0, z: (zone.minZ + zone.maxZ) / 2 };
    }
    const userId = session?.participantId ?? identity.userId;
    const group = classroom.state?.groups.find(
      (g) => g.status === "active" && g.hold?.enabled && g.hold.mode === "hard" && g.targetPosition && g.memberUserIds.includes(userId)
    );
    if (!group?.targetPosition) return null;
    const memberIndex = group.memberUserIds.indexOf(userId);
    return computeGroupMemberPosition(group.targetPosition, memberIndex);
  }, [myActiveHallpass?.status, hallpassZone, classroom.state?.groups, session?.participantId, identity.userId]);

  const studentMediaRuntime = roomTypeFeatures.studentMediaControls && CLIENT_TUNING.enableStudentMediaPermissions && role === "student"
    ? (classroom.state?.studentMediaRuntime ?? null)
    : null;
  const canUseCamera = !studentMediaRuntime
    || studentMediaRuntime.camerasEnabled
    || studentMediaRuntime.cameraEnabledUserIds.includes(identity.userId);
  const canUseMicrophone = !studentMediaRuntime
    || studentMediaRuntime.microphonesEnabled
    || studentMediaRuntime.microphoneEnabledUserIds.includes(identity.userId);
  const mediaPermissionText = (() => {
    if (canUseCamera && canUseMicrophone) return media.permissionText;
    if (!canUseCamera && !canUseMicrophone) return "Camera and microphone disabled by teacher.";
    if (!canUseCamera) return "Camera disabled by teacher.";
    return "Microphone disabled by teacher.";
  })();

  useEffect(() => {
    if (!canUseCamera && media.cameraEnabled) media.setCameraEnabled(false);
  }, [canUseCamera, media.cameraEnabled, media.setCameraEnabled]);

  useEffect(() => {
    if (!canUseMicrophone && media.microphoneEnabled) media.setMicrophoneEnabled(false);
  }, [canUseMicrophone, media.microphoneEnabled, media.setMicrophoneEnabled]);

  useEffect(() => {
    if (myActiveHallpass?.status === "acknowledged") {
      if (priorHallpassMicRef.current === null) {
        priorHallpassMicRef.current = micEnabledRef.current;
      }
      media.setMicrophoneEnabled(false);
    } else if (priorHallpassMicRef.current !== null) {
      media.setMicrophoneEnabled(priorHallpassMicRef.current && canUseMicrophone);
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

  const walkSpeedMultiplier = activeSkinForRoom?.overrides.walkSpeedMultiplier ?? 1;
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
    lockedPosition,
    walkSpeedMultiplier
  });

  // Walk-speed toast: shown once per skin with a non-1× multiplier, auto-dismissed after 6 s or first key press.
  const [walkToastVisible, setWalkToastVisible] = useState(false);
  const prevWalkMultiplierRef = useRef<number>(1);
  useEffect(() => {
    if (walkSpeedMultiplier === prevWalkMultiplierRef.current) return;
    prevWalkMultiplierRef.current = walkSpeedMultiplier;
    if (walkSpeedMultiplier === 1) { setWalkToastVisible(false); return; }
    setWalkToastVisible(true);
    const timer = setTimeout(() => setWalkToastVisible(false), 6000);
    function onKey() { setWalkToastVisible(false); }
    window.addEventListener("keydown", onKey, { once: true });
    return () => { clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [walkSpeedMultiplier]);

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
    setManifest((current) => (current ? normalizeRoomManifest(current, session?.room.type ?? "classroom") : current));
    setSession((current) => (current ? { ...current, manifest: normalizeRoomManifest(current.manifest, current.room.type) } : current));
  }, []);

  useEffect(() => {
    if (!movement.avatarState || viewMode !== "3d") return;
    camera.yawRef.current = movement.avatarState.rotation.y;
  }, [movement.avatarState?.participantId, movement.avatarState?.rotation.y, viewMode]);

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
        const normalizedManifest = normalizeRoomManifest(nextSession.manifest, nextSession.room.type);
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
      if (roomObjectsRealtimeHandlerRef.current(message)) return;
      if (classroomRealtimeHandlerRef.current(message)) return;
      if (dynamicBoardsRealtimeHandlerRef.current(message)) return;
      if (message.type.startsWith("wall.")) return;
      if (message.type.startsWith("room.object.")) return;
      if (message.type.startsWith("room.board.")) return;

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

      if (message.type === "room.skin.v1") {
        const parsed = RoomSkinMessageSchema.safeParse(message);
        if (parsed.success) {
          setTargetSkinId(parsed.data.skinId);
          setTargetDayNightMode(parsed.data.dayNight);
        }
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
  const roomObjectTemplatesById = useMemo(() => {
    const map: Record<string, RoomObjectTemplate> = {};
    for (const template of roomObjectTemplates.templates) {
      map[template.id] = template;
    }
    return map;
  }, [roomObjectTemplates.templates]);
  const memberGroupIdsForRoomObjects = useMemo(
    () =>
      (classroom.state?.groups ?? [])
        .filter((group) => group.status === "active" && group.memberUserIds.includes(identity.userId))
        .map((group) => group.id),
    [classroom.state?.groups, identity.userId]
  );
  const localParticipantForRoomObjects = useMemo(
    () =>
      participantList.find((participant) => participant.id === session?.participantId) ??
      participantList.find((participant) => participant.local) ??
      null,
    [participantList, session?.participantId]
  );
  const selectedRoomObject = useMemo(
    () => roomObjects.objects.find((object) => object.id === selectedRoomObjectId) ?? null,
    [roomObjects.objects, selectedRoomObjectId]
  );
  const selectedRoomObjectTemplate = useMemo(
    () => (selectedRoomObject ? roomObjectTemplatesById[selectedRoomObject.templateId] : undefined),
    [roomObjectTemplatesById, selectedRoomObject]
  );
  const groupByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const group of classroom.state?.groups ?? []) {
      if (group.status !== "active" || !group.targetPosition) continue;
      for (const userId of group.memberUserIds) {
        map.set(userId, group.id);
      }
    }
    return map;
  }, [classroom.state?.groups]);

  useEffect(() => {
    if (selectedStudentId && !participantList.some((p) => p.id === selectedStudentId)) {
      setSelectedStudentId("");
    }
    if (helpBoardAccessUserId && !participantList.some((p) => p.id === helpBoardAccessUserId)) {
      setHelpBoardAccessUserId("");
    }
  }, [helpBoardAccessUserId, participantList, selectedStudentId]);

  useEffect(() => {
    if (!fullscreenObjectId) return;
    const obj = wall.wallObjects.find((o) => o.id === fullscreenObjectId);
    if (!obj || obj.status === "removed") setFullscreenObjectId(null);
  }, [fullscreenObjectId, wall.wallObjects]);

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
  const podsInput = useMemo(() => {
    if (!roomTypeFeatures.breakoutPods || !CLIENT_TUNING.enableBreakoutPods) return undefined;
    const runtime = classroom.state?.podsRuntime;
    if (!runtime?.podsEnabled) return undefined;
    return {
      enabled: true,
      murmurFloor: session?.room.settings.pods?.podMurmurFloor ?? 0.08,
      broadcastUserIds: new Set(runtime.broadcastFromUserIds),
      groupByUserId
    };
  }, [classroom.state?.podsRuntime, groupByUserId, roomTypeFeatures.breakoutPods, session]);
  useSpatialAudio(
    session
      ? {
          participants: participantList,
          localParticipantId: session.participantId,
          config: session.tuning.spatialAudio,
          manifest: manifest ?? undefined,
          wallObjects: wall.wallObjects,
          wallMediaStreams,
          audioModes,
          pods: podsInput
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
    classroom.state?.podsRuntime?.podsEnabled !== true &&
    whisperMode === "normal";

  const publishAudioMode = useCallback(
    (mode: "normal" | "whisper" | "broadcast", radiusMeters = 3) => {
      if (!session) return null;
      setWhisperMode(mode === "whisper" ? "whisper" : "normal");
      setBroadcastMode(mode === "broadcast" ? "broadcast" : "normal");
      const msg = {
        type: "participant.audio-mode.v1" as const,
        participantId: session.participantId,
        mode,
        radiusMeters
      };
      receiveAudioMode(msg);
      realtimeRef.current?.publish(msg);
      return msg;
    },
    [receiveAudioMode, session]
  );

  const toggleWhisper = useCallback(() => {
    if (!session || role === "teacher") return;
    const maxRadius = classroom.state?.whisper?.maxRadiusMeters ?? 3;
    const nextMode: "normal" | "whisper" = whisperModeRef.current === "normal" ? "whisper" : "normal";
    const radiusMeters = Math.min(3, maxRadius);
    publishAudioMode(nextMode, radiusMeters);
    if (nextMode === "whisper") {
      void postRoomEvent(identity, session.room.id, "whisper.toggled.v1", {
        participantId: session.participantId,
        displayName: identity.displayName,
        radiusMeters
      }).catch(() => undefined);
    }
  }, [session, role, classroom.state?.whisper?.maxRadiusMeters, publishAudioMode, identity]);

  // Auto-revert to normal when teacher disallows whisper mid-session
  useEffect(() => {
    if (!session || role === "teacher") return;
    if (classroom.state?.whisper?.allowed !== false || whisperModeRef.current !== "whisper") return;
    publishAudioMode("normal");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroom.state?.whisper?.allowed, publishAudioMode, role, session]);

  const fireReaction = useCallback(
    (slug: AvatarReactionSlug) => {
      if (!session) return;
      const msg: AvatarReactionMessage = {
        type: "avatar.reaction.v1",
        participantId: session.participantId,
        reaction: slug,
        expiresAt: new Date(Date.now() + 5000).toISOString()
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
  const podsEnabled = classroom.state?.podsRuntime?.podsEnabled === true;
  const broadcastFromUserIds = classroom.state?.podsRuntime?.broadcastFromUserIds ?? [];
  const podsVisualEnabled =
    roomTypeFeatures.breakoutPods &&
    CLIENT_TUNING.enableBreakoutPods &&
    session?.room.settings.pods?.enabled === true &&
    podsEnabled;
  const podRadiusMeters = session?.room.settings.pods?.podRadiusMeters ?? 3;
  const podDrawPartitions = session?.room.settings.pods?.drawPartitions === true;
  const studentGroup = role === "student"
    ? (classroom.state?.groups ?? []).find((g) => g.status === "active" && g.memberUserIds.includes(identity.userId))
    : null;
  const studentPositionedGroup = role === "student" && studentGroup?.targetPosition
    ? studentGroup
    : null;
  const studentPodTarget = useMemo(() => {
    if (!studentPositionedGroup?.targetPosition) return null;
    const memberIndex = studentPositionedGroup.memberUserIds.indexOf(identity.userId);
    if (memberIndex < 0) return null;
    const point = computeGroupMemberPosition(studentPositionedGroup.targetPosition, memberIndex);
    return { x: point.x, z: point.z };
  }, [identity.userId, studentPositionedGroup]);
  const studentHasBroadcastGrant =
    role === "student" &&
    Boolean(session?.participantId && broadcastFromUserIds.includes(session.participantId));
  const handRaised = role === "student"
    ? Boolean(classroom.activeHelpRequest)
    : false;
  const studentQuickCheckActive =
    roomTypeFeatures.privateChecks &&
    role === "student" &&
    (lesson.run?.status === "running" || lesson.run?.status === "paused") &&
    lesson.currentStep?.kind === "private-check";
  const helpDetailPanelOpen = roomTypeFeatures.peoplePanelTeacherControls && Boolean(helpBoardAccessUserId);
  const lessonScriptDockOpen = roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher" && Boolean(lesson.run);
  const roomObjectInspectorDockOpen =
    roomObjectsEnabled &&
    role === "teacher" &&
    Boolean(selectedRoomObject && selectedRoomObjectTemplate);
  const roomObjectInspectorStacked = helpDetailPanelOpen || lessonScriptDockOpen;
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

  const toggleBroadcast = useCallback(() => {
    if (!session || role === "teacher" || !studentHasBroadcastGrant) return;
    publishAudioMode(broadcastModeRef.current === "broadcast" ? "normal" : "broadcast");
  }, [publishAudioMode, role, session, studentHasBroadcastGrant]);

  const moveToMyPod = useCallback(() => {
    if (!studentPodTarget) return;
    movement.moveTo3DPoint(studentPodTarget);
  }, [movement, studentPodTarget]);

  useEffect(() => {
    if (!session || role === "teacher") return;
    if (studentHasBroadcastGrant || broadcastModeRef.current !== "broadcast") return;
    publishAudioMode("normal");
  }, [publishAudioMode, role, session, studentHasBroadcastGrant]);

  const leftHudControls = (
    <>
      {/* Teacher: spotlight active indicator */}
      {roomTypeFeatures.focus && role === "teacher" && spotlightActive ? (
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
      {roomTypeFeatures.classroomState && role === "student" ? (
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
              <span className="hud-ctx-sub">Waiting for your {roleLabels.hostSingular.toLowerCase()}</span>
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

      {roomTypeFeatures.breakoutPods && role === "student" && (studentPodTarget || (podsEnabled && studentHasBroadcastGrant)) ? (
        <div className="hud-panel">
          {studentPodTarget ? (
            <button type="button" className="hud-btn" onClick={moveToMyPod}>
              Go to my pod
            </button>
          ) : null}
          {podsEnabled && studentHasBroadcastGrant ? (
            <button
              type="button"
              className={`hud-btn hud-btn--broadcast${broadcastMode === "broadcast" ? " hud-btn--active" : ""}`}
              data-testid="student-broadcast-toggle"
              onClick={toggleBroadcast}
            >
              {broadcastMode === "broadcast" ? "Broadcast on" : "Broadcast off"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Identity + media controls + avatar editor button */}
      <div className="hud-panel">
        <div className="hud-id-card">
          <div className="hud-av" style={{ background: avatarColor }}>{initials}</div>
          <div className="hud-id-text">
            <div className="hud-id-name">{identity.displayName}</div>
            <div className="hud-id-sub">{roomRoleLabel} · {roomName}</div>
          </div>
        </div>
        <MediaControls media={media} canUseCamera={canUseCamera} canUseMicrophone={canUseMicrophone} />
        {viewMode === "3d" ? (
          <div className="hud-person-actions">
            <div className="hud-person-actions__cam-spacer" aria-hidden="true" />
            <div className="hud-person-actions__buttons">
              <div className="toggle hud-person-actions__perspective" aria-label="Camera perspective" title="First-person view (V)">
                <button
                  type="button"
                  aria-pressed={firstPerson}
                  disabled={!manifest}
                  onClick={() => setFirstPerson(true)}
                >
                  1P
                </button>
                <button
                  type="button"
                  aria-pressed={!firstPerson}
                  disabled={!manifest}
                  onClick={() => setFirstPerson(false)}
                >
                  3P
                </button>
              </div>
              <button
                type="button"
                className={`avatar-editor__hud-btn hud-person-actions__avatar${avatarEditorOpen ? " avatar-editor__hud-btn--active" : ""}${avatarEditorLocked ? " avatar-editor__hud-btn--locked" : ""}`}
                onClick={() => setAvatarEditorOpen((prev) => !prev)}
                aria-pressed={avatarEditorOpen}
                aria-label={avatarEditorLocked ? "Avatar editing paused during lesson" : "Edit your avatar"}
                disabled={avatarEditorLocked}
              >
                {avatarEditorLocked ? "🔒 Avatar" : "👤 Avatar"}
              </button>
            </div>
          </div>
        ) : null}
        {mediaPermissionText ? <p className="hud-permission" style={{ padding: "4px 9px", fontSize: "9.5px", color: "var(--hud-tx-m)" }}>{mediaPermissionText}</p> : null}
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
      {roomTypeFeatures.whisper && CLIENT_TUNING.enableWhisper && role === "student" && whisperAllowed ? (
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
    </>
  );

  // localAmbientGain takes precedence once the teacher has moved the slider.
  const ambientGainOverride = localAmbientGain ?? parsedRoomSettings?.worldSkins?.ambientGainOverride ?? null;
  // Mute ambient while the teacher's microphone is live (voice is primary).
  const muteAmbient = media.microphoneEnabled && role === "teacher";

  return (
    <SkinLayer
      skin={CLIENT_TUNING.enableWorldSkins ? activeSkinForRoom : null}
      dayNightMode={skinDayNightMode}
      ambientGainOverride={ambientGainOverride}
      muteAmbient={muteAmbient}
    >
    <main className="app-shell room-shell">
      {/* Stage fills the full viewport */}
      <div className="room-stage" aria-label="Shared classroom">
        {/* Walk-speed toast — shown once when entering a skin with non-1× walk multiplier */}
        {CLIENT_TUNING.enableWorldSkins && walkToastVisible ? (
          <div className="world-skin-walk-toast" role="status" aria-live="polite">
            Lower gravity — you move slower.
          </div>
        ) : null}
        {leaving ? (
          <div className="fallback-view">Leaving...</div>
        ) : !manifest || !session ? (
          <div className="fallback-view">Joining...</div>
        ) : viewMode === "3d" ? (
          <RoomView3D
            manifest={manifest}
            dynamicWallAnchors={dynamicBoards.anchors}
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
            hallpassZone={hallpassZone}
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
            podsEnabled={podsVisualEnabled}
            podRadiusMeters={podRadiusMeters}
            drawPodPartitions={podDrawPartitions}
            privateChecks={classroom.state?.privateChecks ?? []}
            spotlight={classroom.state?.spotlight}
            onWallObjectControl={controlWallObject}
            onWallObjectRemove={async (objectId) => {
              await wall.removeObject(objectId);
            }}
            onWallObjectStopShare={stopShare}
            onWallObjectModerate={moderateWallObject}
            onWallObjectFullscreen={setFullscreenObjectId}
            {...(roomObjectsEnabled && manifest
              ? {
                  roomObjects: roomObjects.objects,
                  roomObjectTemplatesById,
                  roomObjectGrabs: roomObjects.grabs,
                  myActiveRoomObjectGrabId: roomObjects.myActiveGrab?.objectId ?? null,
                  roomObjectRole: role,
                  roomObjectCurrentUserId: identity.userId,
                  roomObjectMemberGroupIds: memberGroupIdsForRoomObjects,
                  selectedRoomObjectId,
                  onSelectRoomObject: setSelectedRoomObjectId,
                  roomObjectActions: roomObjects.actions
                }
              : {})}
          />
        ) : (
          <RoomView2D
            manifest={manifest}
            dynamicWallAnchors={dynamicBoards.anchors}
            participants={participantList}
            hallpassZone={hallpassZone}
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
            podsEnabled={podsVisualEnabled}
            podRadiusMeters={podRadiusMeters}
            privateChecks={classroom.state?.privateChecks ?? []}
            spotlight={classroom.state?.spotlight}
            positioningMode={Boolean(positioningGroupId)}
            getReaction={(id) => getReaction(id)?.reaction}
            getAudioMode={getAudioMode}
            {...(roomObjectsEnabled && manifest
              ? {
                  roomObjects: roomObjects.objects,
                  roomObjectTemplatesById,
                  roomObjectGrabs: roomObjects.grabs,
                  myActiveRoomObjectGrabId: roomObjects.myActiveGrab?.objectId ?? null,
                  roomObjectRole: role,
                  roomObjectCurrentUserId: identity.userId,
                  roomObjectMemberGroupIds: memberGroupIdsForRoomObjects,
                  selectedRoomObjectId,
                  onSelectRoomObject: setSelectedRoomObjectId,
                  roomObjectActions: roomObjects.actions,
                  getAppearance: effectiveGetAppearance
                }
              : {})}
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
        <span className="room-hud-meta">{roomRoleLabel} · {status}</span>
        {role === "teacher" && session ? (
          <>
            <div className="room-hud-top-sep" />
            <CopyRoomInviteButton
              identity={identity}
              roomId={roomId}
              className="room-exit-btn"
              disabled={leaving}
            />
          </>
        ) : null}
        {roomTypeFeatures.breakoutPods && podsEnabled ? (
          <>
            <div className="room-hud-top-sep" />
            <div className="hud-pill--pods" data-testid="pods-indicator">
              {role === "student" && studentPositionedGroup ? (
                <>
                  <span className="group-dot" style={{ background: studentPositionedGroup.color ?? "#4678b4" }} />
                  <span>Pods on</span>
                </>
              ) : role === "student" ? (
                <span>Pods on · unassigned</span>
              ) : (
                <>
                  <span>Pods on</span>
                  <button
                    type="button"
                    className="hud-pill--pods__off"
                    disabled={classroom.loading}
                    onClick={() => {
                      void classroom.runAction({ type: "toggle-pods", enabled: false });
                    }}
                  >
                    off
                  </button>
                </>
              )}
            </div>
          </>
        ) : null}
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
      </header>

      <aside className="room-hud-people room-hud-people--dock-top" aria-label="Participants">
        <div className="hud-panel room-hud-people-panel">
          <Roster
            participants={participantList}
            classroomState={classroom.state}
            role={role}
            roleLabels={roleLabels}
            enableTeacherControls={roomTypeFeatures.peoplePanelTeacherControls}
            selectedStudentId={selectedStudentId}
            onSelectStudent={(id) => {
              setHelpBoardAccessUserId("");
              setSelectedStudentId(id);
            }}
          />
        </div>
      </aside>

      {/* Left HUD: identity / media / movement */}
      <div className="room-hud-left">{leftHudControls}</div>

      {/* Right HUD: unified collapsible panel */}
      <aside className="room-hud-right" aria-label="Room details">
        <div className="hud-panel">
          {roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "student" ? (
            <LessonStudentCallout
              run={lesson.run}
              currentStep={lesson.currentStep}
              state={classroom.state}
              manifest={manifest}
              currentUserId={identity.userId}
              onRunAction={classroom.runAction}
            />
          ) : null}
          {roomObjectsTeacherToolbarVisible ? (
            <RoomObjectsToolbar
              templates={roomObjectTemplates.templates}
              objects={roomObjects.objects}
              roomTypeLabel={roomTypeLabel}
              manifest={manifest!}
              roomObjectsReady={roomObjectsEnabled}
              gateSyncing={roomObjectsGateSyncing}
              localAvatarPosition={
                localParticipantForRoomObjects?.state.position ?? { x: 0, y: 0, z: 0 }
              }
              localAvatarYaw={localParticipantForRoomObjects?.state.rotation.y ?? 0}
              loading={roomObjects.loading || roomObjectTemplates.status === "loading"}
              error={roomObjects.error || (roomObjectTemplates.status === "error" ? "Unable to load object catalog." : "")}
              selectedObjectId={selectedRoomObjectId}
              onSelectObject={setSelectedRoomObjectId}
              onInstantiate={async (templateId) => {
                const template = roomObjectTemplatesById[templateId];
                const pose =
                  template && localParticipantForRoomObjects
                    ? buildSpawnPoseInFront({
                        manifest: manifest!,
                        avatarPosition: localParticipantForRoomObjects.state.position,
                        avatarYaw: localParticipantForRoomObjects.state.rotation.y,
                        template
                      })
                    : undefined;
                const object = await roomObjects.actions.instantiate(templateId, pose);
                setSelectedRoomObjectId(object.id);
              }}
              onRemove={async (objectId) => {
                await roomObjects.actions.remove(objectId);
                setSelectedRoomObjectId((current) => (current === objectId ? null : current));
              }}
              onDeleteTemplate={async (templateId) => {
                const placed = roomObjects.objects.filter((object) => object.templateId === templateId);
                for (const object of placed) {
                  await roomObjects.actions.remove(object.id);
                }
                await archiveRoomObjectTemplate(identity, templateId);
                if (placed.some((object) => object.id === selectedRoomObjectId)) {
                  setSelectedRoomObjectId(null);
                }
                await roomObjectTemplates.refetch();
              }}
              customUploadsEnabled={roomObjectCustomUploadsEnabled}
              onUpload={async (input) => {
                const activeRoomId = session?.room.id ?? roomId;
                if (!activeRoomId) throw new Error("Room is not ready.");
                await uploadRoomObjectGlb(identity, {
                  roomId: activeRoomId,
                  ...input
                });
                await roomObjectTemplates.refetch();
              }}
            />
          ) : null}
          {roomTypeFeatures.classroomState ? (
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
              hostSingular={roleLabels.hostSingular}
              onOpenBoardAccess={(userId) => {
                setSelectedStudentId("");
                setHelpBoardAccessUserId((current) => (current === userId ? "" : userId));
              }}
              onRunAction={async (action) => {
                await classroom.runAction(action);
              }}
            />
          ) : null}
          {roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher" ? (
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
                onOpenRecap={() => {
                  if (lesson.run?.id) openLessonRecap(lesson.run.id);
                }}
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
          {roomTypeFeatures.privateChecks ? (
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
          ) : null}
          {roomTypeFeatures.groups ? (
            <GroupsPanel
              role={role}
              state={classroom.state}
              loading={classroom.loading}
              participants={participantList}
              currentUserId={identity.userId}
              positioningGroupId={positioningGroupId}
              podsEnabled={classroom.state?.podsRuntime?.podsEnabled === true}
              broadcastUserIds={classroom.state?.podsRuntime?.broadcastFromUserIds ?? []}
              podsAllowedInRoom={CLIENT_TUNING.enableBreakoutPods && session?.room.settings.pods?.enabled === true}
              {...(manifest ? { manifestAnchors: manifest.wallAnchors } : {})}
              onRunAction={async (action) => {
                await classroom.runAction(action);
              }}
              onEnterPositioningMode={(groupId) => setPositioningGroupId(groupId)}
              onCancelPositioning={() => setPositioningGroupId("")}
            />
          ) : null}
          {roomTypeFeatures.focus ? (
            <FocusPanel
              role={role}
              state={classroom.state}
              loading={classroom.loading}
              manifest={manifest}
              currentUserId={identity.userId}
              hostSingular={roleLabels.hostSingular}
              onRunAction={async (action) => {
                await classroom.runAction(action);
              }}
              onLookAtFocus={lookAtFocus}
            />
          ) : null}
          {manifest && session ? (
            <AnchorPanel
              identity={identity}
              roomId={session.room.id}
              manifest={manifest}
              dynamicWallAnchors={dynamicBoards.anchors}
              wallObjects={wall.wallObjects}
              assetUrls={wall.assetUrls}
              wallMediaStreams={wallMediaStreams}
              canCreate={session.role === "teacher" || session.room.settings.wallObjectCreation !== "teacher-only" || Boolean(activeBoardGrant)}
              canManage={session.role === "teacher"}
              canCreateDynamicAnchor={roomTypeFeatures.dynamicBoards}
              role={session.role}
              activeBoardGrant={activeBoardGrant}
              loading={wall.loading}
              error={wall.error || displayMedia.error}
              onCreateDynamicAnchor={async (body) => { await dynamicBoards.create(body); }}
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
              hostSingular={roleLabels.hostSingular}
            />
          ) : null}
          {roomTypeFeatures.worldSkins && CLIENT_TUNING.enableWorldSkins && role === "teacher" && session ? (
            <EnvironmentCard
              identity={identity}
              skin={activeSkin.skin ?? null}
              dayNightMode={skinDayNightMode}
              ambientGain={ambientGainOverride}
              onRunAction={async (action) => {
                const result = await classroom.runAction(action);
                // The skin API handler returns { skinId, realtimeMessages } rather than a
                // full ClassroomState, so applyState silently ignores it.  Apply the
                // optimistic local override here, then broadcast the room.skin.v1 message
                // so all other participants update immediately via LiveKit.
                if (action.type === "set-room-skin") {
                  setTargetSkinId(action.skinId);
                }
                if (action.type === "set-room-skin-day-night") {
                  setTargetDayNightMode(action.mode);
                }
                const msgs = (result as { realtimeMessages?: RealtimeMessage[] }).realtimeMessages ?? [];
                for (const msg of msgs) publishRealtime(msg);
                return result;
              }}
              onAmbientChange={(gain) => {
                setLocalAmbientGain(gain);
                if (ambientDebounceRef.current) clearTimeout(ambientDebounceRef.current);
                ambientDebounceRef.current = setTimeout(() => {
                  const activeRoomId = session.room.id;
                  void patchRoom(identity, activeRoomId, {
                    settings: {
                      worldSkins: {
                        enabled: parsedRoomSettings?.worldSkins?.enabled ?? true,
                        skinId: parsedRoomSettings?.worldSkins?.skinId ?? null,
                        skinDayNightMode: parsedRoomSettings?.worldSkins?.skinDayNightMode ?? "day",
                        ambientGainOverride: gain
                      }
                    }
                  });
                }, 400);
              }}
            />
          ) : null}
        </div>
      </aside>
      {roomObjectInspectorDockOpen && selectedRoomObject && selectedRoomObjectTemplate ? (
        <aside
          className={`room-hud-right-secondary room-object-inspector-dock${roomObjectInspectorStacked ? " room-hud-right-secondary--stacked" : ""}`}
          aria-label={`${selectedRoomObject.displayName} inspector`}
          data-testid="room-object-inspector-dock"
        >
          <div className="hud-panel">
            <RoomObjectInspector
              key={selectedRoomObject.id}
              object={selectedRoomObject}
              template={selectedRoomObjectTemplate}
              role={role}
              currentUserId={identity.userId}
              memberGroupIds={memberGroupIdsForRoomObjects}
              participants={participantList}
              classroomGroups={classroom.state?.groups ?? []}
              visible={true}
              actions={roomObjects.actions}
              onClose={() => setSelectedRoomObjectId(null)}
            />
          </div>
        </aside>
      ) : null}
      {roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher" && lesson.run ? (
        <aside
          className={`room-hud-right-secondary${helpDetailPanelOpen ? " room-hud-right-secondary--stacked" : ""}`}
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
      {roomTypeFeatures.peoplePanelTeacherControls ? (() => {
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
                studentMediaRuntime={classroom.state.studentMediaRuntime}
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
            studentMediaRuntime={classroom.state?.studentMediaRuntime}
            error={classroom.error}
            onRunAction={async (action) => { await classroom.runAction(action); }}
            onClose={() => setSelectedStudentId("")}
          />
        ) : null;
      })() : null}
      {roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher" && recapOpen && recapRunId && session ? (
        <LessonRecapPanel
          identity={identity}
          roomId={session.room.id}
          runId={recapRunId}
          onClose={() => setRecapOpen(false)}
        />
      ) : null}
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
      {(() => {
        if (!fullscreenObjectId) return null;
        const fsObject = wall.wallObjects.find((o) => o.id === fullscreenObjectId && o.status !== "removed");
        if (!fsObject) return null;
        const fsStreams = wallMediaStreams[fullscreenObjectId] ?? {};
        return (
          <div className="board-fullscreen-overlay" role="dialog" aria-label={`${fsObject.title} — fullscreen`}>
            <div className="board-fullscreen-header">
              <span className="board-fullscreen-title">{fsObject.title}</span>
              <button
                type="button"
                className="board-fullscreen-close"
                onClick={() => setFullscreenObjectId(null)}
                aria-label="Exit fullscreen"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M3 1v3H1M7 1v3h2M3 9v-3H1M7 9v-3h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Exit fullscreen
              </button>
            </div>
            <div className="board-fullscreen-body">
              <WallObjectContent
                object={fsObject}
                canManage={session?.role === "teacher"}
                currentUserId={identity.userId}
                surface={false}
                assetUrl={wall.assetUrls[fullscreenObjectId]}
                videoStream={fsStreams.videoStream}
                audioStream={fsStreams.audioStream}
                onControl={controlWallObject}
              />
            </div>
          </div>
        );
      })()}
    </main>
    </SkinLayer>
  );
}
