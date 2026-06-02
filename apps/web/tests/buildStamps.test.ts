import { describe, expect, it } from "vitest";
import {
  BUILTIN_BUILD_STAMPS,
  ESCAPE_STARTER_KIT,
  getBuildStamp,
  getRoomStamp,
  roomStampToTargets,
  stampToPlacementTargets
} from "../lib/buildStamps";

describe("buildStamps", () => {
  it("translates stamp cells to the anchor", () => {
    const stamp = getBuildStamp("floor-2x2")!;
    const targets = stampToPlacementTargets(stamp, { ix: 10, iz: 20 }, 0, "stone");
    expect(targets).toHaveLength(4);
    expect(targets.map((t) => `${t.cell.ix},${t.cell.iz}`).sort()).toEqual([
      "10,20",
      "10,21",
      "11,20",
      "11,21"
    ]);
  });

  it("rotates stamp cells and edges 90°", () => {
    const stamp = getBuildStamp("corridor")!;
    const targets = stampToPlacementTargets(stamp, { ix: 0, iz: 0 }, 90, "stone");
    const doorway = targets.find((t) => t.kind === "doorway" && t.cell.ix === 0 && t.cell.iz === 0);
    expect(doorway?.edge).toBe("w");
  });

  it("room stamp is an enclosed, floored, enterable room", () => {
    const stamp = getBuildStamp("room-3x3")!;
    const targets = stampToPlacementTargets(stamp, { ix: 5, iz: 5 }, 0, "stone");
    const floors = targets.filter((t) => t.kind === "floor");
    const walls = targets.filter((t) => t.kind === "wall");
    const doorways = targets.filter((t) => t.kind === "doorway");
    // Full floor (3×3), a complete perimeter minus one south doorway, and one opening.
    expect(floors).toHaveLength(9);
    expect(walls.length).toBeGreaterThan(10);
    expect(doorways).toHaveLength(1);
    // Walls live only on the perimeter — no interior lattice.
    const interiorWall = walls.find(
      (t) => t.cell.ix > 5 && t.cell.ix < 7 && t.cell.iz > 5 && t.cell.iz < 7
    );
    expect(interiorWall).toBeUndefined();
    expect(BUILTIN_BUILD_STAMPS.length).toBeGreaterThanOrEqual(4);
  });

  it("perimeter stamp is a hollow box with no floor or doorway", () => {
    const stamp = getBuildStamp("perimeter-5")!;
    const targets = stampToPlacementTargets(stamp, { ix: 0, iz: 0 }, 0, "stone");
    expect(targets.every((t) => t.kind === "wall")).toBe(true);
    expect(targets.some((t) => t.kind === "floor")).toBe(false);
    expect(targets.some((t) => t.kind === "doorway")).toBe(false);
  });

  it("escape starter kit carries pre-wired logic with a win plate", () => {
    expect(getRoomStamp("escape-starter")).toBe(ESCAPE_STARTER_KIT);
    const { buildTargets, logicTargets } = roomStampToTargets(
      ESCAPE_STARTER_KIT,
      { ix: 0, iz: 0 },
      0,
      "stone"
    );
    expect(buildTargets.length).toBeGreaterThan(32);
    // Enclosed room: a full 5×5 floor plus an exit landing tile (>= 26 floors).
    expect(buildTargets.filter((t) => t.kind === "floor").length).toBeGreaterThanOrEqual(26);
    const door = logicTargets.find((t) => t.kind === "door");
    const button = logicTargets.find((t) => t.kind === "button" && t.channelId === door?.channelId);
    expect(door?.channelId).toBeTruthy();
    expect(button).toBeTruthy();
    expect(logicTargets.some((t) => t.config?.isExit === true)).toBe(true);
    // No build wall may share the exit door's edge, or it would block the doorway.
    const blockingWall = buildTargets.find(
      (t) =>
        t.kind === "wall" &&
        t.edge === door?.edge &&
        t.cell.ix === door?.cell.ix &&
        t.cell.iz === door?.cell.iz
    );
    expect(blockingWall).toBeUndefined();
  });

  it("translates room stamp logic cells to the anchor", () => {
    const { logicTargets } = roomStampToTargets(ESCAPE_STARTER_KIT, { ix: 10, iz: 10 }, 0, "stone");
    const door = ESCAPE_STARTER_KIT.logicPieces.find((p) => p.kind === "door")!;
    const placedDoor = logicTargets.find((t) => t.kind === "door")!;
    expect(placedDoor.cell).toEqual({ ix: 10 + door.cell.ix, iz: 10 + door.cell.iz });
  });
});
