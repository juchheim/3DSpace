import type {
  BuildLogicPiece,
  ClassroomGroup,
  RoomObject,
  RoomObjectTemplate,
  WallAnchor,
  WallObject
} from "@3dspace/contracts";
import type { ParticipantView } from "./types";

type HelpRequestLike = {
  status: string;
  userId: string;
};

export function participantListFromRecord(
  participants: Record<string, ParticipantView>
): ParticipantView[] {
  return Object.values(participants);
}

export function participantNameMapFromList(
  participants: ParticipantView[]
): Record<string, string> {
  return Object.fromEntries(
    participants.map((participant) => [participant.id, participant.displayName])
  );
}

export function roomObjectTemplatesById(
  templates: RoomObjectTemplate[]
): Record<string, RoomObjectTemplate> {
  const map: Record<string, RoomObjectTemplate> = {};
  for (const template of templates) {
    map[template.id] = template;
  }
  return map;
}

export function findSelectedRoomObject(
  objects: RoomObject[],
  selectedRoomObjectId: string | null
): RoomObject | null {
  if (!selectedRoomObjectId) return null;
  return objects.find((object) => object.id === selectedRoomObjectId) ?? null;
}

export function findSelectedRoomObjectTemplate(
  selectedRoomObject: RoomObject | null,
  templatesById: Record<string, RoomObjectTemplate>
): RoomObjectTemplate | undefined {
  if (!selectedRoomObject) return undefined;
  return templatesById[selectedRoomObject.templateId];
}

export function memberGroupIdsForUser(
  groups: ClassroomGroup[] | undefined,
  userId: string
): string[] {
  return (groups ?? [])
    .filter((group) => group.status === "active" && group.memberUserIds.includes(userId))
    .map((group) => group.id);
}

export function groupByUserId(
  groups: ClassroomGroup[] | undefined
): Map<string, string> {
  const map = new Map<string, string>();
  for (const group of groups ?? []) {
    if (group.status !== "active" || !group.targetPosition) continue;
    for (const userId of group.memberUserIds) {
      map.set(userId, group.id);
    }
  }
  return map;
}

export function activeHelpRequestUserIds(
  helpRequests: HelpRequestLike[] | undefined
): Set<string> {
  return new Set(
    (helpRequests ?? [])
      .filter((request) => request.status === "raised" || request.status === "acknowledged")
      .map((request) => request.userId)
  );
}

export function boardGrantWallAnchors(
  manifestAnchors: WallAnchor[] | undefined,
  dynamicAnchors: WallAnchor[] | undefined
): WallAnchor[] {
  if (!manifestAnchors) return dynamicAnchors ?? [];
  return dynamicAnchors && dynamicAnchors.length > 0
    ? [...manifestAnchors, ...dynamicAnchors]
    : manifestAnchors;
}

export function mergeWallMediaStreams(input: {
  remoteWallMedia: Record<
    string,
    { videoStream?: MediaStream | null; audioStream?: MediaStream | null }
  >;
  localWallMedia: Record<
    string,
    { videoStream?: MediaStream | null; audioStream?: MediaStream | null }
  >;
  wallObjects: WallObject[];
  participants: ParticipantView[];
}): Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }> {
  const next: Record<string, { videoStream?: MediaStream | null; audioStream?: MediaStream | null }> = {
    ...input.remoteWallMedia,
    ...input.localWallMedia
  };
  for (const object of input.wallObjects) {
    if (object.type.endsWith(".live") && !(object.type.endsWith(".live") && object.status === "active")) {
      const participantTrackType = object.type === "camera.live" || object.type === "microphone.live";
      const terminalStatus =
        object.status === "removed" ||
        object.status === "source_ended" ||
        object.status === "failed" ||
        object.status === "rejected";
      if (!participantTrackType || terminalStatus) {
        if (next[object.id]) {
          next[object.id] = {
            ...(next[object.id] ?? {}),
            videoStream: null,
            audioStream: null
          };
        }
        continue;
      }
    }
    const source = object.source;
    if (source.kind !== "livekit-track") continue;
    const participant = input.participants.find(
      (candidate) => candidate.id === source.participantId
    );
    if (!participant) continue;
    if (object.type === "camera.live") {
      const existing = next[object.id] ?? {};
      next[object.id] = {
        ...existing,
        videoStream:
          existing.videoStream !== undefined
            ? existing.videoStream
            : (participant.cameraStream ?? null)
      };
    }
    if (object.type === "microphone.live") {
      const existing = next[object.id] ?? {};
      next[object.id] = {
        ...existing,
        audioStream:
          existing.audioStream !== undefined
            ? existing.audioStream
            : (participant.microphoneStream ?? null)
      };
    }
  }
  return next;
}

export function findLocalParticipant(
  participants: ParticipantView[],
  localParticipantId: string | undefined
): ParticipantView | null {
  return (
    participants.find((participant) => participant.id === localParticipantId) ??
    participants.find((participant) => participant.local) ??
    null
  );
}

export function existingLogicChannels(
  pieces: BuildLogicPiece[]
): Set<string> {
  return new Set(
    pieces
      .map((piece) => piece.channelId)
      .filter((channelId): channelId is string => typeof channelId === "string" && channelId.length > 0)
  );
}
