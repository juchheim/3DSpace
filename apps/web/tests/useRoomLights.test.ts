// @vitest-environment happy-dom

import type { RoomLight } from "@3dspace/contracts";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { useRoomLights } from "../lib/useRoomLights";

vi.mock("../lib/api", () => ({
  listRoomLights: vi.fn(),
  createRoomLight: vi.fn(),
  updateRoomLight: vi.fn(),
  deleteRoomLight: vi.fn()
}));

const identity = {
  userId: "teacher-a",
  displayName: "Teacher A",
  role: "teacher" as const
};

const baseLight: RoomLight = {
  id: "light-1",
  roomId: "room-1",
  type: "spot",
  enabled: true,
  position: { x: 1, y: 2, z: 1 },
  target: { x: 1, y: 0, z: -1 },
  color: "#ffffff",
  intensity: 3,
  castShadow: false,
  angleDeg: 30,
  createdByUserId: "teacher-a",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z"
};

describe("useRoomLights", () => {
  beforeEach(() => {
    vi.mocked(api.listRoomLights).mockResolvedValue([baseLight]);
    vi.mocked(api.createRoomLight).mockReset();
    vi.mocked(api.updateRoomLight).mockReset();
    vi.mocked(api.deleteRoomLight).mockReset();
  });

  it("keeps the latest position when repeated commits resolve out of order", async () => {
    const pending: Array<{
      resolve: (value: Awaited<ReturnType<typeof api.updateRoomLight>>) => void;
      patch: Parameters<typeof api.updateRoomLight>[3];
    }> = [];
    vi.mocked(api.updateRoomLight).mockImplementation((_identity, _roomId, _lightId, patch) => (
      new Promise((resolve) => pending.push({ resolve, patch }))
    ));

    const { result } = renderHook(() =>
      useRoomLights({
        identity,
        roomId: "room-1",
        publish: vi.fn()
      })
    );

    await waitFor(() => {
      expect(result.current.lightsById["light-1"]?.position.x).toBe(1);
    });

    let firstCommit!: Promise<void>;
    let secondCommit!: Promise<void>;
    act(() => {
      firstCommit = result.current.updateLight("light-1", { position: { x: 2, y: 2, z: 1 } }, { commit: true });
      secondCommit = result.current.updateLight("light-1", { position: { x: 3, y: 2, z: 1 } }, { commit: true });
    });

    expect(result.current.lightsById["light-1"]?.position.x).toBe(3);
    expect(pending).toHaveLength(2);

    await act(async () => {
      const position = pending[0]!.patch.position ?? baseLight.position;
      pending[0]!.resolve({
        light: { ...baseLight, position, updatedAt: "2026-01-01T00:00:01.000Z" },
        realtimeMessages: []
      });
      await firstCommit;
    });

    expect(result.current.lightsById["light-1"]?.position.x).toBe(3);

    await act(async () => {
      const position = pending[1]!.patch.position ?? baseLight.position;
      pending[1]!.resolve({
        light: { ...baseLight, position, updatedAt: "2026-01-01T00:00:02.000Z" },
        realtimeMessages: []
      });
      await secondCommit;
    });

    expect(result.current.lightsById["light-1"]?.position.x).toBe(3);
  });
});
