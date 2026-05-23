/**
 * Non-React ambient audio loop helper.
 *
 * - One HTMLAudioElement per `startAmbient` call (SkinLayer ensures only one
 *   plays at a time via effect cleanup).
 * - Routes through a shared AudioContext when available for smooth gain ramps;
 *   falls back to HTMLAudioElement.volume on browsers without Web Audio.
 * - All audio is fail-open: errors are swallowed so skin load never blocks the room.
 */

export type AmbientHandle = {
  stop: () => void;
  setGain: (gain: number) => void;
};

// Module-level shared AudioContext (one per page; created on first call).
let sharedCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!sharedCtx) {
    try {
      sharedCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  return sharedCtx;
}

const FADE_OUT_S = 0.4;
const FADE_OUT_BUFFER_MS = 450;

export function startAmbient({ url, gain }: { url: string; gain: number }): AmbientHandle {
  if (typeof window === "undefined") {
    return { stop: () => undefined, setGain: () => undefined };
  }

  const audio = new Audio();
  audio.loop = true;
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";

  const ctx = getAudioCtx();
  let gainNode: GainNode | null = null;
  let source: MediaElementAudioSourceNode | null = null;
  let stopped = false;

  if (ctx) {
    try {
      gainNode = ctx.createGain();
      gainNode.gain.value = Math.max(0, Math.min(1, gain));
      source = ctx.createMediaElementSource(audio);
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      void ctx.resume().catch(() => undefined);
    } catch {
      // Web Audio setup failed — fall through to volume-only mode
      gainNode = null;
      source = null;
    }
  }

  if (!gainNode) {
    audio.volume = Math.max(0, Math.min(1, gain));
  }

  audio.src = url;
  audio.play().catch(() => undefined);

  return {
    stop() {
      if (stopped) return;
      stopped = true;

      if (gainNode && ctx) {
        try {
          gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + FADE_OUT_S);
        } catch {
          // ignore
        }
        setTimeout(() => {
          audio.pause();
          audio.src = "";
          try { source?.disconnect(); } catch { /* ignore */ }
          try { gainNode?.disconnect(); } catch { /* ignore */ }
        }, FADE_OUT_BUFFER_MS);
      } else {
        audio.pause();
        audio.src = "";
      }
    },

    setGain(newGain: number) {
      if (stopped) return;
      const clamped = Math.max(0, Math.min(1, newGain));
      if (gainNode && ctx) {
        try {
          gainNode.gain.setTargetAtTime(clamped, ctx.currentTime, 0.1);
        } catch { /* ignore */ }
      } else {
        audio.volume = clamped;
      }
    }
  };
}
