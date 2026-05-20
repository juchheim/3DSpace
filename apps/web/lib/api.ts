import type {
  AcceptInviteResponseSchema,
  AvatarAppearance,
  ClassroomActionSchema,
  ClassroomState,
  ClassMembership,
  ClassRecord,
  Invite,
  Role,
  RoomRecord,
  RoomSessionResponse,
  RoomWithManifest,
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
    throw new Error(payload.message ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
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
