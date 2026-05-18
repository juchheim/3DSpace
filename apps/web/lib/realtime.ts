"use client";

import { ConnectionState, DisconnectReason, Room, RoomEvent, Track } from "livekit-client";
import { isSafariBrowser } from "./browser";
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
  syncParticipants(): void;
  setLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }): Promise<void>;
  setLocalWallShare(input: { objectId: string; screenStream: MediaStream | null; audioStream?: MediaStream | null; publicationName?: string }): Promise<void>;
  close(): Promise<void>;
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

export function normalizeLiveKitUrl(url: string) {
  const trimmed = url.trim();
  if (trimmed.startsWith("https://")) return `wss://${trimmed.slice("https://".length)}`;
  if (trimmed.startsWith("http://")) return `ws://${trimmed.slice("http://".length)}`;
  return trimmed;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

function disconnectReasonLabel(reason: DisconnectReason) {
  return DisconnectReason[reason] ?? `code-${reason}`;
}

function createRoomForBrowser() {
  const safari = isSafariBrowser();
  if (!safari) {
    return new Room({ adaptiveStream: true, dynacast: true });
  }
  return new Room({
    disconnectOnPageLeave: false,
    publishDefaults: {
      simulcast: false,
      videoCodec: "vp8" as const,
      backupCodec: false
    }
  });
}

async function prepareLiveKitConnection(room: Room, url: string, token: string) {
  if (isSafariBrowser()) return;
  await Promise.race([room.prepareConnection(normalizeLiveKitUrl(url), token), sleep(5_000)]).catch(() => undefined);
}

function isRetryableLiveKitError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("duplicate") ||
    message.includes("already connected") ||
    message.includes("client initiated disconnect") ||
    message.includes("connection attempt aborted") ||
    message.includes("timed out")
  );
}

async function disconnectLiveKitRoom(room: Room) {
  if (room.state === ConnectionState.Disconnected) return;
  try {
    await room.disconnect(true);
  } catch {
    // ignore disconnect errors while resetting a stuck peer connection
  }
  await sleep(400);
}

async function connectLiveKitRoom(
  room: Room,
  url: string,
  token: string,
  timeoutMs = 25_000,
  onProgress?: (message: string) => void
) {
  const livekitUrl = normalizeLiveKitUrl(url);
  const connectTimeoutMs = isSafariBrowser() ? Math.max(timeoutMs, 30_000) : timeoutMs;
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let timedOut = false;
    let connectPromise: Promise<void> | undefined;
    try {
      onProgress?.(
        attempt === 0 ? "Connecting to LiveKit..." : `Connecting to LiveKit (retry ${attempt + 1}/3)...`
      );
      if (attempt > 0 || room.state !== ConnectionState.Disconnected) {
        await disconnectLiveKitRoom(room);
      }
      connectPromise = room.connect(livekitUrl, token, {
        autoSubscribe: true,
        peerConnectionTimeout: connectTimeoutMs,
        websocketTimeout: connectTimeoutMs
      });
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          timedOut = true;
          void disconnectLiveKitRoom(room);
          reject(new Error("LiveKit connection timed out. Verify LIVEKIT_URL is wss:// on the API service."));
        }, connectTimeoutMs);
        connectPromise!
          .then(() => {
            window.clearTimeout(timeoutId);
            resolve();
          })
          .catch((error) => {
            window.clearTimeout(timeoutId);
            reject(error);
          });
      });
      return;
    } catch (error) {
      if (timedOut && connectPromise) {
        await connectPromise.catch(() => undefined);
      }
      lastError = error;
      if (!isRetryableLiveKitError(error) || attempt === 2) {
        throw error;
      }
      await sleep(800 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("LiveKit connection failed");
}

function createBroadcastClient(input: AdapterInput, reason?: string): RealtimeClient {
  const channel = new BroadcastChannel(`3dspace:${input.roomId}`);
  channel.onmessage = (event) => {
    const payload = event.data as { senderId?: string };
    if (payload.senderId === input.session.participantId) return;
    const message = withoutSender(payload);
    if (message) input.onMessage(message);
  };

  const suffix = reason ? ` (${reason})` : "";
  input.onStatus(`Connected through local multi-tab realtime fallback${suffix}. Cross-device presence will not work.`);
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
    syncParticipants() {
      return;
    },
    async setLocalMedia() {
      return;
    },
    async setLocalWallShare() {
      return;
    },
    async close() {
      window.clearInterval(presenceInterval);
      channel.postMessage(
        withSender({ type: "participant.leave.v1", participantId: input.session.participantId }, input.session.participantId)
      );
      channel.close();
    }
  };
}

async function createLiveKitClient(input: AdapterInput): Promise<RealtimeClient> {
  const safari = isSafariBrowser();
  const room = createRoomForBrowser();
  input.onStatus("Connecting to LiveKit...");
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let publishedCameraTrack: MediaStreamTrack | null = null;
  let publishedMicTrack: MediaStreamTrack | null = null;
  const publishedWallTracks = new Map<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>();
  let localMediaSync: Promise<void> = Promise.resolve();
  let closed = false;
  let isConnecting = true;

  async function syncLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }) {
    if (room.state !== ConnectionState.Connected) return;
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
        simulcast: !safari
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
        red: !safari
      });
      publishedMicTrack = nextMicTrack;
    }
  }

  function participantIdFromIdentity(identity: string) {
    return identity.includes(":") ? identity.split(":")[0]! : identity;
  }

  function roleFromMetadata(metadata: string | undefined): Role {
    if (!metadata) return "student";
    try {
      const parsed = JSON.parse(metadata) as { role?: string };
      return parsed.role === "teacher" ? "teacher" : "student";
    } catch {
      return "student";
    }
  }

  function presenceFromParticipant(participant: { identity: string; name?: string; metadata?: string }): PresenceMessage {
    const participantId = participantIdFromIdentity(participant.identity);
    return {
      type: "participant.presence.v1",
      participantId,
      displayName: participant.name?.trim() || participantId,
      role: roleFromMetadata(participant.metadata)
    };
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

  function syncRemoteParticipants() {
    room.remoteParticipants.forEach((participant) => {
      input.onMessage(presenceFromParticipant(participant));
    });
  }

  room.on(RoomEvent.Connected, syncRemoteParticipants);
  room.on(RoomEvent.Reconnected, syncRemoteParticipants);
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    input.onMessage(presenceFromParticipant(participant));
  });
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    input.onMessage({
      type: "participant.leave.v1",
      participantId: participantIdFromIdentity(participant.identity)
    });
  });
  room.on(RoomEvent.SignalConnected, () => {
    if (isConnecting) {
      input.onStatus("Connecting to LiveKit (media)...");
    }
  });
  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (state === ConnectionState.Connected) {
      input.onStatus("Connected through LiveKit media and data channels.");
      return;
    }
    if (isConnecting) return;
    if (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting) {
      input.onStatus("Reconnecting to LiveKit...");
    } else if (state === ConnectionState.Disconnected) {
      input.onStatus("Disconnected from LiveKit.");
    }
  });
  room.on(RoomEvent.Disconnected, (reason) => {
    if (closed || isConnecting) return;
    const detail = reason !== undefined ? ` (${disconnectReasonLabel(reason)})` : "";
    input.onStatus(`Disconnected from LiveKit${detail}.`);
  });

  try {
    await prepareLiveKitConnection(room, input.session.livekitUrl, input.session.token);
    await connectLiveKitRoom(room, input.session.livekitUrl, input.session.token, 25_000, input.onStatus);
    input.onStatus("Connected through LiveKit media and data channels.");
    syncRemoteParticipants();
    if (safari) {
      void room.startAudio().catch(() => undefined);
    }
  } finally {
    isConnecting = false;
  }

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
    if (closed) return;
    void room.localParticipant.publishData(encoder.encode(JSON.stringify(presence)), { reliable: true });
  };
  publishPresence();
  const presenceInterval = window.setInterval(publishPresence, 2_000);

  return {
    publish(message) {
      if (closed) return;
      const reliable = message.type !== "avatar.state.v1";
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable });
    },
    syncParticipants: syncRemoteParticipants,
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
            simulcast: !safari
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
    async close() {
      closed = true;
      window.clearInterval(presenceInterval);
      publishedCameraTrack = null;
      publishedMicTrack = null;
      publishedWallTracks.clear();
      await disconnectLiveKitRoom(room);
    }
  };
}

export async function createRealtimeClient(input: AdapterInput): Promise<RealtimeClient> {
  if (input.session.token.startsWith("dev-token")) {
    return createBroadcastClient(input);
  }

  try {
    return await createLiveKitClient(input);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown LiveKit error";
    console.error("LiveKit connection failed", error);
    if (process.env.NODE_ENV === "development") {
      return createBroadcastClient(input, detail);
    }
    throw new Error(`LiveKit connection failed: ${detail}`);
  }
}
