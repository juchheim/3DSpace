"use client";

import { useEffect, useRef } from "react";
import type { SpatialAudioConfig } from "@3dspace/contracts";
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

      const sourcePosition = participant.state.position;
      const listenerPosition = local.state.position;
      context.listener.positionX.value = listenerPosition.x;
      context.listener.positionY.value = listenerPosition.y;
      context.listener.positionZ.value = listenerPosition.z;
      node.panner.positionX.value = sourcePosition.x;
      node.panner.positionY.value = sourcePosition.y;
      node.panner.positionZ.value = sourcePosition.z;
      node.gain.gain.value = participant.state.media?.microphoneEnabled ? 1 : 0;
    }

    nodesRef.current.forEach((node, participantId) => {
      if (!activeRemoteIds.has(participantId)) {
        node.source.disconnect();
        nodesRef.current.delete(participantId);
      }
    });
  }, [input.participants, input.localParticipantId, input.config]);

  useEffect(
    () => () => {
      nodesRef.current.forEach((node) => node.source.disconnect());
      nodesRef.current.clear();
      contextRef.current?.close().catch(() => undefined);
    },
    []
  );
}
