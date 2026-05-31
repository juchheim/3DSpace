import { describe, expect, it } from "vitest";
import { createEscapeRoomManifest } from "@3dspace/room-engine";
import { MemoryRepository } from "../../src/repository.js";
import { applyTeleporterSignal } from "../../src/logic-pieces/teleporter.js";
import { BuildLogicPieceSchema } from "@3dspace/contracts";

const createdAt = "2026-05-31T12:00:00.000Z";

describe("applyTeleporterSignal", () => {
  it("returns teleportTo for paired armed pads", async () => {
    const repository = new MemoryRepository();
    const manifest = createEscapeRoomManifest({ roomId: "room-1" });
    const roomId = "room-1";

    const padA = BuildLogicPieceSchema.parse(
      await repository.createLogicPiece({
        roomId,
        kind: "teleporter",
        cell: { ix: 2, iz: 2 },
        level: 0,
        rotation: 0,
        linkId: "pair-1",
        createdByUserId: "u1"
      })
    );
    await repository.createLogicPiece({
      roomId,
      kind: "teleporter",
      cell: { ix: 8, iz: 8 },
      level: 0,
      rotation: 0,
      linkId: "pair-1",
      createdByUserId: "u1"
    });

    const result = await applyTeleporterSignal(repository, roomId, manifest, padA, "stepOn");
    expect(result.teleportTo).toBeTruthy();
    expect(result.teleportTo!.x).not.toBe(0);
  });
});
