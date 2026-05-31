import type {
  BuildPieceKind,
  BuildPieceMaterial,
  BuildPieceRotation,
  BuildPieceEdge,
  LogicConfigInput,
  LogicPieceKind
} from "@3dspace/contracts";
import type { BuildPlacementTarget } from "./buildPlacement";

/** Relative placement within a stamp (origin cell 0,0). */
export type BuildStampPiece = {
  kind: BuildPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge;
  rotation?: BuildPieceRotation;
  materialId?: BuildPieceMaterial;
};

export type BuildStamp = {
  id: string;
  label: string;
  description: string;
  pieces: BuildStampPiece[];
};

function roomShellPieces(size: number): BuildStampPiece[] {
  const pieces: BuildStampPiece[] = [
    { kind: "floor", cell: { ix: 0, iz: 0 }, level: 0, materialId: "wood" }
  ];
  for (let ix = 0; ix < size; ix++) {
    for (let iz = 0; iz < size; iz++) {
      if (ix > 0) pieces.push({ kind: "wall", cell: { ix, iz }, level: 0, edge: "w", materialId: "stone" });
      if (iz > 0) pieces.push({ kind: "wall", cell: { ix, iz }, level: 0, edge: "s", materialId: "stone" });
      if (ix < size - 1) pieces.push({ kind: "wall", cell: { ix, iz }, level: 0, edge: "e", materialId: "stone" });
      if (iz < size - 1) pieces.push({ kind: "wall", cell: { ix, iz }, level: 0, edge: "n", materialId: "stone" });
    }
  }
  pieces.push({ kind: "doorway", cell: { ix: Math.floor(size / 2), iz: 0 }, level: 0, edge: "s", materialId: "wood" });
  return pieces;
}

export const BUILTIN_BUILD_STAMPS: BuildStamp[] = [
  {
    id: "room-3x3",
    label: "Room 3×3",
    description: "Floored cell with walls and a south doorway",
    pieces: roomShellPieces(3)
  },
  {
    id: "corridor",
    label: "Corridor",
    description: "Two cells with side walls and doorways at each end",
    pieces: [
      { kind: "floor", cell: { ix: 0, iz: 0 }, level: 0, materialId: "stone" },
      { kind: "floor", cell: { ix: 1, iz: 0 }, level: 0, materialId: "stone" },
      { kind: "wall", cell: { ix: 0, iz: 0 }, level: 0, edge: "w", materialId: "stone" },
      { kind: "wall", cell: { ix: 1, iz: 0 }, level: 0, edge: "w", materialId: "stone" },
      { kind: "wall", cell: { ix: 0, iz: 0 }, level: 0, edge: "e", materialId: "stone" },
      { kind: "wall", cell: { ix: 1, iz: 0 }, level: 0, edge: "e", materialId: "stone" },
      { kind: "doorway", cell: { ix: 0, iz: 0 }, level: 0, edge: "s", materialId: "wood" },
      { kind: "doorway", cell: { ix: 1, iz: 0 }, level: 0, edge: "n", materialId: "wood" }
    ]
  },
  {
    id: "floor-2x2",
    label: "Floor 2×2",
    description: "Four floor tiles",
    pieces: [
      { kind: "floor", cell: { ix: 0, iz: 0 }, level: 0, materialId: "wood" },
      { kind: "floor", cell: { ix: 1, iz: 0 }, level: 0, materialId: "wood" },
      { kind: "floor", cell: { ix: 0, iz: 1 }, level: 0, materialId: "wood" },
      { kind: "floor", cell: { ix: 1, iz: 1 }, level: 0, materialId: "wood" }
    ]
  },
  {
    id: "perimeter-5",
    label: "Perimeter 5×5",
    description: "Hollow box — outer walls only",
    pieces: roomShellPieces(5).filter((piece) => piece.kind !== "doorway")
  }
];

export function getBuildStamp(id: string): BuildStamp | undefined {
  return BUILTIN_BUILD_STAMPS.find((stamp) => stamp.id === id);
}

function rotateCell(ix: number, iz: number, rotation: BuildPieceRotation): { ix: number; iz: number } {
  switch (rotation) {
    case 0:
      return { ix, iz };
    case 90:
      return { ix: iz, iz: -ix };
    case 180:
      return { ix: -ix, iz: -iz };
    case 270:
      return { ix: -iz, iz: ix };
  }
}

function rotateEdge(edge: BuildPieceEdge, rotation: BuildPieceRotation): BuildPieceEdge {
  const order: BuildPieceEdge[] = ["n", "e", "s", "w"];
  const index = order.indexOf(edge);
  const steps = rotation / 90;
  return order[(index + steps) % 4]!;
}

/** Translate and rotate a stamp to an anchor cell in world grid space. */
export function stampToPlacementTargets(
  stamp: BuildStamp,
  anchor: { ix: number; iz: number },
  rotation: BuildPieceRotation,
  defaultMaterialId: BuildPieceMaterial
): BuildPlacementTarget[] {
  return stamp.pieces.map((piece) => {
    const rotated = rotateCell(piece.cell.ix, piece.cell.iz, rotation);
    return {
      kind: piece.kind,
      cell: { ix: anchor.ix + rotated.ix, iz: anchor.iz + rotated.iz },
      level: piece.level,
      ...(piece.edge ? { edge: rotateEdge(piece.edge, rotation) } : {}),
      rotation: piece.rotation ?? 0,
      materialId: piece.materialId ?? defaultMaterialId
    };
  });
}

// ── Room stamps: build pieces + pre-wired logic (Phase 10.5) ──────────────────

export type LogicStampPiece = {
  kind: LogicPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge;
  channelId?: string;
  linkId?: string;
  config?: LogicConfigInput;
};

export type RoomStamp = {
  id: string;
  label: string;
  description: string;
  buildPieces: BuildStampPiece[];
  logicPieces: LogicStampPiece[];
};

export type LogicPlacementTargetForStamp = {
  kind: LogicPieceKind;
  cell: { ix: number; iz: number };
  level: number;
  edge?: BuildPieceEdge;
  channelId?: string;
  linkId?: string;
  config?: LogicConfigInput;
};

/**
 * Starter mini-escape (recipe §4.10, trimmed for a first play test):
 * a 5×5 room with a south doorway, a button that opens the north door on
 * channel `exit-door`, a closet button that turns on a light on `study-light`,
 * and an exit plate beyond the door that ends the session (`isExit`).
 */
export const ESCAPE_STARTER_KIT: RoomStamp = {
  id: "escape-starter",
  label: "Starter escape",
  description: "Room shell + button→door, light reveal, and a win plate — ready to play test",
  buildPieces: roomShellPieces(5),
  logicPieces: [
    {
      kind: "door",
      cell: { ix: 2, iz: 4 },
      level: 0,
      edge: "n",
      channelId: "exit-door",
      config: { listenMode: "latch", initialState: { open: false } }
    },
    {
      kind: "button",
      cell: { ix: 3, iz: 1 },
      level: 0,
      edge: "e",
      channelId: "exit-door",
      config: { fireMode: "pulse" }
    },
    {
      kind: "light",
      cell: { ix: 1, iz: 1 },
      level: 0,
      channelId: "study-light",
      config: { listenMode: "latch", initialState: { on: false } }
    },
    {
      kind: "button",
      cell: { ix: 1, iz: 2 },
      level: 0,
      edge: "w",
      channelId: "study-light",
      config: { fireMode: "pulse" }
    },
    {
      kind: "pressurePlate",
      cell: { ix: 2, iz: 5 },
      level: 0,
      channelId: "escaped",
      config: { fireMode: "pulse", isExit: true }
    }
  ]
};

export const BUILTIN_ROOM_STAMPS: RoomStamp[] = [ESCAPE_STARTER_KIT];

export function getRoomStamp(id: string): RoomStamp | undefined {
  return BUILTIN_ROOM_STAMPS.find((stamp) => stamp.id === id);
}

/** Translate + rotate a room stamp's build and logic pieces into world-grid placement targets. */
export function roomStampToTargets(
  stamp: RoomStamp,
  anchor: { ix: number; iz: number },
  rotation: BuildPieceRotation,
  defaultMaterialId: BuildPieceMaterial
): { buildTargets: BuildPlacementTarget[]; logicTargets: LogicPlacementTargetForStamp[] } {
  const buildTargets = stamp.buildPieces.map((piece) => {
    const rotated = rotateCell(piece.cell.ix, piece.cell.iz, rotation);
    return {
      kind: piece.kind,
      cell: { ix: anchor.ix + rotated.ix, iz: anchor.iz + rotated.iz },
      level: piece.level,
      ...(piece.edge ? { edge: rotateEdge(piece.edge, rotation) } : {}),
      rotation: piece.rotation ?? 0,
      materialId: piece.materialId ?? defaultMaterialId
    } satisfies BuildPlacementTarget;
  });

  const logicTargets = stamp.logicPieces.map((piece) => {
    const rotated = rotateCell(piece.cell.ix, piece.cell.iz, rotation);
    return {
      kind: piece.kind,
      cell: { ix: anchor.ix + rotated.ix, iz: anchor.iz + rotated.iz },
      level: piece.level,
      ...(piece.edge ? { edge: rotateEdge(piece.edge, rotation) } : {}),
      ...(piece.channelId ? { channelId: piece.channelId } : {}),
      ...(piece.linkId ? { linkId: piece.linkId } : {}),
      ...(piece.config ? { config: piece.config } : {})
    } satisfies LogicPlacementTargetForStamp;
  });

  return { buildTargets, logicTargets };
}
