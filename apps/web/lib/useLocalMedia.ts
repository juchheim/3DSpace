"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type MediaDefaults = {
  defaultCameraEnabled: boolean;
  defaultMicEnabled: boolean;
  maxVideoWidth: number;
  maxVideoHeight: number;
  maxVideoFps: number;
};

function isLiveVideoStream(stream: MediaStream | null | undefined) {
  return stream?.getVideoTracks().some((track) => track.readyState === "live") ?? false;
}

function isLiveAudioStream(stream: MediaStream | null | undefined) {
  return stream?.getAudioTracks().some((track) => track.readyState === "live") ?? false;
}

const SPEAKING_DETECT_DELAY_MS = 1_200;
const SPEAKING_SAMPLE_MS = 280;

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
  const heldMicStreamRef = useRef<MediaStream | null>(null);
  const captureGenerationRef = useRef(0);
  const speakingIntervalRef = useRef<number | undefined>(undefined);
  const speakingScheduleRef = useRef<number | undefined>(undefined);
  const lastSpeakingRef = useRef(false);

  useEffect(() => {
    cameraStreamRef.current = cameraStream;
  }, [cameraStream]);

  useEffect(() => {
    micStreamRef.current = micStream;
  }, [micStream]);

  const videoConstraints = useCallback(
    () => ({
      width: { ideal: defaults?.maxVideoWidth ?? 640 },
      height: { ideal: defaults?.maxVideoHeight ?? 360 },
      frameRate: { ideal: defaults?.maxVideoFps ?? 15, max: defaults?.maxVideoFps ?? 15 }
    }),
    [defaults?.maxVideoFps, defaults?.maxVideoHeight, defaults?.maxVideoWidth]
  );

  useEffect(() => {
    let cancelled = false;
    const generation = ++captureGenerationRef.current;

    function stopVideoTracks() {
      cameraStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
    }

    function stopHeldAudioTracks() {
      heldMicStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
      heldMicStreamRef.current = null;
    }

    function setHeldMicEnabled(enabled: boolean) {
      heldMicStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = enabled;
      });
    }

    function clearSpeakingDetection() {
      if (speakingScheduleRef.current !== undefined) {
        window.clearTimeout(speakingScheduleRef.current);
        speakingScheduleRef.current = undefined;
      }
      if (speakingIntervalRef.current !== undefined) {
        window.clearInterval(speakingIntervalRef.current);
        speakingIntervalRef.current = undefined;
      }
      void audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      lastSpeakingRef.current = false;
      setSpeaking(false);
    }

    function startSpeakingDetection(stream: MediaStream) {
      clearSpeakingDetection();
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      audioContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      speakingIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(samples);
        const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
        const nextSpeaking = average > 16;
        if (nextSpeaking === lastSpeakingRef.current) return;
        lastSpeakingRef.current = nextSpeaking;
        setSpeaking(nextSpeaking);
      }, SPEAKING_SAMPLE_MS);
    }

    function scheduleSpeakingDetection(stream: MediaStream) {
      if (speakingScheduleRef.current !== undefined) {
        window.clearTimeout(speakingScheduleRef.current);
      }
      speakingScheduleRef.current = window.setTimeout(() => {
        speakingScheduleRef.current = undefined;
        if (cancelled || generation !== captureGenerationRef.current) return;
        if (micStreamRef.current !== stream) return;
        startSpeakingDetection(stream);
      }, SPEAKING_DETECT_DELAY_MS);
    }

    function publishMicFromHeld(enabled: boolean) {
      const held = heldMicStreamRef.current;
      if (enabled && held && isLiveAudioStream(held)) {
        setHeldMicEnabled(true);
        setMicStream(held);
        scheduleSpeakingDetection(held);
        return true;
      }
      setHeldMicEnabled(false);
      setMicStream(null);
      clearSpeakingDetection();
      return false;
    }

    function updatePermissionText(hasCamera: boolean, hasMic: boolean) {
      const messages: string[] = [];
      if (hasCamera) messages.push("Camera is available.");
      if (hasMic) messages.push("Microphone is available.");
      setPermissionText(messages.join(" ") || (hasCamera || hasMic ? "Media is available." : "Camera and microphone are off."));
    }

    function storeHeldAudio(audioTracks: MediaStreamTrack[], enabled: boolean) {
      stopHeldAudioTracks();
      if (audioTracks.length === 0) {
        return;
      }
      audioTracks.forEach((track) => {
        track.enabled = enabled;
      });
      heldMicStreamRef.current = new MediaStream(audioTracks);
    }

    async function updateMedia() {
      if (!cameraEnabled && !microphoneEnabled) {
        stopVideoTracks();
        stopHeldAudioTracks();
        clearSpeakingDetection();
        setCameraStream(null);
        setMicStream(null);
        setPermissionText("Camera and microphone are off.");
        return;
      }

      const keepCamera = isLiveVideoStream(cameraStreamRef.current);
      const keepMicPublished = isLiveAudioStream(micStreamRef.current) && microphoneEnabled;

      try {
        if (!cameraEnabled) {
          stopVideoTracks();
          setCameraStream(null);
        }

        if (cameraEnabled && microphoneEnabled && keepCamera) {
          if (publishMicFromHeld(true)) {
            updatePermissionText(true, true);
            return;
          }
        }

        if (cameraEnabled && !microphoneEnabled && keepCamera) {
          publishMicFromHeld(false);
          updatePermissionText(true, false);
          return;
        }

        if (!cameraEnabled && microphoneEnabled && keepMicPublished) {
          updatePermissionText(false, true);
          return;
        }

        if (cameraEnabled && microphoneEnabled && keepMicPublished && !keepCamera) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
          if (cancelled || generation !== captureGenerationRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          stopVideoTracks();
          const nextCamera = stream.getVideoTracks().length > 0 ? new MediaStream(stream.getVideoTracks()) : null;
          setCameraStream(nextCamera);
          publishMicFromHeld(true);
          updatePermissionText(Boolean(nextCamera), true);
          return;
        }

        if (!cameraEnabled && microphoneEnabled) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
          if (cancelled || generation !== captureGenerationRef.current) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          stopHeldAudioTracks();
          const audioTracks = stream.getAudioTracks();
          storeHeldAudio(audioTracks, true);
          setMicStream(heldMicStreamRef.current);
          if (heldMicStreamRef.current) scheduleSpeakingDetection(heldMicStreamRef.current);
          updatePermissionText(false, audioTracks.length > 0);
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraEnabled ? videoConstraints() : false,
          audio: cameraEnabled || microphoneEnabled
        });
        if (cancelled || generation !== captureGenerationRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        if (cameraEnabled) {
          stopVideoTracks();
          const videoTracks = stream.getVideoTracks();
          setCameraStream(videoTracks.length > 0 ? new MediaStream(videoTracks) : null);
          storeHeldAudio(stream.getAudioTracks(), microphoneEnabled);
        } else {
          stopHeldAudioTracks();
          storeHeldAudio(stream.getAudioTracks(), microphoneEnabled);
        }

        if (microphoneEnabled && heldMicStreamRef.current) {
          setMicStream(heldMicStreamRef.current);
          scheduleSpeakingDetection(heldMicStreamRef.current);
        } else {
          publishMicFromHeld(false);
        }

        updatePermissionText(
          Boolean(cameraEnabled && stream.getVideoTracks().length > 0),
          Boolean(microphoneEnabled && stream.getAudioTracks().length > 0)
        );
      } catch {
        if (cancelled || generation !== captureGenerationRef.current) return;
        if (cameraEnabled) setCameraEnabled(false);
        if (microphoneEnabled) setMicrophoneEnabled(false);
        setPermissionText("Camera or microphone permission was denied or unavailable.");
      }
    }

    void updateMedia();
    return () => {
      cancelled = true;
    };
  }, [cameraEnabled, microphoneEnabled, videoConstraints]);

  useEffect(
    () => () => {
      if (speakingScheduleRef.current !== undefined) window.clearTimeout(speakingScheduleRef.current);
      if (speakingIntervalRef.current !== undefined) window.clearInterval(speakingIntervalRef.current);
      void audioContextRef.current?.close().catch(() => undefined);
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      heldMicStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    []
  );

  const waitForCameraStream = useCallback(async (timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const stream = cameraStreamRef.current;
      const track = stream?.getVideoTracks()[0];
      if (track?.readyState === "live") return stream;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return cameraStreamRef.current;
  }, []);

  const release = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    heldMicStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    heldMicStreamRef.current = null;
    micStreamRef.current = null;
    setCameraStream(null);
    setMicStream(null);
    setCameraEnabled(false);
    setMicrophoneEnabled(false);
    setSpeaking(false);
    lastSpeakingRef.current = false;
    if (speakingScheduleRef.current !== undefined) window.clearTimeout(speakingScheduleRef.current);
    if (speakingIntervalRef.current !== undefined) window.clearInterval(speakingIntervalRef.current);
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
    waitForCameraStream,
    release
  };
}
