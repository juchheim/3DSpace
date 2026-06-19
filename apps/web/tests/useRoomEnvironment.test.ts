// @vitest-environment happy-dom

import type { RoomEnvironment } from "@3dspace/contracts";
import { defaultRoomEnvironment } from "@3dspace/contracts";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { useRoomEnvironment } from "../lib/useRoomEnvironment";

vi.mock("../lib/api", () => ({
  getRoomEnvironment: vi.fn(),
  setRoomEnvironment: vi.fn()
}));

const identity = {
  userId: "teacher-a",
  displayName: "Teacher A",
  role: "teacher" as const
};

const baseEnvironment: RoomEnvironment = {
  ...defaultRoomEnvironment(),
  enabled: true
};

describe("useRoomEnvironment", () => {
  beforeEach(() => {
    vi.mocked(api.getRoomEnvironment).mockResolvedValue({ environment: baseEnvironment });
    vi.mocked(api.setRoomEnvironment).mockReset();
  });

  it("keeps the latest slider commit when environment commits resolve out of order", async () => {
    const pending: Array<{
      resolve: (value: Awaited<ReturnType<typeof api.setRoomEnvironment>>) => void;
      patch: Partial<RoomEnvironment>;
    }> = [];
    vi.mocked(api.setRoomEnvironment).mockImplementation((_identity, _roomId, patch) => (
      new Promise((resolve) => pending.push({ resolve, patch }))
    ));

    const { result } = renderHook(() =>
      useRoomEnvironment({
        identity,
        roomId: "room-1",
        publish: vi.fn()
      })
    );

    await waitFor(() => {
      expect(result.current.environment.exposure.exposure).toBe(1);
    });

    let firstCommit!: Promise<void>;
    let secondCommit!: Promise<void>;
    act(() => {
      firstCommit = result.current.updateEnvironment(
        { exposure: { ...result.current.environment.exposure, exposure: 1.5 } },
        { commit: true }
      );
      secondCommit = result.current.updateEnvironment(
        { exposure: { ...result.current.environment.exposure, exposure: 2 } },
        { commit: true }
      );
    });

    expect(result.current.environment.exposure.exposure).toBe(2);
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[0]!.resolve({
        environment: { ...baseEnvironment, ...pending[0]!.patch },
        realtimeMessages: []
      });
      await firstCommit;
    });

    expect(result.current.environment.exposure.exposure).toBe(2);

    await act(async () => {
      pending[1]!.resolve({
        environment: { ...baseEnvironment, ...pending[1]!.patch },
        realtimeMessages: []
      });
      await secondCommit;
    });

    expect(result.current.environment.exposure.exposure).toBe(2);
  });

  it("keeps a local slider preview when an older commit resolves during the next drag", async () => {
    let resolveCommit!: (value: Awaited<ReturnType<typeof api.setRoomEnvironment>>) => void;
    vi.mocked(api.setRoomEnvironment).mockReturnValue(
      new Promise((resolve) => {
        resolveCommit = resolve;
      })
    );

    const { result } = renderHook(() =>
      useRoomEnvironment({
        identity,
        roomId: "room-1"
      })
    );

    await waitFor(() => {
      expect(result.current.environment.exposure.exposure).toBe(1);
    });

    let commitPromise!: Promise<void>;
    act(() => {
      commitPromise = result.current.updateEnvironment(
        { exposure: { ...result.current.environment.exposure, exposure: 1.5 } },
        { commit: true }
      );
    });
    expect(result.current.environment.exposure.exposure).toBe(1.5);

    act(() => {
      void result.current.updateEnvironment(
        { exposure: { ...result.current.environment.exposure, exposure: 2 } },
        { commit: false }
      );
    });
    expect(result.current.environment.exposure.exposure).toBe(2);

    await act(async () => {
      resolveCommit({
        environment: { ...baseEnvironment, exposure: { ...baseEnvironment.exposure, exposure: 1.5 } },
        realtimeMessages: []
      });
      await commitPromise;
    });

    expect(result.current.environment.exposure.exposure).toBe(2);
  });

  it("keeps local edits when the initial environment load resolves after editing starts", async () => {
    let resolveLoad!: (value: Awaited<ReturnType<typeof api.getRoomEnvironment>>) => void;
    vi.mocked(api.getRoomEnvironment).mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );

    const { result } = renderHook(() =>
      useRoomEnvironment({
        identity,
        roomId: "room-1"
      })
    );

    act(() => {
      void result.current.updateEnvironment(
        { exposure: { ...result.current.environment.exposure, exposure: 2 } },
        { commit: false }
      );
    });
    expect(result.current.environment.exposure.exposure).toBe(2);

    await act(async () => {
      resolveLoad({
        environment: { ...baseEnvironment, exposure: { ...baseEnvironment.exposure, exposure: 1.25 } }
      });
    });

    expect(result.current.environment.exposure.exposure).toBe(2);
  });

  it("ignores realtime environment echoes sent by the current user", async () => {
    const { result } = renderHook(() =>
      useRoomEnvironment({
        identity,
        roomId: "room-1"
      })
    );

    await waitFor(() => {
      expect(result.current.environment.enabled).toBe(true);
    });

    act(() => {
      const handled = result.current.handleRealtimeMessage({
        type: "room.lighting.environment.v1",
        roomId: "room-1",
        environment: { ...baseEnvironment, enabled: false },
        sentAt: Date.now(),
        senderId: identity.userId
      });
      expect(handled).toBe(true);
    });

    expect(result.current.environment.enabled).toBe(true);
  });
});
