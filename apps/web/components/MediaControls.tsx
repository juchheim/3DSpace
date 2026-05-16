"use client";

import { useEffect, useRef } from "react";

type MediaControlsProps = {
  media: {
    cameraEnabled: boolean;
    microphoneEnabled: boolean;
    speaking: boolean;
    cameraStream: MediaStream | null;
    setCameraEnabled(value: boolean): void;
    setMicrophoneEnabled(value: boolean): void;
  };
};

export function MediaControls({ media }: MediaControlsProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = media.cameraStream;
    }
  }, [media.cameraStream]);

  return (
    <section className="stack" aria-label="Camera and microphone controls">
      <strong>Media</strong>
      <div className="video-preview" aria-label={media.cameraEnabled ? "Local camera preview" : "Camera preview off"}>
        {media.cameraStream ? <video ref={videoRef} muted autoPlay playsInline /> : null}
      </div>
      <button className={media.cameraEnabled ? "secondary" : undefined} onClick={() => media.setCameraEnabled(!media.cameraEnabled)}>
        {media.cameraEnabled ? "Turn camera off" : "Turn camera on"}
      </button>
      <button className={media.microphoneEnabled ? "secondary" : undefined} onClick={() => media.setMicrophoneEnabled(!media.microphoneEnabled)}>
        {media.microphoneEnabled ? "Mute microphone" : "Turn microphone on"}
      </button>
      <span className="status-pill">
        <span className="status-dot" />
        {media.speaking ? "Speaking" : media.microphoneEnabled ? "Mic live" : "Mic off"}
      </span>
    </section>
  );
}
