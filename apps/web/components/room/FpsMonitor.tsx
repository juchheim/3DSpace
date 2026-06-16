import { useEffect, useRef, useState } from "react";

function useFps(sampleMs = 500) {
  const [fps, setFps] = useState<number | null>(null);
  const rafRef = useRef<number>(0);
  const frameCountRef = useRef(0);
  const lastSampleRef = useRef(performance.now());

  useEffect(() => {
    let alive = true;

    function tick() {
      if (!alive) return;
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastSampleRef.current;
      if (elapsed >= sampleMs) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastSampleRef.current = now;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [sampleMs]);

  return fps;
}

export function FpsMonitor() {
  const fps = useFps();
  if (fps === null) return null;

  const tier = fps >= 50 ? "good" : fps >= 30 ? "ok" : "bad";
  return (
    <span className={`room-hud-fps room-hud-fps--${tier}`} aria-label={`${fps} frames per second`}>
      {fps} fps
    </span>
  );
}
