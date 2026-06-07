import type {
  AcceptInviteResponseSchema,
  AiObjectJob,
  AvatarAppearance,
  AvatarAccessoryCatalogEntry,
  AvatarEquippedAccessories,
  ClassroomActionSchema,
  ClassroomState,
  ClassMembership,
  ClassRecord,
  CreateDynamicWallAnchorRequest,
  CreateBuildPieceRequestSchema,
  CreateBuildPiecesBatchRequestSchema,
  CreateRoomObjectRequestSchema,
  CreateRoomObjectTemplateRequestSchema,
  CreateRoomObjectUploadRequestSchema,
  DynamicWallAnchor,
  Invite,
  LessonRecap,
  ListFreeForAllRoomsResponse,
  ListAiObjectJobsResponse,
  MeetingNotesDownloadFormat,
  MeetingNotesSessionDetail,
  MeetingNotesSessionListResponse,
  PlaceAiObjectRequest,
  Role,
  BuildLogicPiece,
  BuildPiece,
  CreateLogicPieceRequestSchema,
  UpdateLogicPieceRequestSchema,
  EscapeSession,
  LogicSignalKind,
  LogicState,
  RoomAiHost,
  RoomAiHostChatMessage,
  RoomAiHostChatMode,
  RoomAiHostFile,
  RoomAiHostRealtimeMessage,
  CreateRoomAiHostFileUploadTargetRequestSchema,
  RegisterRoomAiHostFileRequestSchema,
  RoomBuildRealtimeMessage,
  RoomLogicRealtimeMessage,
  RoomSessionRealtimeMessage,
  CreateRoomAiHostRequestSchema,
  PatchRoomAiHostRequestSchema,
  SendRoomAiHostChatRequestSchema,
  RoomObject,
  RoomSessionResponse,
  RoomType,
  RoomRecord,
  User,
  RoomObjectCategory,
  RoomObjectRealtimeInbound,
  RoomObjectRealtimeMessage,
  RoomObjectTemplate,
  StartAiObjectJobRequest,
  StartAiObjectJobResponse,
  UpdateDynamicWallAnchorRequest,
  WorldSkin,
  RoomSettings,
  RoomObjectTouchRequestSchema,
  RoomWithManifest,
  StartMeetingNotesSessionResponse,
  UpdateRoomObjectRequestSchema,
  UploadMeetingNotesAudioChunkResponse,
  WallAttachment,
  WallAttachmentDownloadResponse,
  WallObject,
  WallObjectControlRequestSchema,
  CreateWallObjectRequestSchema,
  CommitWhiteboardStrokeRequestSchema,
  CommitWhiteboardStrokeResponse,
  UpdateWallObjectRequestSchema,
  CreateWallShareResponseSchema,
  ListWhiteboardStrokesResponse,
  EraseWhiteboardStrokesResponse,
  RequestWhiteboardSnapshotResponse,
  ClearWhiteboardResponse,
  SharedBrowserSessionResponse
} from "@3dspace/contracts";
import type { z } from "zod";
import { API_URL } from "./config";
import { identityHeaders, type ApiIdentity } from "./identity";

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiErrorMessage(response: Response, payload: Record<string, unknown>) {
  if (typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (payload.error === "validation_error" && Array.isArray(payload.issues)) {
    const issue = payload.issues[0] as { message?: unknown; path?: unknown } | undefined;
    if (typeof issue?.message === "string" && issue.message.trim()) {
      const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
      return path ? `${path}: ${issue.message}` : issue.message;
    }
  }
  if (response.statusText) return response.statusText;
  return `Request failed with ${response.status}`;
}

function roomObjectUploadErrorMessage(error: ApiError) {
  const details = error.details;
  if (error.code === "room-object-upload-rejected" && details?.reason === "triangle_budget_exceeded") {
    const triangleCount = Number(details.triangleCount);
    const maxTriangleCount = Number(details.maxTriangleCount);
    if (Number.isFinite(triangleCount) && Number.isFinite(maxTriangleCount)) {
      return `Uploaded .glb has ${triangleCount.toLocaleString()} triangles; the current limit is ${maxTriangleCount.toLocaleString()}.`;
    }
  }
  return error.message;
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  identity: ApiIdentity;
};

export async function apiFetch<T>(path: string, options: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {
    ...identityHeaders(options.identity)
  };
  const token = await options.identity.getAuthToken?.();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  const init: RequestInit = {
    method: options.method ?? "GET",
    headers
  };
  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, init);

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText })) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      apiErrorMessage(response, payload),
      typeof payload.error === "string" ? payload.error : undefined,
      payload
    );
  }

  return response.json() as Promise<T>;
}

type RoomObjectMutationResult = {
  object: RoomObject;
  realtimeMessages: RoomObjectRealtimeMessage[];
};

type BuildPieceMutationResult = {
  piece: BuildPiece;
  realtimeMessages: RoomBuildRealtimeMessage[];
};

type BuildPiecesBatchMutationResult = {
  pieces: BuildPiece[];
  realtimeMessages: RoomBuildRealtimeMessage[];
};

type BuildPieceDeleteMutationResult = {
  realtimeMessages: RoomBuildRealtimeMessage[];
};

function normalizeRoomObjectMutationResult(
  payload:
    | { object: RoomObject; realtimeMessages?: RoomObjectRealtimeMessage[] | undefined }
    | (RoomObject & { realtimeMessages?: RoomObjectRealtimeMessage[] | undefined })
): RoomObjectMutationResult {
  if ("object" in payload) {
    return {
      object: payload.object,
      realtimeMessages: payload.realtimeMessages ?? []
    };
  }
  const { realtimeMessages = [], ...object } = payload;
  return {
    object: object as RoomObject,
    realtimeMessages
  };
}

function normalizeBuildPieceMutationResult(payload: {
  piece: BuildPiece;
  realtimeMessages?: RoomBuildRealtimeMessage[] | undefined;
}): BuildPieceMutationResult {
  return {
    piece: payload.piece,
    realtimeMessages: payload.realtimeMessages ?? []
  };
}

function normalizeBuildPiecesBatchMutationResult(payload: {
  pieces: BuildPiece[];
  realtimeMessages?: RoomBuildRealtimeMessage[] | undefined;
}): BuildPiecesBatchMutationResult {
  return {
    pieces: payload.pieces,
    realtimeMessages: payload.realtimeMessages ?? []
  };
}

function normalizeBuildPieceDeleteMutationResult(payload: {
  realtimeMessages?: RoomBuildRealtimeMessage[] | undefined;
}): BuildPieceDeleteMutationResult {
  return {
    realtimeMessages: payload.realtimeMessages ?? []
  };
}

export function listClasses(identity: ApiIdentity) {
  return apiFetch<ClassRecord[]>("/v1/classes", { identity });
}

export function createClass(identity: ApiIdentity, name: string) {
  return apiFetch<ClassRecord>("/v1/classes", { method: "POST", identity, body: { name } });
}

export function listRooms(identity: ApiIdentity) {
  return apiFetch<RoomRecord[]>("/v1/rooms", { identity });
}

export function createRoom(
  identity: ApiIdentity,
  classId: string,
  name: string,
  type: RoomType = "classroom",
  opts?: { freeForAllPassword?: string }
) {
  return apiFetch<RoomWithManifest>("/v1/rooms", {
    method: "POST",
    identity,
    body: {
      classId,
      name,
      type,
      ...(opts?.freeForAllPassword ? { freeForAllPassword: opts.freeForAllPassword } : {})
    }
  });
}

export function createInvite(identity: ApiIdentity, classId: string, input: { role: Role; roomId?: string }) {
  return apiFetch<Invite>(`/v1/classes/${classId}/invites`, {
    method: "POST",
    identity,
    body: { ...input, expiresInMinutes: 60 * 24 * 7 }
  });
}

export function getRoomInvite(identity: ApiIdentity, roomId: string) {
  return apiFetch<Invite>(`/v1/rooms/${roomId}/invite`, { identity });
}

export function acceptInvite(identity: ApiIdentity, code: string) {
  return apiFetch<z.infer<typeof AcceptInviteResponseSchema>>(`/v1/invites/${code}/accept`, {
    method: "POST",
    identity
  });
}

export function listClassMembers(identity: ApiIdentity, classId: string) {
  return apiFetch<ClassMembership[]>(`/v1/classes/${classId}/members`, { identity });
}

export function deleteRoom(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ roomId: string; deleted: true }>(`/v1/rooms/${roomId}`, {
    method: "DELETE",
    identity
  });
}

export function patchRoom(identity: ApiIdentity, roomId: string, input: { name?: string; settings?: Partial<RoomSettings> }) {
  return apiFetch<RoomRecord>(`/v1/rooms/${roomId}`, {
    method: "PATCH",
    identity,
    body: input
  });
}

export function joinRoom(identity: ApiIdentity, roomId: string, input: { viewMode: "3d" | "2d"; inviteCode?: string }) {
  return apiFetch<RoomSessionResponse>(`/v1/rooms/${roomId}/session`, {
    method: "POST",
    identity,
    body: input
  });
}

export function heartbeatRoomSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ ok: boolean }>(`/v1/rooms/${roomId}/session/heartbeat`, {
    method: "POST",
    identity
  });
}

export function leaveRoomSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ ok: boolean }>(`/v1/rooms/${roomId}/session`, {
    method: "DELETE",
    identity
  });
}

export function patchAvatarAppearance(identity: ApiIdentity, appearance: AvatarAppearance) {
  return apiFetch<{ ok: boolean }>("/v1/users/me/avatar", {
    method: "PATCH",
    identity,
    body: { appearance }
  });
}

export function clearAvatarAppearance(identity: ApiIdentity) {
  return apiFetch<{ ok: boolean }>("/v1/users/me/avatar/appearance", {
    method: "DELETE",
    identity,
  });
}

export function listAvatarAccessories(identity: ApiIdentity) {
  return apiFetch<{ items: AvatarAccessoryCatalogEntry[] }>("/v1/avatar-accessories", { identity }).then(
    (response) => response.items
  );
}

export function patchAvatarAccessories(identity: ApiIdentity, accessories: AvatarEquippedAccessories) {
  return apiFetch<User>("/v1/users/me/accessories", {
    method: "PATCH",
    identity,
    body: { accessories }
  });
}

export function listAttachments(identity: ApiIdentity, roomId: string) {
  return apiFetch<WallAttachment[]>(`/v1/rooms/${roomId}/attachments`, { identity });
}

export function createAttachment(
  identity: ApiIdentity,
  roomId: string,
  input: {
    wallAnchorId: string;
    kind: "image" | "video" | "audio" | "future";
    fileName: string;
    contentType: string;
    metadata?: Record<string, unknown>;
  }
) {
  return apiFetch<{
    attachment: WallAttachment;
    upload: { url: string; method: "PUT"; headers: Record<string, string> };
  }>(`/v1/rooms/${roomId}/attachments`, {
    method: "POST",
    identity,
    body: { ...input, metadata: { source: "wall-object-ui", ...(input.metadata ?? {}) } }
  });
}

export function finalizeAttachment(identity: ApiIdentity, roomId: string, attachmentId: string, metadata: Record<string, unknown> = {}) {
  return apiFetch<WallAttachment>(`/v1/rooms/${roomId}/attachments/${attachmentId}/finalize`, {
    method: "POST",
    identity,
    body: { metadata }
  });
}

export function createAttachmentDownload(identity: ApiIdentity, roomId: string, attachmentId: string) {
  return apiFetch<WallAttachmentDownloadResponse>(`/v1/rooms/${roomId}/attachments/${attachmentId}/download`, { identity });
}

export function listWallObjects(identity: ApiIdentity, roomId: string) {
  return apiFetch<WallObject[]>(`/v1/rooms/${roomId}/wall-objects`, { identity });
}

export function createWallObject(identity: ApiIdentity, roomId: string, input: z.infer<typeof CreateWallObjectRequestSchema>) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/wall-objects`, {
    method: "POST",
    identity,
    body: input
  });
}

export function updateWallObject(identity: ApiIdentity, roomId: string, objectId: string, input: z.infer<typeof UpdateWallObjectRequestSchema>) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/wall-objects/${objectId}`, {
    method: "PATCH",
    identity,
    body: input
  });
}

export function listWhiteboardStrokes(identity: ApiIdentity, roomId: string, objectId: string, sinceZ?: number) {
  const query = sinceZ !== undefined ? `?sinceZ=${encodeURIComponent(String(sinceZ))}` : "";
  return apiFetch<ListWhiteboardStrokesResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/whiteboard/strokes${query}`, { identity });
}

export function commitWhiteboardStroke(
  identity: ApiIdentity,
  roomId: string,
  objectId: string,
  input: z.infer<typeof CommitWhiteboardStrokeRequestSchema>
) {
  return apiFetch<CommitWhiteboardStrokeResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/whiteboard/strokes`, {
    method: "POST",
    identity,
    body: input
  });
}

export function eraseWhiteboardStrokes(identity: ApiIdentity, roomId: string, objectId: string, strokeIds: string[]) {
  return apiFetch<EraseWhiteboardStrokesResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/whiteboard/strokes`, {
    method: "DELETE",
    identity,
    body: { strokeIds }
  });
}

export function clearWhiteboard(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<ClearWhiteboardResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/whiteboard/clear`, {
    method: "POST",
    identity
  });
}

export function requestWhiteboardSnapshot(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<RequestWhiteboardSnapshotResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/whiteboard/snapshots`, {
    method: "POST",
    identity
  });
}

export function getSharedBrowserSession(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser`, { identity });
}

export function navigateSharedBrowser(identity: ApiIdentity, roomId: string, objectId: string, url: string) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser/navigate`, {
    method: "POST",
    identity,
    body: { url }
  });
}

export function sharedBrowserHistory(
  identity: ApiIdentity,
  roomId: string,
  objectId: string,
  action: "back" | "forward" | "refresh"
) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser/history`, {
    method: "POST",
    identity,
    body: { action }
  });
}

export function sharedBrowserControlLease(
  identity: ApiIdentity,
  roomId: string,
  objectId: string,
  action: "take" | "release" | "renew"
) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser/control-lease`, {
    method: "POST",
    identity,
    body: { action }
  });
}

export function resumeSharedBrowser(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser/resume`, {
    method: "POST",
    identity
  });
}

export function refreshSharedBrowserEmbed(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<SharedBrowserSessionResponse>(`/v1/rooms/${roomId}/wall-objects/${objectId}/shared-browser/embed`, {
    method: "POST",
    identity
  });
}

export function removeWallObject(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/wall-objects/${objectId}`, {
    method: "DELETE",
    identity
  });
}

export function controlWallObject(identity: ApiIdentity, roomId: string, objectId: string, input: z.infer<typeof WallObjectControlRequestSchema>) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/wall-objects/${objectId}/control`, {
    method: "POST",
    identity,
    body: input
  });
}

export function createWallShare(
  identity: ApiIdentity,
  roomId: string,
  input: {
    wallAnchorId: string;
    type: "camera.live" | "microphone.live" | "screen.live" | "browser-tab.live";
    title: string;
    description?: string;
  }
) {
  return apiFetch<z.infer<typeof CreateWallShareResponseSchema>>(`/v1/rooms/${roomId}/wall-shares`, {
    method: "POST",
    identity,
    body: input
  });
}

export function endWallShare(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/wall-shares/${objectId}/end`, {
    method: "POST",
    identity
  });
}

export function createWebResource(
  identity: ApiIdentity,
  roomId: string,
  input: {
    wallAnchorId: string;
    url: string;
    title?: string;
    description?: string;
    embedMode?: "link" | "iframe";
  }
) {
  return apiFetch<WallObject>(`/v1/rooms/${roomId}/web-resources`, {
    method: "POST",
    identity,
    body: input
  });
}

export function listRoomObjectTemplates(identity: ApiIdentity, roomId: string) {
  const query = new URLSearchParams({ roomId });
  return apiFetch<{ templates: RoomObjectTemplate[] }>(`/v1/room-objects/templates?${query.toString()}`, { identity }).then((response) => response.templates);
}

export function fetchRoomObjectTemplate(identity: ApiIdentity, templateId: string, roomId: string) {
  const query = new URLSearchParams({ roomId });
  return apiFetch<RoomObjectTemplate>(`/v1/room-objects/templates/${templateId}?${query.toString()}`, { identity });
}

export function listWorldSkins(identity: ApiIdentity) {
  return apiFetch<{ skins: WorldSkin[] }>("/v1/world-skins", { identity }).then((r) => r.skins);
}

export function fetchWorldSkin(slug: string, identity: ApiIdentity) {
  return apiFetch<WorldSkin>(`/v1/world-skins/${encodeURIComponent(slug)}`, { identity });
}

export function createRoomObjectUpload(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof CreateRoomObjectUploadRequestSchema>
) {
  return apiFetch<{
    storageKey: string;
    assetUrl: string;
    upload: { url: string; method: "PUT"; headers: Record<string, string> };
  }>(`/v1/rooms/${roomId}/room-objects/uploads`, {
    method: "POST",
    identity,
    body: input
  });
}

export function createRoomObjectTemplate(identity: ApiIdentity, input: z.infer<typeof CreateRoomObjectTemplateRequestSchema>) {
  return apiFetch<{ template: RoomObjectTemplate }>("/v1/room-objects/templates", {
    method: "POST",
    identity,
    body: input
  }).then((response) => response.template);
}

export function archiveRoomObjectTemplate(identity: ApiIdentity, templateId: string) {
  return apiFetch<RoomObjectTemplate>(`/v1/room-objects/templates/${templateId}`, {
    method: "DELETE",
    identity
  });
}

function buildCustomRoomObjectSlug(displayName: string) {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "room-object";
  return `${base}-${Date.now().toString(36)}`.slice(0, 64);
}

async function uploadFileToTarget(upload: { url: string; method: "PUT"; headers: Record<string, string> }, file: File) {
  const response = await fetch(upload.url, {
    method: upload.method,
    headers: upload.headers,
    body: file
  });
  if (!response.ok) {
    throw new Error(`Upload failed with ${response.status}`);
  }
}

export async function uploadRoomObjectGlb(
  identity: ApiIdentity,
  input: {
    roomId: string;
    file: File;
    thumbnailFile: File;
    displayName: string;
    category?: RoomObjectCategory | undefined;
    description?: string | undefined;
    license: string;
    attribution: string;
  }
) {
  const assetUpload = await createRoomObjectUpload(identity, input.roomId, {
    kind: "asset",
    fileName: input.file.name,
    contentType: "model/gltf-binary"
  });
  await uploadFileToTarget(assetUpload.upload, input.file);

  const thumbnailUpload = await createRoomObjectUpload(identity, input.roomId, {
    kind: "thumbnail",
    fileName: input.thumbnailFile.name,
    contentType: "image/png"
  });
  await uploadFileToTarget(thumbnailUpload.upload, input.thumbnailFile);

  try {
    return await createRoomObjectTemplate(identity, {
      roomId: input.roomId,
      assetStorageKey: assetUpload.storageKey,
      thumbnailStorageKey: thumbnailUpload.storageKey,
      slug: buildCustomRoomObjectSlug(input.displayName),
      displayName: input.displayName,
      category: input.category ?? "custom",
      description: input.description ?? "",
      defaultScale: 1,
      defaultParameters: {},
      parameterSchemaJson: "{}",
      license: input.license,
      attribution: input.attribution,
      exportable: true
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw new Error(roomObjectUploadErrorMessage(error));
    }
    throw error;
  }
}

export function listRoomObjects(identity: ApiIdentity, roomId: string, options?: { status?: RoomObject["status"] | undefined }) {
  const params = new URLSearchParams();
  if (options?.status) params.set("status", options.status);
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  return apiFetch<{ objects: RoomObject[] }>(`/v1/rooms/${roomId}/objects${suffix}`, { identity }).then((response) => response.objects);
}

export function createRoomObject(identity: ApiIdentity, roomId: string, input: z.infer<typeof CreateRoomObjectRequestSchema>) {
  return apiFetch<{ object: RoomObject; realtimeMessages?: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/objects`, {
    method: "POST",
    identity,
    body: input
  }).then(normalizeRoomObjectMutationResult);
}

export function updateRoomObject(identity: ApiIdentity, roomId: string, objectId: string, input: z.infer<typeof UpdateRoomObjectRequestSchema>) {
  return apiFetch<RoomObject & { realtimeMessages?: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/objects/${objectId}`, {
    method: "PATCH",
    identity,
    body: input
  }).then(normalizeRoomObjectMutationResult);
}

export function deleteRoomObject(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<RoomObject & { realtimeMessages?: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/objects/${objectId}`, {
    method: "DELETE",
    identity
  }).then(normalizeRoomObjectMutationResult);
}

export function setRoomObjectTouch(identity: ApiIdentity, roomId: string, objectId: string, input: z.infer<typeof RoomObjectTouchRequestSchema>) {
  return apiFetch<RoomObject & { realtimeMessages?: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/objects/${objectId}/touch`, {
    method: "POST",
    identity,
    body: input
  }).then(normalizeRoomObjectMutationResult);
}

export function resetRoomObject(identity: ApiIdentity, roomId: string, objectId: string) {
  return apiFetch<{ object: RoomObject; realtimeMessages?: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/objects/${objectId}/reset`, {
    method: "POST",
    identity
  }).then(normalizeRoomObjectMutationResult);
}

export function dispatchRoomObjectRealtime(identity: ApiIdentity, roomId: string, message: RoomObjectRealtimeInbound) {
  return apiFetch<{ messages: RoomObjectRealtimeMessage[] }>(`/v1/rooms/${roomId}/room-objects/realtime`, {
    method: "POST",
    identity,
    body: message
  }).then((response) => response.messages);
}

export function listBuildPieces(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ pieces: BuildPiece[] }>(`/v1/rooms/${roomId}/build-pieces`, { identity }).then(
    (response) => response.pieces
  );
}

export function createBuildPiece(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof CreateBuildPieceRequestSchema>
) {
  return apiFetch<{ piece: BuildPiece; realtimeMessages?: RoomBuildRealtimeMessage[] }>(`/v1/rooms/${roomId}/build-pieces`, {
    method: "POST",
    identity,
    body: input
  }).then(normalizeBuildPieceMutationResult);
}

export function createBuildPiecesBatch(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof CreateBuildPiecesBatchRequestSchema>
) {
  return apiFetch<{ pieces: BuildPiece[]; realtimeMessages?: RoomBuildRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/build-pieces/batch`,
    {
      method: "POST",
      identity,
      body: input
    }
  ).then(normalizeBuildPiecesBatchMutationResult);
}

export function deleteBuildPiece(identity: ApiIdentity, roomId: string, pieceId: string) {
  return apiFetch<{ realtimeMessages?: RoomBuildRealtimeMessage[] }>(`/v1/rooms/${roomId}/build-pieces/${pieceId}`, {
    method: "DELETE",
    identity
  }).then(normalizeBuildPieceDeleteMutationResult);
}

export function clearBuildPieces(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ realtimeMessages?: RoomBuildRealtimeMessage[] }>(`/v1/rooms/${roomId}/build-pieces`, {
    method: "DELETE",
    identity
  }).then(normalizeBuildPieceDeleteMutationResult);
}

function normalizeLogicPieceMutationResult(response: {
  piece: BuildLogicPiece;
  realtimeMessages?: RoomLogicRealtimeMessage[];
}) {
  return {
    piece: response.piece,
    realtimeMessages: response.realtimeMessages ?? []
  };
}

function normalizeLogicPieceDeleteMutationResult(response: {
  realtimeMessages?: RoomLogicRealtimeMessage[];
}) {
  return { realtimeMessages: response.realtimeMessages ?? [] };
}

export function listLogicPieces(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ pieces: BuildLogicPiece[] }>(`/v1/rooms/${roomId}/logic-pieces`, { identity }).then(
    (response) => response.pieces
  );
}

export function getLogicState(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ state: LogicState }>(`/v1/rooms/${roomId}/logic-state`, { identity }).then(
    (response) => response.state
  );
}

export function createLogicPiece(
  identity: ApiIdentity,
  roomId: string,
  input: z.input<typeof CreateLogicPieceRequestSchema>
) {
  return apiFetch<{ piece: BuildLogicPiece; realtimeMessages?: RoomLogicRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/logic-pieces`,
    { method: "POST", identity, body: input }
  ).then(normalizeLogicPieceMutationResult);
}

export function updateLogicPiece(
  identity: ApiIdentity,
  roomId: string,
  pieceId: string,
  patch: z.input<typeof UpdateLogicPieceRequestSchema>
) {
  return apiFetch<{ piece: BuildLogicPiece; realtimeMessages?: RoomLogicRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/logic-pieces/${pieceId}`,
    { method: "PATCH", identity, body: patch }
  ).then(normalizeLogicPieceMutationResult);
}

export function deleteLogicPiece(identity: ApiIdentity, roomId: string, pieceId: string) {
  return apiFetch<{ realtimeMessages?: RoomLogicRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/logic-pieces/${pieceId}`,
    { method: "DELETE", identity }
  ).then(normalizeLogicPieceDeleteMutationResult);
}

export function clearLogicPieces(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ realtimeMessages?: RoomLogicRealtimeMessage[] }>(`/v1/rooms/${roomId}/logic-pieces`, {
    method: "DELETE",
    identity
  }).then(normalizeLogicPieceDeleteMutationResult);
}

export function patchLogicPieceNodeState(
  identity: ApiIdentity,
  roomId: string,
  pieceId: string,
  patch: { open?: boolean; on?: boolean; armed?: boolean }
) {
  return apiFetch<{ state: LogicState; realtimeMessages?: RoomLogicRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/logic-pieces/${pieceId}/state`,
    { method: "PATCH", identity, body: patch }
  ).then((response) => ({
    state: response.state,
    realtimeMessages: response.realtimeMessages ?? []
  }));
}

export function signalLogicPiece(identity: ApiIdentity, roomId: string, pieceId: string, kind: LogicSignalKind) {
  return apiFetch<{
    ok: true;
    pieceId: string;
    kind: LogicSignalKind;
    state?: LogicState;
    realtimeMessages?: RoomLogicRealtimeMessage[];
    teleportTo?: { x: number; y: number; z: number };
    teleportTargetPieceId?: string;
  }>(`/v1/rooms/${roomId}/logic-pieces/${pieceId}/signal`, { method: "POST", identity, body: { kind } }).then(
    (response) => ({
      ok: response.ok,
      pieceId: response.pieceId,
      kind: response.kind,
      state: response.state,
      realtimeMessages: response.realtimeMessages ?? [],
      teleportTo: response.teleportTo,
      teleportTargetPieceId: response.teleportTargetPieceId
    })
  );
}

function normalizeEscapeSessionMutationResult(response: {
  session: EscapeSession;
  realtimeMessages?: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage>;
}) {
  return {
    session: response.session,
    realtimeMessages: response.realtimeMessages ?? []
  };
}

export function getEscapeSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ session: EscapeSession }>(`/v1/rooms/${roomId}/escape-session`, { identity }).then(
    (response) => response.session
  );
}

export function startEscapeSession(identity: ApiIdentity, roomId: string, durationSec?: number) {
  return apiFetch<{ session: EscapeSession; realtimeMessages?: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage> }>(
    `/v1/rooms/${roomId}/escape-session/start`,
    { method: "POST", identity, body: durationSec !== undefined ? { durationSec } : {} }
  ).then(normalizeEscapeSessionMutationResult);
}

export function resetEscapeSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ session: EscapeSession; realtimeMessages?: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage> }>(
    `/v1/rooms/${roomId}/escape-session/reset`,
    { method: "POST", identity, body: {} }
  ).then(normalizeEscapeSessionMutationResult);
}

export function winEscapeSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ session: EscapeSession; realtimeMessages?: Array<RoomSessionRealtimeMessage | RoomLogicRealtimeMessage> }>(
    `/v1/rooms/${roomId}/escape-session/win`,
    { method: "POST", identity, body: {} }
  ).then(normalizeEscapeSessionMutationResult);
}

export type AiHostMutationResult = {
  host: RoomAiHost;
  realtimeMessages: RoomAiHostRealtimeMessage[];
};

function normalizeAiHostMutationResult(payload: {
  host: RoomAiHost;
  realtimeMessages?: RoomAiHostRealtimeMessage[] | undefined;
}): AiHostMutationResult {
  return {
    host: payload.host,
    realtimeMessages: payload.realtimeMessages ?? []
  };
}

export function getAiHost(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ host: RoomAiHost | null }>(`/v1/rooms/${roomId}/ai-host`, { identity }).then(
    (response) => response.host
  );
}

export function createAiHost(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof CreateRoomAiHostRequestSchema>
) {
  return apiFetch<AiHostMutationResult>(`/v1/rooms/${roomId}/ai-host`, {
    method: "POST",
    identity,
    body: input
  }).then(normalizeAiHostMutationResult);
}

export function patchAiHost(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof PatchRoomAiHostRequestSchema>
) {
  return apiFetch<AiHostMutationResult>(`/v1/rooms/${roomId}/ai-host`, {
    method: "PATCH",
    identity,
    body: input
  }).then(normalizeAiHostMutationResult);
}

export function dismissAiHost(identity: ApiIdentity, roomId: string, deleteFiles = false) {
  const query = deleteFiles ? "?deleteFiles=true" : "";
  return apiFetch<{ dismissed: true; realtimeMessages?: RoomAiHostRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/ai-host${query}`,
    { method: "DELETE", identity }
  ).then((response) => ({
    dismissed: true as const,
    realtimeMessages: response.realtimeMessages ?? []
  }));
}

export function listAiHostFiles(identity: ApiIdentity, roomId: string) {
  return apiFetch<{ files: RoomAiHostFile[] }>(`/v1/rooms/${roomId}/ai-host/files`, { identity }).then(
    (response) => response.files
  );
}

export function createAiHostFileUploadTarget(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof CreateRoomAiHostFileUploadTargetRequestSchema>
) {
  return apiFetch<{
    fileId: string;
    storageKey: string;
    upload: { url: string; method: "PUT"; headers: Record<string, string> };
  }>(`/v1/rooms/${roomId}/ai-host/files/upload-target`, {
    method: "POST",
    identity,
    body: input
  });
}

export function registerAiHostFile(
  identity: ApiIdentity,
  roomId: string,
  input: z.infer<typeof RegisterRoomAiHostFileRequestSchema>
) {
  return apiFetch<{ file: RoomAiHostFile; realtimeMessages?: RoomAiHostRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/ai-host/files`,
    { method: "POST", identity, body: input }
  ).then((response) => ({
    file: response.file,
    realtimeMessages: response.realtimeMessages ?? []
  }));
}

function aiHostStudyFileContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".txt")) return "text/plain";
  return file.type || "application/octet-stream";
}

export async function uploadAiHostStudyFile(
  identity: ApiIdentity,
  roomId: string,
  file: File
) {
  const contentType = aiHostStudyFileContentType(file);
  const target = await createAiHostFileUploadTarget(identity, roomId, {
    fileName: file.name,
    contentType,
    sizeBytes: file.size
  });
  const uploadHeaders = { ...target.upload.headers };
  if (!uploadHeaders["content-type"] && file.type) {
    uploadHeaders["content-type"] = file.type;
  }
  const uploadResponse = await fetch(target.upload.url, {
    method: target.upload.method,
    headers: uploadHeaders,
    body: file
  });
  if (!uploadResponse.ok) {
    throw new ApiError(uploadResponse.status, `Upload failed (${uploadResponse.status})`);
  }
  return registerAiHostFile(identity, roomId, {
    fileId: target.fileId,
    storageKey: target.storageKey,
    originalFileName: file.name,
    contentType,
    sizeBytes: file.size
  });
}

export function reprocessAiHostFile(identity: ApiIdentity, roomId: string, fileId: string) {
  return apiFetch<{ file: RoomAiHostFile; realtimeMessages?: RoomAiHostRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/ai-host/files/${fileId}/reprocess`,
    { method: "POST", identity }
  ).then((response) => ({
    file: response.file,
    realtimeMessages: response.realtimeMessages ?? []
  }));
}

export function deleteAiHostFile(identity: ApiIdentity, roomId: string, fileId: string) {
  return apiFetch<{ deleted: true; realtimeMessages?: RoomAiHostRealtimeMessage[] }>(
    `/v1/rooms/${roomId}/ai-host/files/${fileId}`,
    { method: "DELETE", identity }
  ).then((response) => ({
    deleted: true as const,
    realtimeMessages: response.realtimeMessages ?? []
  }));
}

export function listAiHostChat(
  identity: ApiIdentity,
  roomId: string,
  opts?: { mode?: RoomAiHostChatMode | undefined; fileId?: string | undefined; limit?: number | undefined }
) {
  const params = new URLSearchParams();
  if (opts?.mode) params.set("mode", opts.mode);
  if (opts?.fileId) params.set("fileId", opts.fileId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const query = params.toString();
  return apiFetch<{ messages: RoomAiHostChatMessage[] }>(
    `/v1/rooms/${roomId}/ai-host/chat${query ? `?${query}` : ""}`,
    { identity }
  ).then((response) => response.messages);
}

export type AiHostChatStreamHandlers = {
  onDelta?: (text: string) => void;
  onDone?: (message: RoomAiHostChatMessage) => void;
  onError?: (payload: { error: string; message: string }) => void;
  signal?: AbortSignal | undefined;
};

/**
 * Streams a Build Help / Study Files reply over SSE. Resolves with the persisted assistant
 * message when the stream completes, or throws ApiError when the request itself fails.
 */
export async function streamAiHostChat(
  identity: ApiIdentity,
  roomId: string,
  body: z.infer<typeof SendRoomAiHostChatRequestSchema>,
  handlers: AiHostChatStreamHandlers = {}
): Promise<RoomAiHostChatMessage | null> {
  const headers: Record<string, string> = {
    ...identityHeaders(identity),
    "content-type": "application/json",
    accept: "text/event-stream"
  };
  const token = await identity.getAuthToken?.();
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}/v1/rooms/${roomId}/ai-host/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    ...(handlers.signal ? { signal: handlers.signal } : {})
  });

  if (!response.ok || !response.body) {
    const payload = (await response.json().catch(() => ({ message: response.statusText }))) as Record<string, unknown>;
    throw new ApiError(
      response.status,
      apiErrorMessage(response, payload),
      typeof payload.error === "string" ? payload.error : undefined,
      payload
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalMessage: RoomAiHostChatMessage | null = null;

  const handleEvent = (event: string, data: string) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    if (event === "delta" && typeof parsed.delta === "string") {
      handlers.onDelta?.(parsed.delta);
    } else if (event === "done") {
      finalMessage = parsed.message as RoomAiHostChatMessage;
      handlers.onDone?.(finalMessage);
    } else if (event === "error") {
      handlers.onError?.({ error: String(parsed.error ?? "ai-host-unavailable"), message: String(parsed.message ?? "") });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      const event = lines.find((l) => l.startsWith("event:"))?.slice("event:".length).trim() ?? "message";
      const dataLine = lines.find((l) => l.startsWith("data:"))?.slice("data:".length).trim();
      if (dataLine) handleEvent(event, dataLine);
    }
  }

  return finalMessage;
}

export function getClassroomState(identity: ApiIdentity, roomId: string) {
  return apiFetch<ClassroomState>(`/v1/rooms/${roomId}/classroom`, { identity });
}

export function runClassroomAction(identity: ApiIdentity, roomId: string, input: z.infer<typeof ClassroomActionSchema>) {
  return apiFetch<ClassroomState>(`/v1/rooms/${roomId}/classroom/actions`, {
    method: "POST",
    identity,
    body: input
  });
}

export function postRoomEvent(identity: ApiIdentity, roomId: string, type: string, payload: Record<string, unknown> = {}) {
  return apiFetch<{ id: string; roomId: string; type: string; persisted: boolean; createdAt: string }>(
    `/v1/rooms/${roomId}/events`,
    { method: "POST", identity, body: { type, payload } }
  );
}

export function fetchLessonRecap(identity: ApiIdentity, roomId: string, runId: string) {
  return apiFetch<LessonRecap>(`/v1/rooms/${roomId}/lesson-runs/${runId}/recap`, { identity });
}

export function lessonRecapCsvUrl(roomId: string, runId: string) {
  return `${API_URL}/v1/rooms/${roomId}/lesson-runs/${runId}/recap?format=csv`;
}

export async function downloadLessonRecapCsv(identity: ApiIdentity, roomId: string, runId: string) {
  const headers: Record<string, string> = {
    ...identityHeaders(identity)
  };
  const token = await identity.getAuthToken?.();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(lessonRecapCsvUrl(roomId, runId), { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(
      response.status,
      payload.message ?? `Request failed with ${response.status}`,
      payload.error,
      payload
    );
  }
  return response.text();
}

export function listMeetingNotesSessions(identity: ApiIdentity, roomId: string) {
  return apiFetch<MeetingNotesSessionListResponse>(`/v1/rooms/${roomId}/meeting-notes/sessions`, { identity });
}

export function startMeetingNotesSession(identity: ApiIdentity, roomId: string) {
  return apiFetch<StartMeetingNotesSessionResponse>(`/v1/rooms/${roomId}/meeting-notes/sessions`, {
    method: "POST",
    identity
  });
}

export function fetchMeetingNotesSession(identity: ApiIdentity, roomId: string, sessionId: string) {
  return apiFetch<MeetingNotesSessionDetail>(`/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`, { identity });
}

export function updateMeetingNotesSession(identity: ApiIdentity, roomId: string, sessionId: string, action: "stop" | "cancel") {
  return apiFetch<StartMeetingNotesSessionResponse>(`/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`, {
    method: "PATCH",
    identity,
    body: { action }
  });
}

export function resummarizeMeetingNotesSession(identity: ApiIdentity, roomId: string, sessionId: string) {
  return apiFetch<StartMeetingNotesSessionResponse>(`/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/summary`, {
    method: "POST",
    identity,
    body: { action: "resummarize" }
  });
}

export function deleteMeetingNotesSession(identity: ApiIdentity, roomId: string, sessionId: string) {
  return apiFetch<{ deleted: boolean }>(`/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}`, {
    method: "DELETE",
    identity
  });
}

export function uploadMeetingNotesAudioChunk(
  identity: ApiIdentity,
  roomId: string,
  sessionId: string,
  body: {
    participantId: string;
    startedAtMs: number;
    endedAtMs: number;
    mimeType: string;
    audioBase64: string;
  }
) {
  return apiFetch<UploadMeetingNotesAudioChunkResponse>(`/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/audio-chunks`, {
    method: "POST",
    identity,
    body
  });
}

export async function downloadMeetingNotesArtifact(
  identity: ApiIdentity,
  roomId: string,
  sessionId: string,
  format: MeetingNotesDownloadFormat
) {
  const headers: Record<string, string> = {
    ...identityHeaders(identity)
  };
  const token = await identity.getAuthToken?.();
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}/v1/rooms/${roomId}/meeting-notes/sessions/${sessionId}/download?format=${encodeURIComponent(format)}`, { headers });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(
      response.status,
      payload.message ?? `Request failed with ${response.status}`,
      payload.error,
      payload
    );
  }
  return response.text();
}

export function listFreeForAllRooms(identity: ApiIdentity, opts?: { classId?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.classId) params.set("classId", opts.classId);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<ListFreeForAllRoomsResponse>(`/v1/rooms/free-for-all${qs ? "?" + qs : ""}`, { identity });
}

export function joinFreeForAllRoom(identity: ApiIdentity, roomId: string, freeForAllPassword?: string) {
  return apiFetch<RoomSessionResponse>(`/v1/rooms/${roomId}/free-for-all-sessions`, {
    method: "POST",
    identity,
    body: freeForAllPassword ? { freeForAllPassword } : {}
  });
}

export function listDynamicWallAnchors(identity: ApiIdentity, roomId: string) {
  return apiFetch<DynamicWallAnchor[]>(`/v1/rooms/${roomId}/dynamic-wall-anchors`, { identity });
}

export function createDynamicWallAnchor(identity: ApiIdentity, roomId: string, body: CreateDynamicWallAnchorRequest) {
  return apiFetch<{ anchor: DynamicWallAnchor; realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/dynamic-wall-anchors`, { method: "POST", body, identity });
}

export function updateDynamicWallAnchor(identity: ApiIdentity, roomId: string, anchorId: string, patch: UpdateDynamicWallAnchorRequest) {
  return apiFetch<{ anchor: DynamicWallAnchor; realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/dynamic-wall-anchors/${anchorId}`, { method: "PATCH", body: patch, identity });
}

export function removeDynamicWallAnchor(identity: ApiIdentity, roomId: string, anchorId: string) {
  return apiFetch<{ realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/dynamic-wall-anchors/${anchorId}`, { method: "DELETE", identity });
}

export function startAiObjectJob(identity: ApiIdentity, roomId: string, body: Pick<StartAiObjectJobRequest, "prompt" | "stylePreset" | "complexity">) {
  return apiFetch<StartAiObjectJobResponse>(`/v1/rooms/${roomId}/ai-objects/jobs`, { method: "POST", body, identity });
}

export function listAiObjectJobs(identity: ApiIdentity, roomId: string) {
  return apiFetch<ListAiObjectJobsResponse>(`/v1/rooms/${roomId}/ai-objects/jobs`, { identity });
}

export function getAiObjectJob(identity: ApiIdentity, roomId: string, jobId: string) {
  return apiFetch<AiObjectJob>(`/v1/rooms/${roomId}/ai-objects/jobs/${jobId}`, { identity });
}

export function cancelAiObjectJob(identity: ApiIdentity, roomId: string, jobId: string) {
  return apiFetch<{ job: AiObjectJob; realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/ai-objects/jobs/${jobId}`, {
    method: "PATCH",
    body: { action: "cancel" },
    identity
  });
}

export function deleteAiObjectJob(identity: ApiIdentity, roomId: string, jobId: string) {
  return apiFetch<{ deleted: boolean; realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/ai-objects/jobs/${jobId}`, {
    method: "DELETE",
    identity
  });
}

export function placeAiObject(identity: ApiIdentity, roomId: string, jobId: string, body: Partial<PlaceAiObjectRequest> = {}) {
  return apiFetch<{ object: RoomObject; template: RoomObjectTemplate; realtimeMessages: unknown[] }>(`/v1/rooms/${roomId}/ai-objects/jobs/${jobId}/place`, {
    method: "POST",
    body,
    identity
  });
}

export async function downloadAiObjectGlb(identity: ApiIdentity, roomId: string, jobId: string, filename: string) {
  const url = `${API_URL}/v1/rooms/${roomId}/ai-objects/jobs/${jobId}/object.glb`;
  const headers: Record<string, string> = { ...identityHeaders(identity) };
  if (identity.getAuthToken) {
    const token = await identity.getAuthToken();
    if (token) headers["authorization"] = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) throw new ApiError(response.status, "Download failed");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
}
