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
    buildingEnabled: true,
    buildDestroyPolicy: "anyone" as const,
    logicEnabled: true,
    playModeEnabled: false
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
    sharedBrowsers: { ...base.sharedBrowsers, enabled: false },
    logicEnabled: true
  };
}
