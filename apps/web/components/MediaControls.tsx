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
  canUseCamera?: boolean;
  canUseMicrophone?: boolean;
};

export function MediaControls({ media, canUseCamera = true, canUseMicrophone = true }: MediaControlsProps) {
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
          disabled={!canUseCamera}
          title={canUseCamera ? undefined : "Camera disabled by teacher"}
          onClick={() => media.setCameraEnabled(!media.cameraEnabled)}
        >
          <span className={`media-dot${media.cameraEnabled ? " live" : ""}`} />
          {media.cameraEnabled ? "Cam on" : "Cam off"}
        </button>
        <button
          className={`media-toggle${media.microphoneEnabled ? " on" : ""}`}
          disabled={!canUseMicrophone}
          title={canUseMicrophone ? undefined : "Microphone disabled by teacher"}
          onClick={() => media.setMicrophoneEnabled(!media.microphoneEnabled)}
        >
          <span className={`media-dot${media.speaking ? " speaking" : media.microphoneEnabled ? " live" : ""}`} />
          {media.speaking ? "Speaking" : media.microphoneEnabled ? "Mic on" : "Mic off"}
        </button>
      </div>
    </div>
  );
}
