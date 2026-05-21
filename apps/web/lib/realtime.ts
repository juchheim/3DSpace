"use client";

import type {
  AvatarAppearanceMessage,
  AvatarReactionMessage,
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

export type RealtimeMessage = AvatarStateMessage | AvatarAppearanceMessage | AvatarReactionMessage | PresenceMessage | LeaveMessage | WallRealtimeMessage | ClassroomRealtimeMessage;

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

function maskToken(token: string) {
  if (token.length <= 16) return `${token.slice(0, 4)}...${token.slice(-4)}`;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

function decodeBase64UrlJson(segment: string) {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function summarizeLiveKitJwt(token: string) {
  const [headerSegment, payloadSegment] = token.split(".");
  if (!headerSegment || !payloadSegment) {
    return { kind: "non-jwt" as const };
  }

  const header = decodeBase64UrlJson(headerSegment);
  const payload = decodeBase64UrlJson(payloadSegment);
  if (!header || !payload) {
    return { kind: "decode-failed" as const };
  }

  return {
    kind: "jwt" as const,
    header: {
      alg: typeof header.alg === "string" ? header.alg : undefined,
      typ: typeof header.typ === "string" ? header.typ : undefined
    },
    payload: {
      iss: typeof payload.iss === "string" ? payload.iss : undefined,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
      name: typeof payload.name === "string" ? payload.name : undefined,
      metadata: typeof payload.metadata === "string" ? payload.metadata : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
      nbf: typeof payload.nbf === "number" ? payload.nbf : undefined,
      video: typeof payload.video === "object" && payload.video ? payload.video : undefined
    }
  };
}

function logSessionDebug(input: AdapterInput) {
  console.log("[LiveKit session]", {
    roomId: input.roomId,
    livekitUrl: input.session.livekitUrl,
    participantId: input.session.participantId,
    participantIdentity: input.session.participantIdentity,
    role: input.session.role,
    tokenPreview: maskToken(input.session.token),
    token: summarizeLiveKitJwt(input.session.token)
  });
}

function isSafariBrowser() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/CriOS\//.test(ua) && !/FxiOS\//.test(ua);
}

function summarizeIceServers(iceServers: RTCIceServer[] | undefined) {
  return (iceServers ?? []).map((server) => ({
    urls: Array.isArray(server.urls) ? server.urls : [server.urls],
    username: server.username ? "present" : undefined,
    credential: server.credential ? "present" : undefined
  }));
}

function summarizeCandidate(candidateLine: string) {
  const protocol = /\s(udp|tcp)\s/i.exec(candidateLine)?.[1]?.toLowerCase();
  const candidateType = /\styp\s([a-z0-9]+)/i.exec(candidateLine)?.[1]?.toLowerCase();
  const address = /candidate:\S+\s\d+\s(?:udp|tcp)\s\d+\s([^\s]+)\s(\d+)/i.exec(candidateLine);
  return {
    protocol,
    candidateType,
    address: address?.[1],
    port: address?.[2] ? Number(address[2]) : undefined
  };
}

function logJson(label: string, value: unknown) {
  try {
    console.log(label, JSON.stringify(value));
  } catch {
    console.log(label, value);
  }
}

function installSafariRtcProbe(forceRelay = false) {
  if (!isSafariBrowser()) return () => undefined;
  if (typeof window === "undefined" || !window.RTCPeerConnection) return () => undefined;

  const probeWindow = window as Window & {
    __lkOriginalRTCPeerConnection?: typeof RTCPeerConnection;
    __lkRtcProbeRefs?: number;
    __lkRtcProbeCounter?: number;
    __lkTurnProbeStarted?: boolean;
  };

  if (!probeWindow.__lkOriginalRTCPeerConnection) {
    const Original = window.RTCPeerConnection;
    probeWindow.__lkOriginalRTCPeerConnection = Original;

    const runTurnProbe = (configuration: RTCConfiguration, id: number) => {
      if (probeWindow.__lkTurnProbeStarted) return;
      probeWindow.__lkTurnProbeStarted = true;

      const probePc = new Original(configuration);
      const seenCandidates: Array<Record<string, unknown>> = [];
      let finished = false;
      const finish = (reason: string) => {
        if (finished) return;
        finished = true;
        logJson("[Safari TURN probe result]", {
          sourcePcId: id,
          reason,
          candidates: seenCandidates
        });
        probePc.close();
      };

      console.log("[Safari TURN probe start]", { sourcePcId: id });
      logJson("[Safari TURN probe config]", {
        sourcePcId: id,
        configuration: {
          iceTransportPolicy: configuration.iceTransportPolicy,
          iceServers: summarizeIceServers(configuration.iceServers)
        }
      });

      probePc.createDataChannel("turn-probe");
      probePc.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          finish("completed");
          return;
        }
        const candidateSummary = summarizeCandidate(event.candidate.candidate);
        seenCandidates.push(candidateSummary);
        logJson("[Safari TURN probe candidate]", { sourcePcId: id, ...candidateSummary });
      });
      probePc.addEventListener("icecandidateerror", (event: Event) => {
        const errorEvent = event as RTCPeerConnectionIceErrorEvent;
        logJson("[Safari TURN probe candidateerror]", {
          sourcePcId: id,
          address: errorEvent.address,
          port: errorEvent.port,
          url: errorEvent.url,
          errorCode: errorEvent.errorCode,
          errorText: errorEvent.errorText
        });
      });
      probePc
        .createOffer()
        .then((offer) => probePc.setLocalDescription(offer))
        .catch((error) => {
          logJson("[Safari TURN probe error]", {
            sourcePcId: id,
            error: error instanceof Error ? error.message : "unknown"
          });
          finish("offer-failed");
        });

      window.setTimeout(() => finish("timeout"), 6000);
    };

    const Wrapped = function (
      this: RTCPeerConnection,
      configuration?: RTCConfiguration,
      ...rest: unknown[]
    ) {
      const id = (probeWindow.__lkRtcProbeCounter = (probeWindow.__lkRtcProbeCounter ?? 0) + 1);
      const effectiveConfiguration: RTCConfiguration = {
        ...(configuration ?? {}),
        ...(forceRelay ? { iceTransportPolicy: "relay" } : {})
      };
      const configurationSummary = {
        iceTransportPolicy: effectiveConfiguration.iceTransportPolicy,
        bundlePolicy: configuration?.bundlePolicy,
        rtcpMuxPolicy: configuration?.rtcpMuxPolicy,
        iceServers: summarizeIceServers(effectiveConfiguration.iceServers)
      };
      console.log("[Safari RTC create]", {
        id,
        configuration: configurationSummary
      });
      logJson("[Safari RTC create json]", { id, configuration: configurationSummary });
      if (forceRelay && effectiveConfiguration.iceServers?.length) {
        runTurnProbe(effectiveConfiguration, id);
      }

      const pc = new Original(effectiveConfiguration, ...(rest as []));
      const originalSetConfiguration = pc.setConfiguration.bind(pc);
      pc.setConfiguration = (nextConfiguration: RTCConfiguration) => {
        const effectiveNextConfiguration: RTCConfiguration = {
          ...(nextConfiguration ?? {}),
          ...(forceRelay ? { iceTransportPolicy: "relay" } : {})
        };
        const nextConfigurationSummary = {
          iceTransportPolicy: effectiveNextConfiguration.iceTransportPolicy,
          bundlePolicy: effectiveNextConfiguration?.bundlePolicy,
          rtcpMuxPolicy: effectiveNextConfiguration?.rtcpMuxPolicy,
          iceServers: summarizeIceServers(effectiveNextConfiguration?.iceServers)
        };
        console.log("[Safari RTC setConfiguration]", {
          id,
          configuration: nextConfigurationSummary
        });
        logJson("[Safari RTC setConfiguration json]", { id, configuration: nextConfigurationSummary });
        return originalSetConfiguration(effectiveNextConfiguration);
      };

      pc.addEventListener("icegatheringstatechange", () => {
        console.log("[Safari RTC icegatheringstate]", { id, state: pc.iceGatheringState });
      });
      pc.addEventListener("iceconnectionstatechange", () => {
        console.log("[Safari RTC iceconnectionstate]", { id, state: pc.iceConnectionState });
      });
      pc.addEventListener("connectionstatechange", () => {
        console.log("[Safari RTC connectionstate]", { id, state: pc.connectionState });
      });
      pc.addEventListener("signalingstatechange", () => {
        console.log("[Safari RTC signalingstate]", { id, state: pc.signalingState });
      });
      pc.addEventListener("icecandidate", (event) => {
        if (!event.candidate) {
          console.log("[Safari RTC icecandidate]", { id, done: true });
          logJson("[Safari RTC icecandidate json]", { id, done: true });
          return;
        }
        const candidateSummary = {
          id,
          ...summarizeCandidate(event.candidate.candidate)
        };
        console.log("[Safari RTC icecandidate]", candidateSummary);
        logJson("[Safari RTC icecandidate json]", candidateSummary);
      });
      pc.addEventListener("icecandidateerror", (event: Event) => {
        const errorEvent = event as RTCPeerConnectionIceErrorEvent;
        const errorSummary = {
          id,
          address: errorEvent.address,
          port: errorEvent.port,
          url: errorEvent.url,
          errorCode: errorEvent.errorCode,
          errorText: errorEvent.errorText
        };
        console.warn("[Safari RTC icecandidateerror]", errorSummary);
        logJson("[Safari RTC icecandidateerror json]", errorSummary);
      });

      const statsTimer = window.setInterval(() => {
        void pc
          .getStats()
          .then((report) => {
            const interesting: Array<Record<string, unknown>> = [];
            report.forEach((stat) => {
              if (stat.type === "candidate-pair") {
                interesting.push({
                  type: stat.type,
                  state: "state" in stat ? stat.state : undefined,
                  nominated: "nominated" in stat ? stat.nominated : undefined,
                  selected: "selected" in stat ? stat.selected : undefined,
                  localCandidateId: "localCandidateId" in stat ? stat.localCandidateId : undefined,
                  remoteCandidateId: "remoteCandidateId" in stat ? stat.remoteCandidateId : undefined,
                  bytesSent: "bytesSent" in stat ? stat.bytesSent : undefined,
                  bytesReceived: "bytesReceived" in stat ? stat.bytesReceived : undefined
                });
              }
              if (stat.type === "local-candidate" || stat.type === "remote-candidate") {
                interesting.push({
                  type: stat.type,
                  candidateType: "candidateType" in stat ? stat.candidateType : undefined,
                  protocol: "protocol" in stat ? stat.protocol : undefined,
                  address: "address" in stat ? stat.address : undefined,
                  port: "port" in stat ? stat.port : undefined,
                  url: "url" in stat ? stat.url : undefined,
                  relayProtocol: "relayProtocol" in stat ? stat.relayProtocol : undefined
                });
              }
            });
            if (interesting.length > 0) {
              logJson("[Safari RTC stats json]", { id, stats: interesting });
            }
          })
          .catch(() => undefined);
      }, 3000);

      const stopStats = () => window.clearInterval(statsTimer);
      pc.addEventListener("connectionstatechange", () => {
        if (pc.connectionState === "connected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
          stopStats();
        }
      });
      pc.addEventListener("iceconnectionstatechange", () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") {
          stopStats();
        }
      });

      return pc;
    } as unknown as typeof RTCPeerConnection;

    Wrapped.prototype = Original.prototype;
    window.RTCPeerConnection = Wrapped;
  }

  probeWindow.__lkRtcProbeRefs = (probeWindow.__lkRtcProbeRefs ?? 0) + 1;

  return () => {
    probeWindow.__lkRtcProbeRefs = Math.max((probeWindow.__lkRtcProbeRefs ?? 1) - 1, 0);
    if (probeWindow.__lkRtcProbeRefs === 0 && probeWindow.__lkOriginalRTCPeerConnection) {
      window.RTCPeerConnection = probeWindow.__lkOriginalRTCPeerConnection;
    }
  };
}

function withSender(message: RealtimeMessage, senderId: string) {
  return { ...message, senderId };
}

function withoutSender(payload: unknown) {
  if (typeof payload !== "object" || !payload) return undefined;
  const { senderId: _senderId, ...message } = payload as RealtimeMessage & { senderId?: string };
  return message as RealtimeMessage;
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
  const safariRelay = isSafariBrowser();
  const removeSafariRtcProbe = installSafariRtcProbe(safariRelay);
  try {
    const { Room, RoomEvent, Track } = await import("livekit-client");
  if (safariRelay) {
    console.log("[LiveKit Safari transport]", { policy: "relay" });
  }
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    ...(safariRelay ? { rtcConfig: { iceTransportPolicy: "relay" } } : {})
  });
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let publishedCameraTrack: MediaStreamTrack | null = null;
  let publishedMicTrack: MediaStreamTrack | null = null;
  const publishedWallTracks = new Map<string, { video?: MediaStreamTrack; audio?: MediaStreamTrack }>();

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
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    input.onMessage(presenceFromParticipant(participant));
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
    input.onMessage(presenceFromParticipant(participant));
    participant.trackPublications.forEach((publication) => {
      if (publication.track) {
        handleRemoteTrack(publication.track, participant.identity, publication);
      }
    });
  });

    return {
      publish(message) {
        const reliable = message.type !== "avatar.state.v1";
        void room.localParticipant.publishData(encoder.encode(JSON.stringify(message)), { reliable });
      },
      syncParticipants() {
        room.remoteParticipants.forEach((participant) => {
          input.onMessage(presenceFromParticipant(participant));
        });
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
          await room.localParticipant.publishTrack(videoTrack, {
            name: publicationName,
            source: Track.Source.ScreenShare,
            stream: "wall-share",
            simulcast: true
          });
          record.video = videoTrack;
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
        if (publishedCameraTrack) {
          void room.localParticipant.unpublishTrack(publishedCameraTrack, false);
        }
        if (publishedMicTrack) {
          void room.localParticipant.unpublishTrack(publishedMicTrack, false);
        }
        for (const tracks of publishedWallTracks.values()) {
          if (tracks.video) void room.localParticipant.unpublishTrack(tracks.video, false);
          if (tracks.audio) void room.localParticipant.unpublishTrack(tracks.audio, false);
        }
        room.disconnect();
        removeSafariRtcProbe();
      }
    };
  } catch (error) {
    removeSafariRtcProbe();
    throw error;
  }
}

export async function createRealtimeClient(input: AdapterInput): Promise<RealtimeClient> {
  if (input.session.token.startsWith("dev-token")) {
    return createBroadcastClient(input);
  }

  try {
    logSessionDebug(input);
    return await createLiveKitClient(input);
  } catch (error) {
    input.onStatus("LiveKit connection failed; using local multi-tab realtime fallback.");
    return createBroadcastClient(input);
  }
}
