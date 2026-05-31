import type { BuildLogicPiece, BuildPieceEdge, LogicPieceKind } from "@3dspace/contracts";
import { logicPieceRequiresEdge, logicPieceStableId, worldToCell } from "@3dspace/room-engine";
import { avatarStandingLevel, nearestWallEdge, wallLevelFromSurface } from "./buildPlacement";

function alignLogicWallEdge(
  cell: { ix: number; iz: number },
  level: number,
  cursorEdge: BuildPieceEdge,
  piecesById: Record<string, BuildLogicPiece>
): BuildPieceEdge {
  const { ix, iz } = cell;
  const edgeKinds: LogicPieceKind[] = ["door", "button"];
  const hasEdge = (cix: number, ciz: number, edge: BuildPieceEdge) =>
    edgeKinds.some((kind) =>
      Boolean(
        piecesById[
          logicPieceStableId({ kind, cell: { ix: cix, iz: ciz }, level, edge })
        ]
      )
    );

  const suggestions = new Set<BuildPieceEdge>();
  for (const edge of ["n", "s"] as const) {
    if (hasEdge(ix - 1, iz, edge) || hasEdge(ix + 1, iz, edge)) suggestions.add(edge);
  }
  for (const edge of ["e", "w"] as const) {
    if (hasEdge(ix, iz - 1, edge) || hasEdge(ix, iz + 1, edge)) suggestions.add(edge);
  }

  if (suggestions.has(cursorEdge)) return cursorEdge;
  if (suggestions.size === 1) return [...suggestions][0]!;
  return cursorEdge;
}

export type LogicPlacementTarget = {
  kind: LogicPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge;
  channelId?: string;
};

export function resolveLogicPlacementTarget(input: {
  kind: LogicPieceKind;
  hitX: number;
  hitY: number;
  hitZ: number;
  channelId?: string;
  baseLevel?: number;
  existingPieces?: Record<string, BuildLogicPiece>;
}): LogicPlacementTarget {
  const cell = worldToCell(input.hitX, input.hitZ);
  const baseLevel = input.baseLevel ?? 0;

  if (logicPieceRequiresEdge(input.kind)) {
    const level = wallLevelFromSurface(input.hitY, null, baseLevel);
    const cursorEdge = nearestWallEdge(input.hitX, input.hitZ, cell.ix, cell.iz);
    const edge = input.existingPieces
      ? alignLogicWallEdge(cell, level, cursorEdge, input.existingPieces)
      : cursorEdge;
    return {
      kind: input.kind,
      cell,
      level,
      edge,
      ...(input.channelId ? { channelId: input.channelId } : {})
    };
  }

  return {
    kind: input.kind,
    cell,
    level: avatarStandingLevel(input.hitY),
    ...(input.channelId ? { channelId: input.channelId } : {})
  };
}

export function logicPlacementPreviewId(target: LogicPlacementTarget) {
  return logicPieceStableId({
    kind: target.kind,
    cell: target.cell,
    level: target.level,
    edge: target.edge
  });
}
