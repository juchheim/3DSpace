"use client";

import { useEffect, useState } from "react";
import type { ApiIdentity } from "../../lib/identity";
import { API_URL, CLIENT_TUNING } from "../../lib/config";
import { identityHeaders } from "../../lib/identity";

async function authHeaders(identity: ApiIdentity) {
  const headers: Record<string, string> = {
    ...identityHeaders(identity)
  };
  const token = await identity.getAuthToken?.();
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

export function useSharedBrowserVideo(input: {
  identity: ApiIdentity;
  roomId: string;
  objectId: string;
  enabled: boolean;
}) {
  const [jpegUrl, setJpegUrl] = useState<string | null>(null);
  const [jpegLoading, setJpegLoading] = useState(false);

  useEffect(() => {
    if (!input.enabled) {
      setJpegLoading(false);
      setJpegUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    let latestObjectUrl: string | null = null;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      timeoutId = window.setTimeout(() => {
        void poll();
      }, delayMs);
    };

    const poll = async () => {
      if (cancelled) return;
      setJpegLoading(true);
      try {
        const response = await fetch(
          `${API_URL}/v1/rooms/${input.roomId}/wall-objects/${input.objectId}/shared-browser/frame.jpg`,
          { headers: await authHeaders(input.identity), cache: "no-store" }
        );
        if (!response.ok) {
          schedule(1000);
          return;
        }
        const blob = await response.blob();
        if (cancelled) return;
        const nextObjectUrl = URL.createObjectURL(blob);
        setJpegUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          latestObjectUrl = nextObjectUrl;
          return nextObjectUrl;
        });
        setJpegLoading(false);
        schedule(Math.max(80, Math.round(1000 / CLIENT_TUNING.sharedBrowserJpegFps)));
      } catch {
        if (!cancelled) {
          setJpegLoading(false);
          schedule(1000);
        }
      }
    };

    void poll();

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (latestObjectUrl) URL.revokeObjectURL(latestObjectUrl);
    };
  }, [input.enabled, input.identity, input.objectId, input.roomId]);

  return { jpegUrl, jpegLoading };
}
