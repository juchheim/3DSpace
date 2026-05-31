"use client";

import { useMemo } from "react";
import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from "three";
import type { BuildPiece, BuildPieceMaterial, BuildPieceRotation } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_LEVEL_HEIGHT,
  buildCellFootprint,
  rampClimbFromRotation
} from "@3dspace/room-engine";
import { buildMaterialProps } from "./buildMaterials";
import { wallMeshTransform } from "../lib/buildWallMesh";

function RampClimbIndicator({ rotation }: { rotation: BuildPieceRotation }) {
  const { climbAxis, climbSign } = rampClimbFromRotation(rotation);
  const half = BUILD_CELL_SIZE / 2;
  const y = BUILD_LEVEL_HEIGHT * 0.55;
  const offset = half * 0.55;
  const position: [number, number, number] =
    climbAxis === "z"
      ? [0, y, climbSign === 1 ? offset : -offset]
      : [climbSign === 1 ? offset : -offset, y, 0];
  const rotationY = climbAxis === "z" ? (climbSign === 1 ? 0 : Math.PI) : climbSign === 1 ? Math.PI / 2 : -Math.PI / 2;

  return (
    <mesh position={position} rotation={[-Math.PI / 2, rotationY, 0]}>
      <coneGeometry args={[0.22, 0.55, 8]} />
      <meshStandardMaterial color="#6dff9a" emissive="#2fdc76" emissiveIntensity={0.45} />
    </mesh>
  );
}

function RampGeometry({ rotation }: { rotation: BuildPieceRotation }) {
  const geometry = useMemo(() => {
    const { climbAxis, climbSign } = rampClimbFromRotation(rotation);
    const half = BUILD_CELL_SIZE / 2;
    const lowY = 0;
    const highY = BUILD_LEVEL_HEIGHT;
    const lowCoord = climbSign === 1 ? -half : half;
    const highCoord = climbSign === 1 ? half : -half;

    const positions =
      climbAxis === "z"
        ? [
            -half, lowY, lowCoord,
            half, lowY, lowCoord,
            half, lowY, highCoord,
            -half, lowY, highCoord,
            -half, highY, highCoord,
            half, highY, highCoord
          ]
        : [
            lowCoord, lowY, -half,
            lowCoord, lowY, half,
            highCoord, lowY, half,
            highCoord, lowY, -half,
            highCoord, highY, -half,
            highCoord, highY, half
          ];

    const indices = [
      0, 1, 2, 0, 2, 3,
      3, 4, 5, 3, 5, 2,
      0, 3, 4,
      1, 5, 2,
      2, 5, 4, 2, 4, 3
    ];

    const geo = new BufferGeometry();
    geo.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }, [rotation]);

  return <primitive object={geometry} attach="geometry" />;
}

export function BuildPieceMesh({
  piece,
  ghost = false,
  trail = false,
  valid = true,
  highlighted = false,
  interactive = false,
  pointerEventsPassThrough = false,
  onPointerMove,
  onPointerOut,
  onPointerDown,
  onClick
}: {
  piece: BuildPiece;
  ghost?: boolean;
  trail?: boolean;
  valid?: boolean;
  highlighted?: boolean;
  interactive?: boolean;
  pointerEventsPassThrough?: boolean;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const materialId = piece.materialId as BuildPieceMaterial;
  const materialProps = buildMaterialProps(materialId, {
    ghost: ghost || trail,
    valid: trail ? true : valid,
    highlighted
  });
  if (trail && typeof materialProps.opacity === "number") {
    materialProps.opacity *= 0.38;
  }

  const pointerProps = interactive
    ? {
        ...(onPointerMove ? { onPointerMove } : {}),
        ...(onPointerOut ? { onPointerOut } : {}),
        ...(onPointerDown ? { onPointerDown } : {}),
        ...(onClick ? { onClick } : {})
      }
    : {};

  if (piece.kind === "wall") {
    const { position, rotationY, size } = wallMeshTransform(piece);
    return (
      <mesh
        position={position}
        rotation={[0, rotationY, 0]}
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
        {...pointerProps}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial {...materialProps} />
        {ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null}
      </mesh>
    );
  }

  if (piece.kind === "floor") {
    const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
    const y = piece.level * BUILD_LEVEL_HEIGHT + BUILD_FLOOR_THICKNESS / 2;
    const centerX = (footprint.minX + footprint.maxX) / 2;
    const centerZ = (footprint.minZ + footprint.maxZ) / 2;
    return (
      <mesh
        position={[centerX, y, centerZ]}
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...pointerProps}
      >
        <boxGeometry args={[BUILD_CELL_SIZE, BUILD_FLOOR_THICKNESS, BUILD_CELL_SIZE]} />
        <meshStandardMaterial {...materialProps} />
        {ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null}
      </mesh>
    );
  }

  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  return (
    <group
      position={[centerX, baseY, centerZ]}
      userData={{ buildPieceId: piece.id, buildPiece: piece }}
      {...pointerProps}
    >
      <mesh>
        <RampGeometry rotation={piece.rotation} />
        <meshStandardMaterial {...materialProps} side={DoubleSide} />
        {ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null}
      </mesh>
      {ghost ? <RampClimbIndicator rotation={piece.rotation} /> : null}
    </group>
  );
}
