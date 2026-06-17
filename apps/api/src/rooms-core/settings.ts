import type { AppConfig } from "../config.js";

export function roomSettings(config: AppConfig) {
  return {
    maxParticipants: config.tuning.maxRoomParticipants,
    defaultViewMode: config.tuning.defaultViewMode,
    defaultQuality: config.tuning.defaultQuality,
    enable2DAnalog: config.tuning.enable2DAnalog,
    enableWallAttachments: config.tuning.enableWallAttachments,
    enableWallObjects: config.tuning.enableWallObjects,
    wallObjectCreation: config.tuning.wallObjectCreationDefault,
    wallObjectModeration: "pre" as const,
    allowLiveStudentShares: config.tuning.enableWallStudentLiveShares,
    allowStudentUploads: config.tuning.enableWallStudentUploads,
    allowWebLinks: config.tuning.enableWallWebLinks,
    allowEmbeds: config.tuning.enableWallWebEmbeds,
    maxActiveWallObjects: config.tuning.wallObjectMaxActivePerRoom,
    maxActiveLiveShares: config.tuning.wallObjectMaxActiveLiveShares,
    hallpass: { enabled: true, maxConcurrent: 1, perPeriodLimit: 2 },
    pods: { enabled: true, podRadiusMeters: 3, podMurmurFloor: 0.08, drawPartitions: false },
    roomObjects: {
      enabled: true,
      maxActive: 8,
      customUploadsEnabled: config.tuning.enableRoomObjects,
      maxUploadSizeBytes: 15 * 1024 * 1024,
      defaultTouchPolicy: "teacher-only" as const
    },
    worldSkins: {
      enabled: true,
      skinId: null as string | null,
      skinDayNightMode: "day" as const,
      ambientGainOverride: null as number | null
    },
    studentMedia: {
      camerasEnabled: true,
      microphonesEnabled: true
    },
    aiMeetingNotes: {
      enabled: true,
      autoStartOnFirstJoin: false,
      maxSessionDurationMinutes: config.tuning.aiMeetingNotesMaxDurationMinutes,
      retentionDays: 30
    },
    whiteboards: {
      enabled: config.tuning.enableWhiteboards,
      maxActivePerRoom: config.tuning.whiteboardMaxActivePerRoom,
      maxStrokesPerBoard: 10_000,
      maxPointsPerStroke: config.tuning.whiteboardMaxPointsPerStroke,
      showRemoteCursors: true,
      cursorBroadcastHz: 20,
      allowStudentDraw: true,
      snapshotEvery: config.tuning.whiteboardSnapshotAtStrokes
    },
    aiObjects: {
      enabled: config.tuning.enableAiObjectGeneration,
      maxConcurrentJobsPerRoom: 3,
      maxConcurrentJobsPerUser: 1,
      maxJobsPerUserPerDay: config.tuning.aiObjectMaxJobsPerUserPerDay,
      allowMeshy: config.tuning.aiObjectProvider === "meshy",
      meshyRefineTextures: config.tuning.aiObjectMeshyRefineTextures,
      defaultPolycountTarget: 10000
    },
    aiWorldHost: {
      enabled: true,
      maxFilesPerRoom: 10,
      maxFileSizeBytes: 5_000_000,
      maxMessagesPerUserPerHour: 60,
      maxContextMessages: 20,
      allowedMimeTypes: ["application/pdf", "text/plain", "text/markdown"]
    },
    sharedBrowsers: {
      enabled: config.tuning.enableSharedBrowsers,
      maxActivePerRoom: config.tuning.sharedBrowserMaxActivePerRoom,
      defaultStartUrl: "https://www.wikipedia.org",
      viewportWidth: config.tuning.sharedBrowserViewportWidth,
      viewportHeight: config.tuning.sharedBrowserViewportHeight,
      idlePauseMinutes: config.tuning.sharedBrowserIdlePauseMinutes,
      navigationAllowlistEnabled: false,
      navigationAllowlist: [] as string[],
      controlLeaseSeconds: 120,
      hyperbeamQuality: config.tuning.sharedBrowserHyperbeamQuality,
      hyperbeamFramerate: config.tuning.sharedBrowserHyperbeamFramerate
    },
    physics: {
      enabled: config.tuning.physics.enablePhysics,
      gravity: config.tuning.physics.gravity,
      moveSpeed: config.tuning.physics.moveSpeed,
      jumpHeight: config.tuning.physics.jumpHeight,
      maxFallSpeed: config.tuning.physics.maxFallSpeed,
      airControl: config.tuning.physics.airControl,
      coyoteTimeMs: config.tuning.physics.coyoteTimeMs,
      capsuleRadius: config.tuning.physics.capsuleRadius,
      capsuleHeight: config.tuning.physics.capsuleHeight,
      maxSlopeClimbDeg: config.tuning.physics.maxSlopeClimbDeg,
      autoStepHeight: config.tuning.physics.autoStepHeight,
      snapToGroundDist: config.tuning.physics.snapToGroundDist
    },
    buildingEnabled: true,
    buildDestroyPolicy: "anyone" as const,
    logicEnabled: true,
    playModeEnabled: false,
    translation: {
      enabled: true,
      voiceEnabled: true
    },
    lighting: {}
  };
}

export function escapeRoomSettings(config: AppConfig) {
  const base = roomSettings(config);
  return {
    ...base,
    buildDestroyPolicy: "owner-or-teacher" as const,
    wallObjectCreation: "teacher-only" as const,
    hallpass: { ...base.hallpass, enabled: false },
    pods: { ...base.pods, enabled: false },
    roomObjects: {
      ...base.roomObjects,
      defaultTouchPolicy: "teacher-only" as const
    },
    worldSkins: {
      ...base.worldSkins,
      enabled: true,
      skinDayNightMode: "night" as const
    },
    aiMeetingNotes: { ...base.aiMeetingNotes, enabled: false },
    aiWorldHost: { ...base.aiWorldHost, enabled: false },
    sharedBrowsers: { ...base.sharedBrowsers, enabled: false },
    logicEnabled: true
  };
}

/** Verse rooms: classroom board-access grants; teachers place content unless a grant is active. */
export function verseRoomSettings(config: AppConfig) {
  const base = roomSettings(config);
  return {
    ...base,
    whiteboards: {
      ...base.whiteboards,
      enabled: true
    },
    sharedBrowsers: {
      ...base.sharedBrowsers,
      enabled: config.tuning.enableSharedBrowsers
    },
    hallpass: { ...base.hallpass, enabled: false },
    pods: { ...base.pods, enabled: false }
  };
}
