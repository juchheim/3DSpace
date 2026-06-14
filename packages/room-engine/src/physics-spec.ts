import type { BuildLogicPiece, BuildPiece, LogicState, RoomManifest, Vector3 } from "@3dspace/contracts";

import { BUILD_FLOOR_THICKNESS, collectCollisionWalls, type WallCollider } from "./build.js";
import { BuildSurfaceIndex } from "./ground-height.js";
import { collectLogicDoorColliders } from "./logic.js";

export type ColliderVec3 = Pick<Vector3, "x" | "y" | "z">;

export type CuboidColliderSpec = {
  kind: "cuboid";
  id: string;
  source: "wall" | "floor" | "door";
  center: ColliderVec3;
  half: ColliderVec3;
  rotationY?: number;
};

export type RampColliderSpec = {
  kind: "ramp";
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  lowY: number;
  highY: number;
  climbAxis: "x" | "z";
  climbSign: 1 | -1;
  rotation: BuildPiece["rotation"];
};

export type GroundColliderSpec = {
  kind: "ground";
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  y: number;
};

/** Triangle mesh in world space (e.g. a placed World Builder scene prop). */
export type TrimeshColliderSpec = {
  kind: "trimesh";
  id: string;
  source: "world-asset";
  vertices: Float32Array;
  indices: Uint32Array;
};

export type ColliderSpec = CuboidColliderSpec | RampColliderSpec | GroundColliderSpec | TrimeshColliderSpec;

type LogicDoorInput = {
  pieces: BuildLogicPiece[];
  nodes: LogicState["nodes"];
};

function stableWallKey(wall: RoomManifest["walls"][number]) {
  return `${wall.id}|${wall.start.x},${wall.start.y},${wall.start.z}|${wall.end.x},${wall.end.y},${wall.end.z}|${wall.height}|${wall.thickness ?? ""}|${wall.passable ?? ""}`;
}

function stablePieceKey(piece: BuildPiece) {
  return `${piece.id}|${piece.kind}|${piece.cell.ix},${piece.cell.iz}|${piece.level}|${piece.edge ?? ""}|${piece.rotation}|${piece.materialId}`;
}

function stableDoorKey(piece: BuildLogicPiece, nodes: LogicState["nodes"]) {
  return `${piece.id}|${piece.cell.ix},${piece.cell.iz}|${piece.level}|${piece.edge ?? ""}|${nodes[piece.id]?.open === true ? 1 : 0}`;
}

function wallColliderToCuboidSpec(wall: WallCollider, source: CuboidColliderSpec["source"]): CuboidColliderSpec {
  const dx = wall.end.x - wall.start.x;
  const dz = wall.end.z - wall.start.z;
  const length = Math.hypot(dx, dz);
  return {
    kind: "cuboid",
    id: wall.id,
    source,
    center: {
      x: (wall.start.x + wall.end.x) / 2,
      y: wall.baseY + wall.height / 2,
      z: (wall.start.z + wall.end.z) / 2
    },
    half: {
      x: length / 2,
      y: wall.height / 2,
      z: (wall.thickness ?? 0) / 2
    },
    rotationY: Math.atan2(dz, dx)
  };
}

function buildGroundSpecs(manifest: RoomManifest): GroundColliderSpec[] {
  const breakpoints = new Set<number>([manifest.bounds.minZ, manifest.bounds.maxZ]);
  for (const tier of manifest.tiers ?? []) {
    if (tier.minZ > manifest.bounds.minZ && tier.minZ < manifest.bounds.maxZ) {
      breakpoints.add(tier.minZ);
    }
  }

  const ordered = [...breakpoints].sort((a, b) => a - b);
  const specs: GroundColliderSpec[] = [];

  for (let index = 0; index < ordered.length - 1; index += 1) {
    const minZ = ordered[index]!;
    const maxZ = ordered[index + 1]!;
    if (maxZ <= minZ) continue;

    const sampleZ = minZ + (maxZ - minZ) / 2;
    const sortedTiers = [...(manifest.tiers ?? [])].sort((a, b) => b.minZ - a.minZ);
    const tier = sortedTiers.find((candidate) => sampleZ >= candidate.minZ);
    const y = tier?.floorY ?? 0;

    specs.push({
      kind: "ground",
      id: `ground:${index}`,
      minX: manifest.bounds.minX,
      maxX: manifest.bounds.maxX,
      minZ,
      maxZ,
      y
    });
  }

  return specs;
}

export function buildPhysicsWorldSpec(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  logicDoors?: LogicDoorInput
): ColliderSpec[] {
  const ground = buildGroundSpecs(manifest);

  const staticWalls = collectCollisionWalls(
    {
      ...manifest,
      walls: [...manifest.walls].sort((a, b) => stableWallKey(a).localeCompare(stableWallKey(b)))
    },
    [...buildPieces].sort((a, b) => stablePieceKey(a).localeCompare(stablePieceKey(b)))
  )
    .filter((wall) => wall.passable === false)
    .map((wall) => wallColliderToCuboidSpec(wall, "wall"))
    .sort((a, b) => a.id.localeCompare(b.id));

  const doorWalls = logicDoors
    ? collectLogicDoorColliders(
        [...logicDoors.pieces]
          .filter((piece) => piece.kind === "door")
          .sort((a, b) => stableDoorKey(a, logicDoors.nodes).localeCompare(stableDoorKey(b, logicDoors.nodes))),
        logicDoors.nodes
      )
        .map((wall) => wallColliderToCuboidSpec(wall, "door"))
        .sort((a, b) => a.id.localeCompare(b.id))
    : [];

  const surfaceIndex = BuildSurfaceIndex.fromPieces(buildPieces);
  const { floors, ramps } = surfaceIndex.allSurfaces();
  const floorSpecs: CuboidColliderSpec[] = floors.map((floor) => ({
    kind: "cuboid",
    id: floor.id,
    source: "floor",
    center: {
      x: (floor.minX + floor.maxX) / 2,
      y: floor.topY - BUILD_FLOOR_THICKNESS / 2,
      z: (floor.minZ + floor.maxZ) / 2
    },
    half: {
      x: (floor.maxX - floor.minX) / 2,
      y: BUILD_FLOOR_THICKNESS / 2,
      z: (floor.maxZ - floor.minZ) / 2
    }
  }));
  const rampSpecs: RampColliderSpec[] = ramps.map((ramp) => ({ kind: "ramp", ...ramp }));

  return [
    ...ground,
    ...staticWalls,
    ...doorWalls,
    ...floorSpecs,
    ...rampSpecs
  ];
}

/** Fingerprint manifest geometry, build pieces, and logic-door open state for world-spec reuse. */
export function physicsWorldSpecCacheKey(
  manifest: RoomManifest,
  buildPieces: BuildPiece[],
  logicDoors?: LogicDoorInput
): string {
  const manifestPart = [
    `bounds:${manifest.bounds.minX},${manifest.bounds.maxX},${manifest.bounds.minZ},${manifest.bounds.maxZ}`,
    `walls:${[...manifest.walls].sort((a, b) => stableWallKey(a).localeCompare(stableWallKey(b))).map(stableWallKey).join(";")}`,
    `tiers:${[...(manifest.tiers ?? [])]
      .sort((a, b) => a.minZ - b.minZ || a.maxZ - b.maxZ || a.floorY - b.floorY)
      .map((tier) => `${tier.minZ},${tier.maxZ},${tier.floorY}`)
      .join(";")}`
  ].join("|");

  const piecesPart = [...buildPieces]
    .sort((a, b) => stablePieceKey(a).localeCompare(stablePieceKey(b)))
    .map(stablePieceKey)
    .join(";");

  const logicPart = logicDoors
    ? [...logicDoors.pieces]
        .filter((piece) => piece.kind === "door")
        .sort((a, b) => stableDoorKey(a, logicDoors.nodes).localeCompare(stableDoorKey(b, logicDoors.nodes)))
        .map((piece) => stableDoorKey(piece, logicDoors.nodes))
        .join(";")
    : "";

  return `${manifestPart}::${piecesPart}::${logicPart}`;
}
