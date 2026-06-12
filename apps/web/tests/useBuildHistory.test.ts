// @vitest-environment happy-dom

import type { BuildPiece } from "@3dspace/contracts";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useBuildHistory } from "../lib/useBuildHistory";

const basePiece: BuildPiece = {
  id: "build:floor:5,5:0",
  roomId: "room-1",
  kind: "floor",
  cell: { ix: 5, iz: 5 },
  level: 0,
  rotation: 0,
  materialId: "stone",
  createdByUserId: "author-1",
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("useBuildHistory", () => {
  it("undoes a place by destroying the piece", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const place = vi.fn().mockResolvedValue(basePiece);
    const actions = {
      place,
      placeBatch: vi.fn(),
      destroy,
      clearAll: vi.fn()
    };

    const { result } = renderHook(() => useBuildHistory(actions, () => ({})));

    await act(async () => {
      result.current.recordPlace(basePiece);
      await result.current.undo();
    });

    expect(destroy).toHaveBeenCalledWith(basePiece.id);
  });

  it("restores a destroyed piece on undo", async () => {
    const place = vi.fn().mockResolvedValue(basePiece);
    const destroy = vi.fn().mockResolvedValue(undefined);
    const actions = {
      place,
      placeBatch: vi.fn(),
      destroy,
      clearAll: vi.fn()
    };

    const { result } = renderHook(() => useBuildHistory(actions, () => ({})));

    await act(async () => {
      result.current.recordDestroy(basePiece);
      await result.current.undo();
    });

    expect(place).toHaveBeenCalledWith("floor", { ix: 5, iz: 5 }, 0, undefined, 0, "stone", undefined, undefined);
  });

  it("restores a destroyed image floor with its texture on undo", async () => {
    const imageFloor: BuildPiece = {
      ...basePiece,
      id: "build:image-floor:5,5:0",
      kind: "image-floor",
      textureStorageKey: "rooms/room-1/floor-textures/tex.webp",
      textureSpanCells: 8
    };
    const place = vi.fn().mockResolvedValue(imageFloor);
    const destroy = vi.fn().mockResolvedValue(undefined);
    const actions = {
      place,
      placeBatch: vi.fn(),
      destroy,
      clearAll: vi.fn()
    };

    const { result } = renderHook(() => useBuildHistory(actions, () => ({})));

    await act(async () => {
      result.current.recordDestroy(imageFloor);
      await result.current.undo();
    });

    expect(place).toHaveBeenCalledWith(
      "image-floor",
      { ix: 5, iz: 5 },
      0,
      undefined,
      0,
      "stone",
      "rooms/room-1/floor-textures/tex.webp",
      8
    );
  });

  it("no-ops undo destroy when another user owns the slot", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const onConflict = vi.fn();
    const actions = {
      place: vi.fn(),
      placeBatch: vi.fn(),
      destroy,
      clearAll: vi.fn()
    };

    const { result, rerender } = renderHook(
      ({ pieces }) => useBuildHistory(actions, () => pieces, { onConflict }),
      { initialProps: { pieces: {} as Record<string, BuildPiece> } }
    );

    await act(async () => {
      result.current.recordPlace(basePiece);
    });

    rerender({ pieces: { [basePiece.id]: { ...basePiece, createdByUserId: "other-user" } } });

    await act(async () => {
      await result.current.undo();
    });

    expect(destroy).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalled();
  });
});
