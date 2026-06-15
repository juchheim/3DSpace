"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Edges, useGLTF } from "@react-three/drei";
import { Color, DoubleSide, Mesh as ThreeMesh } from "three";
import type { Group } from "three";
import { MeshStandardMaterial } from "three";
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
export const CEILING_FUTURISTIC_LIGHTING_NATIVE_H = 0.12597297504544258;

/** Four down-facing emitters across the panel underside (native model space). */
const UNDERSIDE_LIGHT_POSITIONS: [number, number, number][] = [
  [-0.42, 0.03, -0.42],
  [0.42, 0.03, -0.42],
  [-0.42, 0.03, 0.42],
  [0.42, 0.03, 0.42]
];

const PANEL_ACCENT = "#6eb8d4";
const PANEL_ACCENT_INTENSITY = 0.22;
const LIGHT_COLOR = "#c8f0ff";

/** Just below the panel underside — spots aim down so they do not wash out the panel mesh. */
const EMITTER_Y = -0.14;
const SPOT_TARGET_DROP = 8;

useGLTF.preload(CEILING_FUTURISTIC_LIGHTING_GLB_URL);

function isMesh(object: unknown): object is ThreeMesh {
  return Boolean(object) && (object as ThreeMesh).isMesh === true;
}

export function futuristicLightingCeilingWorldTransform(piece: BuildPiece) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const scale = BUILD_CELL_SIZE / CEILING_FUTURISTIC_LIGHTING_NATIVE_W;
  const scaledH = CEILING_FUTURISTIC_LIGHTING_NATIVE_H * scale;
  const y = baseY + BUILD_LEVEL_HEIGHT - scaledH;
  return {
    centerX,
    centerZ,
    y,
    scale,
    scaledH,
    rotationY: (piece.rotation * Math.PI) / 180
  };
}

function FuturisticLightingCeilingGlbMesh({
  piece,
  ghost = false,
  emitRealLight = false
}: {
  piece: BuildPiece;
  ghost?: boolean;
  emitRealLight?: boolean;
}) {
  const { scene } = useGLTF(CEILING_FUTURISTIC_LIGHTING_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const { centerX, centerZ, y, scale, rotationY } = futuristicLightingCeilingWorldTransform(piece);
  const accentIntensity = ghost ? 0.12 : PANEL_ACCENT_INTENSITY;

  useEffect(() => {
    const accent = new Color(PANEL_ACCENT);

    model.traverse((object) => {
      if (!isMesh(object)) return;
      const source = object.material as MeshStandardMaterial;
      const material = source.clone();
      object.material = material;
      // Keep the baked underside readable; a hint of emissive only when lights are off.
      material.emissive.copy(accent);
      material.emissiveIntensity = emitRealLight ? accentIntensity * 0.35 : accentIntensity;
      material.roughness = Math.min(material.roughness, 0.55);
      material.metalness = Math.max(material.metalness, 0.1);
      material.side = DoubleSide;
      if (ghost) {
        material.transparent = true;
        material.opacity = 0.72;
      }
    });
  }, [model, ghost, accentIntensity, emitRealLight]);

  return (
    <group position={[centerX, y, centerZ]} rotation={[0, rotationY, 0]} scale={[scale, scale, scale]}>
      <primitive object={model} />
      {emitRealLight && !ghost
        ? UNDERSIDE_LIGHT_POSITIONS.map(([x, , z], index) => (
            <spotLight
              key={`ceiling-light-${index}`}
              position={[x, EMITTER_Y, z]}
              intensity={3.2}
              angle={Math.PI / 2.4}
              penumbra={0.5}
              distance={20}
              decay={2}
              color={LIGHT_COLOR}
            >
              <object3D position={[0, -SPOT_TARGET_DROP, 0]} />
            </spotLight>
          ))
        : null}
    </group>
  );
}

export function FuturisticLightingCeilingMesh({
  piece,
  materialId,
  ghost = false,
  valid = true,
  emitRealLight = false,
  pointerProps,
  pointerEventsPassThrough
}: {
  piece: BuildPiece;
  materialId: BuildPieceMaterial;
  ghost?: boolean;
  valid?: boolean;
  emitRealLight?: boolean;
  pointerProps: Record<string, unknown>;
  pointerEventsPassThrough?: boolean;
}) {
  const materialProps = buildMaterialProps(materialId, { ghost });
  const { centerX, centerZ, y, scaledH, rotationY } = futuristicLightingCeilingWorldTransform(piece);
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
        <mesh position={[0, scaledH / 2, 0]}>
          <boxGeometry args={boxSize} />
          <meshStandardMaterial
            {...materialProps}
            emissive={PANEL_ACCENT}
            emissiveIntensity={0.35}
          />
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
            <mesh position={[0, scaledH / 2, 0]}>
              <boxGeometry args={boxSize} />
              <meshStandardMaterial
                {...materialProps}
                emissive={PANEL_ACCENT}
                emissiveIntensity={0.35}
              />
            </mesh>
          </group>
        }
      >
        <FuturisticLightingCeilingGlbMesh piece={piece} emitRealLight={emitRealLight} />
      </Suspense>
    </group>
  );
}
