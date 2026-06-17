"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { AvatarAppearance, AvatarBodySlug, AvatarEquippedAccessories, AvatarReactionMessage, AvatarReactionSlug, AvatarStateMessage, BuildPiece, CreateDynamicWallAnchorRequest, PhysicsTuning, Role, RoomManifest, RoomObjectTemplate, RoomSessionResponse, ViewMode, WallObject, WorldSkinDayNightMode } from "@3dspace/contracts";
import {
  DYNAMIC_WALL_ANCHOR_MAX_HEIGHT_M,
  DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M,
  DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M,
  DYNAMIC_WALL_ANCHOR_MIN_WIDTH_M
} from "@3dspace/contracts";
import {
  AvatarAccessoriesMessageSchema,
  AvatarAppearanceMessageSchema,
  AvatarBodyMessageSchema,
  AvatarBodySlugSchema,
  AvatarEquippedAccessoriesSchema,
  AvatarReactionMessageSchema,
  getRoomTypeFeatureFlags,
  isVerseRoomType,
  ParticipantAudioModeMessageSchema,
  parseRoomSettings,
  RoomPlayModeMessageSchema,
  RoomSkinMessageSchema,
  verseIdFromRoomType
} from "@3dspace/contracts";
import { computeGroupMemberPosition, createAvatarState, floorYFromZ, isEscapeRoomManifest, logicChannelsFromPieces, resolvePhysicsTuning, unprojectPointFrom2D, worldToCell } from "@3dspace/room-engine";
import {
  archiveRoomObjectTemplate,
  createAttachment,
  createAttachmentDownload,
  finalizeAttachment,
  listClasses,
  listClassMembers,
  patchRoom,
  postRoomEvent,
  uploadRoomObjectGlb
} from "../lib/api";
import { buildingEnvEnabled, CLIENT_TUNING, physicsEnvEnabled } from "../lib/config";
import { pickDisplayName } from "../lib/displayName";
import { useAvatarMovement } from "../lib/useAvatarMovement";
import { useAvatarAppearance } from "../lib/useAvatarAppearance";
import { DEFAULT_EQUIPPED_ACCESSORIES, useAvatarAccessories } from "../lib/useAvatarAccessories";
import { useAvatarBody } from "../lib/useAvatarBody";
import { BUILTIN_AVATAR_BODY_CATALOG, DEFAULT_AVATAR_BODY_SLUG, avatarBodyCatalogForRoom } from "../lib/avatarBodyCatalog";
import { useAvatarReactions } from "../lib/useAvatarReactions";
import { useAudioModes } from "../lib/useAudioModes";
import { isKeyboardOwnedTarget } from "../lib/isKeyboardOwnedTarget";
import { verseById, verseFromClassName, verseRoomThemeVars } from "../lib/verses";
import { DEFAULT_APPEARANCE } from "../lib/avatarAppearance";
import { useThirdPersonCamera } from "../lib/useThirdPersonCamera";
import { useLocalMedia } from "../lib/useLocalMedia";
import { useDisplayMedia } from "../lib/useDisplayMedia";
import { useWallObjects } from "../lib/useWallObjects";
import { useWhiteboards } from "../lib/useWhiteboards";
import { useSharedBrowser } from "../lib/useSharedBrowser";
import { useRoomObjects } from "../lib/useRoomObjects";
import { useBuildPieces } from "../lib/useBuildPieces";
import { useBuildHistory } from "../lib/useBuildHistory";
import { useBuildMode } from "../lib/useBuildMode";
import type { Build2DPreview } from "./BuildPreview2D";
import {
  buildPlacementStatusMessage,
  evaluateBuildPlacement,
  findBuildPieceForDestroy,
  resolveBuildTargetFromWorld,
  resolvePlaceAheadBuildTarget,
  tryAcquireBuildPlacementSlot
} from "../lib/buildPlacement";
import { useRoomObjectTemplates } from "../lib/useRoomObjectTemplates";
import { useWorldSkin } from "../lib/useWorldSkin";
import { SkinLayer } from "./worldSkins/SkinLayer";
import { usePersistentIdentity } from "../lib/usePersistentIdentity";
import { navigateToLobby } from "../lib/navigateToLobby";
import { type RealtimeClient, type RealtimeMessage } from "../lib/realtime";
import { useSpatialAudio } from "../lib/useSpatialAudio";
import { isBoardGrantActive } from "../lib/classroomGrants";
import { findNearestChair, type PlacedChair } from "../lib/usePlacedChairs";
import { usePlacedWorldAssets } from "../lib/usePlacedWorldAssets";
import { useCustomWorldAssets } from "../lib/useCustomWorldAssets";
import { useSitting } from "../lib/useSitting";
import { useStanding } from "../lib/useStanding";
import { AVATAR_KEYBOARD_INTERACT_MAX_HOLD_MS } from "../lib/useAvatarMovement";
import { placedAssetHasDeskNotebook, placedAssetHasPodiumNotebook, isStaticColliderWorldAsset, scatterWorldAssetOffsets, WORLD_ASSET_CATALOG } from "../lib/worldAssetCatalog";
import { worldAssetGroundY } from "../lib/worldAssetGroundY";
import { AuthGate } from "../lib/auth";
import { RoomView2D } from "./RoomView2D";
import { BoardAccessSidePanel } from "./BoardAccessSidePanel";
import { activeGrantMap, Roster, StudentDetailPanel } from "./Roster";
import { useClassroomState } from "../lib/useClassroomState";
import { useLessonRun } from "../lib/useLessonRun";
import { LessonStudio } from "./LessonStudio";
import { LessonRecapPanel } from "./LessonRecapPanel";
import { AvatarEditorPanel } from "./AvatarEditorPanel";
import { CopyRoomInviteButton } from "./CopyRoomInviteButton";
import { WallObjectContent } from "./WallObjectCard";
import { RoomObjectInspector } from "./RoomObjectInspector";
import { buildSpawnPoseInFront } from "../lib/roomObjectInteraction";
import { useDynamicWallAnchors } from "../lib/useDynamicWallAnchors";
import { useMeetingNotes } from "../lib/useMeetingNotes";
import { useLiveCaptions } from "../lib/useLiveCaptions";
import { useTranslation } from "../lib/useTranslation";
import { useTranslationVoice, type VoiceMode } from "../lib/useTranslationVoice";
import { LiveCaptionsDock } from "./LiveCaptionsDock";
import { TranslationDock } from "./TranslationDock";
import { WorldHostPanel } from "./WorldHostPanel";
import { BuildControls } from "./BuildControls";
import { LogicControls } from "./LogicControls";
import { LogicInspector } from "./LogicInspector";
import { LogicDebugOverlay } from "./LogicDebugOverlay";
import { useLogicMode } from "../lib/useLogicMode";
import { ESCAPE_STARTER_KIT, roomStampToTargets } from "../lib/buildStamps";
import { imageFloorTextureUrl } from "../lib/imageFloorTexture";
import { useLogicPieces } from "../lib/useLogicPieces";
import { useLogicDetection, type LogicDetectionEvent } from "../lib/useLogicDetection";
import { useEscapeSession } from "../lib/useEscapeSession";
import { AiWorldHostSceneContext, aiHostPlacementPosition, useAiWorldHost } from "../lib/useAiWorldHost";
import { EscapeTimerHud } from "./EscapeTimerHud";
import { ApiError, signalLogicPiece } from "../lib/api";
import type { BuildLogicPiece } from "@3dspace/contracts";
import { useAiObjectGenerator } from "../lib/useAiObjectGenerator";
import { DYNAMIC_BOARD_DEFAULT_HEIGHT, DYNAMIC_BOARD_DEFAULT_WIDTH } from "./RoomView3D";
import { RoomHudTop } from "./room/RoomHudTop";
import { RoomLeftHud } from "./room/RoomLeftHud";
import { RoomOverlayStack } from "./room/RoomOverlayStack";
import { RoomRightRail } from "./room/RoomRightRail";
import { RoomStage } from "./room/RoomStage";
import type { ParticipantView } from "../lib/room/types";
import {
  activeHelpRequestUserIds as activeHelpRequestUserIdsFromRequests,
  boardGrantWallAnchors,
  findLocalParticipant,
  findSelectedRoomObject,
  findSelectedRoomObjectTemplate,
  groupByUserId,
  memberGroupIdsForUser,
  mergeWallMediaStreams,
  participantListFromRecord,
  participantNameMapFromList,
  roomObjectTemplatesById
} from "../lib/room/selectors";
import {
  readFinePlacement,
  readTranslationPreferences,
  writeFinePlacement,
  writeTranslationPreference
} from "../lib/room/storage";
import { useRoomAvatarActions } from "../lib/room/useRoomAvatarActions";
import { useRoomEnvironmentActions } from "../lib/room/useRoomEnvironmentActions";
import { useRoomLights } from "../lib/useRoomLights";
import { useRoomEnvironment } from "../lib/useRoomEnvironment";
import { useRoomFloorTextureActions } from "../lib/room/useRoomFloorTextureActions";
import { useRoomRealtime } from "../lib/room/useRoomRealtime";
import { useRoomWallActions } from "../lib/room/useRoomWallActions";
import { useRoomSession } from "../lib/room/useRoomSession";

const RoomView3D = dynamic(() => import("./RoomView3D").then((module) => module.RoomView3D), {
  ssr: false,
  loading: () => <div className="fallback-view">Loading the 3D room...</div>
});

const DeskNotebook = dynamic(
  () => import("./DeskNotebook/DeskNotebook").then((module) => module.DeskNotebook),
  { ssr: false }
);

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

export function RoomClient({ roomId, inviteCode, verseId }: { roomId: string; inviteCode?: string; verseId?: string }) {
  const router = useRouter();
  const { identity, loaded: identityLoaded, authRequired, signedIn } = usePersistentIdentity();
  // Verse color key for the room HUD: prefer the URL's ?verse, else derive from
  // the room's class name (verse rooms live in a class named after the verse).
  const [derivedVerseId, setDerivedVerseId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [firstPerson, setFirstPerson] = useState(false);
  useEffect(() => {
    if (viewMode !== "3d") setFirstPerson(false);
  }, [viewMode]);
  useEffect(() => {
    if (viewMode !== "3d") return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code === "KeyV") setFirstPerson((prev) => !prev);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewMode]);
  const [participants, setParticipants] = useState<Record<string, ParticipantView>>({});
  const realtimeRef = useRef<RealtimeClient | null>(null);
  const realtimeGenerationRef = useRef(0);
  const leaveCleanupRef = useRef<() => void>(() => undefined);
  const avatarStateRef = useRef<AvatarStateMessage | null>(null);
  const memberNamesRef = useRef(new Map<string, string>());
  const localAppearanceRef = useRef<AvatarAppearance>(DEFAULT_APPEARANCE);
  const localAppearanceCustomizedRef = useRef(false);
  const localAccessoriesRef = useRef(DEFAULT_EQUIPPED_ACCESSORIES);
  const localBodySlugRef = useRef<AvatarBodySlug>(DEFAULT_AVATAR_BODY_SLUG);
  const seenParticipantsRef = useRef(new Set<string>());
  const {
    receiveAppearance,
    setLocalAppearance,
    getAppearance,
    getAppearanceCustomized
  } = useAvatarAppearance();
  const { receiveAccessories, setLocalAccessories, getAccessories } = useAvatarAccessories();
  const { receiveBody, setLocalBody, getBodySlug } = useAvatarBody();
  const getAccessoriesRef = useRef(getAccessories);
  getAccessoriesRef.current = getAccessories;
  const { receive: receiveReaction, drop: dropReaction, getReaction, log } = useAvatarReactions();
  const { receive: receiveAudioMode, drop: dropAudioMode, all: audioModes } = useAudioModes();
  const handleSessionJoined = useCallback((nextSession: RoomSessionResponse) => {
    const initialAppearance = nextSession.avatarAppearance ?? DEFAULT_APPEARANCE;
    const initialAppearanceCustomized = nextSession.avatarAppearance != null;
    const initialAccessories = AvatarEquippedAccessoriesSchema.parse(
      nextSession.avatarAccessories ?? undefined
    );
    const initialBodySlug = AvatarBodySlugSchema.parse(
      nextSession.avatarBodySlug ?? DEFAULT_AVATAR_BODY_SLUG
    );
    localAppearanceRef.current = initialAppearance;
    localAppearanceCustomizedRef.current = initialAppearanceCustomized;
    localAccessoriesRef.current = initialAccessories;
    localBodySlugRef.current = initialBodySlug;
    setLocalAppearance(nextSession.participantId, initialAppearance, initialAppearanceCustomized);
    setLocalAccessories(nextSession.participantId, initialAccessories);
    setLocalBody(nextSession.participantId, initialBodySlug);
  }, [setLocalAppearance, setLocalAccessories, setLocalBody]);
  const {
    session,
    setSession,
    manifest,
    status,
    setStatus,
    error,
    setError,
    leaving,
    leaveForLobby
  } = useRoomSession({
    identity,
    identityLoaded,
    authRequired,
    signedIn,
    roomId,
    inviteCode,
    viewMode,
    onJoined: handleSessionJoined,
    onLeaveCleanup: () => leaveCleanupRef.current(),
    onLeaveNavigate: () => navigateToLobby(router)
  });
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
  const [localDraftAccessories, setLocalDraftAccessories] = useState<AvatarEquippedAccessories | null>(null);
  const [localDraftBodySlug, setLocalDraftBodySlug] = useState<AvatarBodySlug | null>(null);
  const [waveTriggered, setWaveTriggered] = useState(false);
  const [hallpassBusy, setHallpassBusy] = useState(false);
  const [hallpassElapsedSeconds, setHallpassElapsedSeconds] = useState(0);
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapRunId, setRecapRunId] = useState<string | null>(null);
  const [lessonStudioOpen, setLessonStudioOpen] = useState(false);
  const [fullscreenObjectId, setFullscreenObjectId] = useState<string | null>(null);
  const prevLessonStatusRef = useRef<string | undefined>(undefined);
  const waveTriggeredRef = useRef(false);
  waveTriggeredRef.current = waveTriggered;
  const publishRealtime = useCallback((message: RealtimeMessage) => {
    realtimeRef.current?.publish(message);
  }, []);
  const {
    resetToDefaultSkin,
    saveAppearance: saveAvatarAppearance,
    saveAccessories: saveAvatarAccessories,
    saveBody: saveAvatarBody
  } = useRoomAvatarActions({
    identity,
    participantId: session?.participantId,
    localAppearanceRef,
    localAppearanceCustomizedRef,
    localAccessoriesRef,
    localBodySlugRef,
    setLocalAppearance,
    setLocalAccessories,
    setLocalBody,
    publishRealtime
  });
  const wall = useWallObjects({
    identity,
    roomId: session?.room.id ?? roomId,
    manifest,
    enabled: Boolean(session && manifest),
    publish: publishRealtime
  });
  const roomTypeFeatures = useMemo(() => getRoomTypeFeatureFlags(session?.room.type), [session?.room.type]);
  const whiteboards = useWhiteboards({
    identity,
    roomId: session?.room.id ?? roomId,
    session,
    wallObjects: wall.wallObjects,
    enabled: CLIENT_TUNING.enableWhiteboards && roomTypeFeatures.whiteboards && Boolean(session && manifest),
    publish: publishRealtime
  });
  const sharedBrowsers = useSharedBrowser({
    identity,
    roomId: session?.room.id ?? roomId,
    session,
    wallObjects: wall.wallObjects,
    enabled: CLIENT_TUNING.enableSharedBrowsers && roomTypeFeatures.sharedBrowsers && Boolean(session && manifest),
    publish: publishRealtime
  });
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
      case "escape-room":
        return { hostSingular: "Author", hostInitial: "A", guestSingular: "Player", guestPlural: "Players" };
      default:
        return { hostSingular: "Teacher", hostInitial: "T", guestSingular: "Student", guestPlural: "Students" };
    }
  }, [session?.room.type]);
  const roomRoleLabel = role === "teacher" ? roleLabels.hostSingular : roleLabels.guestSingular;
  const roomTypeLabel = useMemo(() => {
    const roomType = session?.room.type;
    if (roomType === "workforce-training") return "Workforce Training";
    if (roomType === "free-for-all") return "Free-for-All";
    if (roomType === "escape-room") return "Escape Room";
    if (isVerseRoomType(roomType)) {
      const verse = verseById(verseIdFromRoomType(roomType) ?? undefined);
      return verse?.name ?? "Verse";
    }
    return "Classroom";
  }, [session?.room.type]);
  const dynamicBoards = useDynamicWallAnchors({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: roomTypeFeatures.dynamicBoards && Boolean(session)
  });
  const meetingNotesEnabled = roomTypeFeatures.aiMeetingNotes && CLIENT_TUNING.enableAiMeetingNotes && Boolean(session);
  const liveCaptionsEnabled = roomTypeFeatures.liveCaptions && CLIENT_TUNING.enableLiveCaptions && Boolean(session);
  const meetingNotes = useMeetingNotes({
    identity,
    roomId: session?.room.id ?? roomId,
    roomName: session?.room.name ?? "",
    enabled: meetingNotesEnabled,
    participants: Object.values(participants).map((participant) => ({
      participantId: participant.id,
      displayName: participant.displayName,
      microphoneStream: participant.microphoneStream
    })),
    publish: publishRealtime
  });
  const liveCaptions = useLiveCaptions({
    roomId: session?.room.id ?? roomId,
    participantId: session?.participantId ?? identity.userId,
    enabled: liveCaptionsEnabled,
    micEnabled: media.microphoneEnabled,
    publish: publishRealtime
  });
  const translationEnabled = roomTypeFeatures.translation && CLIENT_TUNING.enableTranslation && Boolean(session);
  const translationVoiceEnabled = translationEnabled && CLIENT_TUNING.enableTranslationVoice;
  const translationStorageKey = `3dspace.translation:${identity.userId}`;
  const initialTranslationPrefs = useMemo(
    () =>
      readTranslationPreferences({
        storage: typeof window === "undefined" ? undefined : window.localStorage,
        storageKey: translationStorageKey,
        navigatorLanguage: typeof navigator === "undefined" ? undefined : navigator.language
      }),
    [translationStorageKey]
  );
  const [readLang, setReadLangState] = useState<string>(initialTranslationPrefs.readLang);
  const [speakLang, setSpeakLangState] = useState<string>(initialTranslationPrefs.speakLang);
  const [voiceMode, setVoiceModeState] = useState<VoiceMode>(initialTranslationPrefs.voiceMode);
  const [voiceChoice, setVoiceChoiceState] = useState<string>(initialTranslationPrefs.voiceChoice);
  const setReadLang = useCallback((lang: string) => {
    setReadLangState(lang);
    writeTranslationPreference(
      { storage: typeof window === "undefined" ? undefined : window.localStorage, storageKey: translationStorageKey },
      { readLang: lang }
    );
  }, [translationStorageKey]);
  const setSpeakLang = useCallback((lang: string) => {
    setSpeakLangState(lang);
    writeTranslationPreference(
      { storage: typeof window === "undefined" ? undefined : window.localStorage, storageKey: translationStorageKey },
      { speakLang: lang }
    );
  }, [translationStorageKey]);
  const setVoiceMode = useCallback((mode: VoiceMode) => {
    setVoiceModeState(mode);
    writeTranslationPreference(
      { storage: typeof window === "undefined" ? undefined : window.localStorage, storageKey: translationStorageKey },
      { voiceMode: mode }
    );
  }, [translationStorageKey]);
  const setVoiceChoice = useCallback((voice: string) => {
    setVoiceChoiceState(voice);
    writeTranslationPreference(
      { storage: typeof window === "undefined" ? undefined : window.localStorage, storageKey: translationStorageKey },
      { voiceChoice: voice }
    );
  }, [translationStorageKey]);
  const translationVoice = useTranslationVoice({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: translationVoiceEnabled,
    mode: voiceMode,
    voiceChoice,
    provider: "openai"
  });
  const translation = useTranslation({
    identity,
    roomId: session?.room.id ?? roomId,
    participantId: session?.participantId ?? identity.userId,
    enabled: translationEnabled,
    micEnabled: media.microphoneEnabled,
    readLang,
    speakLang,
    publish: publishRealtime,
    onTranslationResolved: translationVoice.enqueue
  });
  const aiObjectsEnabled = CLIENT_TUNING.enableAiObjectGeneration && roomTypeFeatures.aiObjects && Boolean(session);
  const [dynamicBoardPlacementActive, setDynamicBoardPlacementActive] = useState(false);
  const [dynamicBoardPlacementBusy, setDynamicBoardPlacementBusy] = useState(false);
  const [dynamicBoardPlacementMessage, setDynamicBoardPlacementMessage] = useState("");
  const [placementBoardWidth, setPlacementBoardWidth] = useState(DYNAMIC_BOARD_DEFAULT_WIDTH);
  const [placementBoardHeight, setPlacementBoardHeight] = useState(DYNAMIC_BOARD_DEFAULT_HEIGHT);
  const [focusAnchorId, setFocusAnchorId] = useState<string | null>(null);
  const placeDynamicBoardIn3D = useCallback(async (body: CreateDynamicWallAnchorRequest) => {
    setDynamicBoardPlacementBusy(true);
    setDynamicBoardPlacementMessage("Placing board...");
    try {
      const anchor = await dynamicBoards.create(body);
      setFocusAnchorId(anchor.id);
      setDynamicBoardPlacementActive(false);
      setDynamicBoardPlacementMessage("Board placed.");
    } catch (err) {
      setDynamicBoardPlacementMessage(err instanceof Error ? err.message : "Unable to place board.");
    } finally {
      setDynamicBoardPlacementBusy(false);
    }
  }, [dynamicBoards.create]);
  const dynamicBoardPlacement = useMemo(
    () => dynamicBoardPlacementActive
      ? {
          active: true,
          busy: dynamicBoardPlacementBusy,
          boardSize: { width: placementBoardWidth, height: placementBoardHeight },
          onPlace: placeDynamicBoardIn3D
        }
      : null,
    [dynamicBoardPlacementActive, dynamicBoardPlacementBusy, placeDynamicBoardIn3D, placementBoardWidth, placementBoardHeight]
  );
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
  const roomObjectsEnabled = (CLIENT_TUNING.enableRoomObjects || aiObjectsEnabled) && roomObjectsSettings?.enabled === true;

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
    identityReady: identityLoaded && (!authRequired || signedIn)
  });

  // When no explicit skin is chosen for a workforce-training room, the default-theater
  // skin would bleed classroom assets (floor and panorama) into the space. Strip them
  // until the workforce-training room gets its own skin assets.
  const activeSkinForRoom = useMemo(() => {
    const stripDefaultClassroomAssets =
      session?.room.type === "workforce-training" ||
      session?.room.type === "free-for-all" ||
      session?.room.type === "escape-room" ||
      isVerseRoomType(session?.room.type);
    if (!stripDefaultClassroomAssets || skinId !== null || !activeSkin.skin) {
      return activeSkin.skin;
    }
    const { floor: _floor, panoramaWall: _panorama, ...rest } = activeSkin.skin.overrides;
    return { ...activeSkin.skin, overrides: rest };
  }, [activeSkin.skin, session?.room.type, skinId]);

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
  const playModeEnabled = parsedRoomSettings?.playModeEnabled ?? false;
  const buildingFeatureEnabled =
    roomTypeFeatures.building &&
    buildingEnvEnabled(session?.room.type) &&
    (parsedRoomSettings?.buildingEnabled ?? true) &&
    Boolean(session);
  const buildPiecesEnabled = buildingFeatureEnabled && !playModeEnabled;
  const buildPieces = useBuildPieces({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: buildingFeatureEnabled,
    publish: publishRealtime
  });
  const aiWorldHostEnabled =
    roomTypeFeatures.aiWorldHost && CLIENT_TUNING.enableAiWorldHost && Boolean(session);
  const aiWorldHost = useAiWorldHost({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: aiWorldHostEnabled,
    publish: publishRealtime
  });
  const buildMode = useBuildMode();
  const {
    localAmbientGain,
    runSkinAction,
    changeAmbientGain,
    scheduleRoomPhysicsSettings,
    resetRoomPhysicsSettings
  } = useRoomEnvironmentActions({
    identity,
    roomId: session?.room.id,
    worldSkinSettings: parsedRoomSettings?.worldSkins,
    setSession,
    setTargetSkinId,
    setTargetDayNightMode,
    publishRealtime,
    runClassroomAction: classroom.runAction
  });
  const { handleUploadFloorTexture, handleSelectFloorTexturePreset } =
    useRoomFloorTextureActions({
      identity,
      roomId: session?.room.id ?? roomId,
      setFloorTexture: buildMode.setFloorTexture
    });
  /** Distinct floor images already laid in this room, so a floor can be extended later. */
  const floorTextureOptions = useMemo(() => {
    const seen = new Map<
      string,
      { storageKey: string; url: string; spanCells?: import("@3dspace/contracts").ImageFloorTextureSpanCells }
    >();
    for (const piece of buildPieces.pieces) {
      if (piece.kind !== "image-floor" || !piece.textureStorageKey) continue;
      if (!seen.has(piece.textureStorageKey)) {
        seen.set(piece.textureStorageKey, {
          storageKey: piece.textureStorageKey,
          url: imageFloorTextureUrl(piece.textureStorageKey),
          ...(piece.textureSpanCells ? { spanCells: piece.textureSpanCells } : {})
        });
      }
    }
    return Array.from(seen.values());
  }, [buildPieces.pieces]);
  const [selectedAssetSlug, setSelectedAssetSlug] = useState<string | null>(null);
  const [selectedCustomAssetId, setSelectedCustomAssetId] = useState<string | null>(null);
  const [assetYawDeg, setAssetYawDeg] = useState(0);
  // Per-placement size multiplier for custom uploads (×0.25–×4 of the model's base).
  const [customAssetScale, setCustomAssetScale] = useState(1);
  // Scatter assets (e.g. Tall Grass): instances strewn per placement click.
  const [assetScatterCount, setAssetScatterCount] = useState(1);
  const [fineAssetPlacement, setFineAssetPlacement] = useState(() =>
    readFinePlacement(typeof window === "undefined" ? undefined : window.localStorage)
  );
  const toggleFineAssetPlacement = useCallback(() => {
    setFineAssetPlacement((value) => {
      const next = !value;
      return writeFinePlacement(
        typeof window === "undefined" ? undefined : window.localStorage,
        next
      );
    });
  }, []);
  const logicFeatureEnabled =
    roomTypeFeatures.logic &&
    CLIENT_TUNING.enableEscapeRoom &&
    (parsedRoomSettings?.logicEnabled ?? true) &&
    Boolean(session);
  const logicAuthoringEnabled = logicFeatureEnabled && role === "teacher" && !playModeEnabled;
  const logicPlayEnabled = logicFeatureEnabled && playModeEnabled;
  const [logicSessionRunning, setLogicSessionRunning] = useState(false);
  const logicPieces = useLogicPieces({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: logicFeatureEnabled,
    publish: publishRealtime,
    // Timer fires mutate server state with no acting client to republish, so a
    // running session polls the authoritative logic state every few seconds.
    pollIntervalMs: logicSessionRunning ? 3000 : undefined
  });
  const logicMode = useLogicMode();
  const [selectedLogicPieceId, setSelectedLogicPieceId] = useState<string | null>(null);
  const [nearestInteractable, setNearestInteractable] = useState<BuildLogicPiece | null>(null);
  const [playStatusMessage, setPlayStatusMessage] = useState("");
  const playStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashPlayStatus = useCallback((message: string) => {
    setPlayStatusMessage(message);
    if (playStatusTimerRef.current) clearTimeout(playStatusTimerRef.current);
    playStatusTimerRef.current = setTimeout(() => setPlayStatusMessage(""), 3500);
  }, []);
  useEffect(
    () => () => {
      if (playStatusTimerRef.current) clearTimeout(playStatusTimerRef.current);
    },
    []
  );
  const onExitStepOnRef = useRef<(() => void) | null>(null);
  const movementTeleportRef = useRef<((position: { x: number; y: number; z: number }) => void) | null>(null);
  const logicDetectionSuppressRef = useRef<((pieceIds: string[]) => void) | null>(null);
  const [logicDebugEvents, setLogicDebugEvents] = useState<LogicDetectionEvent[]>([]);
  const appendLogicDebugEvent = useCallback((event: LogicDetectionEvent) => {
    setLogicDebugEvents((current) => [event, ...current].slice(0, 12));
  }, []);
  const [logicPulseAtByPieceId, setLogicPulseAtByPieceId] = useState<Record<string, number>>({});
  const reportLogicSignal = useCallback(
    async (pieceId: string, kind: LogicDetectionEvent["kind"]) => {
      if (!session?.room.id) return;
      try {
        const result = await signalLogicPiece(identity, session.room.id, pieceId, kind);
        for (const message of result.realtimeMessages) {
          logicPieces.handleRealtimeMessage(message);
          publishRealtime(message);
        }
        if (result.teleportTo) {
          movementTeleportRef.current?.(result.teleportTo);
          if (result.teleportTargetPieceId) {
            logicDetectionSuppressRef.current?.([result.teleportTargetPieceId]);
          }
        }
        if (kind === "stepOn" && logicPieces.piecesById[pieceId]?.config?.isExit === true) {
          onExitStepOnRef.current?.();
        }
        if (kind === "interact") {
          setLogicPulseAtByPieceId((current) => ({ ...current, [pieceId]: Date.now() }));
        }
      } catch (err) {
        // Local HUD still records detection; server may reject outside play mode.
        // Teleporters fail loudly so players know why nothing happened.
        if (logicPieces.piecesById[pieceId]?.kind === "teleporter" && kind === "stepOn" && err instanceof ApiError) {
          if (err.code === "logic-teleporter-no-target") {
            flashPlayStatus("This pad isn't linked yet — pair it with another pad's Link ID.");
          } else if (err.code === "logic-teleporter-disarmed") {
            flashPlayStatus("This pad is powered off — solve its puzzle to activate it.");
          }
        }
      }
    },
    [flashPlayStatus, identity, logicPieces, publishRealtime, session?.room.id]
  );
  const buildHistory = useBuildHistory(buildPieces.actions, () => buildPieces.piecesById, {
    onConflict: (message) => buildMode.setStatusMessage(message)
  });
  const buildActionsWithHistory = useMemo(
    () => ({
      place: async (
        ...args: Parameters<typeof buildPieces.actions.place>
      ) => {
        const piece = await buildPieces.actions.place(...args);
        buildHistory.recordPlace(piece);
        return piece;
      },
      placeBatch: async (...args: Parameters<typeof buildPieces.actions.placeBatch>) => {
        const pieces = await buildPieces.actions.placeBatch(...args);
        buildHistory.recordPlaceBatch(pieces);
        return pieces;
      },
      destroy: async (pieceId: string) => {
        const previous = buildPieces.piecesById[pieceId];
        if (previous) {
          buildHistory.recordDestroy(previous);
        }
        await buildPieces.actions.destroy(pieceId);
      },
      clearAll: buildPieces.actions.clearAll
    }),
    [buildHistory, buildPieces.actions, buildPieces.piecesById]
  );
  const buildScene = useMemo(
    () =>
      buildPiecesEnabled && manifest && session
        ? {
            roomId: session.room.id,
            userId: identity.userId,
            buildMode,
            pieces: buildPieces.pieces,
            piecesById: buildPieces.piecesById,
            actions: buildActionsWithHistory,
            onStatus: buildMode.setStatusMessage
          }
        : null,
    [
      buildActionsWithHistory,
      buildMode,
      buildPieces.pieces,
      buildPieces.piecesById,
      buildPiecesEnabled,
      identity.userId,
      manifest,
      session
    ]
  );
  const [playModeBusy, setPlayModeBusy] = useState(false);
  const togglePlayMode = useCallback(async () => {
    if (!session?.room.id || role !== "teacher") return;
    const next = !playModeEnabled;
    setPlayModeBusy(true);
    try {
      const updated = await patchRoom(identity, session.room.id, { settings: { playModeEnabled: next } });
      const nextSettings = parseRoomSettings(updated.settings);
      setSession((current) =>
        current?.room.id === session.room.id
          ? { ...current, room: { ...current.room, settings: { ...current.room.settings, ...nextSettings } } }
          : current
      );
      publishRealtime(
        RoomPlayModeMessageSchema.parse({
          type: "room.play-mode.v1",
          roomId: session.room.id,
          playModeEnabled: next,
          sentAt: Date.now(),
          senderId: identity.userId
        })
      );
      if (next) {
        buildMode.setEnabled(false);
        buildHistory.clear();
      }
    } catch (err) {
      buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to update play mode.");
    } finally {
      setPlayModeBusy(false);
    }
  }, [buildHistory, buildMode, identity, playModeEnabled, publishRealtime, role, session?.room.id]);

  useEffect(() => {
    buildHistory.clear();
  }, [buildHistory, session?.room.id]);
  useEffect(() => {
    if (!buildPiecesEnabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          void buildHistory.redo().then((did) => {
            if (did) buildMode.setStatusMessage("Redid.");
          });
        } else {
          void buildHistory.undo().then((did) => {
            if (did) buildMode.setStatusMessage("Undid.");
          });
        }
        return;
      }
      if (e.code === "KeyB" && !dynamicBoardPlacementActive) {
        e.preventDefault();
        buildMode.toggle();
        return;
      }
      if (!buildMode.enabled) return;
      if (e.code === "KeyR") {
        if (selectedAssetSlug) return;
        e.preventDefault();
        buildMode.rotate();
        return;
      }
      const toolByDigit: Partial<Record<string, Parameters<typeof buildMode.setTool>[0]>> = {
        Digit1: "wall",
        Digit2: "floor",
        Digit3: "ramp",
        Digit4: "destroy",
        Digit5: "doorway",
        Digit6: "window",
        Digit7: "light",
        Digit8: "mirror",
        Digit9: "simple-wall",
        Digit0: "image-floor"
      };
      const tool = toolByDigit[e.code];
      if (tool) {
        if (selectedAssetSlug) setSelectedAssetSlug(null);
        buildMode.setTool(tool);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [buildHistory, buildMode, buildPiecesEnabled, dynamicBoardPlacementActive, selectedAssetSlug]);
  useEffect(() => {
    if (dynamicBoardPlacementActive && buildMode.enabled) {
      buildMode.setEnabled(false);
    }
  }, [buildMode, dynamicBoardPlacementActive]);
  useEffect(() => {
    if (!buildMode.enabled) {
      setBuild2dPreview(null);
      setSelectedAssetSlug(null);
      setSelectedCustomAssetId(null);
      setAssetYawDeg(0);
      setCustomAssetScale(1);
    }
  }, [buildMode.enabled]);
  // While placing build pieces / world assets, flag the body so interactive board / object
  // DOM overlays (drei <Html>) stop swallowing placement clicks — the 3D placement plane
  // owns the pointer. CSS scopes the passthrough to `body.wb-placement-active`.
  useEffect(() => {
    const active = buildMode.enabled || Boolean(selectedAssetSlug);
    document.body.classList.toggle("wb-placement-active", active);
    return () => document.body.classList.remove("wb-placement-active");
  }, [buildMode.enabled, selectedAssetSlug]);
  const handleAiObjectJobDeleted = useCallback(
    (payload: { jobId: string; templateId?: string | undefined }) => {
      if (payload.templateId) {
        roomObjectTemplates.unregisterTemplate(payload.templateId);
      }
    },
    [roomObjectTemplates.unregisterTemplate]
  );
  const aiObjectGenerator = useAiObjectGenerator({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: aiObjectsEnabled,
    publish: publishRealtime,
    applyLocally: (msg) => roomObjectsRealtimeHandlerRef.current(msg),
    onJobDeleted: handleAiObjectJobDeleted
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
  const whiteboardRealtimeHandlerRef = useRef(whiteboards.handleRealtimeMessage);
  whiteboardRealtimeHandlerRef.current = whiteboards.handleRealtimeMessage;
  const roomObjectsRealtimeHandlerRef = useRef(roomObjects.handleRealtimeMessage);
  roomObjectsRealtimeHandlerRef.current = roomObjects.handleRealtimeMessage;
  const buildPiecesRealtimeHandlerRef = useRef(buildPieces.handleRealtimeMessage);
  buildPiecesRealtimeHandlerRef.current = buildPieces.handleRealtimeMessage;
  const logicPiecesRealtimeHandlerRef = useRef(logicPieces.handleRealtimeMessage);
  logicPiecesRealtimeHandlerRef.current = logicPieces.handleRealtimeMessage;
  const classroomRealtimeHandlerRef = useRef(classroom.handleRealtimeMessage);
  classroomRealtimeHandlerRef.current = classroom.handleRealtimeMessage;
  const dynamicBoardsRealtimeHandlerRef = useRef(dynamicBoards.handleRealtimeMessage);
  dynamicBoardsRealtimeHandlerRef.current = dynamicBoards.handleRealtimeMessage;
  const meetingNotesRealtimeHandlerRef = useRef(meetingNotes.handleRealtimeMessage);
  meetingNotesRealtimeHandlerRef.current = meetingNotes.handleRealtimeMessage;
  const liveCaptionsRealtimeHandlerRef = useRef(liveCaptions.handleRealtimeMessage);
  liveCaptionsRealtimeHandlerRef.current = liveCaptions.handleRealtimeMessage;
  const translationRealtimeHandlerRef = useRef(translation.handleRealtimeMessage);
  translationRealtimeHandlerRef.current = translation.handleRealtimeMessage;
  const aiObjectsRealtimeHandlerRef = useRef(aiObjectGenerator.handleRealtimeMessage);
  aiObjectsRealtimeHandlerRef.current = aiObjectGenerator.handleRealtimeMessage;
  const sharedBrowserRealtimeHandlerRef = useRef(sharedBrowsers.handleRealtimeMessage);
  sharedBrowserRealtimeHandlerRef.current = sharedBrowsers.handleRealtimeMessage;
  const aiWorldHostRealtimeHandlerRef = useRef(aiWorldHost.handleRealtimeMessage);
  aiWorldHostRealtimeHandlerRef.current = aiWorldHost.handleRealtimeMessage;
  camera.lockedRef.current = role === "student" && classroom.state?.spotlight?.mode === "force";

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
  const physicsRoomOverrides = useMemo<Partial<PhysicsTuning> | undefined>(() => {
    const physics = parsedRoomSettings?.physics;
    if (!physics) return undefined;
    const next: Partial<PhysicsTuning> = {};
    if (physics.enabled !== undefined) next.enabled = physics.enabled;
    if (physics.gravity !== undefined) next.gravity = physics.gravity;
    if (physics.moveSpeed !== undefined) next.moveSpeed = physics.moveSpeed;
    if (physics.jumpHeight !== undefined) next.jumpHeight = physics.jumpHeight;
    if (physics.maxFallSpeed !== undefined) next.maxFallSpeed = physics.maxFallSpeed;
    if (physics.airControl !== undefined) next.airControl = physics.airControl;
    if (physics.coyoteTimeMs !== undefined) next.coyoteTimeMs = physics.coyoteTimeMs;
    if (physics.capsuleRadius !== undefined) next.capsuleRadius = physics.capsuleRadius;
    if (physics.capsuleHeight !== undefined) next.capsuleHeight = physics.capsuleHeight;
    if (physics.maxSlopeClimbDeg !== undefined) next.maxSlopeClimbDeg = physics.maxSlopeClimbDeg;
    if (physics.autoStepHeight !== undefined) next.autoStepHeight = physics.autoStepHeight;
    if (physics.snapToGroundDist !== undefined) next.snapToGroundDist = physics.snapToGroundDist;
    return Object.keys(next).length > 0 ? next : undefined;
  }, [parsedRoomSettings?.physics]);
  const buildPiecesForMovementRef = useRef<BuildPiece[]>([]);
  buildPiecesForMovementRef.current = buildPiecesEnabled ? buildPieces.pieces : [];
  const worldAssetsForMovementRef = useRef<PlacedChair[]>([]);
  const logicPiecesForMovementRef = useRef<BuildLogicPiece[]>([]);
  logicPiecesForMovementRef.current = logicFeatureEnabled ? logicPieces.pieces : [];
  const logicNodesForMovementRef = useRef<Record<string, Record<string, unknown>>>({});
  logicNodesForMovementRef.current = logicFeatureEnabled ? (logicPieces.logicState?.nodes ?? {}) : {};
  const lastBuildPlaceAtRef = useRef(0);
  const [build2dPreview, setBuild2dPreview] = useState<Build2DPreview>(null);
  // ── Chair placement (API-persisted, realtime-synced) ─────────────────────
  const chairs = usePlacedWorldAssets({
    identity,
    roomId: session?.room.id ?? roomId,
    publish: publishRealtime
  });
  // ── Custom GLB library (per-user, reusable across rooms) ─────────────────
  const customAssets = useCustomWorldAssets({ identity });
  // ── Room lights + environment (flag-gated) ───────────────────────────────
  const lightingEnabled = CLIENT_TUNING.enableWorldBuilderLighting;
  const roomLights = useRoomLights(
    lightingEnabled && session?.room.id
      ? { identity, roomId: session.room.id, publish: publishRealtime }
      : { identity }
  );
  const roomEnvironment = useRoomEnvironment(
    lightingEnabled && session?.room.id
      ? { identity, roomId: session.room.id, publish: publishRealtime }
      : { identity }
  );
  const [selectedLightId, setSelectedLightId] = useState<string | null>(null);
  const [pendingLightType, setPendingLightType] = useState<import("@3dspace/contracts").RoomLightType | null>(null);
  worldAssetsForMovementRef.current = chairs.chairs;
  const hasWalkableSceneAssets = chairs.chairs.some((asset) => isStaticColliderWorldAsset(asset.slug));
  const physicsTuning = useMemo(() => {
    if (!session) return undefined;
    const sceneWalkPhysics = hasWalkableSceneAssets && roomTypeFeatures.physics;
    return resolvePhysicsTuning({
      defaults: {
        enabled: CLIENT_TUNING.physics.enablePhysics || sceneWalkPhysics,
        gravity: CLIENT_TUNING.physics.gravity,
        moveSpeed: CLIENT_TUNING.physics.moveSpeed,
        jumpHeight: CLIENT_TUNING.physics.jumpHeight,
        maxFallSpeed: CLIENT_TUNING.physics.maxFallSpeed,
        airControl: CLIENT_TUNING.physics.airControl,
        coyoteTimeMs: CLIENT_TUNING.physics.coyoteTimeMs,
        capsuleRadius: CLIENT_TUNING.physics.capsuleRadius,
        capsuleHeight: CLIENT_TUNING.physics.capsuleHeight,
        maxSlopeClimbDeg: CLIENT_TUNING.physics.maxSlopeClimbDeg,
        autoStepHeight: CLIENT_TUNING.physics.autoStepHeight,
        snapToGroundDist: CLIENT_TUNING.physics.snapToGroundDist
      },
      skin: activeSkinForRoom?.overrides,
      room: physicsRoomOverrides,
      featureEnabled:
        roomTypeFeatures.physics && (physicsEnvEnabled(session.room.type) || sceneWalkPhysics)
    });
  }, [
    activeSkinForRoom?.overrides,
    hasWalkableSceneAssets,
    physicsRoomOverrides,
    roomTypeFeatures.physics,
    session
  ]);
  const worldAssetsRealtimeHandlerRef = useRef(chairs.handleRealtimeMessage);
  worldAssetsRealtimeHandlerRef.current = chairs.handleRealtimeMessage;
  const roomLightsRealtimeHandlerRef = useRef(roomLights.handleRealtimeMessage);
  roomLightsRealtimeHandlerRef.current = roomLights.handleRealtimeMessage;
  const roomEnvironmentRealtimeHandlerRef = useRef(roomEnvironment.handleRealtimeMessage);
  roomEnvironmentRealtimeHandlerRef.current = roomEnvironment.handleRealtimeMessage;
  // A stable ref so useSitting can always read the latest avatar position without
  // needing movement to be declared first.
  const avatarPositionRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const resolveWorldAssetGroundY = useCallback(
    (x: number, z: number) => {
      if (!manifest) return 0;
      return worldAssetGroundY(manifest, buildPiecesForMovementRef.current, x, z);
    },
    [manifest]
  );
  const sitting = useSitting({
    chairs: chairs.chairs,
    getAvatarPosition: () => avatarPositionRef.current,
    resolveGroundY: resolveWorldAssetGroundY
  });
  const standing = useStanding({
    assets: chairs.chairs,
    getAvatarPosition: () => avatarPositionRef.current,
    resolveGroundY: resolveWorldAssetGroundY
  });
  // Classroom lock wins, then seat, then podium.
  const combinedLockedPosition = lockedPosition ?? sitting.seatLockedPosition ?? standing.standLockedPosition;
  const combinedLockedRotationY =
    lockedPosition !== null && lockedPosition !== undefined
      ? null
      : (sitting.seatYaw ?? standing.standYaw);

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
    lockedPosition: combinedLockedPosition,
    lockedRotationY: combinedLockedRotationY,
    walkSpeedMultiplier,
    physicsTuning,
    buildPiecesRef: buildPiecesForMovementRef,
    logicPiecesRef: logicPiecesForMovementRef,
    logicNodesRef: logicNodesForMovementRef,
    worldAssetsRef: worldAssetsForMovementRef
  });
  // Keep the position ref in sync with the latest avatar state.
  avatarPositionRef.current = movement.avatarState?.position ?? null;
  movementTeleportRef.current = movement.teleportToPosition;
  const nearestChairForPrompt = useMemo(() => {
    const pos = movement.avatarState?.position;
    if (!pos) return null;
    if (sitting.sittingPhase !== "none") return sitting.nearestChair;
    return findNearestChair(pos, chairs.chairs, 1.5);
  }, [chairs.chairs, movement.avatarState?.position, sitting.nearestChair, sitting.sittingPhase]);
  // Seated at a Student Desk → the personal notebook overlay mounts.
  const seatedNotebookDesk =
    sitting.sittingPhase === "seated" &&
    sitting.nearestChair !== null &&
    placedAssetHasDeskNotebook(sitting.nearestChair);
  const podiumEngaged = standing.engaged;
  const podiumNotebook =
    standing.engaged && standing.nearestPodium !== null && placedAssetHasPodiumNotebook(standing.nearestPodium);
  const sittingTryInteractRef = useRef(sitting.tryInteract);
  sittingTryInteractRef.current = sitting.tryInteract;
  const sittingPhaseRef = useRef(sitting.sittingPhase);
  sittingPhaseRef.current = sitting.sittingPhase;
  const nearestChairRef = useRef(nearestChairForPrompt);
  nearestChairRef.current = nearestChairForPrompt;
  const standingTryInteractRef = useRef(standing.tryInteract);
  standingTryInteractRef.current = standing.tryInteract;
  const nearestPodiumRef = useRef(standing.nearestPodium);
  nearestPodiumRef.current = standing.nearestPodium;
  const podiumEngagedRef = useRef(standing.engaged);
  podiumEngagedRef.current = standing.engaged;
  const sittingKeyDownTimesRef = useRef(new Map<string, number>());
  const logicDetection = useLogicDetection({
    enabled: logicPlayEnabled,
    pieces: logicPieces.pieces,
    getAvatarState: movement.getAvatarState,
    onEvent: appendLogicDebugEvent,
    onSignal: reportLogicSignal,
    onNearestInteractableChange: setNearestInteractable
  });
  logicDetectionSuppressRef.current = logicDetection.suppressStepOn;
  useEffect(() => {
    if (!logicPlayEnabled) {
      setLogicDebugEvents([]);
    }
  }, [logicPlayEnabled, session?.room.id]);
  // ── E-key: sit / stand (runs before logic interact so sitting takes priority) ──
  // Listeners must stay mounted — avatar movement re-renders every frame, so never
  // depend on `sitting` in this effect or keydown timestamps get wiped before keyup.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code !== "KeyE" || e.repeat) return;
      sittingKeyDownTimesRef.current.set(e.code, e.timeStamp);
    }
    function onKeyUp(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code !== "KeyE") return;
      const downAt = sittingKeyDownTimesRef.current.get(e.code);
      sittingKeyDownTimesRef.current.delete(e.code);
      if (downAt === undefined) return;
      const held = e.timeStamp - downAt;
      // Sit/stand on release if hold was shorter than interact max (turn starts earlier at turn-hold).
      if (held >= AVATAR_KEYBOARD_INTERACT_MAX_HOLD_MS) return;
      e.preventDefault();
      if (sittingPhaseRef.current !== "none" || nearestChairRef.current) {
        sittingTryInteractRef.current();
      } else if (podiumEngagedRef.current || nearestPodiumRef.current) {
        standingTryInteractRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // ── Lighting keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    if (!lightingEnabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      // Cancel pending light placement
      if (e.key === "Escape" && pendingLightType) {
        e.preventDefault();
        setPendingLightType(null);
        return;
      }
      if (!selectedLightId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        void roomLights.deleteLight(selectedLightId);
        setSelectedLightId(null);
      } else if (e.key === "[") {
        e.preventDefault();
        const light = roomLights.lightsById[selectedLightId];
        if (light) void roomLights.updateLight(selectedLightId, { intensity: Math.max(0, light.intensity - 0.5) }, { commit: true });
      } else if (e.key === "]") {
        e.preventDefault();
        const light = roomLights.lightsById[selectedLightId];
        if (light) void roomLights.updateLight(selectedLightId, { intensity: Math.min(20, light.intensity + 0.5) }, { commit: true });
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightingEnabled, selectedLightId, pendingLightType, roomLights]);

  const logicTryInteractRef = useRef(logicDetection.tryInteract);
  logicTryInteractRef.current = logicDetection.tryInteract;
  useEffect(() => {
    if (!logicPlayEnabled) return;
    function onKeyDown(e: KeyboardEvent) {
      if (isKeyboardOwnedTarget(e.target)) return;
      if (e.code !== "KeyE" || e.repeat) return;
      // Don't trigger logic if the avatar is near a chair/podium or already seated/engaged
      if (sittingPhaseRef.current !== "none" || nearestChairRef.current ||
          podiumEngagedRef.current || nearestPodiumRef.current) return;
      e.preventDefault();
      logicTryInteractRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [logicPlayEnabled]);
  const handleLogicPieceClick = useCallback(
    (piece: BuildLogicPiece) => {
      if (piece.kind === "button") {
        logicDetection.interactPiece(piece.id);
        return;
      }
      if (piece.kind === "door" && role === "teacher") {
        const open = logicPieces.logicState?.nodes[piece.id]?.open === true;
        void logicPieces.actions.patchNodeState(piece.id, { open: !open });
      }
    },
    [logicDetection.interactPiece, logicPieces.actions, logicPieces.logicState?.nodes, role]
  );
  const selectLogicPiece = useCallback((piece: BuildLogicPiece) => {
    setSelectedLogicPieceId(piece.id);
  }, []);
  const existingLogicChannels = useMemo(
    () => logicChannelsFromPieces(logicPieces.pieces),
    [logicPieces.pieces]
  );
  const playVerbs = useMemo(() => {
    const kinds = new Set(logicPieces.pieces.map((piece) => piece.kind));
    return {
      hasButton: kinds.has("button"),
      hasPlate: kinds.has("pressurePlate"),
      hasZone: kinds.has("proximityZone"),
      hasTeleporter: kinds.has("teleporter"),
      hasExit: logicPieces.pieces.some((piece) => piece.config?.isExit === true)
    };
  }, [logicPieces.pieces]);
  const logicNodeStates = logicPieces.logicState?.nodes ?? {};
  const logicPlayLayer = useMemo(
    () =>
      logicPlayEnabled
        ? {
            pieces: logicPieces.pieces,
            nodeStates: logicNodeStates,
            pulseAtByPieceId: logicPulseAtByPieceId,
            onPieceClick: handleLogicPieceClick
          }
        : null,
    [handleLogicPieceClick, logicNodeStates, logicPlayEnabled, logicPieces.pieces, logicPulseAtByPieceId]
  );
  const escapeSession = useEscapeSession({
    identity,
    roomId: session?.room.id ?? roomId,
    enabled: logicFeatureEnabled,
    publish: publishRealtime,
    onReset: () => movement.returnToSpawn(),
    onRealtimeMessages: (messages) => {
      for (const message of messages) {
        if (message.type.startsWith("room.logic.")) {
          logicPieces.handleRealtimeMessage(message);
        }
      }
    }
  });
  const escapeSessionRealtimeHandlerRef = useRef(escapeSession.handleRealtimeMessage);
  escapeSessionRealtimeHandlerRef.current = escapeSession.handleRealtimeMessage;
  useEffect(() => {
    setLogicSessionRunning(escapeSession.session?.status === "running");
  }, [escapeSession.session?.status]);
  onExitStepOnRef.current = () => {
    void escapeSession.actions.win();
  };
  useEffect(() => {
    avatarStateRef.current = movement.avatarState ?? null;
  }, [movement.avatarState]);
  useRoomRealtime({
    roomId,
    session,
    leaving,
    identityDisplayName: identity.displayName,
    localAvatarState: movement.avatarState,
    mediaCameraStream: media.cameraStream,
    mediaMicStream: media.micStream,
    avatarAccessoriesEnabled: CLIENT_TUNING.enableAvatarAccessories,
    avatarBodiesEnabled: CLIENT_TUNING.enableAvatarBodies,
    wallObjects: wall.wallObjects,
    realtimeRef,
    realtimeGenerationRef,
    avatarStateRef,
    displayNameRef,
    memberNamesRef,
    seenParticipantsRef,
    localAppearanceRef,
    localAppearanceCustomizedRef,
    localAccessoriesRef,
    localBodySlugRef,
    waveTriggeredRef,
    handlerRegistry: [
      wallRealtimeHandlerRef,
      whiteboardRealtimeHandlerRef,
      roomObjectsRealtimeHandlerRef,
      buildPiecesRealtimeHandlerRef,
      logicPiecesRealtimeHandlerRef,
      escapeSessionRealtimeHandlerRef,
      classroomRealtimeHandlerRef,
      dynamicBoardsRealtimeHandlerRef,
      meetingNotesRealtimeHandlerRef,
      liveCaptionsRealtimeHandlerRef,
      translationRealtimeHandlerRef,
      aiObjectsRealtimeHandlerRef,
      sharedBrowserRealtimeHandlerRef,
      aiWorldHostRealtimeHandlerRef,
      worldAssetsRealtimeHandlerRef,
      roomLightsRealtimeHandlerRef,
      roomEnvironmentRealtimeHandlerRef
    ],
    setStatus,
    setError,
    setSession,
    setParticipants,
    setRemoteWallMedia,
    setLocalWallMedia,
    receiveAppearance,
    receiveAccessories,
    receiveBody,
    receiveReaction,
    receiveAudioMode,
    dropReaction,
    dropAudioMode,
    dropCaptionsContributor: liveCaptions.dropContributor,
    setTargetSkinId,
    setTargetDayNightMode,
    warmPermissions: warmSafariLiveKitPermissions
  });
  const logicScene = useMemo(
    () =>
      logicAuthoringEnabled && manifest && session && movement.avatarState
        ? {
            manifest,
            logicMode,
            pieces: logicPieces.pieces,
            piecesById: logicPieces.piecesById,
            nodeStates: logicNodeStates,
            pulseAtByPieceId: logicPulseAtByPieceId,
            selectedPieceId: selectedLogicPieceId,
            localAvatarPosition: movement.avatarState.position,
            actions: logicPieces.actions,
            onPieceClick: selectLogicPiece,
            onStatus: logicMode.setStatusMessage
          }
        : null,
    [
      logicAuthoringEnabled,
      logicMode,
      logicNodeStates,
      logicPieces.actions,
      logicPieces.pieces,
      logicPieces.piecesById,
      logicPulseAtByPieceId,
      manifest,
      movement.avatarState,
      selectLogicPiece,
      selectedLogicPieceId,
      session
    ]
  );
  const applyStarterKit = useCallback(async () => {
    if (!session?.room.id || !movement.avatarState) return;
    const anchor = worldToCell(movement.avatarState.position.x, movement.avatarState.position.z);
    const { buildTargets, logicTargets } = roomStampToTargets(
      ESCAPE_STARTER_KIT,
      anchor,
      0,
      buildMode.materialId
    );
    if (buildTargets.length > 0) {
      await buildActionsWithHistory.placeBatch(buildTargets);
    }
    for (const target of logicTargets) {
      try {
        await logicPieces.actions.place(
          target.kind,
          target.cell,
          target.level,
          target.edge,
          target.channelId,
          { config: target.config, linkId: target.linkId }
        );
      } catch {
        // Skip slots already occupied; keep stamping the rest.
      }
    }
    logicMode.setStatusMessage("Starter escape stamped — switch to Play test to try it.");
  }, [
    buildActionsWithHistory,
    buildMode.materialId,
    logicMode,
    logicPieces.actions,
    movement.avatarState,
    session?.room.id
  ]);
  useEffect(() => {
    if (!logicAuthoringEnabled) {
      setSelectedLogicPieceId(null);
      return;
    }
    if (selectedLogicPieceId && !logicPieces.piecesById[selectedLogicPieceId]) {
      setSelectedLogicPieceId(null);
    }
  }, [logicAuthoringEnabled, logicPieces.piecesById, selectedLogicPieceId]);
  const handlePlaceAhead = useCallback(() => {
    if (!manifest || !session || !buildMode.enabled || buildMode.tool === "destroy" || selectedAssetSlug) return;
    const avatar = movement.avatarState;
    if (!avatar) return;
    if (buildMode.tool === "image-floor" && !buildMode.floorTexture) {
      buildMode.setStatusMessage(buildPlacementStatusMessage("floor-texture-missing"));
      return;
    }
    if (!tryAcquireBuildPlacementSlot(lastBuildPlaceAtRef)) {
      buildMode.setStatusMessage("Slow down…");
      return;
    }
    const target = resolvePlaceAheadBuildTarget({
      tool: buildMode.tool,
      avatarPosition: avatar.position,
      rotationY: avatar.rotation.y,
      rotation: buildMode.rotation,
      materialId: buildMode.materialId,
      pieces: buildPieces.pieces,
      rampRotationOverride: buildMode.rampRotationOverride,
      textureStorageKey: buildMode.tool === "image-floor" ? buildMode.floorTexture?.storageKey : undefined,
      textureSpanCells: buildMode.tool === "image-floor" ? buildMode.floorTextureSpanCells : undefined
    });
    const preview = evaluateBuildPlacement(
      manifest,
      target,
      session.room.id,
      identity.userId,
      buildPieces.piecesById
    );
    if (!preview.allowed) {
      buildMode.setStatusMessage(preview.message ?? buildPlacementStatusMessage(preview.reason));
      return;
    }
    void buildPieces.actions
      .place(
        target.kind,
        target.cell,
        target.level,
        target.edge,
        target.rotation,
        target.materialId,
        target.textureStorageKey,
        target.textureSpanCells
      )
      .then(() => buildMode.setStatusMessage("Piece placed."))
      .catch((err) =>
        buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to place piece.")
      );
  }, [
    buildMode,
    buildPieces.actions,
    buildPieces.pieces,
    buildPieces.piecesById,
    identity.userId,
    manifest,
    movement.avatarState,
    selectedAssetSlug,
    session
  ]);

  const updateBuild2dPreview = useCallback(
    (point: { x: number; y: number }) => {
      if (!manifest || !session || !buildMode.enabled || point.x < 0) {
        setBuild2dPreview(null);
        return;
      }
      const world = unprojectPointFrom2D(manifest, point);
      const hitY = movement.avatarState?.position.y ?? 0;
      if (buildMode.tool === "destroy") {
        const piece = findBuildPieceForDestroy(buildPieces.pieces, world.x, world.z);
        setBuild2dPreview(piece ? { mode: "destroy", piece } : null);
        return;
      }
      const target = resolveBuildTargetFromWorld({
        tool: buildMode.tool,
        hitX: world.x,
        hitY,
        hitZ: world.z,
        rotation: buildMode.rotation,
        materialId: buildMode.materialId,
        pieces: buildPieces.pieces,
        rampRotationOverride: buildMode.rampRotationOverride,
        textureStorageKey: buildMode.tool === "image-floor" ? buildMode.floorTexture?.storageKey : undefined,
        textureSpanCells: buildMode.tool === "image-floor" ? buildMode.floorTextureSpanCells : undefined
      });
      const result = evaluateBuildPlacement(
        manifest,
        target,
        session.room.id,
        identity.userId,
        buildPieces.piecesById
      );
      const missingTexture = buildMode.tool === "image-floor" && !buildMode.floorTexture;
      setBuild2dPreview({
        mode: "place",
        target,
        allowed: result.allowed && !missingTexture,
        roomId: session.room.id,
        userId: identity.userId
      });
    },
    [
      buildMode.enabled,
      buildMode.floorTexture,
      buildMode.floorTextureSpanCells,
      buildMode.materialId,
      buildMode.rampRotationOverride,
      buildMode.rotation,
      buildMode.tool,
      buildPieces.pieces,
      buildPieces.piecesById,
      identity.userId,
      manifest,
      movement.avatarState?.position.y,
      session
    ]
  );

  const handleBuild2dPointerDown = useCallback(
    (point: { x: number; y: number }) => {
      if (!manifest || !session || !buildMode.enabled) return;
      const world = unprojectPointFrom2D(manifest, point);
      const hitY = movement.avatarState?.position.y ?? 0;

      if (buildMode.tool === "destroy") {
        const piece = findBuildPieceForDestroy(buildPieces.pieces, world.x, world.z);
        if (!piece) {
          buildMode.setStatusMessage("Nothing to remove here.");
          return;
        }
        void buildPieces.actions
          .destroy(piece.id)
          .then(() => buildMode.setStatusMessage("Piece removed."))
          .catch((err) =>
            buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to remove piece.")
          );
        return;
      }

      if (buildMode.tool === "image-floor" && !buildMode.floorTexture) {
        buildMode.setStatusMessage(buildPlacementStatusMessage("floor-texture-missing"));
        return;
      }

      if (!tryAcquireBuildPlacementSlot(lastBuildPlaceAtRef)) {
        buildMode.setStatusMessage("Slow down…");
        return;
      }

      const target = resolveBuildTargetFromWorld({
        tool: buildMode.tool,
        hitX: world.x,
        hitY,
        hitZ: world.z,
        rotation: buildMode.rotation,
        materialId: buildMode.materialId,
        pieces: buildPieces.pieces,
        rampRotationOverride: buildMode.rampRotationOverride,
        textureStorageKey: buildMode.floorTexture?.storageKey,
        textureSpanCells: buildMode.floorTextureSpanCells
      });
      const preview = evaluateBuildPlacement(
        manifest,
        target,
        session.room.id,
        identity.userId,
        buildPieces.piecesById
      );
      if (!preview.allowed) {
        buildMode.setStatusMessage(preview.message ?? buildPlacementStatusMessage(preview.reason));
        return;
      }
      void buildPieces.actions
        .place(
          target.kind,
          target.cell,
          target.level,
          target.edge,
          target.rotation,
          target.materialId,
          target.textureStorageKey,
          target.textureSpanCells
        )
        .then(() => buildMode.setStatusMessage("Piece placed."))
        .catch((err) =>
          buildMode.setStatusMessage(err instanceof Error ? err.message : "Unable to place piece.")
        );
    },
    [
      buildMode,
      buildPieces.actions,
      buildPieces.pieces,
      buildPieces.piecesById,
      identity.userId,
      manifest,
      movement.avatarState?.position.y,
      session
    ]
  );

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
    debugWindow.__debug.buildPieces = {
      enabled: buildPiecesEnabled,
      pieces: buildPieces.pieces,
      piecesById: buildPieces.piecesById,
      refresh: buildPieces.refresh,
      actions: buildPieces.actions,
      previewPlacementAtWorld: (input: {
        tool: "wall" | "floor" | "ramp";
        x: number;
        z: number;
        y?: number;
      }) => {
        if (!manifest || !session) return null;
        const hitY = input.y ?? movement.getAvatarState()?.position.y ?? 0;
        const target = resolveBuildTargetFromWorld({
          tool: input.tool,
          hitX: input.x,
          hitY,
          hitZ: input.z,
          rotation: buildMode.rotation,
          materialId: buildMode.materialId,
          pieces: buildPieces.pieces
        });
        const preview = evaluateBuildPlacement(
          manifest,
          target,
          session.room.id,
          identity.userId,
          buildPieces.piecesById
        );
        return {
          allowed: preview.allowed,
          reason: preview.reason,
          message: preview.message,
          target
        };
      }
    };
    debugWindow.__debug.movement = {
      avatarState: movement.avatarState,
      getAvatarState: movement.getAvatarState,
      moveTo3DPoint: movement.moveTo3DPoint,
      teleportToPosition: movement.teleportToPosition,
      setTouchVector: movement.setTouchVector,
      tryMoveDelta: movement.tryMoveDelta,
      returnToSpawn: movement.returnToSpawn,
      requestJump: movement.requestJump
    };
    debugWindow.__debug.participants = participants;
    debugWindow.__debug.worldSkin = activeSkin;
    debugWindow.__debug.dynamicBoards = {
      enabled: roomTypeFeatures.dynamicBoards && Boolean(session),
      anchors: dynamicBoards.anchors,
      refresh: dynamicBoards.refresh
    };
    debugWindow.__debug.avatarAccessories = {
      enabled: CLIENT_TUNING.enableAvatarAccessories,
      getAccessories: (participantId: string) => getAccessoriesRef.current(participantId)
    };
    return () => {
      if (debugWindow.__debug) {
        delete debugWindow.__debug.roomObjects;
        delete debugWindow.__debug.buildPieces;
        delete debugWindow.__debug.movement;
        delete debugWindow.__debug.participants;
        delete debugWindow.__debug.worldSkin;
        delete debugWindow.__debug.dynamicBoards;
        delete debugWindow.__debug.avatarAccessories;
      }
    };
  }, [
    activeSkin,
    buildMode.materialId,
    buildMode.rotation,
    buildPieces.actions,
    buildPieces.pieces,
    buildPieces.piecesById,
    buildPieces.refresh,
    buildPiecesEnabled,
    dynamicBoards.anchors,
    dynamicBoards.refresh,
    identity.userId,
    manifest,
    movement.avatarState,
    movement.getAvatarState,
    movement.moveTo3DPoint,
    movement.returnToSpawn,
    movement.tryMoveDelta,
    roomObjects.actions,
    roomObjects.grabs,
    roomObjects.myActiveGrab,
    roomObjects.objects,
    roomObjects.objectsById,
    roomObjects.refresh,
    roomObjectsEnabled,
    roomObjectTemplates.refetch,
    roomObjectTemplates.status,
    roomObjectTemplates.templates,
    roomTypeFeatures.dynamicBoards,
    session
  ]);

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

  // Force mode: snap student camera to the spotlight anchor on activation
  const spotlight = classroom.state?.spotlight;
  useEffect(() => {
    if (role !== "student" || spotlight?.mode !== "force" || !spotlight.anchorId || !manifest) return;
    const anchor = manifest.wallAnchors.find((a) => a.id === spotlight.anchorId);
    if (!anchor) return;
    const pos = avatarStateRef.current?.position;
    if (!pos) return;
    camera.yawRef.current = Math.atan2(anchor.position.x - pos.x, anchor.position.z - pos.z);
  }, [role, spotlight?.anchorId, spotlight?.mode, manifest, camera.yawRef]);

  useEffect(() => {
    if (!movement.avatarState || viewMode !== "3d") return;
    camera.yawRef.current = movement.avatarState.rotation.y;
  }, [movement.avatarState?.participantId, movement.avatarState?.rotation.y, viewMode]);

  // When sitting begins, snap avatar position + yaw to the chair seat pose.
  useEffect(() => {
    if (sitting.sittingPhase !== "sitting") return;
    if (!sitting.seatLockedPosition) return;
    movement.teleportToPosition(
      sitting.seatLockedPosition,
      sitting.seatYaw ?? undefined
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sitting.sittingPhase, sitting.seatLockedPosition, sitting.seatYaw]);

  // When engaging a podium, snap avatar position + yaw to the stand pose.
  const engagedPodiumRef = useRef(standing.engaged);
  useEffect(() => {
    if (!standing.engaged) { engagedPodiumRef.current = false; return; }
    if (engagedPodiumRef.current) return;
    engagedPodiumRef.current = true;
    if (standing.standLockedPosition) {
      movement.teleportToPosition(standing.standLockedPosition, standing.standYaw ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standing.engaged, standing.standLockedPosition, standing.standYaw]);

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
  leaveCleanupRef.current = teardownSession;

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

  // Derive the verse from the room's class when not supplied via ?verse, so a
  // student who joined by invite code still gets the verse's color key.
  useEffect(() => {
    if (verseId || !session) return;
    let cancelled = false;
    void listClasses(identity)
      .then((records) => {
        if (cancelled) return;
        const cls = records.find((record) => record.id === session.room.classId);
        const verse = verseFromClassName(cls?.name);
        if (verse) setDerivedVerseId(verse.id);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [verseId, session?.room.classId, identity.userId]);

  const participantList = useMemo(
    () => participantListFromRecord(participants),
    [participants]
  );
  const participantNameMap = useMemo(
    () => participantNameMapFromList(participantList),
    [participantList]
  );
  const roomObjectTemplatesByIdMap = useMemo(
    () => roomObjectTemplatesById(roomObjectTemplates.templates),
    [roomObjectTemplates.templates]
  );

  useEffect(() => {
    if (!roomObjectsEnabled || !session?.room.id) return;
    const missingTemplateIds = [
      ...new Set(
        roomObjects.objects
          .map((object) => object.templateId)
          .filter((templateId) => !roomObjectTemplatesByIdMap[templateId])
      )
    ];
    if (missingTemplateIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      for (const templateId of missingTemplateIds) {
        if (cancelled) return;
        await roomObjectTemplates.resolveTemplate(templateId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomObjects.objects, roomObjectTemplates.resolveTemplate, roomObjectTemplatesByIdMap, roomObjectsEnabled, session?.room.id]);

  const memberGroupIdsForRoomObjects = useMemo(
    () => memberGroupIdsForUser(classroom.state?.groups, identity.userId),
    [classroom.state?.groups, identity.userId]
  );
  const localParticipantForRoomObjects = useMemo(
    () => findLocalParticipant(participantList, session?.participantId),
    [participantList, session?.participantId]
  );
  const selectedRoomObject = useMemo(
    () => findSelectedRoomObject(roomObjects.objects, selectedRoomObjectId),
    [roomObjects.objects, selectedRoomObjectId]
  );
  const selectedRoomObjectTemplate = useMemo(
    () => findSelectedRoomObjectTemplate(selectedRoomObject, roomObjectTemplatesByIdMap),
    [roomObjectTemplatesByIdMap, selectedRoomObject]
  );
  const groupByUserIdMap = useMemo(
    () => groupByUserId(classroom.state?.groups),
    [classroom.state?.groups]
  );

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
  const wallMediaStreams = useMemo(
    () =>
      mergeWallMediaStreams({
        remoteWallMedia,
        localWallMedia,
        wallObjects: wall.wallObjects,
        participants: participantList
      }),
    [localWallMedia, participantList, remoteWallMedia, wall.wallObjects]
  );
  const canWriteWhiteboard = useCallback((object: WallObject) => {
    if (!session || object.type !== "whiteboard") return false;
    if (session.role === "teacher") return true;
    if (!roomTypeFeatures.peoplePanelTeacherControls) {
      return Boolean(parsedRoomSettings?.whiteboards.allowStudentDraw);
    }
    if (!parsedRoomSettings?.whiteboards.allowStudentDraw) return false;
    return Boolean(
      activeBoardGrant &&
      activeBoardGrant.wallAnchorId === object.wallAnchorId &&
      activeBoardGrant.allowedObjectTypes.includes("whiteboard")
    );
  }, [activeBoardGrant, parsedRoomSettings?.whiteboards.allowStudentDraw, roomTypeFeatures.peoplePanelTeacherControls, session]);
  const boardGrantWallAnchorsList = useMemo(
    () => boardGrantWallAnchors(manifest?.wallAnchors, dynamicBoards.anchors),
    [dynamicBoards.anchors, manifest?.wallAnchors]
  );
  const podsInput = useMemo(() => {
    if (!roomTypeFeatures.breakoutPods || !CLIENT_TUNING.enableBreakoutPods) return undefined;
    const runtime = classroom.state?.podsRuntime;
    if (!runtime?.podsEnabled) return undefined;
    return {
      enabled: true,
      murmurFloor: session?.room.settings.pods?.podMurmurFloor ?? 0.08,
      broadcastUserIds: new Set(runtime.broadcastFromUserIds),
      groupByUserId: groupByUserIdMap
    };
  }, [classroom.state?.podsRuntime, groupByUserIdMap, roomTypeFeatures.breakoutPods, session]);
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
          pods: podsInput,
          duckedParticipantIds: translationVoice.duckedParticipantIds,
          duckMode: voiceMode === "replace" ? "replace" : "duck"
        }
      : { participants: participantList }
  );

  const getAudioMode = useCallback((id: string) => audioModes.get(id), [audioModes]);
  const {
    createFileObject,
    createNote,
    createWhiteboard,
    createSharedBrowser,
    createTimer,
    createPoll,
    createLink,
    pinCamera,
    pinMicrophone,
    shareScreen,
    stopShare,
    controlWallObject,
    moderateWallObject,
    removeWallObject
  } = useRoomWallActions({
    wall,
    media,
    displayMedia,
    realtimeRef,
    setLocalWallMedia,
    setRemoteWallMedia
  });

  const uploadSlideImage = useCallback(
    async (file: File, wallAnchorId: string) => {
      const roomId = session?.room.id;
      if (!roomId) throw new Error("Room is not ready.");
      const created = await createAttachment(identity, roomId, {
        wallAnchorId,
        kind: "image",
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        metadata: { source: "lesson-slide-deck", sizeBytes: file.size }
      });
      const response = await fetch(created.upload.url, {
        method: created.upload.method,
        headers: created.upload.headers,
        body: file
      });
      if (!response.ok) throw new Error(`Upload failed with ${response.status}`);
      const finalized = await finalizeAttachment(identity, roomId, created.attachment.id, { sizeBytes: file.size });
      const download = await createAttachmentDownload(identity, roomId, finalized.id);
      return { attachmentId: finalized.id, url: download.download.url };
    },
    [identity, session?.room.id]
  );

  const resolveSlideImage = useCallback(
    async (attachmentId: string) => {
      const roomId = session?.room.id;
      if (!roomId) throw new Error("Room is not ready.");
      const response = await createAttachmentDownload(identity, roomId, attachmentId);
      return response.download.url;
    },
    [identity, session?.room.id]
  );

  // The deck wall object is created server-side when the step starts; this is
  // the live object the run panel's slide navigator reads from and controls.
  const lessonSlideDeckObject = useMemo(() => {
    const step = lesson.currentStep;
    const payload = step?.payload;
    if (!payload || payload.kind !== "slide-deck") return null;
    if (lesson.run?.status !== "running" && lesson.run?.status !== "paused") return null;
    return (
      wall.wallObjects.find(
        (object) =>
          object.type === "slides.file" &&
          object.status === "active" &&
          object.wallAnchorId === payload.data.wallAnchorId
      ) ?? null
    );
  }, [lesson.currentStep, lesson.run?.status, wall.wallObjects]);

  const setLessonSlide = useCallback(
    (objectId: string, slideIndex: number) => {
      void controlWallObject(objectId, "set-slide", undefined, undefined, slideIndex).catch(() => undefined);
    },
    [controlWallObject]
  );

  // Lesson steps create and remove wall objects server-side (slide decks, wall
  // timers); refresh right away instead of waiting for the next poll.
  const lessonWallRefreshKey = `${lesson.run?.status ?? "none"}:${lesson.run?.currentStepIndex ?? -1}`;
  const wallRefresh = wall.refresh;
  useEffect(() => {
    void wallRefresh({ showLoading: false });
  }, [lessonWallRefreshKey, wallRefresh]);

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

  const activeVerse = verseById(
    verseId ?? derivedVerseId ?? verseIdFromRoomType(session?.room.type) ?? undefined
  );
  const verseStyle = activeVerse ? (verseRoomThemeVars(activeVerse.hue) as CSSProperties) : undefined;
  const avatarBodyCatalog = useMemo(
    () => avatarBodyCatalogForRoom(BUILTIN_AVATAR_BODY_CATALOG, isVerseRoomType(session?.room.type)),
    [session?.room.type]
  );

  const avatarColor = role === "teacher" ? "#c07834" : "#389060";
  const initials = identity.displayName
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase() || "?";
  const roomName = session?.room.name ?? "Joining...";

  const activeHelpRequestUserIds = useMemo(
    () => activeHelpRequestUserIdsFromRequests(classroom.state?.helpRequests),
    [classroom.state?.helpRequests]
  );
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
  const roomObjectInspectorDockOpen =
    roomObjectsEnabled &&
    role === "teacher" &&
    Boolean(selectedRoomObject && selectedRoomObjectTemplate);
  const aiWorldHostGuidePanelOpen =
    aiWorldHostEnabled &&
    aiWorldHost.panelOpen &&
    Boolean(aiWorldHost.host || aiWorldHost.hasStudyFiles);
  const roomObjectInspectorStacked = helpDetailPanelOpen || aiWorldHostGuidePanelOpen;
  const avatarEditorLocked =
    classroom.state?.lessonRun?.status === "running" &&
    classroom.state?.avatarEditorLocked === true;
  const localEditorPreviewActive = avatarEditorOpen && localDraftAppearance !== null;

  // Effective appearance: use draft for local participant when editor is open
  const localParticipantIdForAppearance = session?.participantId;
  function effectiveGetAppearance(id: string): AvatarAppearance {
    if (id === localParticipantIdForAppearance && localDraftAppearance !== null) {
      return localDraftAppearance;
    }
    return getAppearance(id);
  }

  function effectiveGetAppearanceCustomized(id: string): boolean {
    return getAppearanceCustomized(id);
  }

  function effectiveGetAccessories(id: string): AvatarEquippedAccessories {
    if (id === localParticipantIdForAppearance && localDraftAccessories !== null) {
      return localDraftAccessories;
    }
    return getAccessories(id);
  }

  function effectiveGetBodySlug(id: string): AvatarBodySlug {
    if (id === localParticipantIdForAppearance && localDraftBodySlug !== null) {
      return localDraftBodySlug;
    }
    return getBodySlug(id);
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

  if (identityLoaded && authRequired && !signedIn) {
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

  const showPlayModeToggle =
    role === "teacher" && buildingFeatureEnabled && session?.room.type === "escape-room";
  const showPlayModeDock = playModeEnabled && Boolean(session) && manifest && isEscapeRoomManifest(manifest);

  const hallpassStatus =
    CLIENT_TUNING.enableHallPass && session?.room.settings.hallpass.enabled
      ? myActiveHallpass?.status === "acknowledged"
        ? {
            mode: "active" as const,
            elapsedLabel: formatElapsed(hallpassElapsedSeconds),
            busy: hallpassBusy
          }
        : !myActiveHallpass &&
            session.room.settings.hallpass.perPeriodLimit > 0 &&
            myTodayPassCount >= session.room.settings.hallpass.perPeriodLimit
          ? { mode: "limit" as const }
          : {
              mode: "request" as const,
              pending: myActiveHallpass?.status === "raised",
              busy: hallpassBusy
            }
      : null;

  // localAmbientGain takes precedence once the teacher has moved the slider.
  const ambientGainOverride = localAmbientGain ?? parsedRoomSettings?.worldSkins?.ambientGainOverride ?? null;
  // Mute ambient while the teacher's microphone is live (voice is primary).
  const muteAmbient = media.microphoneEnabled && role === "teacher";
  const room3dView = manifest && session ? (
    <RoomView3D
      manifest={manifest}
      dynamicWallAnchors={dynamicBoards.anchors}
      participants={participantList}
      localParticipantId={session.participantId}
      verse={skinId === null ? activeVerse : null}
      getAppearance={effectiveGetAppearance}
      getAppearanceCustomized={effectiveGetAppearanceCustomized}
      localEditorPreviewActive={localEditorPreviewActive}
      getAccessories={effectiveGetAccessories}
      getBodySlug={effectiveGetBodySlug}
      getReaction={(id) => getReaction(id)?.reaction}
      getAudioMode={getAudioMode}
      recordingActive={Boolean(meetingNotes.activeSession)}
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
        if (manifest && aiWorldHostEnabled && aiWorldHost.placementMode !== "idle") {
          const fallbackY = movement.avatarState?.position.y ?? floorYFromZ(manifest, point.z);
          const position = aiHostPlacementPosition(
            manifest,
            point.x,
            point.z,
            buildPieces.pieces,
            fallbackY
          );
          aiWorldHost.handleGroundClick(position);
          return;
        }
        if (positioningGroupId) {
          void classroom.runAction({
            type: "update-group",
            groupId: positioningGroupId,
            targetPosition: {
              x: point.x,
              y: manifest ? floorYFromZ(manifest, point.z) : 0,
              z: point.z
            },
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
      onWallObjectRemove={removeWallObject}
      onWallObjectStopShare={stopShare}
      onWallObjectModerate={moderateWallObject}
      onWallObjectFullscreen={setFullscreenObjectId}
      whiteboardController={whiteboards}
      whiteboardParticipantNames={participantNameMap}
      canWriteWhiteboard={canWriteWhiteboard}
      sharedBrowserController={sharedBrowsers}
      sharedBrowserIdentity={identity}
      sharedBrowserRoomId={session.room.id}
      dynamicBoardPlacement={dynamicBoardPlacement}
      placementHighlightAnchorId={focusAnchorId}
      {...(roomObjectsEnabled && manifest
        ? {
            roomObjects: roomObjects.objects,
            roomObjectTemplatesById: roomObjectTemplatesByIdMap,
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
      buildScene={buildScene}
      logicScene={logicScene}
      logicPlayLayer={logicPlayLayer}
      placedChairs={chairs.chairs}
      {...(buildMode.tool === "destroy" ? { onDeleteChair: (id: string) => void chairs.removeChair(id) } : {})}
      localParticipantSittingPhase={sitting.sittingPhase}
      onLocalParticipantSitAnimationFinished={sitting.onAnimationFinished}
      assetPlacement={(() => {
        const rotateBy = (deltaDeg: number) =>
          setAssetYawDeg((deg) => (((deg + deltaDeg) % 360) + 360) % 360);

        const custom = selectedCustomAssetId
          ? customAssets.assets.find((a) => a.id === selectedCustomAssetId)
          : undefined;
        if (custom && manifest) {
          // Final scale = model's base scale × the user's per-placement size.
          const placeScale = (custom.scale ?? 1) * customAssetScale;
          return {
            glbUrl: custom.glbUrl,
            scale: placeScale,
            yawDeg: assetYawDeg,
            finePlacement: false,
            placement: custom.placement,
            snap: {
              walls: manifest.walls.map((w) => ({
                start: { x: w.start.x, z: w.start.z },
                end: { x: w.end.x, z: w.end.z }
              })),
              dimensions: { height: manifest.dimensions.height }
            },
            onPlace: (position: { x: number; y: number; z: number }, yaw: number) => {
              chairs.placeChair(custom.id, position, yaw, {
                custom: {
                  glbUrl: custom.glbUrl,
                  placement: custom.placement,
                  ...(custom.thumbnailUrl ? { thumbnailUrl: custom.thumbnailUrl } : {}),
                  ...(custom.objectRole ? { objectRole: custom.objectRole } : {})
                },
                scale: placeScale
              });
            },
            onCancel: () => setSelectedCustomAssetId(null),
            onRotateBy: rotateBy
          };
        }

        if (!selectedAssetSlug) return null;
        const asset = WORLD_ASSET_CATALOG.find((a) => a.slug === selectedAssetSlug);
        if (!asset) return null;
        return {
          glbUrl: asset.glbUrl,
          ...(asset.scale !== undefined ? { scale: asset.scale } : {}),
          yawDeg: assetYawDeg,
          ...(asset.scatter ? { scatterAreaSize: asset.scatter.areaSize } : {}),
          finePlacement: fineAssetPlacement,
          onPlace: (position, yaw) => {
            const scatter = asset.scatter;
            if (scatter) {
              for (const offset of scatterWorldAssetOffsets(scatter, assetScatterCount)) {
                chairs.placeChair(
                  asset.slug,
                  { x: position.x + offset.dx, y: position.y, z: position.z + offset.dz },
                  offset.yaw
                );
              }
              return;
            }
            chairs.placeChair(selectedAssetSlug, position, yaw);
          },
          onCancel: () => setSelectedAssetSlug(null),
          onRotateBy: rotateBy
        };
      })()}
      lightingEnabled={lightingEnabled}
      {...(lightingEnabled ? {
        lights: roomLights.lights,
        selectedLightId,
        environment: roomEnvironment.environment,
        onSelectLight: (id: string | null) => { setSelectedLightId(id); if (id) setPendingLightType(null); },
        onLightTransform: (id: string, position: { x: number; y: number; z: number }) => { void roomLights.updateLight(id, { position }, { commit: false }); },
        onLightTransformCommit: (id: string, position: { x: number; y: number; z: number }) => { void roomLights.updateLight(id, { position }, { commit: true }); },
        pendingLightType,
        onPlaceLight: async (position: { x: number; y: number; z: number }) => {
          if (!pendingLightType) return;
          const type = pendingLightType;
          setPendingLightType(null);
          const light = await roomLights.createLight({
            type,
            position,
            color: "#ffffff",
            intensity: 3,
            castShadow: false,
            ...(type === "spot" ? { target: { x: position.x, y: 0, z: position.z - 2 }, angleDeg: 30 } : {}),
            ...(type === "area" ? { width: 2, height: 2 } : {}),
          });
          if (light) setSelectedLightId(light.id);
        },
        onCancelLightPlacement: () => setPendingLightType(null),
      } : {})}
    />
  ) : null;
  const room2dView = manifest && session ? (
    <RoomView2D
      manifest={manifest}
      dynamicWallAnchors={dynamicBoards.anchors}
      participants={participantList}
      hallpassZone={hallpassZone}
      onMoveToPoint={(point) => {
        if (manifest && aiWorldHostEnabled && aiWorldHost.placementMode !== "idle" && point.x >= 0) {
          const world = unprojectPointFrom2D(manifest, point);
          const fallbackY = movement.avatarState?.position.y ?? floorYFromZ(manifest, world.z);
          const position = aiHostPlacementPosition(manifest, world.x, world.z, buildPieces.pieces, fallbackY);
          aiWorldHost.handleGroundClick(position);
          return;
        }
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
      currentUserId={identity.userId}
      whiteboardController={whiteboards}
      whiteboardParticipantNames={participantNameMap}
      canWriteWhiteboard={canWriteWhiteboard}
      sharedBrowserController={sharedBrowsers}
      sharedBrowserIdentity={identity}
      sharedBrowserRoomId={session.room.id}
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
            roomObjectTemplatesById: roomObjectTemplatesByIdMap,
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
      buildPieces={buildPiecesEnabled ? buildPieces.pieces : []}
      {...(buildPiecesEnabled && buildMode.enabled
        ? {
            buildInteraction: {
              enabled: true,
              tool: buildMode.tool,
              preview: build2dPreview,
              onPointerMove: updateBuild2dPreview,
              onPointerDown: handleBuild2dPointerDown
            }
          }
        : {})}
      {...(lightingEnabled ? { lights: roomLights.lights } : {})}
    />
  ) : null;
  const inviteControl = role === "teacher" && session ? (
    <CopyRoomInviteButton
      identity={identity}
      roomId={roomId}
      className="room-exit-btn"
      disabled={leaving}
    />
  ) : null;
  const aiWorldHostGuideDock = aiWorldHostGuidePanelOpen && session ? (
    <aside
      className="room-hud-right-secondary ai-world-host-guide-dock"
      aria-label="AI guide chat"
      data-testid="ai-world-host-guide-dock"
    >
      <div className="hud-panel">
        <WorldHostPanel
          controller={aiWorldHost}
          buildHelpContext={{
            buildModeEnabled: buildMode.enabled,
            selectedTool: buildMode.enabled ? buildMode.tool : null,
            pieceCount: buildPieces.pieces.length
          }}
        />
      </div>
    </aside>
  ) : null;
  const roomObjectInspectorDock = roomObjectInspectorDockOpen && selectedRoomObject && selectedRoomObjectTemplate ? (
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
  ) : null;
  const lessonStudioOverlay =
    roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher" && lessonStudioOpen ? (
      <LessonStudio
        run={lesson.run}
        state={classroom.state}
        manifest={manifest}
        wallAnchors={allWallAnchors}
        participants={participantList.map((participant) => ({
          id: participant.id,
          displayName: participant.displayName,
          role: participant.role
        }))}
        loading={lesson.loading}
        error={lesson.error}
        runAction={lesson.runAction}
        stepStatus={lesson.stepStatus}
        onClose={() => setLessonStudioOpen(false)}
        uploadSlideImage={uploadSlideImage}
        resolveSlideImage={resolveSlideImage}
        slideImageUrls={wall.assetUrls}
      />
    ) : null;
  const peopleDetailPanel = roomTypeFeatures.peoplePanelTeacherControls
    ? (() => {
        if (helpBoardAccessUserId && manifest && classroom.state) {
          const helpStudent = participantList.find((p) => p.id === helpBoardAccessUserId) ?? null;
          const helpRequest =
            classroom.state.helpRequests.find(
              (r) =>
                r.userId === helpBoardAccessUserId &&
                (r.status === "raised" || r.status === "acknowledged")
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
                wallAnchors={boardGrantWallAnchorsList}
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

        const selectedStudent = selectedStudentId
          ? participantList.find((p) => p.id === selectedStudentId) ?? null
          : null;
        const helpRequest =
          selectedStudent && classroom.state
            ? (classroom.state.helpRequests.find(
                (r) =>
                  r.userId === selectedStudent.id &&
                  (r.status === "raised" || r.status === "acknowledged")
              ) ?? null)
            : null;
        const studentActiveGrants =
          selectedStudent && classroom.state
            ? activeGrantMap(classroom.state).get(selectedStudent.id) ?? []
            : [];
        return selectedStudent && manifest ? (
          <StudentDetailPanel
            key={selectedStudent.id}
            participant={selectedStudent}
            helpRequest={helpRequest}
            activeGrants={studentActiveGrants}
            manifest={manifest}
            wallAnchors={boardGrantWallAnchorsList}
            studentMediaRuntime={classroom.state?.studentMediaRuntime}
            error={classroom.error}
            onRunAction={async (action) => {
              await classroom.runAction(action);
            }}
            onClose={() => setSelectedStudentId("")}
          />
        ) : null;
      })()
    : null;
  const lessonRecapOverlay =
    roomTypeFeatures.lessons &&
    CLIENT_TUNING.enableClassroomLessons &&
    role === "teacher" &&
    recapOpen &&
    recapRunId &&
    session ? (
      <LessonRecapPanel
        identity={identity}
        roomId={session.room.id}
        runId={recapRunId}
        onClose={() => setRecapOpen(false)}
      />
    ) : null;
  const avatarEditorOverlay = avatarEditorOpen && session ? (
    <AvatarEditorPanel
      savedAppearance={localAppearanceRef.current}
      appearanceCustomized={localAppearanceCustomizedRef.current}
      savedAccessories={localAccessoriesRef.current}
      savedBodySlug={localBodySlugRef.current}
      bodyCatalog={avatarBodyCatalog}
      onResetToDefaultSkin={resetToDefaultSkin}
      onSave={saveAvatarAppearance}
      {...(CLIENT_TUNING.enableAvatarAccessories
        ? {
            onSaveAccessories: saveAvatarAccessories,
            onDraftAccessoriesChange: (draft: AvatarEquippedAccessories) =>
              setLocalDraftAccessories(draft)
          }
        : {})}
      {...(CLIENT_TUNING.enableAvatarBodies
        ? {
            onSaveBody: saveAvatarBody,
            onDraftBodyChange: (draft: AvatarBodySlug) => setLocalDraftBodySlug(draft)
          }
        : {})}
      onDraftChange={(draft, dirty) => setLocalDraftAppearance(dirty ? draft : null)}
      onClose={() => {
        setAvatarEditorOpen(false);
        setLocalDraftAppearance(null);
        setLocalDraftAccessories(null);
        setLocalDraftBodySlug(null);
      }}
      onTriggerWave={() => setWaveTriggered(true)}
      waveActive={waveTriggered}
      locked={avatarEditorLocked}
    />
  ) : null;
  const fullscreenWallObjectOverlay = (() => {
    if (!fullscreenObjectId) return null;
    const fsObject = wall.wallObjects.find(
      (object) => object.id === fullscreenObjectId && object.status !== "removed"
    );
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
              <path
                d="M3 1v3H1M7 1v3h2M3 9v-3H1M7 9v-3h2"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
            slideImageUrls={wall.assetUrls}
            videoStream={fsStreams.videoStream}
            audioStream={fsStreams.audioStream}
            whiteboardController={whiteboards}
            whiteboardParticipantNames={participantNameMap}
            canWriteWhiteboard={canWriteWhiteboard}
            sharedBrowserController={sharedBrowsers}
            sharedBrowserIdentity={identity}
            sharedBrowserRoomId={session?.room.id ?? roomId}
            {...(fsObject.type === "web.browser.shared"
              ? { hyperbeamEmbedVisible: true }
              : {})}
            onControl={controlWallObject}
          />
        </div>
      </div>
    );
  })();
  const interactionPrompt =
    sitting.sittingPhase !== "none" ? (
      <div className="hud-interaction-prompt" role="status" aria-live="polite">
        <kbd>E</kbd> stand up
        {seatedNotebookDesk ? (
          <>
            <span aria-hidden="true">·</span>
            <kbd>N</kbd> notebook
          </>
        ) : null}
      </div>
    ) : podiumEngaged ? (
      <div className="hud-interaction-prompt" role="status" aria-live="polite">
        <kbd>E</kbd> leave
        <span aria-hidden="true">·</span>
        <kbd>N</kbd> notebook
      </div>
    ) : nearestChairForPrompt ? (
      <div className="hud-interaction-prompt" role="status" aria-live="polite">
        <kbd>E</kbd> sit
      </div>
    ) : standing.nearestPodium ? (
      <div className="hud-interaction-prompt" role="status" aria-live="polite">
        <kbd>E</kbd> present
      </div>
    ) : null;
  const logicInteractionPrompt = logicPlayEnabled && nearestInteractable?.kind === "button" ? (
    <div className="hud-interaction-prompt" role="status" aria-live="polite">
      <kbd>E</kbd> use button
    </div>
  ) : null;
  const playModeDockOverlay = showPlayModeDock ? (
    <div className="play-mode-dock" role="status" aria-live="polite">
      <strong>Play test</strong>
      {logicPlayEnabled ? (
        <ul className="play-mode-dock__how">
          {playVerbs.hasExit ? (
            <li>🎯 Reach the exit pad before the timer runs out.</li>
          ) : (
            <li>🎯 Solve the puzzle to open the locked doors.</li>
          )}
          {playVerbs.hasButton ? <li><kbd>E</kbd> (or click) a button to trigger it.</li> : null}
          {playVerbs.hasPlate ? <li>Stand on a pressure plate to hold its signal.</li> : null}
          {playVerbs.hasZone ? <li>Walk into a glowing zone to trip it.</li> : null}
          {playVerbs.hasTeleporter ? <li>Step onto a glowing pad to teleport to its linked pad.</li> : null}
          <li>Closed doors are locked until their channel is powered.</li>
          {role === "teacher" ? <li>Author: click a door to force it open/closed.</li> : null}
        </ul>
      ) : (
        <span>Explore the layout — you can&apos;t edit walls while play mode is on.</span>
      )}
      {playStatusMessage ? (
        <span className="play-mode-dock__toast" role="alert">
          {playStatusMessage}
        </span>
      ) : null}
      {logicPlayEnabled ? (
        <EscapeTimerHud
          session={escapeSession.session}
          isAuthor={role === "teacher"}
          busy={escapeSession.busy}
          onStart={() => void escapeSession.actions.start()}
          onReset={() => void escapeSession.actions.reset()}
        />
      ) : null}
      <button type="button" className="hud-btn" onClick={movement.returnToSpawn}>
        Return to spawn
      </button>
      {logicPlayEnabled ? (
        <div className="logic-debug-hud" aria-label="Logic detection events">
          <strong>Logic signals</strong>
          {logicDebugEvents.length === 0 ? (
            <span className="logic-debug-empty">
              Step on plates, enter zones, or press E near buttons.
            </span>
          ) : (
            <ul>
              {logicDebugEvents.map((event) => (
                <li key={`${event.pieceId}-${event.kind}-${event.at}`}>
                  <code>{event.kind}</code> · {event.pieceKind} · {event.pieceId.slice(-12)}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {logicPlayEnabled && role === "teacher" ? (
        <LogicDebugOverlay pieces={logicPieces.pieces} logicState={logicPieces.logicState} />
      ) : null}
    </div>
  ) : null;
  const logicAuthoringOverlay = logicAuthoringEnabled && session ? (
    <>
      <LogicControls
        logicMode={logicMode}
        pieceCount={logicPieces.pieces.length}
        existingChannels={existingLogicChannels}
        canApplyStarterKit={session.room.type === "escape-room"}
        onApplyStarterKit={applyStarterKit}
        onClearAll={logicPieces.actions.clearAll}
      />
      {selectedLogicPieceId && logicPieces.piecesById[selectedLogicPieceId] ? (
        <LogicInspector
          piece={logicPieces.piecesById[selectedLogicPieceId]!}
          pieces={logicPieces.pieces}
          logicState={logicPieces.logicState}
          onUpdate={logicPieces.actions.update}
          onRemove={async (pieceId) => {
            await logicPieces.actions.destroy(pieceId);
            setSelectedLogicPieceId(null);
          }}
          onSelect={setSelectedLogicPieceId}
          onClose={() => setSelectedLogicPieceId(null)}
        />
      ) : null}
    </>
  ) : null;
  const buildControlsOverlay = buildPiecesEnabled && session ? (
    <BuildControls
      buildMode={buildMode}
      pieceCount={buildPieces.pieces.length}
      error={buildPieces.error}
      emptyCanvasHint={session?.room.type === "escape-room"}
      onClearAll={buildActionsWithHistory.clearAll}
      onReturnToSpawn={movement.returnToSpawn}
      onPlaceAhead={handlePlaceAhead}
      placeAheadDisabled={
        !buildMode.enabled || buildMode.tool === "destroy" || Boolean(selectedAssetSlug)
      }
      onUndo={() =>
        void buildHistory.undo().then((did) => did && buildMode.setStatusMessage("Undid."))
      }
      onRedo={() =>
        void buildHistory.redo().then((did) => did && buildMode.setStatusMessage("Redid."))
      }
      selectedAssetSlug={selectedAssetSlug}
      onSelectAsset={(slug) => {
        setSelectedAssetSlug(slug);
        if (slug) setSelectedCustomAssetId(null);
        setAssetYawDeg(0);
        if (slug) {
          const scatter = WORLD_ASSET_CATALOG.find((asset) => asset.slug === slug)?.scatter;
          if (scatter) setAssetScatterCount(scatter.defaultCount);
        }
      }}
      scatterCount={assetScatterCount}
      onScatterCountChange={setAssetScatterCount}
      finePlacement={fineAssetPlacement}
      onToggleFinePlacement={toggleFineAssetPlacement}
      onUploadFloorTexture={handleUploadFloorTexture}
      onSelectFloorTexturePreset={handleSelectFloorTexturePreset}
      floorTextureOptions={floorTextureOptions}
      customAssets={customAssets.assets}
      selectedCustomAssetId={selectedCustomAssetId}
      onUploadCustomAsset={(input) => customAssets.upload(input).then(() => undefined)}
      onDeleteCustomAsset={(assetId) => {
        if (selectedCustomAssetId === assetId) setSelectedCustomAssetId(null);
        return customAssets.remove(assetId);
      }}
      onSetCustomAssetRole={(assetId, objectRole) => customAssets.setObjectRole(assetId, objectRole)}
      onSelectCustomAsset={(assetId) => {
        setSelectedCustomAssetId(assetId);
        if (assetId) setSelectedAssetSlug(null);
        setAssetYawDeg(0);
        setCustomAssetScale(1);
      }}
      customScale={customAssetScale}
      onCustomScaleChange={setCustomAssetScale}
      assetYawDeg={assetYawDeg}
      onRotateAsset={() => setAssetYawDeg((d) => (((d + 90) % 360) + 360) % 360)}
      {...(lightingEnabled ? {
        lights: roomLights.lights,
        selectedLightId,
        roomEnvironment: roomEnvironment.environment,
        onAddLight: (type: import("@3dspace/contracts").RoomLightType) => {
          setPendingLightType(type);
          setSelectedLightId(null);
        },
        onSelectLight: (id: string | null) => { setSelectedLightId(id); if (id) setPendingLightType(null); },
        onUpdateLight: (id: string, patch: Partial<import("@3dspace/contracts").RoomLight>, commit?: boolean) => { void roomLights.updateLight(id, patch, { commit: commit !== false }); },
        onDeleteLight: (id: string) => { void roomLights.deleteLight(id); },
        onUpdateEnvironment: (patch: Partial<import("@3dspace/contracts").RoomEnvironment>, commit?: boolean) => { void roomEnvironment.updateEnvironment(patch, { commit: commit !== false }); },
      } : {})}
    />
  ) : null;

  return (
    <AiWorldHostSceneContext.Provider value={aiWorldHostEnabled ? aiWorldHost.scene : null}>
    <SkinLayer
      skin={CLIENT_TUNING.enableWorldSkins ? activeSkinForRoom : null}
      dayNightMode={skinDayNightMode}
      ambientGainOverride={ambientGainOverride}
      muteAmbient={muteAmbient}
    >
    <main className="app-shell room-shell" style={verseStyle}>
      <RoomStage
        walkToastVisible={walkToastVisible}
        worldSkinsEnabled={CLIENT_TUNING.enableWorldSkins}
        dynamicBoardPlacementActive={dynamicBoardPlacementActive}
        dynamicBoardPlacementBusy={dynamicBoardPlacementBusy}
        dynamicBoardPlacementMessage={dynamicBoardPlacementMessage}
        buildPiecesEnabled={buildPiecesEnabled}
        onCancelDynamicBoardPlacement={() => {
          setDynamicBoardPlacementActive(false);
          setDynamicBoardPlacementMessage("");
        }}
        aiWorldHostPlacementActive={aiWorldHostEnabled && aiWorldHost.placementMode !== "idle"}
        aiWorldHostPlacementMode={aiWorldHost.placementMode}
        aiWorldHostBusy={aiWorldHost.busy}
        onCancelAiWorldHostPlacement={aiWorldHost.cancelPlacement}
        leaving={leaving}
        manifestReady={Boolean(manifest)}
        sessionReady={Boolean(session)}
        viewMode={viewMode}
        threeDView={room3dView}
        twoDView={room2dView}
      />

      <RoomHudTop
        leaving={leaving}
        roomName={roomName}
        roomRoleLabel={roomRoleLabel}
        status={status}
        meetingNotesActive={Boolean(meetingNotes.activeSession)}
        liveCaptionsEnabled={liveCaptionsEnabled}
        liveCaptionsContributorCount={liveCaptions.contributors.size}
        translationEnabled={translationEnabled}
        translationSharing={translation.sharing}
        showInviteControl={role === "teacher" && Boolean(session)}
        inviteControl={inviteControl}
        podsVisible={roomTypeFeatures.breakoutPods && podsEnabled}
        role={role}
        studentPositionedGroup={studentPositionedGroup}
        classroomLoading={classroom.loading}
        onDisablePods={() => {
          void classroom.runAction({ type: "toggle-pods", enabled: false });
        }}
        viewMode={viewMode}
        manifestReady={Boolean(manifest)}
        canUse2D={Boolean(manifest?.capabilities.twoDAnalog)}
        onViewModeChange={setViewMode}
        onLeave={leaveForLobby}
      />

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

      <RoomLeftHud
        showPlayModeToggle={showPlayModeToggle}
        playModeBusy={playModeBusy}
        playModeEnabled={playModeEnabled}
        onTogglePlayMode={() => {
          void togglePlayMode();
        }}
        showSpotlightIndicator={roomTypeFeatures.focus && role === "teacher" && spotlightActive}
        spotlightAnchorLabel={classroom.state?.spotlight?.anchorId ?? "Board"}
        spotlightModeLabel={
          classroom.state?.spotlight?.mode === "force"
            ? "Force — camera locked"
            : classroom.state?.spotlight?.mode === "guide"
              ? "Guide — look-at prompted"
              : "Highlight — board indicated"
        }
        showStudentClassroomState={roomTypeFeatures.classroomState && role === "student"}
        studentGroup={
          studentGroup
            ? {
                color: studentGroup.color,
                label: studentGroup.label,
                memberCount: studentGroup.memberUserIds.length
              }
            : null
        }
        handRaised={handRaised}
        hostSingular={roleLabels.hostSingular}
        hallpassStatus={hallpassStatus}
        onRequestHallpass={() => {
          setHallpassBusy(true);
          void classroom
            .runAction({ type: "request-hallpass" })
            .catch(() => undefined)
            .finally(() => setHallpassBusy(false));
        }}
        onReturnFromHallpass={() => {
          if (!myActiveHallpass) return;
          setHallpassBusy(true);
          void classroom
            .runAction({ type: "return-from-hallpass", requestId: myActiveHallpass.id })
            .catch(() => undefined)
            .finally(() => setHallpassBusy(false));
        }}
        showPodControls={
          roomTypeFeatures.breakoutPods &&
          role === "student" &&
          (Boolean(studentPodTarget) || (podsEnabled && studentHasBroadcastGrant))
        }
        showGoToPod={Boolean(studentPodTarget)}
        onMoveToPod={moveToMyPod}
        showBroadcastToggle={podsEnabled && studentHasBroadcastGrant}
        broadcastActive={broadcastMode === "broadcast"}
        onToggleBroadcast={toggleBroadcast}
        avatarColor={avatarColor}
        initials={initials}
        displayName={identity.displayName}
        roomRoleLabel={roomRoleLabel}
        roomName={roomName}
        mediaControlsProps={{ media, canUseCamera, canUseMicrophone }}
        viewMode={viewMode}
        firstPerson={firstPerson}
        manifestReady={Boolean(manifest)}
        onSetFirstPerson={() => setFirstPerson(true)}
        onSetThirdPerson={() => setFirstPerson(false)}
        avatarEditorOpen={avatarEditorOpen}
        avatarEditorLocked={avatarEditorLocked}
        onToggleAvatarEditor={() => setAvatarEditorOpen((prev) => !prev)}
        mediaPermissionText={mediaPermissionText}
        reactionsEnabled={CLIENT_TUNING.enableAvatarReactions}
        reactionsLocked={Boolean(classroom.state?.reactionsLocked)}
        onFireReaction={fireReaction}
        showWhisperToggle={
          roomTypeFeatures.whisper &&
          CLIENT_TUNING.enableWhisper &&
          role === "student" &&
          whisperAllowed
        }
        whisperMode={whisperMode}
        whisperSuggested={whisperSuggested}
        onToggleWhisper={toggleWhisper}
        movementPadProps={{
          onVector: movement.setTouchVector,
          onJump: physicsTuning?.enabled && viewMode === "3d" ? movement.requestJump : undefined
        }}
      />

      <RoomRightRail
        lessonStudentCalloutProps={
          roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "student"
            ? {
                run: lesson.run,
                currentStep: lesson.currentStep,
                state: classroom.state,
                manifest,
                currentUserId: identity.userId,
                onRunAction: classroom.runAction
              }
            : undefined
        }
        roomObjectsToolbarProps={
          roomObjectsTeacherToolbarVisible
            ? {
                templates: roomObjectTemplates.catalogTemplates,
                objects: roomObjects.objects,
                roomTypeLabel,
                manifest: manifest!,
                roomObjectsReady: roomObjectsEnabled,
                gateSyncing: roomObjectsGateSyncing,
                localAvatarPosition:
                  localParticipantForRoomObjects?.state.position ?? { x: 0, y: 0, z: 0 },
                localAvatarYaw: localParticipantForRoomObjects?.state.rotation.y ?? 0,
                loading: roomObjects.loading || roomObjectTemplates.status === "loading",
                error:
                  roomObjects.error ||
                  (roomObjectTemplates.status === "error"
                    ? "Unable to load object catalog."
                    : ""),
                selectedObjectId: selectedRoomObjectId,
                onSelectObject: setSelectedRoomObjectId,
                onInstantiate: async (templateId) => {
                  const template = roomObjectTemplatesByIdMap[templateId];
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
                },
                onRemove: async (objectId) => {
                  await roomObjects.actions.remove(objectId);
                  setSelectedRoomObjectId((current) => (current === objectId ? null : current));
                },
                onDeleteTemplate: async (templateId) => {
                  const placed = roomObjects.objects.filter(
                    (object) => object.templateId === templateId
                  );
                  for (const object of placed) {
                    await roomObjects.actions.remove(object.id);
                  }
                  await archiveRoomObjectTemplate(identity, templateId);
                  if (placed.some((object) => object.id === selectedRoomObjectId)) {
                    setSelectedRoomObjectId(null);
                  }
                  await roomObjectTemplates.refetch();
                },
                customUploadsEnabled: roomObjectCustomUploadsEnabled,
                onUpload: async (input) => {
                  const activeRoomId = session?.room.id ?? roomId;
                  if (!activeRoomId) throw new Error("Room is not ready.");
                  await uploadRoomObjectGlb(identity, {
                    roomId: activeRoomId,
                    ...input
                  });
                  await roomObjectTemplates.refetch();
                }
              }
            : undefined
        }
        classroomPanelProps={
          roomTypeFeatures.classroomState
            ? {
                role,
                state: classroom.state,
                loading: classroom.loading,
                error: classroom.error,
                activeHelpRequest: classroom.activeHelpRequest,
                manifest,
                currentUserId: identity.userId,
                boardAccessUserId: helpBoardAccessUserId,
                reactionLog: log,
                hallpassSettings: session?.room.settings.hallpass,
                hostSingular: roleLabels.hostSingular,
                onOpenBoardAccess: (userId) => {
                  setSelectedStudentId("");
                  setHelpBoardAccessUserId((current) => (current === userId ? "" : userId));
                },
                onRunAction: async (action) => {
                  await classroom.runAction(action);
                }
              }
            : undefined
        }
        lessonRunControlsProps={
          roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher"
            ? {
                run: lesson.run,
                currentStep: lesson.currentStep,
                nextStep: lesson.nextStep,
                loading: lesson.loading,
                error: lesson.error,
                runAction: lesson.runAction,
                slideDeckObject: lessonSlideDeckObject,
                onSetSlide: setLessonSlide,
                avatarEditorLocked,
                onToggleAvatarLock: () =>
                  void classroom.runAction({
                    type: "set-avatar-editor-locked",
                    locked: !avatarEditorLocked
                  }),
                onOpenRecap: () => {
                  if (lesson.run?.id) openLessonRecap(lesson.run.id);
                }
              }
            : undefined
        }
        lessonScriptCardProps={
          roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher"
            ? {
                run: lesson.run,
                loading: lesson.loading,
                error: lesson.error,
                onOpenStudio: () => setLessonStudioOpen(true)
              }
            : undefined
        }
        lessonTimelinePanelProps={
          roomTypeFeatures.lessons && CLIENT_TUNING.enableClassroomLessons && role === "teacher"
            ? { run: lesson.run }
            : undefined
        }
        privateChecksPanelProps={
          roomTypeFeatures.privateChecks
            ? {
                role,
                state: classroom.state,
                loading: classroom.loading,
                currentUserId: identity.userId,
                manifest,
                forceExpanded: studentQuickCheckActive,
                onRunAction: async (action) => {
                  await classroom.runAction(action);
                }
              }
            : undefined
        }
        groupsPanelProps={
          roomTypeFeatures.groups
            ? {
                role,
                state: classroom.state,
                loading: classroom.loading,
                participants: participantList,
                currentUserId: identity.userId,
                positioningGroupId,
                podsEnabled: classroom.state?.podsRuntime?.podsEnabled === true,
                broadcastUserIds: classroom.state?.podsRuntime?.broadcastFromUserIds ?? [],
                podsAllowedInRoom:
                  CLIENT_TUNING.enableBreakoutPods &&
                  session?.room.settings.pods?.enabled === true,
                ...(manifest ? { manifestAnchors: manifest.wallAnchors } : {}),
                onRunAction: async (action) => {
                  await classroom.runAction(action);
                },
                onEnterPositioningMode: (groupId) => setPositioningGroupId(groupId),
                onCancelPositioning: () => setPositioningGroupId("")
              }
            : undefined
        }
        focusPanelProps={
          roomTypeFeatures.focus
            ? {
                role,
                state: classroom.state,
                loading: classroom.loading,
                manifest,
                currentUserId: identity.userId,
                hostSingular: roleLabels.hostSingular,
                onRunAction: async (action) => {
                  await classroom.runAction(action);
                },
                onLookAtFocus: lookAtFocus
              }
            : undefined
        }
        anchorPanelProps={
          manifest && session
            ? {
                identity,
                roomId: session.room.id,
                manifest,
                dynamicWallAnchors: dynamicBoards.anchors,
                wallObjects: wall.wallObjects,
                assetUrls: wall.assetUrls,
                wallMediaStreams,
                canCreate:
                  session.role === "teacher" ||
                  session.room.settings.wallObjectCreation !== "teacher-only" ||
                  Boolean(activeBoardGrant),
                canManage: session.role === "teacher",
                canCreateDynamicAnchor:
                  roomTypeFeatures.dynamicBoards &&
                  (session.role === "teacher" || !roomTypeFeatures.peoplePanelTeacherControls),
                dynamicAnchorPlacementActive: dynamicBoardPlacementActive,
                role: session.role,
                activeBoardGrant,
                loading: wall.loading,
                error: wall.error || displayMedia.error,
                onStartDynamicAnchorPlacement: () => {
                  setViewMode("3d");
                  setDynamicBoardPlacementActive(true);
                  setDynamicBoardPlacementMessage("Click a wall in the 3D room.");
                },
                onCancelDynamicAnchorPlacement: () => {
                  setDynamicBoardPlacementActive(false);
                  setDynamicBoardPlacementMessage("");
                },
                placementBoardWidth,
                placementBoardHeight,
                onPlacementBoardWidthChange: (width) =>
                  setPlacementBoardWidth(
                    Math.min(
                      DYNAMIC_WALL_ANCHOR_MAX_WIDTH_M,
                      Math.max(DYNAMIC_WALL_ANCHOR_MIN_WIDTH_M, width)
                    )
                  ),
                onPlacementBoardHeightChange: (height) =>
                  setPlacementBoardHeight(
                    Math.min(
                      DYNAMIC_WALL_ANCHOR_MAX_HEIGHT_M,
                      Math.max(DYNAMIC_WALL_ANCHOR_MIN_HEIGHT_M, height)
                    )
                  ),
                onRemoveDynamicAnchor: async (anchorId) => {
                  await dynamicBoards.remove(anchorId);
                  if (focusAnchorId === anchorId) setFocusAnchorId(null);
                },
                focusAnchorId,
                onCreateFile: createFileObject,
                onCreateWhiteboard: createWhiteboard,
                onCreateSharedBrowser: createSharedBrowser,
                onCreateNote: createNote,
                onCreateTimer: createTimer,
                onCreatePoll: createPoll,
                onCreateLink: createLink,
                onPinCamera: pinCamera,
                onPinMicrophone: pinMicrophone,
                onShareScreen: shareScreen,
                onRemove: removeWallObject,
                onStopShare: stopShare,
                onControl: controlWallObject,
                onModerate: moderateWallObject,
                whiteboardController: whiteboards,
                whiteboardParticipantNames: participantNameMap,
                canWriteWhiteboard,
                sharedBrowserController: sharedBrowsers,
                sharedBrowserEnabled:
                  CLIENT_TUNING.enableSharedBrowsers &&
                  roomTypeFeatures.sharedBrowsers &&
                  session.room.settings.sharedBrowsers.enabled,
                hostSingular: roleLabels.hostSingular
              }
            : undefined
        }
        meetingNotesPanelProps={
          meetingNotesEnabled && session
            ? {
                identity,
                roomId: session.room.id,
                controller: meetingNotes
              }
            : undefined
        }
        translationPanelProps={
          translationEnabled && session
            ? {
                controller: translation,
                readLang,
                speakLang,
                micEnabled: media.microphoneEnabled,
                onReadLangChange: setReadLang,
                onSpeakLangChange: setSpeakLang,
                voiceEnabled: translationVoiceEnabled,
                voiceMode,
                voiceChoice,
                voiceController: translationVoice,
                onVoiceModeChange: setVoiceMode,
                onVoiceChoiceChange: setVoiceChoice
              }
            : undefined
        }
        aiWorldHostControlsProps={
          aiWorldHostEnabled && session && manifest
            ? {
                controller: aiWorldHost,
                manifest,
                buildPieces: buildPieces.pieces,
                localAvatarPosition: movement.avatarState?.position ?? null,
                localAvatarRotationY: movement.avatarState?.rotation.y ?? 0
              }
            : undefined
        }
        aiObjectPanelProps={
          aiObjectsEnabled && session
            ? {
                controller: {
                  ...aiObjectGenerator,
                  place: async (jobId) => {
                    const avatarPos = localParticipantForRoomObjects?.state.position;
                    const avatarYaw = localParticipantForRoomObjects?.state.rotation.y ?? 0;
                    const pose =
                      avatarPos && manifest
                        ? {
                            position: {
                              x: avatarPos.x + Math.sin(avatarYaw) * 1.5,
                              y: 1.1,
                              z: avatarPos.z + Math.cos(avatarYaw) * 1.5
                            },
                            rotation: { yaw: avatarYaw, pitch: 0, roll: 0 }
                          }
                        : undefined;
                    const result = await aiObjectGenerator.place(jobId, pose);
                    if (result?.template) {
                      roomObjectTemplates.registerTemplate(result.template);
                    }
                  }
                }
              }
            : undefined
        }
        environmentCardProps={
          roomTypeFeatures.worldSkins && CLIENT_TUNING.enableWorldSkins && role === "teacher" && session
            ? {
                identity,
                skin: activeSkin.skin ?? null,
                dayNightMode: skinDayNightMode,
                ambientGain: ambientGainOverride,
                onRunAction: runSkinAction,
                onAmbientChange: changeAmbientGain
              }
            : undefined
        }
        physicsCardProps={
          roomTypeFeatures.physics && role === "teacher" && session && physicsTuning
            ? {
                effectiveTuning: physicsTuning,
                roomOverride: physicsRoomOverrides,
                featureGateEnabled:
                  physicsEnvEnabled(session.room.type) && roomTypeFeatures.physics,
                onChange: scheduleRoomPhysicsSettings,
                onReset: resetRoomPhysicsSettings
              }
            : undefined
        }
      />
      <RoomOverlayStack
        guideDock={aiWorldHostGuideDock}
        objectInspectorDock={roomObjectInspectorDock}
        lessonStudio={lessonStudioOverlay}
        peopleDetailPanel={peopleDetailPanel}
        lessonRecap={lessonRecapOverlay}
        avatarEditor={avatarEditorOverlay}
        fullscreenWallObject={fullscreenWallObjectOverlay}
        liveCaptionsDock={
          liveCaptionsEnabled && session ? (
            <LiveCaptionsDock
              controller={liveCaptions}
              speakerLabel={(id) => participantNameMap[id] ?? id}
              selfParticipantId={session.participantId}
              reserveGuideDock={aiWorldHostGuidePanelOpen}
            />
          ) : null
        }
        translationDock={
          translationEnabled && session && translation.dockOpen ? (
            <TranslationDock
              controller={translation}
              speakerLabel={(id) => participantNameMap[id] ?? id}
              selfParticipantId={session.participantId}
            />
          ) : null
        }
        interactionPrompt={interactionPrompt}
        seatedNotebook={
          seatedNotebookDesk && session ? (
            <DeskNotebook
              roomId={session.room.id}
              userId={identity.userId}
              roomLabel={session.room.name}
            />
          ) : null
        }
        podiumNotebook={
          podiumNotebook && session ? (
            <DeskNotebook
              roomId={session.room.id}
              userId={identity.userId}
              roomLabel={session.room.name}
              storageScope="podium"
              enableTextImport
            />
          ) : null
        }
        logicInteractionPrompt={logicInteractionPrompt}
        playModeDock={playModeDockOverlay}
        logicAuthoringOverlay={logicAuthoringOverlay}
        buildControls={buildControlsOverlay}
      />
    </main>
    </SkinLayer>
    </AiWorldHostSceneContext.Provider>
  );
}
