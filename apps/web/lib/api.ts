import type {
  AcceptInviteResponseSchema,
  AvatarAppearance,
  ClassroomActionSchema,
  ClassroomState,
  ClassMembership,
  ClassRecord,
  CreateRoomObjectRequestSchema,
  Invite,
  LessonRecap,
  Role,
  RoomRecord,
  RoomObject,
  RoomObjectRealtimeInbound,
  RoomObjectRealtimeMessage,
  RoomObjectTemplate,
  RoomSessionResponse,
  RoomSettings,
  RoomObjectTouchRequestSchema,
  RoomWithManifest,
  UpdateRoomObjectRequestSchema,
  WallAttachment,
  WallAttachmentDownloadResponse,
  WallObject,
  WallObjectControlRequestSchema,
  CreateWallObjectRequestSchema,
  UpdateWallObjectRequestSchema,
  CreateWallShareResponseSchema
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
    const payload = await response.json().catch(() => ({ message: response.statusText }));
    throw new ApiError(
      response.status,
      payload.message ?? `Request failed with ${response.status}`,
      payload.error,
      payload
    );
  }

  return response.json() as Promise<T>;
}

type RoomObjectMutationResult = {
  object: RoomObject;
  realtimeMessages: RoomObjectRealtimeMessage[];
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

export function listClasses(identity: ApiIdentity) {
  return apiFetch<ClassRecord[]>("/v1/classes", { identity });
}

export function createClass(identity: ApiIdentity, name: string) {
  return apiFetch<ClassRecord>("/v1/classes", { method: "POST", identity, body: { name } });
}

export function listRooms(identity: ApiIdentity) {
  return apiFetch<RoomRecord[]>("/v1/rooms", { identity });
}

export function createRoom(identity: ApiIdentity, classId: string, name: string) {
  return apiFetch<RoomWithManifest>("/v1/rooms", { method: "POST", identity, body: { classId, name } });
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

export function patchAvatarAppearance(identity: ApiIdentity, appearance: AvatarAppearance) {
  return apiFetch<{ ok: boolean }>("/v1/users/me/avatar", {
    method: "PATCH",
    identity,
    body: { appearance }
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

export function listRoomObjectTemplates(identity: ApiIdentity) {
  return apiFetch<{ templates: RoomObjectTemplate[] }>("/v1/room-objects/templates", { identity }).then((response) => response.templates);
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
