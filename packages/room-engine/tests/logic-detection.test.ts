import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema, type BuildLogicPiece } from "@3dspace/contracts";
import {
  avatarCellFromPosition,
  findProximityZonesContaining,
  findStepOnLogicPieces,
  footprintForZone,
  logicPieceOccupiesCell,
  pointInLogicFootprint,
  LOGIC_ID_PREFIX
} from "../src/logic.js";

const createdAt = "2026-05-31T12:00:00.000Z";

function logicPiece(input: BuildLogicPiece) {
  return BuildLogicPieceSchema.parse(input);
}

describe("logic detection helpers", () => {
  it("derives avatar cell from world position", () => {
    expect(avatarCellFromPosition(5, 0.1, 5)).toEqual({ ix: 2, iz: 2, level: 0 });
    expect(avatarCellFromPosition(5, 2.1, 5).level).toBe(1);
  });

  it("detects step-on pieces on the same cell", () => {
    const plate = logicPiece({
      id: `${LOGIC_ID_PREFIX}pressurePlate:3,3:0`,
      roomId: "r1",
      kind: "pressurePlate",
      cell: { ix: 3, iz: 3 },
      level: 0,
      rotation: 0,
      config: {},
      createdByUserId: "u1",
      createdAt
    });
    const cell = { ix: 3, iz: 3, level: 0 };
    expect(logicPieceOccupiesCell(plate, 3, 3, 0)).toBe(true);
    expect(findStepOnLogicPieces([plate], cell)).toHaveLength(1);
  });

  it("proximity zone uses an expanded footprint", () => {
    const zone = logicPiece({
      id: `${LOGIC_ID_PREFIX}proximityZone:5,5:0`,
      roomId: "r1",
      kind: "proximityZone",
      cell: { ix: 5, iz: 5 },
      level: 0,
      rotation: 0,
      config: {},
      createdByUserId: "u1",
      createdAt
    });
    const fp = footprintForZone(zone);
    expect(fp.maxX - fp.minX).toBeGreaterThan(2);
    expect(pointInLogicFootprint(zone, 11.5, 11.5, 0)).toBe(true);
    expect(findProximityZonesContaining([zone], 11.5, 11.5, 0)).toHaveLength(1);
  });
});
