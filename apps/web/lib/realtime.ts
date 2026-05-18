"use client";

import { waitForVideoTrackDimensions } from "./mediaTracks";
import type {
  AvatarStateMessage,
  ClassroomStateChangedRealtimeSchema,
  ClassroomStateRealtimeSchema,
  Role,
  RoomSessionResponse,
  WallModerationStateMessageSchema,
  WallObjectRealtimeRemoveSchema,
  WallObjectRealtimeUpsertSchema,
  WallPlaybackStateMessageSchema,
  WallShareEndedMessageSchema
} from "@3dspace/contracts";
import type { z } from "zod";

export type PresenceMessage = {
  type: "participant.presence.v1";
  participantId: string;
  displayName: string;
  role: Role;
};

export type LeaveMessage = {
  type: "participant.leave.v1";
  participantId: string;
};

export type WallRealtimeMessage =
  | z.infer<typeof WallObjectRealtimeUpsertSchema>
  | z.infer<typeof WallObjectRealtimeRemoveSchema>
  | z.infer<typeof WallPlaybackStateMessageSchema>
  | z.infer<typeof WallShareEndedMessageSchema>
  | z.infer<typeof WallModerationStateMessageSchema>;

export type ClassroomRealtimeMessage = z.infer<typeof ClassroomStateChangedRealtimeSchema> | z.infer<typeof ClassroomStateRealtimeSchema>;

export type RealtimeMessage = AvatarStateMessage | PresenceMessage | LeaveMessage | WallRealtimeMessage | ClassroomRealtimeMessage;

export type RemoteMediaUpdate = {
  participantId: string;
  cameraStream?: MediaStream | null;
  microphoneStream?: MediaStream | null;
  wallObjectId?: string;
  wallVideoStream?: MediaStream | null;
  wallAudioStream?: MediaStream | null;
};

export type RealtimeClient = {
  publish(message: RealtimeMessage): void;
  setLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }): Promise<void>;
  setLocalWallShare(input: { objectId: string; screenStream: MediaStream | null; audioStream?: MediaStream | null; publicationName?: string }): Promise<void>;
  close(): void;
};

type AdapterInput = {
  roomId: string;
  session: RoomSessionResponse;
  displayName: string;
  onMessage(message: RealtimeMessage): void;
  onRemoteMedia?(update: RemoteMediaUpdate): void;
  onStatus(status: string): void;
};

function withSender(message: RealtimeMessage, senderId: string) {
  return { ...message, senderId };
}

function withoutSender(payload: unknown) {
  if (typeof payload !== "object" || !payload) return undefined;
  const { senderId: _senderId, ...message } = payload as RealtimeMessage & { senderId?: string };
  return message as RealtimeMessage;
}

function createBroadcastClient(input: AdapterInput): RealtimeClient {
  const channel = new BroadcastChannel(`3dspace:${input.roomId}`);
  channel.onmessage = (event) => {
    const payload = event.data as { senderId?: string };
    if (payload.senderId === input.session.participantId) return;
    const message = withoutSender(payload);
    if (message) input.onMessage(message);
  };

  input.onStatus("Connected through local multi-tab realtime fallback.");
  const presence: PresenceMessage = {
    type: "participant.presence.v1",
    participantId: input.session.participantId,
    displayName: input.displayName,
    role: input.session.role
  };
  const publishPresence = () => channel.postMessage(withSender(presence, input.session.participantId));
  publishPresence();
  const presenceInterval = window.setInterval(publishPresence, 2_000);

  return {
    publish(message) {
      channel.postMessage(withSender(message, input.session.participantId));
    },
    async setLocalMedia() {
      return;
    },
    async setLocalWallShare() {
      return;
    },
    close() {
      window.clearInterval(presenceInterval);
      channel.postMessage(
        withSender({ type: "participant.leave.v1", participantId: input.session.participantId }, input.session.participantId)
      );
      channel.close();
    }
  };
}

async function createLiveKitClient(input: AdapterInput): Promise<RealtimeClient> {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room({ adaptiveStream: true, dynacast: true });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let publishedCameraTrack: MediaStreamTrack | null = null;
  let publishedMicTrack: MediaStreamTrack | null = null;
  const publishedWallTracks = new Map<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>();
  let localMediaSync: Promise<void> = Promise.resolve();

  async function syncLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }) {
    const nextCameraTrack = media.cameraStream?.getVideoTracks()[0] ?? null;
    if (publishedCameraTrack && publishedCameraTrack.id !== nextCameraTrack?.id) {
      await room.localParticipant.unpublishTrack(publishedCameraTrack, false);
      publishedCameraTrack = null;
    }
    if (nextCameraTrack && publishedCameraTrack?.id !== nextCameraTrack.id && nextCameraTrack.readyState === "live") {
      await waitForVideoTrackDimensions(nextCameraTrack).catch(() => undefined);
      await room.localParticipant.publishTrack(nextCameraTrack, {
        name: "camera",
        source: Track.Source.Camera,
        stream: "avatar-media",
        simulcast: true
      });
      publishedCameraTrack = nextCameraTrack;
    }

    const nextMicTrack = media.micStream?.getAudioTracks()[0] ?? null;
    if (publishedMicTrack && publishedMicTrack.id !== nextMicTrack?.id) {
      await room.localParticipant.unpublishTrack(publishedMicTrack, false);
      publishedMicTrack = null;
    }
    if (nextMicTrack && publishedMicTrack?.id !== nextMicTrack.id && nextMicTrack.readyState === "live") {
      await room.localParticipant.publishTrack(nextMicTrack, {
        name: "microphone",
        source: Track.Source.Microphone,
        stream: "avatar-media",
        dtx: true,
        red: true
      });
      publishedMicTrack = nextMicTrack;
    }
  }

  function participantIdFromIdentity(identity: string) {
    return identity.includes(":") ? identity.split(":")[0]! : identity;
  }

  function streamFromTrack(track: { mediaStreamTrack: MediaStreamTrack }) {
    return new MediaStream([track.mediaStreamTrack]);
  }

  function publicationName(publication: unknown) {
    if (typeof publication !== "object" || !publication) return "";
    const record = publication as { trackName?: string; name?: string };
    return record.trackName ?? record.name ?? "";
  }

  function wallObjectIdFromPublication(name: string) {
    if (!name.startsWith("wall:")) return undefined;
    return name.replace(/^wall:/, "").replace(/:audio$/, "");
  }

  function handleRemoteTrack(track: { kind: string; source: string; mediaStreamTrack: MediaStreamTrack }, participantIdentity: string, publication?: unknown) {
    const participantId = participantIdFromIdentity(participantIdentity);
    const wallObjectId = wallObjectIdFromPublication(publicationName(publication));
    if (wallObjectId) {
      if (track.kind === Track.Kind.Audio || track.source === Track.Source.ScreenShareAudio) {
        input.onRemoteMedia?.({ participantId, wallObjectId, wallAudioStream: streamFromTrack(track) });
        return;
      }
      input.onRemoteMedia?.({ participantId, wallObjectId, wallVideoStream: streamFromTrack(track) });
      return;
    }
    if (track.kind === Track.Kind.Video || track.source === Track.Source.Camera) {
      input.onRemoteMedia?.({ participantId, cameraStream: streamFromTrack(track) });
      return;
    }

    if (track.kind === Track.Kind.Audio || track.source === Track.Source.Microphone) {
      input.onRemoteMedia?.({ participantId, microphoneStream: streamFromTrack(track) });
    }
  }

  function handleRemoteTrackRemoved(track: { kind: string; source: string }, participantIdentity: string, publication?: unknown) {
    const participantId = participantIdFromIdentity(participantIdentity);
    const wallObjectId = wallObjectIdFromPublication(publicationName(publication));
    if (wallObjectId) {
      if (track.kind === Track.Kind.Audio || track.source === Track.Source.ScreenShareAudio) {
        input.onRemoteMedia?.({ participantId, wallObjectId, wallAudioStream: null });
        return;
      }
      input.onRemoteMedia?.({ participantId, wallObjectId, wallVideoStream: null });
      return;
    }
    if (track.kind === Track.Kind.Video || track.source === Track.Source.Camera) {
      input.onRemoteMedia?.({ participantId, cameraStream: null });
      return;
    }

    if (track.kind === Track.Kind.Audio || track.source === Track.Source.Microphone) {
      input.onRemoteMedia?.({ participantId, microphoneStream: null });
    }
  }

  room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
    try {
      input.onMessage(JSON.parse(decoder.decode(payload)) as RealtimeMessage);
    } catch {
      input.onStatus("Ignored malformed realtime data message.");
    }
  });
  room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
    handleRemoteTrack(track, participant.identity, publication);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
    handleRemoteTrackRemoved(track, participant.identity, publication);
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    input.onMessage({
      type: "participant.leave.v1",
      participantId: participantIdFromIdentity(participant.identity)
    });
  });

  await room.connect(input.session.livekitUrl, input.session.token);
  input.onStatus("Connected through LiveKit media and data channels.");

  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      if (publication.track) {
        handleRemoteTrack(publication.track, participant.identity, publication);
      }
    });
  });

  const presence: PresenceMessage = {
    type: "participant.presence.v1",
    participantId: input.session.participantId,
    displayName: input.displayName,
    role: input.session.role
  };
  const publishPresence = () => {
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(presence)), { reliable: true });
  };
  publishPresence();
  const presenceInterval = window.setInterval(publishPresence, 2_000);

  return {
    publish(message) {
      const reliable = message.type !== "avatar.state.v1";
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable });
    },
    async setLocalMedia(media) {
      localMediaSync = localMediaSync
        .then(() => syncLocalMedia(media))
        .catch((error) => {
          console.error("Failed to sync local media with LiveKit", error);
        });
      return localMediaSync;
    },
    async setLocalWallShare(inputShare) {
      const existing = publishedWallTracks.get(inputShare.objectId);
      if (existing?.video) await room.localParticipant.unpublishTrack(existing.video, false);
      if (existing?.audio) await room.localParticipant.unpublishTrack(existing.audio, false);
      publishedWallTracks.delete(inputShare.objectId);
      if (!inputShare.screenStream) return;

      const publicationName = inputShare.publicationName ?? `wall:${inputShare.objectId}`;
      const videoTrack = inputShare.screenStream.getVideoTracks()[0] ?? null;
      const audioTrack = inputShare.audioStream?.getAudioTracks()[0] ?? inputShare.screenStream.getAudioTracks()[0] ?? null;
      const record: { video?: MediaStreamTrack; audio?: MediaStreamTrack } = {};
      if (videoTrack) {
        if (videoTrack.readyState === "live") {
          await waitForVideoTrackDimensions(videoTrack).catch(() => undefined);
          await room.localParticipant.publishTrack(videoTrack, {
            name: publicationName,
            source: Track.Source.ScreenShare,
            stream: "wall-share",
            simulcast: true
          });
          record.video = videoTrack;
        }
      }
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          name: `${publicationName}:audio`,
          source: Track.Source.ScreenShareAudio,
          stream: "wall-share"
        });
        record.audio = audioTrack;
      }
      if (record.video || record.audio) publishedWallTracks.set(inputShare.objectId, record);
    },
    close() {
      window.clearInterval(presenceInterval);
      publishedCameraTrack = null;
      publishedMicTrack = null;
      publishedWallTracks.clear();
      void room.disconnect(true).catch(() => undefined);
    }
  };
}

export async function createRealtimeClient(input: AdapterInput): Promise<RealtimeClient> {
  if (input.session.token.startsWith("dev-token")) {
    return createBroadcastClient(input);
  }

  try {
    return await createLiveKitClient(input);
  } catch {
    input.onStatus("LiveKit connection failed; using local multi-tab realtime fallback.");
    return createBroadcastClient(input);
  }
}
