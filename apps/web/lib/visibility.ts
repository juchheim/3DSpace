"use client";

import { useEffect, useRef, useState } from "react";

/** True while the browser tab/window is foregrounded (Page Visibility API). */
export function useDocumentVisible() {
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible"
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible;
}

export type UseInViewOptions = {
  /** Fraction of the target that must be visible (0–1). */
  threshold?: number;
  rootMargin?: string;
};

/**
 * Observes whether a DOM node intersects the viewport. Used to avoid mounting
 * Hyperbeam embeds for off-screen 2D map boards (participant-minute billing).
 */
export function useInView(options: UseInViewOptions = {}) {
  const { threshold = 0.08, rootMargin = "0px" } = options;
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) setInView(entry.isIntersecting);
      },
      { threshold, rootMargin }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  return { ref, inView };
}
