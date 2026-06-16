// @vitest-environment happy-dom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultRoomManifest } from "@3dspace/room-engine";
import * as api from "../lib/api";
import { useRoomSession } from "../lib/room/useRoomSession";

vi.mock("../lib/api", () => ({
  joinRoom: vi.fn(),
  heartbeatRoomSession: vi.fn(),
  leaveRoomSession: vi.fn()
}));

const identity = {
  userId: "teacher-1",
  displayName: "Ms. Rivera",
  role: "teacher" as const
};

function buildSession() {
  return {
    participantId: "local-participant",
    role: "teacher",
    room: {
      id: "room-1",
      classId: "class-1",
      name: "Physics Lab",
      type: "classroom",
      activeManifestVersion: 1,
      settings: {
        maxParticipants: 30,
        defaultViewMode: "3d",
        defaultQuality: "low",
        enable2DAnalog: true,
        enableWallAttachments: true
      },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    manifest: createDefaultRoomManifest({ roomId: "room-1" }),
    tuning: {
      media: {},
      avatarSendHz: 10,
      spatialAudio: {}
    }
  } as any;
}

describe("useRoomSession", () => {
  beforeEach(() => {
    vi.mocked(api.joinRoom).mockResolvedValue(buildSession());
    vi.mocked(api.heartbeatRoomSession).mockResolvedValue({ ok: true });
    vi.mocked(api.leaveRoomSession).mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("joins once identity is ready and reports normalized session state", async () => {
    const onJoined = vi.fn();
    const { result } = renderHook(() =>
      useRoomSession({
        identity,
        identityLoaded: true,
        authRequired: false,
        signedIn: true,
        roomId: "room-1",
        viewMode: "3d",
        onJoined
      })
    );

    await waitFor(() => {
      expect(api.joinRoom).toHaveBeenCalledWith(identity, "room-1", { viewMode: "3d" });
    });

    await waitFor(() => {
      expect(result.current.session?.room.id).toBe("room-1");
      expect(result.current.manifest?.roomId).toBe("room-1");
      expect(result.current.status).toBe("Joined room. Connecting to LiveKit...");
    });
    expect(onJoined).toHaveBeenCalledTimes(1);
  });

  it("does not join when auth is required and the user is signed out", () => {
    renderHook(() =>
      useRoomSession({
        identity,
        identityLoaded: true,
        authRequired: true,
        signedIn: false,
        roomId: "room-1",
        viewMode: "3d"
      })
    );

    expect(api.joinRoom).not.toHaveBeenCalled();
  });

  it("does not rejoin when the onJoined callback identity changes", async () => {
    const { rerender } = renderHook(
      ({ onJoined }) =>
        useRoomSession({
          identity,
          identityLoaded: true,
          authRequired: false,
          signedIn: true,
          roomId: "room-1",
          viewMode: "3d",
          onJoined
        }),
      { initialProps: { onJoined: vi.fn() } }
    );

    await waitFor(() => {
      expect(api.joinRoom).toHaveBeenCalledTimes(1);
    });

    rerender({ onJoined: vi.fn() });
    rerender({ onJoined: vi.fn() });

    expect(api.joinRoom).toHaveBeenCalledTimes(1);
  });

  it("starts heartbeat for an active session and leaves the room on cleanup", async () => {
    const { unmount } = renderHook(() =>
      useRoomSession({
        identity,
        identityLoaded: true,
        authRequired: false,
        signedIn: true,
        roomId: "room-1",
        viewMode: "3d"
      })
    );

    await waitFor(() => {
      expect(api.heartbeatRoomSession).toHaveBeenCalledWith(identity, "room-1");
    });

    unmount();

    expect(api.leaveRoomSession).toHaveBeenCalledWith(identity, "room-1");
  });

  it("owns leaving state and runs leave callbacks through leaveForLobby", async () => {
    const onLeaveCleanup = vi.fn();
    const onLeaveNavigate = vi.fn();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });

    const { result } = renderHook(() =>
      useRoomSession({
        identity,
        identityLoaded: true,
        authRequired: false,
        signedIn: true,
        roomId: "room-1",
        viewMode: "3d",
        onLeaveCleanup,
        onLeaveNavigate
      })
    );

    await waitFor(() => {
      expect(result.current.session?.room.id).toBe("room-1");
    });

    act(() => {
      result.current.leaveForLobby();
    });

    expect(result.current.leaving).toBe(true);
    expect(result.current.status).toBe("Leaving room...");
    expect(api.leaveRoomSession).toHaveBeenCalledWith(identity, "room-1");
    expect(onLeaveCleanup).toHaveBeenCalledTimes(1);
    expect(onLeaveNavigate).toHaveBeenCalledTimes(1);
  });
});
