"use client";

import { useCallback, useEffect, useState } from "react";

export function useDisplayMedia() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    setStream((current) => {
      current?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const start = useCallback(async () => {
    setError("");
    if (!navigator.mediaDevices?.getDisplayMedia) {
      const message = "Screen sharing is not available in this browser.";
      setError(message);
      throw new Error(message);
    }
    try {
      const nextStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 15, max: 30 }
        },
        audio: true
      });
      setStream(nextStream);
      nextStream.getTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          setStream((current) => (current === nextStream ? null : current));
        });
      });
      return nextStream;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to start screen sharing.";
      setError(message);
      throw err;
    }
  }, []);

  useEffect(() => stop, [stop]);

  return {
    stream,
    sharing: Boolean(stream),
    error,
    start,
    stop
  };
}
