"use client";

import { Suspense, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import type { Group } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { BuildPiece, BuildPieceMaterial } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  buildCellFootprint
} from "@3dspace/room-engine";
import { buildMaterialProps } from "./buildMaterials";

export const CEILING_FUTURISTIC_GLB_URL = "/objects/ceiling-futuristic.glb";
export const CEILING_FUTURISTIC_NATIVE_W = 1.3613191621248015;
export const CEILING_FUTURISTIC_NATIVE_MIN_Y = -0.12606900930404655;
export const CEILING_FUTURISTIC_NATIVE_MAX_Y = 0.12356502562761303;

useGLTF.preload(CEILING_FUTURISTIC_GLB_URL);

export function futuristicCeilingWorldTransform(piece: BuildPiece) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const scale = BUILD_CELL_SIZE / CEILING_FUTURISTIC_NATIVE_W;
  const nativeH = CEILING_FUTURISTIC_NATIVE_MAX_Y - CEILING_FUTURISTIC_NATIVE_MIN_Y;
  const scaledH = nativeH * scale;
  // Mesh is vertically centered in the GLB; align nativeMaxY with the level top (same as arbor ceilings).
  const y = baseY + BUILD_LEVEL_HEIGHT - CEILING_FUTURISTIC_NATIVE_MAX_Y * scale;
  const boxCenterY = ((CEILING_FUTURISTIC_NATIVE_MIN_Y + CEILING_FUTURISTIC_NATIVE_MAX_Y) / 2) * scale;
  return {
    centerX,
    centerZ,
    y,
    scale,
    scaledH,
    boxCenterY,
    rotationY: (piece.rotation * Math.PI) / 180
  };
}

function FuturisticCeilingGlbMesh({ piece }: { piece: BuildPiece }) {
  const { scene } = useGLTF(CEILING_FUTURISTIC_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const { centerX, centerZ, y, scale, rotationY } = futuristicCeilingWorldTransform(piece);

  return (
    <group position={[centerX, y, centerZ]} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <primitive object={model} />
    </group>
  );
}

export function FuturisticCeilingMesh({
  piece,
  materialId,
  ghost = false,
  valid = true,
  pointerProps,
  pointerEventsPassThrough
}: {
  piece: BuildPiece;
  materialId: BuildPieceMaterial;
  ghost?: boolean;
  valid?: boolean;
  pointerProps: Record<string, unknown>;
  pointerEventsPassThrough?: boolean;
}) {
  const materialProps = buildMaterialProps(materialId, { ghost });
  const { centerX, centerZ, y, scaledH, boxCenterY, rotationY } = futuristicCeilingWorldTransform(piece);
  const boxSize: [number, number, number] = [BUILD_CELL_SIZE, scaledH, BUILD_CELL_SIZE];

  if (ghost) {
    return (
      <group
        position={[centerX, y, centerZ]}
        rotation={[0, rotationY, 0]}
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
        {...pointerProps}
      >
        <mesh position={[0, boxCenterY, 0]}>
          <boxGeometry args={boxSize} />
          <meshStandardMaterial {...materialProps} />
          <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} />
        </mesh>
      </group>
    );
  }

  return (
    <group
      userData={{ buildPieceId: piece.id, buildPiece: piece }}
      {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
      {...pointerProps}
    >
      <Suspense
        fallback={
          <group position={[centerX, y, centerZ]} rotation={[0, rotationY, 0]}>
            <mesh position={[0, boxCenterY, 0]}>
              <boxGeometry args={boxSize} />
              <meshStandardMaterial {...materialProps} />
            </mesh>
          </group>
        }
      >
        <FuturisticCeilingGlbMesh piece={piece} />
      </Suspense>
    </group>
  );
}
