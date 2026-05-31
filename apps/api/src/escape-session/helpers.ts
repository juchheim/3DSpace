import type { BuildLogicPiece, LogicState } from "@3dspace/contracts";

export function logicNodesFromPieceInitialState(pieces: BuildLogicPiece[]): LogicState["nodes"] {
  const nodes: LogicState["nodes"] = {};
  for (const piece of pieces) {
    const initial = piece.config?.initialState;
    if (initial && typeof initial === "object" && Object.keys(initial).length > 0) {
      nodes[piece.id] = { ...(initial as Record<string, unknown>) };
    }
  }
  return nodes;
}
