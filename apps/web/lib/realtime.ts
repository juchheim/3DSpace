"use client";

import type { AvatarStateMessage, Role, RoomSessionResponse } from "@3dspace/contracts";

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

export type RealtimeMessage = AvatarStateMessage | PresenceMessage | LeaveMessage;

export type RemoteMediaUpdate = {
  participantId: string;
  cameraStream?: MediaStream | null;
  microphoneStream?: MediaStream | null;
};

export type RealtimeClient = {
  publish(message: RealtimeMessage): void;
  setLocalMedia(media: { cameraStream: MediaStream | null; micStream: MediaStream | null }): Promise<void>;
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

  function participantIdFromIdentity(identity: string) {
    return identity.includes(":") ? identity.split(":")[0]! : identity;
  }

  function streamFromTrack(track: { mediaStreamTrack: MediaStreamTrack }) {
    return new MediaStream([track.mediaStreamTrack]);
  }

  function handleRemoteTrack(track: { kind: string; source: string; mediaStreamTrack: MediaStreamTrack }, participantIdentity: string) {
    const participantId = participantIdFromIdentity(participantIdentity);
    if (track.kind === Track.Kind.Video || track.source === Track.Source.Camera) {
      input.onRemoteMedia?.({ participantId, cameraStream: streamFromTrack(track) });
      return;
    }

    if (track.kind === Track.Kind.Audio || track.source === Track.Source.Microphone) {
      input.onRemoteMedia?.({ participantId, microphoneStream: streamFromTrack(track) });
    }
  }

  function handleRemoteTrackRemoved(track: { kind: string; source: string }, participantIdentity: string) {
    const participantId = participantIdFromIdentity(participantIdentity);
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
  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    handleRemoteTrack(track, participant.identity);
  });
  room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
    handleRemoteTrackRemoved(track, participant.identity);
  });
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    input.onMessage({
      type: "participant.presence.v1",
      participantId: participantIdFromIdentity(participant.identity),
      displayName: participant.name ?? participant.identity,
      role: "student"
    });
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
    input.onMessage({
      type: "participant.presence.v1",
      participantId: participantIdFromIdentity(participant.identity),
      displayName: participant.name ?? participant.identity,
      role: "student"
    });
    participant.trackPublications.forEach((publication) => {
      if (publication.track) {
        handleRemoteTrack(publication.track, participant.identity);
      }
    });
  });

  return {
    publish(message) {
      const reliable = message.type !== "avatar.state.v1";
      void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable });
    },
    async setLocalMedia(media) {
      const nextCameraTrack = media.cameraStream?.getVideoTracks()[0] ?? null;
      if (publishedCameraTrack && publishedCameraTrack.id !== nextCameraTrack?.id) {
        await room.localParticipant.unpublishTrack(publishedCameraTrack, false);
        publishedCameraTrack = null;
      }
      if (nextCameraTrack && publishedCameraTrack?.id !== nextCameraTrack.id) {
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
      if (nextMicTrack && publishedMicTrack?.id !== nextMicTrack.id) {
        await room.localParticipant.publishTrack(nextMicTrack, {
          name: "microphone",
          source: Track.Source.Microphone,
          stream: "avatar-media",
          dtx: true,
          red: true
        });
        publishedMicTrack = nextMicTrack;
      }
    },
    close() {
      if (publishedCameraTrack) {
        void room.localParticipant.unpublishTrack(publishedCameraTrack, false);
      }
      if (publishedMicTrack) {
        void room.localParticipant.unpublishTrack(publishedMicTrack, false);
      }
      room.disconnect();
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
