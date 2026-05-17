export function videoTrackHasDimensions(track: MediaStreamTrack): boolean {
  const { width, height } = track.getSettings();
  return typeof width === "number" && width > 0 && typeof height === "number" && height > 0;
}

export async function waitForVideoTrackDimensions(track: MediaStreamTrack, timeoutMs = 8_000): Promise<void> {
  if (track.kind !== "video") return;
  if (videoTrackHasDimensions(track)) return;
  if (track.readyState === "ended") {
    throw new Error("Video track ended before dimensions were available.");
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      if (videoTrackHasDimensions(track)) {
        resolve();
        return;
      }
      reject(new Error("Timed out waiting for video track dimensions."));
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      track.removeEventListener("unmute", onReady);
    };

    const onReady = () => {
      if (videoTrackHasDimensions(track)) {
        cleanup();
        resolve();
      }
    };

    track.addEventListener("unmute", onReady);
    onReady();
  });
}
