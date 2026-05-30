// @vitest-environment happy-dom

import type { BuildPiece } from "@3dspace/contracts";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../lib/api";
import { useBuildPieces } from "../lib/useBuildPieces";

vi.mock("../lib/api", () => ({
  listBuildPieces: vi.fn(),
  createBuildPiece: vi.fn(),
  createBuildPiecesBatch: vi.fn(),
  deleteBuildPiece: vi.fn(),
  clearBuildPieces: vi.fn()
}));

const identity = {
  userId: "builder-a",
  displayName: "Alex",
  role: "student" as const
};

const basePiece: BuildPiece = {
  id: "build:floor:15,15:0",
  roomId: "room-1",
  kind: "floor",
  cell: { ix: 15, iz: 15 },
  level: 0,
  rotation: 0,
  materialId: "stone",
  createdByUserId: "builder-a",
  createdAt: "2026-01-01T00:00:00.000Z"
};

const otherPiece: BuildPiece = {
  ...basePiece,
  id: "build:floor:16,16:0",
  cell: { ix: 16, iz: 16 }
};

describe("useBuildPieces", () => {
  beforeEach(() => {
    vi.mocked(api.listBuildPieces).mockResolvedValue([]);
    vi.mocked(api.createBuildPiece).mockReset();
    vi.mocked(api.createBuildPiecesBatch).mockReset();
    vi.mocked(api.deleteBuildPiece).mockReset();
    vi.mocked(api.clearBuildPieces).mockReset();
  });

  it("places optimistically then reconciles with the server piece", async () => {
    let resolveCreate!: (value: Awaited<ReturnType<typeof api.createBuildPiece>>) => void;
    const createPromise = new Promise<Awaited<ReturnType<typeof api.createBuildPiece>>>((resolve) => {
      resolveCreate = resolve;
    });
    vi.mocked(api.createBuildPiece).mockReturnValue(createPromise);

    const serverPiece: BuildPiece = {
      ...basePiece,
      materialId: "wood",
      createdAt: "2026-01-02T00:00:00.000Z"
    };
    const realtimeMessages = [
      {
        type: "room.build.upsert.v1" as const,
        roomId: "room-1",
        piece: serverPiece,
        sentAt: 1,
        senderId: "builder-a"
      }
    ];
    const publish = vi.fn();

    const { result } = renderHook(() =>
      useBuildPieces({
        identity,
        roomId: "room-1",
        enabled: true,
        publish
      })
    );

    await waitFor(() => {
      expect(api.listBuildPieces).toHaveBeenCalled();
    });

    let placePromise!: Promise<BuildPiece>;
    act(() => {
      placePromise = result.current.actions.place("floor", { ix: 15, iz: 15 }, 0);
    });

    await waitFor(() => {
      expect(result.current.pieces).toHaveLength(1);
      expect(result.current.pieces[0]?.materialId).toBe("stone");
    });

    await act(async () => {
      resolveCreate({ piece: serverPiece, realtimeMessages });
      await placePromise;
    });

    expect(result.current.pieces).toHaveLength(1);
    expect(result.current.pieces[0]?.materialId).toBe("wood");
    expect(result.current.pieces[0]?.createdAt).toBe("2026-01-02T00:00:00.000Z");
    expect(publish).toHaveBeenCalledWith(realtimeMessages[0]);
  });

  it("ignores realtime messages when the hook is disabled", async () => {
    vi.mocked(api.listBuildPieces).mockResolvedValue([basePiece]);

    const { result, rerender } = renderHook(
      ({ enabled }) =>
        useBuildPieces({
          identity,
          roomId: "room-1",
          enabled
        }),
      { initialProps: { enabled: true } }
    );

    await waitFor(() => {
      expect(result.current.pieces).toHaveLength(1);
    });

    rerender({ enabled: false });

    await waitFor(() => {
      expect(result.current.pieces).toHaveLength(0);
    });

    let handled = false;
    act(() => {
      handled = result.current.handleRealtimeMessage({
        type: "room.build.upsert.v1",
        roomId: "room-1",
        piece: otherPiece,
        sentAt: 1,
        senderId: "builder-b"
      });
    });

    expect(handled).toBe(false);
    expect(result.current.pieces).toHaveLength(0);
  });

  it("clears pieces on a remote empty batch message", async () => {
    vi.mocked(api.listBuildPieces).mockResolvedValue([basePiece, otherPiece]);

    const { result } = renderHook(() =>
      useBuildPieces({
        identity,
        roomId: "room-1",
        enabled: true
      })
    );

    await waitFor(() => {
      expect(result.current.pieces).toHaveLength(2);
    });

    let handled = false;
    act(() => {
      handled = result.current.handleRealtimeMessage({
        type: "room.build.batch.v1",
        roomId: "room-1",
        pieces: [],
        sentAt: 1,
        senderId: "builder-b"
      });
    });

    expect(handled).toBe(true);
    expect(result.current.pieces).toHaveLength(0);
  });
});
