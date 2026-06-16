import { useCallback, useEffect, useRef, useState } from "react";
import type { RoomManifest, RoomSessionResponse, ViewMode } from "@3dspace/contracts";
import { heartbeatRoomSession, joinRoom, leaveRoomSession } from "../api";
import type { ApiIdentity } from "../identity";
import { normalizeRoomManifest } from "../manifest";

type UseRoomSessionInput = {
  identity: ApiIdentity;
  identityLoaded: boolean;
  authRequired: boolean;
  signedIn: boolean;
  roomId: string;
  inviteCode?: string | undefined;
  viewMode: ViewMode;
  onJoined?(session: RoomSessionResponse): void;
  onLeaveCleanup?(): void;
  onLeaveNavigate?(): void;
};

export function useRoomSession(input: UseRoomSessionInput) {
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [manifest, setManifest] = useState<RoomManifest | null>(null);
  const [status, setStatus] = useState("Connecting...");
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const joinGenerationRef = useRef(0);
  const identityRef = useRef(input.identity);
  identityRef.current = input.identity;
  const onJoinedRef = useRef(input.onJoined);
  onJoinedRef.current = input.onJoined;
  const onLeaveCleanupRef = useRef(input.onLeaveCleanup);
  onLeaveCleanupRef.current = input.onLeaveCleanup;
  const onLeaveNavigateRef = useRef(input.onLeaveNavigate);
  onLeaveNavigateRef.current = input.onLeaveNavigate;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const leaveForLobby = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setStatus("Leaving room...");
    const activeRoomId = sessionRef.current?.room.id ?? input.roomId;
    void leaveRoomSession(identityRef.current, activeRoomId).catch(() => undefined);
    onLeaveCleanupRef.current?.();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        onLeaveNavigateRef.current?.();
      });
    });
  }, [input.roomId, leaving]);

  useEffect(() => {
    if (!input.identityLoaded) return;
    if (input.authRequired && !input.signedIn) return;
    if (leaving) return;
    const generation = ++joinGenerationRef.current;
    setStatus("Joining room...");
    setError("");
    joinRoom(
      identityRef.current,
      input.roomId,
      input.inviteCode ? { viewMode: input.viewMode, inviteCode: input.inviteCode } : { viewMode: input.viewMode }
    )
      .then((nextSession) => {
        if (generation !== joinGenerationRef.current) return;
        const normalizedManifest = normalizeRoomManifest(nextSession.manifest, nextSession.room.type);
        const normalizedSession = { ...nextSession, manifest: normalizedManifest };
        onJoinedRef.current?.(normalizedSession);
        setSession(normalizedSession);
        setManifest(normalizedManifest);
        setStatus("Joined room. Connecting to LiveKit...");
      })
      .catch((err) => {
        if (generation !== joinGenerationRef.current) return;
        setError(err instanceof Error ? err.message : "Unable to join room.");
      });
    return () => {
      joinGenerationRef.current += 1;
    };
  }, [
    input.authRequired,
    input.identity.userId,
    input.identityLoaded,
    input.inviteCode,
    input.roomId,
    input.signedIn,
    input.viewMode,
    leaving
  ]);

  useEffect(() => {
    if (!session || leaving) return;
    const activeRoomId = session.room.id;
    const tick = () => {
      void heartbeatRoomSession(identityRef.current, activeRoomId).catch(() => undefined);
    };
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => {
      window.clearInterval(interval);
      void leaveRoomSession(identityRef.current, activeRoomId).catch(() => undefined);
    };
  }, [input.identity.userId, leaving, session]);

  return {
    session,
    setSession,
    manifest,
    setManifest,
    status,
    setStatus,
    error,
    setError,
    leaving,
    leaveForLobby
  };
}
