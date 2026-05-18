"use client";

import { ConnectionState, type Room } from "livekit-client";
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
  isStale?: () => boolean;
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

function subscribeAllRemoteTracks(room: Room) {
  room.remoteParticipants.forEach((participant) => {
    participant.trackPublications.forEach((publication) => {
      publication.setSubscribed(true);
    });
  });
}

async function safeDisconnectRoom(room: Room) {
  if (room.state === ConnectionState.Disconnected) return;
  try {
    await Promise.race([room.disconnect(true), sleep(3_000)]);
  } catch (error) {
    // Disconnect during Connecting can race with engine setup; ignore teardown errors.
    console.warn("LiveKit room teardown skipped", error);
  }
  await sleep(150);
}

function connectErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isRetryableConnectError(error: unknown) {
  const message = connectErrorMessage(error).toLowerCase();
  return (
    message.includes("client initiated disconnect") ||
    message.includes("connection aborted") ||
    message.includes("timed out") ||
    message.includes("engine.close")
  );
}

async function connectLiveKitRoomOnce(
  room: Room,
  url: string,
  token: string,
  input: { timeoutMs: number; safari: boolean; isStale?: () => boolean }
) {
  if (input.isStale?.()) {
    throw new Error("LiveKit connection aborted");
  }

  const livekitUrl = normalizeLiveKitUrl(url);
  const connectPromise = room.connect(
    livekitUrl,
    token,
    input.safari
      ? {
          autoSubscribe: false,
          peerConnectionTimeout: input.timeoutMs,
          websocketTimeout: Math.min(25_000, input.timeoutMs),
          rtcConfig: { iceTransportPolicy: "relay" }
        }
      : {
          peerConnectionTimeout: input.timeoutMs
        }
  );
  let timedOut = false;

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      // Disconnect immediately to abort the SDK's internal multi-region retry loop,
      // which otherwise keeps room.connect() alive well past our timeout.
      void room.disconnect(true);
      reject(
        new Error(
          input.safari
            ? "LiveKit connection timed out on Safari while negotiating WebRTC."
            : "LiveKit connection timed out. Verify LIVEKIT_URL uses wss:// on the API service."
        )
      );
    }, input.timeoutMs + 5_000);

    connectPromise
      .then(() => {
        window.clearTimeout(timeoutId);
        if (timedOut) return;
        if (input.isStale?.()) {
          void safeDisconnectRoom(room);
          reject(new Error("LiveKit connection aborted"));
          return;
        }
        resolve();
      })
      .catch((error) => {
        window.clearTimeout(timeoutId);
        if (timedOut) return;
        reject(error);
      });
  });
}

async function connectLiveKitRoom(
  input: {
    getRoom: () => Room;
    replaceRoom: () => Room;
    url: string;
    token: string;
    timeoutMs: number;
    safari: boolean;
    isStale?: () => boolean;
    maxAttempts?: number;
  }
) {
  const maxAttempts = input.maxAttempts ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (input.isStale?.()) {
      throw new Error("LiveKit connection aborted");
    }
    const room = attempt === 0 ? input.getRoom() : input.replaceRoom();
    try {
      await connectLiveKitRoomOnce(room, input.url, input.token, {
        timeoutMs: input.timeoutMs,
        safari: input.safari,
        ...(input.isStale ? { isStale: input.isStale } : {})
      });
      return;
    } catch (error) {
      lastError = error;
      void safeDisconnectRoom(room);
      await sleep(500);
      if (input.isStale?.()) {
        throw new Error("LiveKit connection aborted");
      }
      if (!isRetryableConnectError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
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
  const { Room, RoomEvent, Track, getBrowser } = await import("livekit-client");
  const browser = getBrowser();
  const safari = browser?.name === "Safari" || browser?.os === "iOS";

  function createRoomInstance() {
    return safari
      ? new Room({
          adaptiveStream: false,
          dynacast: false,
          disconnectOnPageLeave: false,
          publishDefaults: {
            simulcast: false,
            videoCodec: "h264"
          }
        })
      : new Room({ adaptiveStream: true, dynacast: true });
  }

  const roomRef = { current: createRoomInstance() };

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let publishedCameraTrack: MediaStreamTrack | null = null;
  let publishedMicTrack: MediaStreamTrack | null = null;
  const publishedWallTracks = new Map<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>();
  let localMediaSync: Promise<void> = Promise.resolve();
  let closed = false;
  let isConnecting = true;

  async function syncLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }) {
    const room = roomRef.current;
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

  function syncRemoteParticipantsFor(room: Room) {
    room.remoteParticipants.forEach((participant) => {
      input.onMessage(presenceFromParticipant(participant));
    });
  }

  function bindRoomEvents(room: Room, safariDeferSubscribe: boolean) {
    function syncRemoteParticipants() {
      syncRemoteParticipantsFor(room);
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
    room.on(RoomEvent.Connected, () => {
      if (safariDeferSubscribe) {
        subscribeAllRemoteTracks(room);
      }
      syncRemoteParticipants();
    });
    room.on(RoomEvent.Reconnected, syncRemoteParticipants);
    room.on(RoomEvent.ParticipantConnected, (participant) => {
      input.onMessage(presenceFromParticipant(participant));
      if (safariDeferSubscribe) {
        subscribeAllRemoteTracks(room);
      }
    });
    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      input.onMessage({
        type: "participant.leave.v1",
        participantId: participantIdFromIdentity(participant.identity)
      });
    });
    room.on(RoomEvent.TrackPublished, (publication) => {
      if (safariDeferSubscribe) {
        publication.setSubscribed(true);
      }
    });
    room.on(RoomEvent.SignalConnected, () => {
      if (isConnecting) {
        input.onStatus("Connecting to LiveKit (negotiating media)...");
      }
      if (safari) {
        // Temporary diagnostic: poll ICE state every second so we can see
        // what candidates are gathered and whether the PC ever reaches connected.
        let tick = 0;
        const poll = window.setInterval(() => {
          tick++;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const eng = (room as any).engine;
          const pcm = eng?.pcManager;
          const pubPc: RTCPeerConnection | undefined = pcm?.publisher?._pc ?? pcm?.publisher?.pc;
          const subPc: RTCPeerConnection | undefined = pcm?.subscriber?._pc ?? pcm?.subscriber?.pc;
          console.log(
            `[ICE t+${tick}s]`,
            `engine=${!!eng}`,
            `pcManager=${!!pcm}`,
            `pub.ice=${pubPc?.iceConnectionState ?? "no-pc"}`,
            `pub.gather=${pubPc?.iceGatheringState ?? "–"}`,
            `sub.ice=${subPc?.iceConnectionState ?? "no-pc"}`,
            `sub.gather=${subPc?.iceGatheringState ?? "–"}`,
          );
          if (pubPc && tick === 1) {
            pubPc.addEventListener("icecandidate", (e) =>
              console.log("[ICE pub candidate]", e.candidate ? `${e.candidate.type} ${e.candidate.protocol} ${e.candidate.address}` : "null (gathering done)")
            );
            pubPc.addEventListener("icecandidateerror", (e) => console.warn("[ICE pub error]", e));
          }
          if (subPc && tick === 1) {
            subPc.addEventListener("icecandidate", (e) =>
              console.log("[ICE sub candidate]", e.candidate ? `${e.candidate.type} ${e.candidate.protocol} ${e.candidate.address}` : "null (gathering done)")
            );
            subPc.addEventListener("icecandidateerror", (e) => console.warn("[ICE sub error]", e));
          }
          if (tick >= 30) window.clearInterval(poll);
        }, 1_000);
      }
    });
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      if (state === ConnectionState.Connected) {
        input.onStatus("Connected through LiveKit media and data channels.");
      } else if (!isConnecting && (state === ConnectionState.Reconnecting || state === ConnectionState.SignalReconnecting)) {
        input.onStatus("Reconnecting to LiveKit...");
      }
    });
  }

  function replaceRoom() {
    void safeDisconnectRoom(roomRef.current);
    roomRef.current = createRoomInstance();
    bindRoomEvents(roomRef.current, safari);
    return roomRef.current;
  }

  bindRoomEvents(roomRef.current, safari);

  input.onStatus("Connecting to LiveKit...");

  try {
    await connectLiveKitRoom({
      getRoom: () => roomRef.current,
      replaceRoom,
      url: input.session.livekitUrl,
      token: input.session.token,
      timeoutMs: 20_000,
      safari,
      ...(input.isStale ? { isStale: input.isStale } : {}),
      maxAttempts: 1
    });
  } finally {
    isConnecting = false;
  }

  if (closed || input.isStale?.()) {
    await safeDisconnectRoom(roomRef.current);
    throw new Error("LiveKit connection aborted");
  }

  const room = roomRef.current;
  input.onStatus("Connected through LiveKit media and data channels.");
  if (safari) {
    subscribeAllRemoteTracks(room);
  }
  syncRemoteParticipantsFor(room);

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
    void roomRef.current.localParticipant.publishData(encoder.encode(JSON.stringify(presence)), { reliable: true });
  };
  publishPresence();
  const presenceInterval = window.setInterval(publishPresence, 2_000);

  return {
    publish(message) {
      if (closed) return;
      const reliable = message.type !== "avatar.state.v1";
      void roomRef.current.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable });
    },
    syncParticipants: () => syncRemoteParticipantsFor(roomRef.current),
    async setLocalMedia(media) {
      localMediaSync = localMediaSync
        .then(() => syncLocalMedia(media))
        .catch((error) => {
          console.error("Failed to sync local media with LiveKit", error);
        });
      return localMediaSync;
    },
    async setLocalWallShare(inputShare) {
      const room = roomRef.current;
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
      await safeDisconnectRoom(roomRef.current);
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
