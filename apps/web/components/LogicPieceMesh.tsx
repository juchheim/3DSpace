"use client";

import { Edges } from "@react-three/drei";
import type { BuildLogicPiece } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  buildCellFootprint
} from "@3dspace/room-engine";
import { LampGlbMesh } from "./LampGlbMesh";

const KIND_COLORS: Record<BuildLogicPiece["kind"], string> = {
  button: "#6dff9a",
  pressurePlate: "#ffd59a",
  proximityZone: "#9ad4ff",
  timer: "#ff9ad4",
  door: "#c8a882",
  light: "#ffe8b0",
  teleporter: "#b89aff"
};

const BUTTON_PULSE_MS = 350;

export function LogicPieceMesh({
  piece,
  nodeState,
  pulseAt,
  ghost = false,
  valid = true,
  emitRealLight = false,
  channelColor = null,
  selected = false,
  onClick
}: {
  piece: BuildLogicPiece;
  nodeState?: Record<string, unknown> | undefined;
  pulseAt?: number | undefined;
  ghost?: boolean;
  valid?: boolean;
  emitRealLight?: boolean;
  channelColor?: string | null;
  selected?: boolean;
  onClick?: (event: import("@react-three/fiber").ThreeEvent<MouseEvent>) => void;
}) {
  const color = KIND_COLORS[piece.kind];
  const tint = !ghost && channelColor ? channelColor : color;
  const selectionEdges = selected ? <Edges color="#ffffff" linewidth={3} /> : null;
  const ghostEdges = ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null;
  const pulsing = pulseAt !== undefined && Date.now() - pulseAt < BUTTON_PULSE_MS;
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const y = piece.level * BUILD_LEVEL_HEIGHT + 0.35;
  const opacity = ghost ? 0.45 : 0.92;

  if (piece.kind === "door" && piece.edge) {
    const edge = piece.edge;
    const isHorizontal = edge === "n" || edge === "s";
    const open = nodeState?.open === true;
    const slide = open ? 1.2 : 0;
    const position: [number, number, number] = isHorizontal
      ? [
          centerX,
          y + 0.5,
          (edge === "n" ? footprint.maxZ : footprint.minZ) + (edge === "n" ? slide : -slide)
        ]
      : [
          (edge === "e" ? footprint.maxX : footprint.minX) + (edge === "e" ? slide : -slide),
          y + 0.5,
          centerZ
        ];
    const size: [number, number, number] = isHorizontal
      ? [BUILD_CELL_SIZE, 1.2, 0.15]
      : [0.15, 1.2, BUILD_CELL_SIZE];
    const doorOpacity = ghost ? opacity : open ? 0.28 : opacity;
    return (
      <mesh
        position={position}
        userData={{ logicPieceId: piece.id, logicPiece: piece }}
        {...(onClick ? { onClick } : {})}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={doorOpacity}
          emissive={tint}
          emissiveIntensity={open ? 0.15 : 0.35}
        />
        {ghostEdges}
        {selectionEdges}
      </mesh>
    );
  }

  if (piece.kind === "teleporter") {
    const armed = nodeState?.armed !== false;
    const teleporterOpacity = ghost ? 0.2 : armed ? 0.85 : 0.3;
    return (
      <mesh
        position={[centerX, y, centerZ]}
        userData={{ logicPieceId: piece.id, logicPiece: piece }}
        {...(onClick ? { onClick } : {})}
      >
        <boxGeometry args={[BUILD_CELL_SIZE * 0.85, 0.12, BUILD_CELL_SIZE * 0.85]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={teleporterOpacity}
          emissive={tint}
          emissiveIntensity={armed ? 0.55 : 0.1}
        />
        {ghostEdges}
        {selectionEdges}
      </mesh>
    );
  }

  if (piece.kind === "light") {
    const on = nodeState?.on === true;
    const bulbIntensity = ghost ? 0.8 : on ? 1.35 : 0.06;
    const shadeOpacity = ghost ? 0.42 : on ? 0.58 : 0.35;
    return (
      <group userData={{ logicPieceId: piece.id, logicPiece: piece }} {...(onClick ? { onClick } : {})}>
        <LampGlbMesh
          cell={piece.cell}
          level={piece.level}
          ghost={ghost}
          bulbIntensity={bulbIntensity}
          shadeOpacity={shadeOpacity}
          emitRealLight={emitRealLight && on}
          pointLightIntensity={0.9}
        />
        {ghostEdges}
        {selectionEdges}
      </group>
    );
  }

  if (piece.kind === "proximityZone") {
    return (
      <mesh
        position={[centerX, y, centerZ]}
        userData={{ logicPieceId: piece.id, logicPiece: piece }}
        {...(onClick ? { onClick } : {})}
      >
        <boxGeometry args={[BUILD_CELL_SIZE * 0.9, 0.08, BUILD_CELL_SIZE * 0.9]} />
        <meshStandardMaterial
          color={tint}
          transparent
          opacity={ghost ? 0.2 : 0.35}
          emissive={tint}
          emissiveIntensity={ghost ? 0.1 : 0.2}
        />
        {ghostEdges}
        {selectionEdges}
      </mesh>
    );
  }

  if (piece.kind === "pressurePlate") {
    return (
      <mesh
        position={[centerX, y - 0.1, centerZ]}
        userData={{ logicPieceId: piece.id, logicPiece: piece }}
        {...(onClick ? { onClick } : {})}
      >
        <boxGeometry args={[BUILD_CELL_SIZE * 0.82, 0.1, BUILD_CELL_SIZE * 0.82]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={ghost ? 0.35 : 0.88}
          emissive={tint}
          emissiveIntensity={ghost ? 0.25 : 0.35}
        />
        {ghostEdges}
        {selectionEdges}
      </mesh>
    );
  }

  if (piece.kind === "timer") {
    return (
      <mesh
        position={[centerX, y, centerZ]}
        userData={{ logicPieceId: piece.id, logicPiece: piece }}
        {...(onClick ? { onClick } : {})}
      >
        <boxGeometry args={[0.45, 0.55, 0.25]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={ghost ? 0.4 : 0.9}
          emissive={tint}
          emissiveIntensity={0.45}
        />
        {ghostEdges}
        {selectionEdges}
      </mesh>
    );
  }

  const emissiveIntensity =
    piece.kind === "button" && pulsing ? 1.2 : piece.kind === "button" ? 0.5 : 0.5;

  return (
    <mesh
      position={[centerX, y, centerZ]}
      userData={{ logicPieceId: piece.id, logicPiece: piece }}
      {...(onClick ? { onClick } : {})}
    >
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        emissive={tint}
        emissiveIntensity={piece.kind === "button" ? emissiveIntensity : 0.5}
      />
      {ghostEdges}
      {selectionEdges}
    </mesh>
  );
}
