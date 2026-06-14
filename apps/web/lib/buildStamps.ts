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

/** Outer-perimeter walls of a `size`×`size` footprint — a complete hollow box, no floor or openings. */
function perimeterWallPieces(size: number): BuildStampPiece[] {
  const pieces: BuildStampPiece[] = [];
  const last = size - 1;
  for (let i = 0; i < size; i++) {
    pieces.push({ kind: "wall", cell: { ix: i, iz: 0 }, level: 0, edge: "s", materialId: "stone" });
    pieces.push({ kind: "wall", cell: { ix: i, iz: last }, level: 0, edge: "n", materialId: "stone" });
    pieces.push({ kind: "wall", cell: { ix: 0, iz: i }, level: 0, edge: "w", materialId: "stone" });
    pieces.push({ kind: "wall", cell: { ix: last, iz: i }, level: 0, edge: "e", materialId: "stone" });
  }
  return pieces;
}

/**
 * A walkable, enclosed `size`×`size` room: a full floor, walls only on the
 * outer perimeter, and a doorway gap in the middle of the south wall. (Interior
 * cells are left open so the room is actually enterable.)
 */
function roomShellPieces(size: number): BuildStampPiece[] {
  const doorwayIx = Math.floor(size / 2);
  const pieces: BuildStampPiece[] = [];

  for (let ix = 0; ix < size; ix++) {
    for (let iz = 0; iz < size; iz++) {
      pieces.push({ kind: "floor", cell: { ix, iz }, level: 0, materialId: "wood" });
    }
  }

  for (const wall of perimeterWallPieces(size)) {
    if (wall.edge === "s" && wall.cell.iz === 0 && wall.cell.ix === doorwayIx) {
      pieces.push({ kind: "doorway", cell: wall.cell, level: 0, edge: "s", materialId: "wood" });
    } else {
      pieces.push(wall);
    }
  }

  return pieces;
}

/**
 * A pergola-style room: wood floor, corner posts, sparse level-1 trellis beams
 * (open center for light from above), and a south doorway — no walls between posts.
 */
function arborRoomPieces(size: number): BuildStampPiece[] {
  const last = size - 1;
  const doorwayIx = Math.floor(size / 2);
  const pieces: BuildStampPiece[] = [];

  for (let ix = 0; ix < size; ix++) {
    for (let iz = 0; iz < size; iz++) {
      pieces.push({ kind: "floor", cell: { ix, iz }, level: 0, materialId: "wood" });
    }
  }

  const corners: Array<{ ix: number; iz: number; edges: BuildPieceEdge[] }> = [
    { ix: 0, iz: 0, edges: ["w", "s"] },
    { ix: last, iz: 0, edges: ["e", "s"] },
    { ix: 0, iz: last, edges: ["w", "n"] },
    { ix: last, iz: last, edges: ["e", "n"] }
  ];
  for (const { ix, iz, edges } of corners) {
    for (const edge of edges) {
      pieces.push({
        kind: "simple-wall",
        cell: { ix, iz },
        level: 0,
        edge,
        materialId: "wood"
      });
    }
  }

  pieces.push({
    kind: "doorway",
    cell: { ix: doorwayIx, iz: 0 },
    level: 0,
    edge: "s",
    materialId: "wood"
  });

  for (let iz = 1; iz < last; iz++) {
    pieces.push({ kind: "simple-wall", cell: { ix: 0, iz }, level: 1, edge: "n", materialId: "wood" });
    pieces.push({ kind: "simple-wall", cell: { ix: last, iz }, level: 1, edge: "n", materialId: "wood" });
  }
  for (let ix = 1; ix < last; ix++) {
    pieces.push({ kind: "simple-wall", cell: { ix, iz: 0 }, level: 1, edge: "e", materialId: "wood" });
    pieces.push({ kind: "simple-wall", cell: { ix, iz: last }, level: 1, edge: "e", materialId: "wood" });
  }

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
    id: "arbor-4x4",
    label: "Arbor 4×4",
    description: "Open pergola with corner posts, trellis beams, and light from above",
    pieces: arborRoomPieces(4)
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
    pieces: perimeterWallPieces(5)
  }
];

/** Room prefabs surfaced on the World Builder **Build** tab (also listed under Stamps). */
export const BUILD_TAB_ROOM_STAMP_IDS = ["room-3x3", "arbor-4x4"] as const;

export function buildTabRoomStamps(): BuildStamp[] {
  const ids = new Set<string>(BUILD_TAB_ROOM_STAMP_IDS);
  return BUILTIN_BUILD_STAMPS.filter((stamp) => ids.has(stamp.id));
}

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
 * Starter mini-escape (recipe §4.10, trimmed for a first play test): an
 * enclosed 5×5 room (cells ix 0–4 west→east, iz 0–4 south→north) you enter
 * through the south doorway. A button on the east wall opens the locked north
 * exit `door` (`exit-door`); a second button on the west wall turns on the room
 * `light` (`study-light`); and a win plate on the exit landing beyond the door
 * ends the session (`isExit`).
 *
 * The north wall has a gap at the door cell so the `door` is the only barrier
 * there (a build wall would block the edge permanently, open or not).
 */
export const ESCAPE_STARTER_KIT: RoomStamp = {
  id: "escape-starter",
  label: "Starter escape",
  description: "Enclosed room you enter via a south doorway, with a button→door, a light, and a win plate — ready to play test",
  buildPieces: [
    ...roomShellPieces(5).filter(
      (piece) =>
        !(piece.kind === "wall" && piece.edge === "n" && piece.cell.ix === 2 && piece.cell.iz === 4)
    ),
    { kind: "floor", cell: { ix: 2, iz: 5 }, level: 0, materialId: "stone" }
  ],
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
      cell: { ix: 4, iz: 2 },
      level: 0,
      edge: "e",
      channelId: "exit-door",
      config: { fireMode: "pulse" }
    },
    {
      kind: "light",
      cell: { ix: 2, iz: 2 },
      level: 0,
      channelId: "study-light",
      config: { listenMode: "latch", initialState: { on: false } }
    },
    {
      kind: "button",
      cell: { ix: 0, iz: 2 },
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
