"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MediaDefaults = {
  defaultCameraEnabled: boolean;
  defaultMicEnabled: boolean;
  maxVideoWidth: number;
  maxVideoHeight: number;
  maxVideoFps: number;
};

export function useLocalMedia(defaults?: MediaDefaults) {
  const [cameraEnabled, setCameraEnabled] = useState(defaults?.defaultCameraEnabled ?? false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(defaults?.defaultMicEnabled ?? false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [permissionText, setPermissionText] = useState("Camera and microphone are off.");
  const audioContextRef = useRef<AudioContext | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    micStreamRef.current = micStream;
  }, [micStream]);

  useEffect(() => {
    let cancelled = false;

    async function updateCamera() {
      if (!cameraEnabled) {
        cameraStream?.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: defaults?.maxVideoWidth ?? 640 },
            height: { ideal: defaults?.maxVideoHeight ?? 360 },
            frameRate: { ideal: defaults?.maxVideoFps ?? 15, max: defaults?.maxVideoFps ?? 15 }
          },
          audio: false
        });
        if (!cancelled) {
          setCameraStream(stream);
          setPermissionText("Camera is available.");
        }
      } catch {
        if (!cancelled) {
          setCameraEnabled(false);
          setPermissionText("Camera permission was denied or unavailable.");
        }
      }
    }

    void updateCamera();
    return () => {
      cancelled = true;
    };
  }, [cameraEnabled]);

  useEffect(() => {
    let cancelled = false;
    let interval: number | undefined;

    async function updateMic() {
      if (!microphoneEnabled) {
        micStream?.getTracks().forEach((track) => track.stop());
        setMicStream(null);
        setSpeaking(false);
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (cancelled) return;
        setMicStream(stream);
        setPermissionText("Microphone is available.");

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const context = new AudioContextClass();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Uint8Array(analyser.frequencyBinCount);
        interval = window.setInterval(() => {
          analyser.getByteFrequencyData(samples);
          const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
          setSpeaking(average > 16);
        }, 160);
      } catch {
        if (!cancelled) {
          setMicrophoneEnabled(false);
          setPermissionText("Microphone permission was denied or unavailable.");
        }
      }
    }

    void updateMic();
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [microphoneEnabled]);

  useEffect(
    () => () => {
      cameraStream?.getTracks().forEach((track) => track.stop());
      micStream?.getTracks().forEach((track) => track.stop());
    },
    [cameraStream, micStream]
  );

  const release = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    micStreamRef.current = null;
    setCameraStream(null);
    setMicStream(null);
    setCameraEnabled(false);
    setMicrophoneEnabled(false);
    setSpeaking(false);
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, []);

  return {
    cameraEnabled,
    microphoneEnabled,
    speaking,
    cameraStream,
    micStream,
    permissionText,
    setCameraEnabled,
    setMicrophoneEnabled,
    release
  };
}
