import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema } from "@3dspace/contracts";
import { createEscapeRoomManifest } from "../src/index.js";
import {
  isTeleporterArmed,
  LOGIC_ID_PREFIX,
  teleportLandingPosition,
  teleportTarget
} from "../src/logic.js";

const createdAt = "2026-05-31T12:00:00.000Z";

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

describe("teleporter helpers", () => {
  it("finds the paired pad by linkId", () => {
    const a = teleporter(`${LOGIC_ID_PREFIX}teleporter:1,1:0`, 1, 1, "pair-a");
    const b = teleporter(`${LOGIC_ID_PREFIX}teleporter:5,5:0`, 5, 5, "pair-a");
    expect(teleportTarget(a, [a, b])?.id).toBe(b.id);
    expect(teleportTarget(b, [a, b])?.id).toBe(a.id);
  });

  it("defaults teleporter pads to armed unless explicitly disarmed", () => {
    expect(isTeleporterArmed({}, "pad-a")).toBe(true);
    expect(isTeleporterArmed({ "pad-a": { armed: false } }, "pad-a")).toBe(false);
    expect(isTeleporterArmed({ "pad-a": { armed: true } }, "pad-a")).toBe(true);
  });

  it("lands on ground height at the target cell", () => {
    const manifest = createEscapeRoomManifest({ roomId: "r1" });
    const target = teleporter(`${LOGIC_ID_PREFIX}teleporter:3,3:0`, 3, 3, "pair-a");
    const landing = teleportLandingPosition(manifest, [], target);
    expect(landing.y).toBe(0);
    expect(landing.x).toBeGreaterThan(0);
    expect(landing.z).toBeGreaterThan(0);
  });
});
