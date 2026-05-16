"use client";

const LOBBY_FALLBACK_MS = 2_000;

export function navigateToLobby(router: { push: (href: string) => void }) {
  router.push("/");
  window.setTimeout(() => {
    if (window.location.pathname.startsWith("/rooms/")) {
      window.location.replace("/");
    }
  }, LOBBY_FALLBACK_MS);
}
