// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { BuildLogicPieceSchema, type LogicSignalKind } from "@3dspace/contracts";
import { LOGIC_ID_PREFIX } from "@3dspace/room-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TELEPORTER_LANDING_SUPPRESS_MS, useLogicDetection } from "../lib/useLogicDetection";

const createdAt = "2026-06-01T12:00:00.000Z";

function teleporter(id: string, ix: number, iz: number, linkId: string) {
  return BuildLogicPieceSchema.parse({
    id,
    roomId: "r1",
    kind: "teleporter",
    cell: { ix, iz },
    level: 0,
    rotation: 0,
    linkId,
    config: {},
    createdByUserId: "u1",
    createdAt
  });
}

describe("useLogicDetection teleporter landing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not re-fire stepOn on a suppressed landing pad until the player leaves", async () => {
    const padA = teleporter(`${LOGIC_ID_PREFIX}teleporter:2,2:0`, 2, 2, "pair");
    const padB = teleporter(`${LOGIC_ID_PREFIX}teleporter:8,8:0`, 8, 8, "pair");
    const signals: Array<{ pieceId: string; kind: LogicSignalKind }> = [];

    let position = { x: 10, y: 0, z: 10 };

    const rafCallbacks: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});

    const { result, unmount } = renderHook(() =>
      useLogicDetection({
        enabled: true,
        pieces: [padA, padB],
        getAvatarState: () => ({
          type: "avatar.state.v1" as const,
          participantId: "p1",
          position,
          rotation: { y: 0 },
          sentAt: Date.now(),
          movement: "idle" as const,
          viewMode: "3d" as const,
          media: { cameraEnabled: false, microphoneEnabled: false, speaking: false }
        }),
        onEvent: () => {},
        onSignal: (pieceId, kind) => {
          signals.push({ pieceId, kind });
        }
      })
    );

    const flushFrames = (count: number) => {
      for (let i = 0; i < count; i += 1) {
        const cbs = rafCallbacks.splice(0, rafCallbacks.length);
        for (const cb of cbs) cb(0);
      }
    };

    // Stand on pad B (cell 8,8) — world center of that build cell
    position = { x: 17, y: 0, z: 17 };
    await act(async () => {
      flushFrames(3);
    });
    expect(signals.some((s) => s.pieceId === padB.id && s.kind === "stepOn")).toBe(true);

    act(() => {
      result.current.suppressStepOn([padB.id]);
    });

    // Leave pad B and return while still suppressed
    signals.length = 0;
    position = { x: 10, y: 0, z: 10 };
    await act(async () => {
      flushFrames(2);
    });
    position = { x: 17, y: 0, z: 17 };
    await act(async () => {
      flushFrames(2);
    });
    expect(signals.some((s) => s.pieceId === padB.id && s.kind === "stepOn")).toBe(false);

    // After suppress window, step-on fires again
    vi.advanceTimersByTime(TELEPORTER_LANDING_SUPPRESS_MS + 50);
    position = { x: 10, y: 0, z: 10 };
    await act(async () => {
      flushFrames(2);
    });
    position = { x: 17, y: 0, z: 17 };
    await act(async () => {
      flushFrames(2);
    });
    expect(signals.some((s) => s.pieceId === padB.id && s.kind === "stepOn")).toBe(true);

    unmount();
  });
});
