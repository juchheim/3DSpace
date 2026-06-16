import { describe, expect, it } from "vitest";
import { ESCAPE_STARTER_KIT, getRoomStamp, roomStampToTargets } from "../lib/buildStamps";

describe("buildStamps", () => {
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
