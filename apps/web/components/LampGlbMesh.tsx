"use client";

import { useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Color, DoubleSide, Mesh as ThreeMesh } from "three";
import type { Group } from "three";
import { MeshStandardMaterial } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { BuildPieceMaterial } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_LEVEL_HEIGHT,
  buildCellFootprint
} from "@3dspace/room-engine";
import { buildMaterialProps } from "./buildMaterials";

export const LAMP_GLB_URL = "/objects/lamp.glb";
/** Native mesh height (floor to top of shade). */
export const LAMP_GLB_NATIVE_H = 1.2;
/** World-space lamp height on the build grid. */
export const LAMP_TARGET_HEIGHT = 1.8;
/** Bulb center in native model space (inside the shade). */
export const LAMP_BULB_NATIVE_Y = 1.1;
export const LAMP_BULB_RADIUS = 0.055;

useGLTF.preload(LAMP_GLB_URL);

function isMesh(object: unknown): object is ThreeMesh {
  return Boolean(object) && (object as ThreeMesh).isMesh === true;
}

function nodeRole(name: string): "base" | "shade" | "other" {
  const key = name.toLowerCase();
  if (key.includes("shade")) return "shade";
  if (key.includes("base")) return "base";
  return "other";
}

export function LampGlbMesh({
  cell,
  level,
  ghost = false,
  materialId = "wood",
  bulbIntensity = 1.2,
  shadeOpacity = 0.52,
  emitRealLight = false,
  pointLightIntensity = 1.1,
  userData,
  pointerEventsPassThrough = false,
  onPointerMove,
  onPointerOut,
  onPointerDown,
  onClick
}: {
  cell: { ix: number; iz: number };
  level: number;
  ghost?: boolean;
  materialId?: BuildPieceMaterial;
  /** Emissive strength on the bulb (0 = off). */
  bulbIntensity?: number;
  shadeOpacity?: number;
  emitRealLight?: boolean;
  pointLightIntensity?: number;
  userData?: Record<string, unknown>;
  pointerEventsPassThrough?: boolean;
  onPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerOut?: (event: ThreeEvent<PointerEvent>) => void;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
  onClick?: (event: ThreeEvent<MouseEvent>) => void;
}) {
  const { scene } = useGLTF(LAMP_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);

  const footprint = buildCellFootprint(cell.ix, cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = level * BUILD_LEVEL_HEIGHT;
  const scale = LAMP_TARGET_HEIGHT / LAMP_GLB_NATIVE_H;
  const bulbY = LAMP_BULB_NATIVE_Y * scale;

  const baseMaterialProps = buildMaterialProps(materialId, { ghost });

  useEffect(() => {
    const warm = new Color("#ffe8b0");
    const shadeGlow = new Color("#ffdd99");

    model.traverse((object) => {
      if (!isMesh(object)) return;
      const role = nodeRole(object.name);
      const source = object.material as MeshStandardMaterial;
      const material = source.clone();
      object.material = material;

      if (role === "shade") {
        material.transparent = true;
        material.opacity = ghost ? 0.38 : shadeOpacity;
        material.depthWrite = false;
        material.side = DoubleSide;
        material.roughness = Math.min(material.roughness, 0.65);
        material.emissive.copy(shadeGlow);
        material.emissiveIntensity = ghost ? bulbIntensity * 0.25 : bulbIntensity * 0.55;
        material.color.lerp(warm, ghost ? 0.15 : 0.35);
        return;
      }

      if (role === "base") {
        material.color.set(baseMaterialProps.color as string);
        material.roughness = baseMaterialProps.roughness ?? material.roughness;
        material.metalness = baseMaterialProps.metalness ?? material.metalness;
        if (ghost && typeof baseMaterialProps.opacity === "number") {
          material.transparent = true;
          material.opacity = baseMaterialProps.opacity;
        }
        return;
      }

      material.emissive.copy(shadeGlow);
      material.emissiveIntensity = bulbIntensity * 0.2;
    });
  }, [model, ghost, shadeOpacity, bulbIntensity, baseMaterialProps.color, baseMaterialProps.metalness, baseMaterialProps.opacity, baseMaterialProps.roughness]);

  const pointerProps =
    onPointerMove || onPointerOut || onPointerDown || onClick
      ? {
          ...(onPointerMove ? { onPointerMove } : {}),
          ...(onPointerOut ? { onPointerOut } : {}),
          ...(onPointerDown ? { onPointerDown } : {}),
          ...(onClick ? { onClick } : {})
        }
      : {};

  return (
    <group
      position={[centerX, baseY, centerZ]}
      scale={[scale, scale, scale]}
      {...(userData ? { userData } : {})}
      {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
      {...pointerProps}
    >
      <primitive object={model} />
      <mesh position={[0, LAMP_BULB_NATIVE_Y, 0]}>
        <sphereGeometry args={[LAMP_BULB_RADIUS, 16, 16]} />
        <meshStandardMaterial
          color="#fffef5"
          emissive="#fff4d0"
          emissiveIntensity={ghost ? bulbIntensity * 0.65 : bulbIntensity}
          toneMapped={false}
        />
      </mesh>
      {emitRealLight && !ghost && bulbIntensity > 0.05 ? (
        <pointLight
          position={[0, LAMP_BULB_NATIVE_Y, 0]}
          intensity={pointLightIntensity * Math.min(1.4, bulbIntensity)}
          distance={10}
          decay={2}
          color="#ffe8c8"
        />
      ) : null}
    </group>
  );
}
