"use client";

import { useEffect, useRef } from "react";
import type { RoomManifest, SpatialAudioConfig, WallObject } from "@3dspace/contracts";
import { getWallAnchorAudioPosition } from "@3dspace/room-engine";
import type { ParticipantView } from "../components/RoomClient";

type SpatialNode = {
  source: MediaStreamAudioSourceNode;
  panner: PannerNode;
  gain: GainNode;
  stream: MediaStream;
};

export function useSpatialAudio(input: {
  participants: ParticipantView[];
  localParticipantId?: string | undefined;
  config?: SpatialAudioConfig | undefined;
  manifest?: RoomManifest | undefined;
  wallObjects?: WallObject[] | undefined;
  wallMediaStreams?: Record<string, { audioStream?: MediaStream | null | undefined }> | undefined;
}) {
  const contextRef = useRef<AudioContext | null>(null);
  const nodesRef = useRef(new Map<string, SpatialNode>());

  useEffect(() => {
    if (!input.config?.enabled) return;

    const resume = () => {
      void contextRef.current?.resume();
    };
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
    };
  }, [input.config?.enabled]);

  useEffect(() => {
    if (!input.config?.enabled || !input.localParticipantId) {
      nodesRef.current.forEach((node) => node.source.disconnect());
      nodesRef.current.clear();
      return;
    }

    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    contextRef.current ??= new AudioContextClass();
    const context = contextRef.current;
    const local = input.participants.find((participant) => participant.id === input.localParticipantId);
    if (!local) return;

    const wallMicAnchors = new Map<string, string>();
    for (const object of input.wallObjects ?? []) {
      if (object.type === "microphone.live" && object.status === "active" && object.source.kind === "livekit-track") {
        wallMicAnchors.set(object.source.participantId, object.wallAnchorId);
      }
    }

    const activeRemoteIds = new Set<string>();
    for (const participant of input.participants) {
      if (participant.id === input.localParticipantId || !participant.microphoneStream) continue;
      activeRemoteIds.add(participant.id);
      let node = nodesRef.current.get(participant.id);

      if (!node || node.stream !== participant.microphoneStream) {
        node?.source.disconnect();
        const source = context.createMediaStreamSource(participant.microphoneStream);
        const panner = context.createPanner();
        const gain = context.createGain();
        panner.panningModel = "HRTF";
        panner.distanceModel = input.config.distanceModel;
        panner.refDistance = input.config.refDistance;
        panner.maxDistance = input.config.maxDistance;
        panner.rolloffFactor = input.config.rolloffFactor;
        source.connect(panner).connect(gain).connect(context.destination);
        node = { source, panner, gain, stream: participant.microphoneStream };
        nodesRef.current.set(participant.id, node);
      }

      const wallAnchorId = wallMicAnchors.get(participant.id);
      const sourcePosition = wallAnchorId && input.manifest ? getWallAnchorAudioPosition(input.manifest, wallAnchorId) ?? participant.state.position : participant.state.position;
      const listenerPosition = local.state.position;
      context.listener.positionX.value = listenerPosition.x;
      context.listener.positionY.value = listenerPosition.y;
      context.listener.positionZ.value = listenerPosition.z;
      node.panner.positionX.value = sourcePosition.x;
      node.panner.positionY.value = sourcePosition.y;
      node.panner.positionZ.value = sourcePosition.z;
      node.gain.gain.value = participant.state.media?.microphoneEnabled ? 1 : 0;
    }

    for (const object of input.wallObjects ?? []) {
      const stream = input.wallMediaStreams?.[object.id]?.audioStream;
      if (!stream || object.status !== "active") continue;
      activeRemoteIds.add(`wall:${object.id}`);
      let node = nodesRef.current.get(`wall:${object.id}`);
      if (!node || node.stream !== stream) {
        node?.source.disconnect();
        const source = context.createMediaStreamSource(stream);
        const panner = context.createPanner();
        const gain = context.createGain();
        panner.panningModel = "HRTF";
        panner.distanceModel = input.config.distanceModel;
        panner.refDistance = input.config.refDistance;
        panner.maxDistance = input.config.maxDistance;
        panner.rolloffFactor = input.config.rolloffFactor;
        source.connect(panner).connect(gain).connect(context.destination);
        node = { source, panner, gain, stream };
        nodesRef.current.set(`wall:${object.id}`, node);
      }
      const sourcePosition = input.manifest ? getWallAnchorAudioPosition(input.manifest, object.wallAnchorId) : undefined;
      if (sourcePosition) {
        node.panner.positionX.value = sourcePosition.x;
        node.panner.positionY.value = sourcePosition.y;
        node.panner.positionZ.value = sourcePosition.z;
      }
      node.gain.gain.value = 1;
    }

    nodesRef.current.forEach((node, participantId) => {
      if (!activeRemoteIds.has(participantId)) {
        node.source.disconnect();
        nodesRef.current.delete(participantId);
      }
    });
  }, [input.participants, input.localParticipantId, input.config, input.manifest, input.wallObjects, input.wallMediaStreams]);

  useEffect(
    () => () => {
      nodesRef.current.forEach((node) => node.source.disconnect());
      nodesRef.current.clear();
      contextRef.current?.close().catch(() => undefined);
    },
    []
  );
}
