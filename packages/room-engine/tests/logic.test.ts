import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema } from "@3dspace/contracts";
import { createEscapeRoomManifest } from "../src/index.js";
import {
  isLogicPlacementAllowed,
  logicPieceStableId,
  logicRoleForKind,
  LOGIC_ID_PREFIX
} from "../src/logic.js";

describe("logicPieceStableId", () => {
  it("uses the logic namespace and edge slot", () => {
    expect(
      logicPieceStableId({
        kind: "door",
        cell: { ix: 2, iz: 3 },
        level: 1,
        edge: "n"
      })
    ).toBe(`${LOGIC_ID_PREFIX}door:2,3:1:n`);
  });
});

describe("logicRoleForKind", () => {
  it("classifies emitters and consumers", () => {
    expect(logicRoleForKind("button")).toBe("emitter");
    expect(logicRoleForKind("door")).toBe("consumer");
  });
});

describe("isLogicPlacementAllowed", () => {
  const manifest = createEscapeRoomManifest({ roomId: "room-er" });

  it("allows a button on the escape canvas", () => {
    const piece = BuildLogicPieceSchema.parse({
      id: `${LOGIC_ID_PREFIX}button:10,10:0:n`,
      roomId: "room-er",
      kind: "button",
      cell: { ix: 10, iz: 10 },
      level: 0,
      edge: "n",
      rotation: 0,
      channelId: "ch-a",
      createdByUserId: "u1",
      createdAt: "2026-05-31T12:00:00.000Z"
    });
    expect(isLogicPlacementAllowed(manifest, piece)).toEqual({ ok: true });
  });

  it("rejects out-of-bounds placement", () => {
    const result = isLogicPlacementAllowed(manifest, {
      kind: "pressurePlate",
      cell: { ix: 999, iz: 999 },
      level: 0
    });
    expect(result).toEqual({ ok: false, reason: "out-of-bounds" });
  });
});
