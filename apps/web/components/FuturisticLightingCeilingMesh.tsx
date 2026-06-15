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

export const CEILING_FUTURISTIC_LIGHTING_GLB_URL = "/objects/ceiling-futuristic-lighting.glb";
export const CEILING_FUTURISTIC_LIGHTING_NATIVE_W = 1.9121090173721313;
export const CEILING_FUTURISTIC_LIGHTING_NATIVE_MIN_Y = -0.0639151781797409;
export const CEILING_FUTURISTIC_LIGHTING_NATIVE_MAX_Y = 0.062057796865701675;

useGLTF.preload(CEILING_FUTURISTIC_LIGHTING_GLB_URL);

export function futuristicLightingCeilingWorldTransform(piece: BuildPiece) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const scale = BUILD_CELL_SIZE / CEILING_FUTURISTIC_LIGHTING_NATIVE_W;
  const nativeH =
    CEILING_FUTURISTIC_LIGHTING_NATIVE_MAX_Y - CEILING_FUTURISTIC_LIGHTING_NATIVE_MIN_Y;
  const scaledH = nativeH * scale;
  const y = baseY + BUILD_LEVEL_HEIGHT - CEILING_FUTURISTIC_LIGHTING_NATIVE_MAX_Y * scale;
  const boxCenterY =
    ((CEILING_FUTURISTIC_LIGHTING_NATIVE_MIN_Y + CEILING_FUTURISTIC_LIGHTING_NATIVE_MAX_Y) / 2) * scale;
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

function FuturisticLightingCeilingGlbMesh({ piece }: { piece: BuildPiece }) {
  const { scene } = useGLTF(CEILING_FUTURISTIC_LIGHTING_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const { centerX, centerZ, y, scale, rotationY } = futuristicLightingCeilingWorldTransform(piece);

  return (
    <group position={[centerX, y, centerZ]} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <primitive object={model} />
    </group>
  );
}

export function FuturisticLightingCeilingMesh({
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
  const { centerX, centerZ, y, scaledH, boxCenterY, rotationY } =
    futuristicLightingCeilingWorldTransform(piece);
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
        <FuturisticLightingCeilingGlbMesh piece={piece} />
      </Suspense>
    </group>
  );
}
