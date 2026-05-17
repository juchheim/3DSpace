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
    <div className="media-controls-compact" aria-label="Camera and microphone controls">
      <div className="cam-mini" aria-label={media.cameraEnabled ? "Camera preview" : "Camera off"}>
        {media.cameraStream ? <video ref={videoRef} muted autoPlay playsInline /> : null}
      </div>
      <div className="media-btn-col">
        <button
          className={`media-toggle${media.cameraEnabled ? " on" : ""}`}
          onClick={() => media.setCameraEnabled(!media.cameraEnabled)}
        >
          <span className={`media-dot${media.cameraEnabled ? " live" : ""}`} />
          {media.cameraEnabled ? "Cam on" : "Cam off"}
        </button>
        <button
          className={`media-toggle${media.microphoneEnabled ? " on" : ""}`}
          onClick={() => media.setMicrophoneEnabled(!media.microphoneEnabled)}
        >
          <span className={`media-dot${media.speaking ? " speaking" : media.microphoneEnabled ? " live" : ""}`} />
          {media.speaking ? "Speaking" : media.microphoneEnabled ? "Mic on" : "Mic off"}
        </button>
      </div>
    </div>
  );
}
