import { describe, expect, it } from "vitest";
import type { BuildLogicPiece } from "@3dspace/contracts";
import { logicNodesFromPieceInitialState } from "../../src/escape-session/helpers.js";

describe("escape-session helpers", () => {
  it("seeds logic nodes from piece initialState", () => {
    const pieces = [
      {
        id: "logic:door:1,1:0:e",
        config: { initialState: { open: false } }
      }
    ] as BuildLogicPiece[];
    expect(logicNodesFromPieceInitialState(pieces)).toEqual({
      "logic:door:1,1:0:e": { open: false }
    });
  });
});
