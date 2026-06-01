// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { BuildLogicPieceSchema, BuildPieceSchema, PhysicsTuningSchema } from "@3dspace/contracts";
import { createDefaultRoomManifest, createFreeForAllManifest } from "@3dspace/room-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const controller = {
  setTuning: vi.fn(),
  syncColliders: vi.fn(),
  step: vi.fn(),
  requestJump: vi.fn(),
  setPosition: vi.fn(),
  dispose: vi.fn()
};

vi.mock("../lib/physics/PhysicsController", () => ({
  PhysicsController: {
    create: vi.fn(async () => controller)
  }
}));

import { PhysicsController } from "../lib/physics/PhysicsController";
import { useAvatarMovement } from "../lib/useAvatarMovement";

const manifest = createFreeForAllManifest({ roomId: "room-physics-live" });
const createdAt = "2026-06-01T12:00:00.000Z";
const physicsTuning = PhysicsTuningSchema.parse({ enabled: true });

function floorPiece() {
  return BuildPieceSchema.parse({
    id: "build:floor:3,4:1",
    roomId: "room-physics-live",
    kind: "floor",
    cell: { ix: 3, iz: 4 },
    level: 1,
    rotation: 0,
    materialId: "wood",
    createdByUserId: "u1",
    createdAt
  });
}

function doorPiece() {
  return BuildLogicPieceSchema.parse({
    id: "logic:door:2,2:0:e",
    roomId: "room-physics-live",
    kind: "door",
    cell: { ix: 2, iz: 2 },
    level: 0,
    edge: "e",
    rotation: 0,
    config: { initialState: { open: false } },
    createdByUserId: "u1",
    createdAt
  });
}

describe("useAvatarMovement physics branch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    controller.setTuning.mockReset();
    controller.syncColliders.mockReset();
    controller.setPosition.mockReset();
    controller.requestJump.mockReset();
    controller.dispose.mockReset();
    controller.step.mockReset().mockReturnValue({
      position: { x: 4, y: 1, z: 5 },
      grounded: true,
      vy: 0,
      airborne: false
    });
    vi.mocked(PhysicsController.create).mockClear();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16));
    vi.stubGlobal("cancelAnimationFrame", (id: number) => window.clearTimeout(id));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates a physics controller in 3d mode and uses its step output", async () => {
    const yawRef = { current: 0 };
    const { result } = renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "3d",
        cameraYawRef: yawRef,
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(PhysicsController.create).toHaveBeenCalled();

    act(() => {
      result.current.setTouchVector({ x: 0, z: -1 });
    });

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(controller.step).toHaveBeenCalled();

    expect(controller.setTuning).toHaveBeenCalledWith(physicsTuning);
    expect(controller.syncColliders).not.toHaveBeenCalled();
    expect(result.current.avatarState?.position).toEqual({ x: 4, y: 1, z: 5 });
    expect(result.current.avatarState?.movement).toBe("walking");
    expect(result.current.avatarState?.airborneState).toBe("grounded");
  });

  it("reuses the controller for teleports in active 3d physics mode", async () => {
    const { result } = renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "3d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(PhysicsController.create).toHaveBeenCalled();

    act(() => {
      result.current.teleportToPosition({ x: 8, y: 0, z: 9 });
    });

    expect(controller.setPosition).toHaveBeenCalledWith(expect.objectContaining({ x: 8, z: 9 }));
  });

  it("does not create a controller in 2d mode even if physics is enabled", async () => {
    renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "2d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(PhysicsController.create).not.toHaveBeenCalled();
  });

  it("queues jump requests and maps airborne wire state from controller output", async () => {
    controller.step.mockReturnValue({
      position: { x: 4, y: 2, z: 5 },
      grounded: false,
      vy: 5,
      airborne: true
    });

    const { result } = renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "3d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    act(() => {
      result.current.requestJump();
      result.current.setTouchVector({ x: 0, z: -1 });
    });

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(controller.requestJump).toHaveBeenCalled();
    expect(result.current.avatarState?.airborneState).toBe("jumping");
  });

  it("only resyncs colliders when build geometry changes", async () => {
    const buildPiecesRef = { current: [] as ReturnType<typeof floorPiece>[] };
    renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "3d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning,
        buildPiecesRef
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(controller.syncColliders).not.toHaveBeenCalled();

    buildPiecesRef.current = [floorPiece()];
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(controller.syncColliders).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(controller.syncColliders).toHaveBeenCalledTimes(1);
  });

  it("resyncs colliders when a logic door changes open state", async () => {
    const logicPiecesRef = { current: [doorPiece()] };
    const logicNodesRef = { current: { [logicPiecesRef.current[0]!.id]: { open: false } } };
    renderHook(() =>
      useAvatarMovement({
        manifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "3d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning,
        logicPiecesRef,
        logicNodesRef
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(controller.syncColliders).not.toHaveBeenCalled();

    logicNodesRef.current = { [logicPiecesRef.current[0]!.id]: { open: true } };
    await act(async () => {
      vi.advanceTimersByTime(50);
      await Promise.resolve();
    });

    expect(controller.syncColliders).toHaveBeenCalledTimes(1);
  });

  it("keeps 2d movement on the kinematic path and snaps y to the current surface", async () => {
    const tieredManifest = (() => {
      const base = createDefaultRoomManifest({ roomId: "room-physics-2d" });
      const splitZ = (base.bounds.minZ + base.bounds.maxZ) / 2;
      return {
        ...base,
        tiers: [
          { minZ: base.bounds.minZ, maxZ: splitZ, floorY: 0 },
          { minZ: splitZ, maxZ: base.bounds.maxZ, floorY: 3 }
        ]
      };
    })();

    const { result } = renderHook(() =>
      useAvatarMovement({
        manifest: tieredManifest,
        participantId: "p1",
        role: "student",
        occupiedPositions: [],
        viewMode: "2d",
        media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
        physicsTuning
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(30);
      await Promise.resolve();
    });

    act(() => {
      result.current.moveTo2DPoint({ x: 50, y: 75 });
    });

    expect(PhysicsController.create).not.toHaveBeenCalled();
    expect(result.current.avatarState?.viewMode).toBe("2d");
    expect(result.current.avatarState?.position.y).toBeCloseTo(3);
  });

  it("re-seeds the controller at the current position when switching from 2d to 3d", async () => {
    const { result, rerender } = renderHook(
      ({ viewMode }: { viewMode: "2d" | "3d" }) =>
        useAvatarMovement({
          manifest,
          participantId: "p1",
          role: "student",
          occupiedPositions: [],
          viewMode,
          media: { cameraEnabled: false, microphoneEnabled: false, speaking: false },
          physicsTuning
        }),
      { initialProps: { viewMode: "2d" as "2d" | "3d" } }
    );

    await act(async () => {
      vi.advanceTimersByTime(30);
      await Promise.resolve();
    });

    act(() => {
      result.current.teleportToPosition({ x: 8, y: 0, z: 9 });
    });

    rerender({ viewMode: "3d" });

    await act(async () => {
      vi.advanceTimersByTime(80);
      await Promise.resolve();
    });

    expect(PhysicsController.create).toHaveBeenCalledWith(
      expect.objectContaining({
        initialPosition: expect.objectContaining({ x: 8, z: 9 })
      })
    );
  });
});
