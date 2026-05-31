import { describe, expect, it } from "vitest";
import { BuildLogicPieceSchema } from "@3dspace/contracts";
import { collectLogicDoorColliders, doorCollider, isDoorOpen, LOGIC_ID_PREFIX } from "../src/logic.js";

const createdAt = "2026-05-31T12:00:00.000Z";

function doorPiece() {
  return BuildLogicPieceSchema.parse({
    id: `${LOGIC_ID_PREFIX}door:2,2:0:e`,
    roomId: "r1",
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

describe("logic door colliders", () => {
  it("emits a wall collider when the door is closed", () => {
    const piece = doorPiece();
    const nodes = { [piece.id]: { open: false } };
    expect(isDoorOpen(nodes, piece.id)).toBe(false);
    const collider = doorCollider(piece, nodes);
    expect(collider?.label).toBe("logic-door");
    expect(collider?.passable).toBe(false);
    expect(collectLogicDoorColliders([piece], nodes)).toHaveLength(1);
  });

  it("omits collider when the door is open", () => {
    const piece = doorPiece();
    const nodes = { [piece.id]: { open: true } };
    expect(isDoorOpen(nodes, piece.id)).toBe(true);
    expect(doorCollider(piece, nodes)).toBeNull();
    expect(collectLogicDoorColliders([piece], nodes)).toHaveLength(0);
  });
});
