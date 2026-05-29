import type { HyperbeamEmbed } from "@hyperbeam/web";

type HyperbeamOptions = {
  delegateKeyboard?: boolean;
  disableInput?: boolean;
  playoutDelay?: boolean;
  volume?: number;
  frameCb?: (frame: ImageBitmap | HTMLVideoElement) => void;
  videoTrackCb?: (track: MediaStreamTrack) => void;
  audioTrackCb?: (track: MediaStreamTrack) => void;
  onConnectionStateChange?: (event: { state: string }) => void;
  onDisconnect?: (event: { type: string }) => void;
  onCloseWarning?: (event: { deadline?: { delay?: number } }) => void;
};

function paintMockFrame(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#14202c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#8ab4ff";
  ctx.font = "14px sans-serif";
  ctx.fillText("E2E Hyperbeam mock", 16, 40);
}

function attachMockVideoTrack(video: HTMLVideoElement, onTrack?: (track: MediaStreamTrack) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  paintMockFrame(canvas);
  const stream = canvas.captureStream(10);
  const [track] = stream.getVideoTracks();
  if (!track) return;
  video.srcObject = new MediaStream([track]);
  void video.play().catch(() => undefined);
  onTrack?.(track);
}

/** Playwright-only stand-in for `@hyperbeam/web` (see `NEXT_PUBLIC_E2E_MOCK_HYPERBEAM_EMBED`). */
export default async function mockHyperbeamEmbed(
  container: HTMLDivElement,
  _embedUrl: string,
  options: HyperbeamOptions = {}
): Promise<HyperbeamEmbed> {
  container.replaceChildren();

  const video = document.createElement("video");
  video.setAttribute("data-testid", "hyperbeam-mock-video");
  video.setAttribute("playsinline", "");
  video.muted = true;
  video.style.width = "100%";
  video.style.height = "100%";
  video.style.background = "#101820";
  container.appendChild(video);

  const playAudio = document.createElement("button");
  playAudio.type = "button";
  playAudio.setAttribute("data-testid", "hyperbeam-mock-play-audio");
  playAudio.textContent = "Play audio";
  playAudio.className = "hyperbeam-mock-play-audio";
  playAudio.style.position = "absolute";
  playAudio.style.right = "0.5rem";
  playAudio.style.top = "0.5rem";
  playAudio.style.zIndex = "3";
  container.appendChild(playAudio);

  playAudio.addEventListener("click", () => {
    playAudio.remove();
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.frequency.value = 0;
    osc.connect(dest);
    osc.start();
    const [track] = dest.stream.getAudioTracks();
    if (track) options.audioTrackCb?.(track);
  });

  attachMockVideoTrack(video, options.videoTrackCb);

  let frameTimer: number | undefined;
  if (options.frameCb) {
    frameTimer = window.setInterval(() => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        options.frameCb?.(video);
      }
    }, 120);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      options.frameCb(video);
    }
  }

  options.onConnectionStateChange?.({ state: "playing" });

  const instance = {
    volume: options.volume ?? 1,
    delegateKeyboard: options.delegateKeyboard ?? false,
    disableInput: options.disableInput ?? true,
    maxArea: 1280 * 720,
    async resize(_width: number, _height: number) {},
    destroy() {
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
      container.replaceChildren();
    }
  } as unknown as HyperbeamEmbed;

  return instance;
}
