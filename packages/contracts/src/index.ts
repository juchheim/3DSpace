import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

export * from "./foundation.js";
export * from "./room.js";
export * from "./classroom.js";
export * from "./ai.js";

import * as foundation from "./foundation.js";
import * as room from "./room.js";
import * as classroom from "./classroom.js";
import * as ai from "./ai.js";

const dependencies = { ...foundation, ...room, ...classroom, ...ai } as typeof foundation & typeof room & typeof classroom & typeof ai;
const {
  AcceptInviteResponseSchema,
  AuthMeResponseSchema,
  AuthSessionExchangeRequestSchema,
  AuthSessionExchangeResponseSchema,
  AuthSessionRefreshRequestSchema,
  AuthSessionRefreshResponseSchema,
  ClassMembershipSchema,
  ClassSchema,
  ClassroomActionSchema,
  ClassroomStateSchema,
  ClearBuildPiecesResponseSchema,
  ClearWhiteboardResponseSchema,
  CommitWhiteboardStrokeRequestSchema,
  CommitWhiteboardStrokeResponseSchema,
  CreateBuildFloorTextureUploadRequestSchema,
  CreateBuildFloorTextureUploadResponseSchema,
  CreateBuildPieceRequestSchema,
  CreateBuildPieceResponseSchema,
  CreateBuildPiecesBatchRequestSchema,
  CreateBuildPiecesBatchResponseSchema,
  CreateClassRequestSchema,
  CreateInviteRequestSchema,
  CreateRoomAiHostFileUploadTargetRequestSchema,
  CreateRoomAiHostFileUploadTargetResponseSchema,
  CreateRoomAiHostRequestSchema,
  CreateRoomObjectRequestSchema,
  CreateRoomObjectResponseSchema,
  CreateRoomObjectTemplateRequestSchema,
  CreateRoomObjectTemplateResponseSchema,
  CreateRoomObjectUploadRequestSchema,
  CreateRoomObjectUploadResponseSchema,
  CreateRoomRequestSchema,
  CreateWallAttachmentRequestSchema,
  CreateWallAttachmentResponseSchema,
  CreateWallObjectRequestSchema,
  CreateWallShareRequestSchema,
  CreateWallShareResponseSchema,
  CreateWebResourceRequestSchema,
  CreateWorldSkinUploadRequestSchema,
  CreateWorldSkinUploadResponseSchema,
  DeleteBuildPieceResponseSchema,
  DeleteRoomAiHostFileResponseSchema,
  DeleteRoomResponseSchema,
  DismissRoomAiHostResponseSchema,
  EraseWhiteboardStrokesRequestSchema,
  EraseWhiteboardStrokesResponseSchema,
  FinalizeWallAttachmentRequestSchema,
  GetRoomAiHostResponseSchema,
  HealthResponseSchema,
  InviteSchema,
  JoinRoomSessionRequestSchema,
  LessonRecapSchema,
  ListAvatarAccessoriesResponseSchema,
  ListAvatarBodiesResponseSchema,
  ListBuildPiecesResponseSchema,
  ListRoomAiHostChatResponseSchema,
  ListRoomAiHostFilesResponseSchema,
  ListRoomObjectTemplatesResponseSchema,
  ListRoomObjectsResponseSchema,
  ListWhiteboardStrokesResponseSchema,
  ListWorldSkinsResponseSchema,
  MeetingNotesSessionDetailSchema,
  MeetingNotesSessionListResponseSchema,
  PatchMeetingNotesSessionRequestSchema,
  PatchRoomAiHostRequestSchema,
  PatchUserAvatarAccessoriesRequestSchema,
  PatchUserAvatarBodyRequestSchema,
  ReadinessResponseSchema,
  RegisterRoomAiHostFileRequestSchema,
  RegisterRoomAiHostFileResponseSchema,
  RequestWhiteboardSnapshotResponseSchema,
  RoomAiHostMutationResponseSchema,
  RoomEventRequestSchema,
  RoomEventResponseSchema,
  RoomManifestSchema,
  RoomObjectRealtimeDispatchResponseSchema,
  RoomObjectRealtimeInboundSchema,
  RoomObjectResetResponseSchema,
  RoomObjectSchema,
  RoomObjectTemplateSchema,
  RoomObjectTouchRequestSchema,
  RoomSchema,
  RoomSessionResponseSchema,
  RoomWithManifestSchema,
  SendRoomAiHostChatRequestSchema,
  SharedBrowserControlLeaseRequestSchema,
  SharedBrowserHistoryRequestSchema,
  SharedBrowserNavigateRequestSchema,
  SharedBrowserSessionResponseSchema,
  StartMeetingNotesSessionResponseSchema,
  TranslateRequestSchema,
  TranslateResponseSchema,
  TranslateSpeechRequestSchema,
  UpdateClassRequestSchema,
  UpdateMeetingNotesSummaryRequestSchema,
  UpdateRoomObjectRequestSchema,
  UpdateRoomRequestSchema,
  UpdateWallAttachmentRequestSchema,
  UpdateWallObjectRequestSchema,
  UploadMeetingNotesAudioChunkRequestSchema,
  UploadMeetingNotesAudioChunkResponseSchema,
  UpsertClassMemberRequestSchema,
  UserSchema,
  WallAttachmentDownloadResponseSchema,
  WallAttachmentSchema,
  WallObjectControlRequestSchema,
  WallObjectSchema,
  WebResourcePreviewRequestSchema,
  WebResourcePreviewResponseSchema,
  WorldSkinSchema,
  WorldSkinUploaderStatusResponseSchema,
  WorldSkinUploaderVerifyRequestSchema,
  WorldSkinUploaderVerifyResponseSchema
} = dependencies;

type ApiRoute = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  tags: string[];
  request?: z.ZodTypeAny;
  response?: z.ZodTypeAny;
};

export const apiRoutes: ApiRoute[] = [
  { method: "get", path: "/health", summary: "Health check", tags: ["system"], response: HealthResponseSchema },
  { method: "get", path: "/ready", summary: "Readiness check", tags: ["system"], response: ReadinessResponseSchema },
  { method: "get", path: "/v1/auth/google/start", summary: "Start Google OAuth sign-in", tags: ["auth"], response: z.unknown() },
  { method: "get", path: "/v1/auth/google/callback", summary: "Complete Google OAuth sign-in", tags: ["auth"], response: z.unknown() },
  { method: "post", path: "/v1/auth/session/exchange", summary: "Exchange one-time sign-in code for a session", tags: ["auth"], request: AuthSessionExchangeRequestSchema, response: AuthSessionExchangeResponseSchema },
  { method: "post", path: "/v1/auth/session/refresh", summary: "Rotate refresh token and mint a new access token", tags: ["auth"], request: AuthSessionRefreshRequestSchema, response: AuthSessionRefreshResponseSchema },
  { method: "get", path: "/v1/auth/me", summary: "Get the current authenticated user", tags: ["auth"], response: AuthMeResponseSchema },
  { method: "post", path: "/v1/auth/logout", summary: "Revoke a refresh session", tags: ["auth"], request: AuthSessionRefreshRequestSchema, response: z.object({ ok: z.literal(true) }) },
  { method: "get", path: "/v1/classes", summary: "List classes visible to the current user", tags: ["classes"], response: z.array(ClassSchema) },
  { method: "post", path: "/v1/classes", summary: "Create a teacher-owned class", tags: ["classes"], request: CreateClassRequestSchema, response: ClassSchema },
  { method: "patch", path: "/v1/classes/{classId}", summary: "Update a teacher-owned class", tags: ["classes"], request: UpdateClassRequestSchema, response: ClassSchema },
  { method: "get", path: "/v1/classes/{classId}/members", summary: "List class memberships", tags: ["classes"], response: z.array(ClassMembershipSchema) },
  { method: "post", path: "/v1/classes/{classId}/members", summary: "Add or update a class membership", tags: ["classes"], request: UpsertClassMemberRequestSchema, response: ClassMembershipSchema },
  { method: "post", path: "/v1/classes/{classId}/invites", summary: "Create a class or room invite", tags: ["classes"], request: CreateInviteRequestSchema, response: InviteSchema },
  { method: "get", path: "/v1/rooms/{roomId}/invite", summary: "Get or create the shareable student invite for a room", tags: ["rooms"], response: InviteSchema },
  { method: "post", path: "/v1/invites/{inviteCode}/accept", summary: "Accept a class or room invite", tags: ["invites"], response: AcceptInviteResponseSchema },
  { method: "get", path: "/v1/rooms", summary: "List rooms visible to the current user", tags: ["rooms"], response: z.array(RoomSchema) },
  { method: "post", path: "/v1/rooms", summary: "Create a room for a class", tags: ["rooms"], request: CreateRoomRequestSchema, response: RoomWithManifestSchema },
  { method: "patch", path: "/v1/rooms/{roomId}", summary: "Update room metadata", tags: ["rooms"], request: UpdateRoomRequestSchema, response: RoomSchema },
  { method: "delete", path: "/v1/rooms/{roomId}", summary: "Delete a room and related data", tags: ["rooms"], response: DeleteRoomResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/manifest", summary: "Get active room manifest", tags: ["rooms"], response: RoomManifestSchema },
  { method: "post", path: "/v1/rooms/{roomId}/session", summary: "Join a room and receive LiveKit session data", tags: ["rooms"], request: JoinRoomSessionRequestSchema, response: RoomSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments", summary: "List wall attachments", tags: ["attachments"], response: z.array(WallAttachmentSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/attachments", summary: "Create wall attachment metadata and signed upload URL", tags: ["attachments"], request: CreateWallAttachmentRequestSchema, response: CreateWallAttachmentResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/finalize", summary: "Finalize a wall attachment after signed upload", tags: ["attachments"], request: FinalizeWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/attachments/{attachmentId}", summary: "Update wall attachment metadata or moderation status", tags: ["attachments"], request: UpdateWallAttachmentRequestSchema, response: WallAttachmentSchema },
  { method: "get", path: "/v1/rooms/{roomId}/attachments/{attachmentId}/download", summary: "Create a signed wall attachment download URL", tags: ["attachments"], response: WallAttachmentDownloadResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects", summary: "List visible wall objects", tags: ["wall-objects"], response: z.array(WallObjectSchema) },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects", summary: "Create a wall object", tags: ["wall-objects"], request: CreateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Fetch one wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Update a wall object", tags: ["wall-objects"], request: UpdateWallObjectRequestSchema, response: WallObjectSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/wall-objects/{objectId}", summary: "Soft-remove a wall object", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/control", summary: "Control playback or live source state for a wall object", tags: ["wall-objects"], request: WallObjectControlRequestSchema, response: WallObjectSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes", summary: "Hydrate whiteboard strokes and latest snapshot", tags: ["whiteboards"], response: ListWhiteboardStrokesResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes", summary: "Commit a finalized whiteboard stroke", tags: ["whiteboards"], request: CommitWhiteboardStrokeRequestSchema, response: CommitWhiteboardStrokeResponseSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/strokes", summary: "Erase whiteboard strokes by id", tags: ["whiteboards"], request: EraseWhiteboardStrokesRequestSchema, response: EraseWhiteboardStrokesResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/clear", summary: "Clear all strokes from a whiteboard", tags: ["whiteboards"], response: ClearWhiteboardResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/whiteboard/snapshots", summary: "Request whiteboard snapshot compaction", tags: ["whiteboards"], response: RequestWhiteboardSnapshotResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser", summary: "Hydrate a shared browser session", tags: ["shared-browsers"], response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser/navigate", summary: "Navigate the shared browser to a URL (SSRF-checked)", tags: ["shared-browsers"], request: SharedBrowserNavigateRequestSchema, response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser/history", summary: "Run a back/forward/refresh action on the shared browser", tags: ["shared-browsers"], request: SharedBrowserHistoryRequestSchema, response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser/control-lease", summary: "Take, release, or renew the shared browser keyboard control lease", tags: ["shared-browsers"], request: SharedBrowserControlLeaseRequestSchema, response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser/resume", summary: "Resume a paused shared browser session (idempotent)", tags: ["shared-browsers"], response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-objects/{objectId}/shared-browser/embed", summary: "Refresh the Hyperbeam embed URL for a live shared browser session", tags: ["shared-browsers"], response: SharedBrowserSessionResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares", summary: "Create live wall share intent", tags: ["wall-objects"], request: CreateWallShareRequestSchema, response: CreateWallShareResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/wall-shares/{objectId}/end", summary: "Mark live wall share ended", tags: ["wall-objects"], response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources", summary: "Create safe wall web resource", tags: ["wall-objects"], request: CreateWebResourceRequestSchema, response: WallObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/web-resources/preview", summary: "Preview safe wall web resource support", tags: ["wall-objects"], request: WebResourcePreviewRequestSchema, response: WebResourcePreviewResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/meeting-notes/sessions", summary: "List meeting notes sessions for a room", tags: ["meeting-notes"], response: MeetingNotesSessionListResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/meeting-notes/sessions", summary: "Start a meeting notes session", tags: ["meeting-notes"], response: StartMeetingNotesSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/meeting-notes/sessions/{sessionId}", summary: "Fetch one meeting notes session with transcript segments", tags: ["meeting-notes"], response: MeetingNotesSessionDetailSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/meeting-notes/sessions/{sessionId}", summary: "Stop or cancel a meeting notes session", tags: ["meeting-notes"], request: PatchMeetingNotesSessionRequestSchema, response: StartMeetingNotesSessionResponseSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/meeting-notes/sessions/{sessionId}", summary: "Delete a meeting notes session", tags: ["meeting-notes"], response: z.object({ deleted: z.boolean() }) },
  { method: "post", path: "/v1/rooms/{roomId}/meeting-notes/sessions/{sessionId}/audio-chunks", summary: "Upload a recorded audio chunk for transcription", tags: ["meeting-notes"], request: UploadMeetingNotesAudioChunkRequestSchema, response: UploadMeetingNotesAudioChunkResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/meeting-notes/sessions/{sessionId}/summary", summary: "Regenerate a meeting notes summary", tags: ["meeting-notes"], request: UpdateMeetingNotesSummaryRequestSchema, response: StartMeetingNotesSessionResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/ai-host", summary: "Get the AI world host for a room (or null)", tags: ["ai-host"], response: GetRoomAiHostResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/ai-host", summary: "Summon the AI world host", tags: ["ai-host"], request: CreateRoomAiHostRequestSchema, response: RoomAiHostMutationResponseSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/ai-host", summary: "Rename or reposition the AI world host", tags: ["ai-host"], request: PatchRoomAiHostRequestSchema, response: RoomAiHostMutationResponseSchema },
  {
    method: "delete",
    path: "/v1/rooms/{roomId}/ai-host",
    summary: "Dismiss the AI world host (?deleteFiles=false keeps study files)",
    tags: ["ai-host"],
    response: DismissRoomAiHostResponseSchema
  },
  { method: "get", path: "/v1/rooms/{roomId}/ai-host/files", summary: "List study files for the AI world host", tags: ["ai-host"], response: ListRoomAiHostFilesResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/ai-host/files/upload-target",
    summary: "Create a signed upload target for an AI world host study file",
    tags: ["ai-host"],
    request: CreateRoomAiHostFileUploadTargetRequestSchema,
    response: CreateRoomAiHostFileUploadTargetResponseSchema
  },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/ai-host/files",
    summary: "Register an uploaded study file and queue text extraction",
    tags: ["ai-host"],
    request: RegisterRoomAiHostFileRequestSchema,
    response: RegisterRoomAiHostFileResponseSchema
  },
  { method: "delete", path: "/v1/rooms/{roomId}/ai-host/files/{fileId}", summary: "Delete a study file", tags: ["ai-host"], response: DeleteRoomAiHostFileResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/ai-host/chat", summary: "List private AI world host chat messages for the current user", tags: ["ai-host"], response: ListRoomAiHostChatResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/ai-host/chat", summary: "Send a message to the AI world host (streaming response)", tags: ["ai-host"], request: SendRoomAiHostChatRequestSchema, response: z.object({ accepted: z.literal(true) }) },
  { method: "get", path: "/v1/rooms/{roomId}/classroom", summary: "Get classroom state visible to the current user", tags: ["classroom"], response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/classroom/actions", summary: "Run a classroom state action", tags: ["classroom"], request: ClassroomActionSchema, response: ClassroomStateSchema },
  { method: "post", path: "/v1/rooms/{roomId}/events", summary: "Persist optional durable room events", tags: ["rooms"], request: RoomEventRequestSchema, response: RoomEventResponseSchema },
  { method: "get", path: "/v1/rooms/{roomId}/lesson-runs/{runId}/recap", summary: "Get lesson run recap (teacher only)", tags: ["classroom"], response: LessonRecapSchema },
  { method: "get", path: "/v1/room-objects/templates", summary: "List room object templates visible to the current user", tags: ["room-objects"], response: ListRoomObjectTemplatesResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/room-objects/uploads",
    summary: "Create a signed upload target for a custom room object asset or thumbnail",
    tags: ["room-objects"],
    request: CreateRoomObjectUploadRequestSchema,
    response: CreateRoomObjectUploadResponseSchema
  },
  { method: "post", path: "/v1/room-objects/templates", summary: "Register a custom room object template after asset upload", tags: ["room-objects"], request: CreateRoomObjectTemplateRequestSchema, response: CreateRoomObjectTemplateResponseSchema },
  { method: "get", path: "/v1/room-objects/templates/{templateId}", summary: "Get a room object template by id (including ai-generated for in-room rendering)", tags: ["room-objects"], response: RoomObjectTemplateSchema },
  { method: "delete", path: "/v1/room-objects/templates/{templateId}", summary: "Archive a custom room object template", tags: ["room-objects"], response: RoomObjectTemplateSchema },
  { method: "get", path: "/v1/rooms/{roomId}/objects", summary: "List room manipulatives in a room", tags: ["room-objects"], response: ListRoomObjectsResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects", summary: "Instantiate a room object template into a room", tags: ["room-objects"], request: CreateRoomObjectRequestSchema, response: CreateRoomObjectResponseSchema },
  { method: "patch", path: "/v1/rooms/{roomId}/objects/{objectId}", summary: "Update a room object instance", tags: ["room-objects"], request: UpdateRoomObjectRequestSchema, response: RoomObjectSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/objects/{objectId}", summary: "Remove a room object from a room", tags: ["room-objects"], response: RoomObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects/{objectId}/touch", summary: "Set touch policy and grants on a room object", tags: ["room-objects"], request: RoomObjectTouchRequestSchema, response: RoomObjectSchema },
  { method: "post", path: "/v1/rooms/{roomId}/objects/{objectId}/reset", summary: "Reset a room object to template defaults", tags: ["room-objects"], response: RoomObjectResetResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/room-objects/realtime",
    summary: "Authoritative room object realtime dispatch (grab lock, pose relay, release persist)",
    tags: ["room-objects"],
    request: RoomObjectRealtimeInboundSchema,
    response: RoomObjectRealtimeDispatchResponseSchema
  },
  { method: "get", path: "/v1/rooms/{roomId}/build-pieces", summary: "List build pieces in a room", tags: ["build-pieces"], response: ListBuildPiecesResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/build-pieces", summary: "Place a build piece in a room", tags: ["build-pieces"], request: CreateBuildPieceRequestSchema, response: CreateBuildPieceResponseSchema },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/build-pieces/batch",
    summary: "Place multiple build pieces (drag-paint batch)",
    tags: ["build-pieces"],
    request: CreateBuildPiecesBatchRequestSchema,
    response: CreateBuildPiecesBatchResponseSchema
  },
  {
    method: "post",
    path: "/v1/rooms/{roomId}/build-pieces/floor-texture-uploads",
    summary: "Create a signed upload target for an image-floor texture",
    tags: ["build-pieces"],
    request: CreateBuildFloorTextureUploadRequestSchema,
    response: CreateBuildFloorTextureUploadResponseSchema
  },
  { method: "delete", path: "/v1/rooms/{roomId}/build-pieces/{pieceId}", summary: "Remove a build piece", tags: ["build-pieces"], response: DeleteBuildPieceResponseSchema },
  { method: "delete", path: "/v1/rooms/{roomId}/build-pieces", summary: "Clear all build pieces in a room", tags: ["build-pieces"], response: ClearBuildPiecesResponseSchema },
  { method: "get", path: "/v1/world-skins", summary: "List world skin catalog entries (flag-gated)", tags: ["world-skins"], response: ListWorldSkinsResponseSchema },
  { method: "get", path: "/v1/world-skins/{slug}", summary: "Get a world skin by slug with absolute asset URLs (flag-gated)", tags: ["world-skins"], response: WorldSkinSchema },
  { method: "get", path: "/v1/avatar-accessories", summary: "List built-in avatar accessory catalog entries (flag-gated)", tags: ["avatar-accessories"], response: ListAvatarAccessoriesResponseSchema },
  { method: "get", path: "/v1/avatar-bodies", summary: "List built-in avatar body catalog entries (flag-gated)", tags: ["avatar-bodies"], response: ListAvatarBodiesResponseSchema },
  { method: "patch", path: "/v1/users/me/body", summary: "Select avatar body for the current user", tags: ["avatar-bodies"], request: PatchUserAvatarBodyRequestSchema, response: UserSchema },
  { method: "patch", path: "/v1/users/me/accessories", summary: "Equip or unequip avatar accessories for the current user", tags: ["avatar-accessories"], request: PatchUserAvatarAccessoriesRequestSchema, response: UserSchema },
  {
    method: "post",
    path: "/v1/world-skin-uploader/verify",
    summary: "Verify world skin uploader password (operator tool)",
    tags: ["world-skins"],
    request: WorldSkinUploaderVerifyRequestSchema,
    response: WorldSkinUploaderVerifyResponseSchema
  },
  {
    method: "get",
    path: "/v1/world-skin-uploader/status",
    summary: "List upload status for a skin prefix in object storage",
    tags: ["world-skins"],
    response: WorldSkinUploaderStatusResponseSchema
  },
  {
    method: "post",
    path: "/v1/world-skin-uploader/uploads",
    summary: "Create a signed PUT target for a world skin asset in R2",
    tags: ["world-skins"],
    request: CreateWorldSkinUploadRequestSchema,
    response: CreateWorldSkinUploadResponseSchema
  },
  { method: "post", path: "/v1/rooms/{roomId}/translate", summary: "Translate text from one language to another (server-side, cached)", tags: ["translation"], request: TranslateRequestSchema, response: TranslateResponseSchema },
  { method: "post", path: "/v1/rooms/{roomId}/translate/speech", summary: "Synthesize translated text to audio (server-side, cached; response is audio/mpeg bytes)", tags: ["translation"], request: TranslateSpeechRequestSchema }
  // Note: GET /v1/world-skin-assets/* and POST /translate/speech serve raw bytes (content-type varies); response schema not registered.
];

function asJsonSchema(schema: z.ZodTypeAny) {
  return zodToJsonSchema(schema, {
    target: "openApi3",
    $refStrategy: "none"
  }) as Record<string, unknown>;
}

export function createOpenApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of apiRoutes) {
    paths[route.path] ??= {};
    paths[route.path]![route.method] = {
      summary: route.summary,
      tags: route.tags,
      requestBody: route.request
        ? {
            required: true,
            content: {
              "application/json": {
                schema: asJsonSchema(route.request)
              }
            }
          }
        : undefined,
      responses: route.response
        ? {
            "200": {
              description: "Successful response",
              content: {
                "application/json": {
                  schema: asJsonSchema(route.response)
                }
              }
            }
          }
        : { "200": { description: "Successful response" } }
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "3DSpace API",
      version: "0.1.0",
      description: "Versioned API contracts generated from shared Zod schemas."
    },
    paths
  };
}
