import type { BuildPiece } from "@3dspace/contracts";
import { describe, expect, it } from "vitest";
import { applyBuildRealtimeToPieces } from "../lib/build-pieces-realtime";

const basePiece: BuildPiece = {
  id: "build:floor:1,2:0",
  roomId: "room-1",
  kind: "floor",
  cell: { ix: 1, iz: 2 },
  level: 0,
  rotation: 0,
  materialId: "stone",
  createdByUserId: "user-a",
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("applyBuildRealtimeToPieces", () => {
  it("upserts a piece", () => {
    const next = applyBuildRealtimeToPieces({}, {
      type: "room.build.upsert.v1",
      roomId: "room-1",
      piece: basePiece,
      sentAt: 1,
      senderId: "user-a"
    });
    expect(next[basePiece.id]).toEqual(basePiece);
  });

  it("removes a piece", () => {
    const next = applyBuildRealtimeToPieces(
      { [basePiece.id]: basePiece },
      {
        type: "room.build.remove.v1",
        roomId: "room-1",
        pieceId: basePiece.id,
        sentAt: 1,
        senderId: "user-a"
      }
    );
    expect(next).toEqual({});
  });

  it("merges batch pieces", () => {
    const other: BuildPiece = {
      ...basePiece,
      id: "build:floor:2,2:0",
      cell: { ix: 2, iz: 2 }
    };
    const next = applyBuildRealtimeToPieces(
      { [basePiece.id]: basePiece },
      {
        type: "room.build.batch.v1",
        roomId: "room-1",
        pieces: [other],
        sentAt: 1,
        senderId: "user-a"
      }
    );
    expect(Object.keys(next)).toHaveLength(2);
    expect(next[other.id]).toEqual(other);
  });

  it("clears all pieces on empty batch", () => {
    const next = applyBuildRealtimeToPieces(
      { [basePiece.id]: basePiece },
      {
        type: "room.build.batch.v1",
        roomId: "room-1",
        pieces: [],
        sentAt: 1,
        senderId: "user-a"
      }
    );
    expect(next).toEqual({});
  });
});
