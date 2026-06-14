"use client";

import { Suspense, useEffect, useMemo } from "react";
import { Edges, MeshReflectorMaterial, useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from "three";
import { SkeletonUtils } from "three-stdlib";
import type { Group } from "three";
import type { BuildPiece, BuildPieceEdge, BuildPieceMaterial, BuildPieceRotation } from "@3dspace/contracts";
import {
  BUILD_CELL_SIZE,
  BUILD_FLOOR_THICKNESS,
  BUILD_LEVEL_HEIGHT,
  BUILD_RAMP_HIGH_Y,
  BUILD_RAMP_LOW_Y,
  BUILD_RAMP_RISE,
  BUILD_WALL_HEIGHT,
  BUILD_WALL_THICKNESS,
  buildCellFootprint,
  rampClimbFromRotation
} from "@3dspace/room-engine";
import { buildMaterialProps } from "./buildMaterials";
import { edgeOpeningFrameParts } from "../lib/buildEdgeOpeningMesh";
import { arborCeilingBeams } from "../lib/arborCeilingBeams";
import { wallMeshTransform } from "../lib/buildWallMesh";
import type { ImageFloorRegion } from "../lib/imageFloorRegions";
import { LampGlbMesh, LAMP_BULB_NATIVE_Y, LAMP_GLB_NATIVE_H, LAMP_TARGET_HEIGHT } from "./LampGlbMesh";

// ── Custom wall GLB ───────────────────────────────────────────────────────────
const WALL_GLB_URL = "/objects/wall.glb";
// Native dimensions of the GLB mesh (measured from the source file)
const WALL_GLB_NATIVE_W = 2.3916; // X extent
const WALL_GLB_NATIVE_H = 2.0;    // Y extent (already matches BUILD_WALL_HEIGHT)

useGLTF.preload(WALL_GLB_URL);

// ── Simple wall GLB ───────────────────────────────────────────────────────────
const SIMPLE_WALL_GLB_URL = "/objects/wall-simple.glb";
const SIMPLE_WALL_GLB_NATIVE_W = 2.0093;
const SIMPLE_WALL_GLB_NATIVE_H = 2.0;

useGLTF.preload(SIMPLE_WALL_GLB_URL);

// ── Custom floor GLB ──────────────────────────────────────────────────────────
const FLOOR_GLB_URL = "/objects/floor.glb";
// Native dimensions of the GLB mesh (measured from the source file)
const FLOOR_GLB_NATIVE_W = 0.0265856; // X extent
const FLOOR_GLB_NATIVE_H = 0.003;     // Y extent (slab thickness)
const FLOOR_GLB_NATIVE_D = 0.0265853; // Z extent

useGLTF.preload(FLOOR_GLB_URL);

// ── Custom ramp GLB ───────────────────────────────────────────────────────────
const RAMP_GLB_URL = "/objects/ramp.glb";
// Native dimensions of the GLB mesh (measured from the source file)
const RAMP_GLB_NATIVE_W = 3.1869926; // X extent (footprint width)
const RAMP_GLB_NATIVE_H = 2.4;       // Y extent (rise)
const RAMP_GLB_NATIVE_D = 4.2271991; // Z extent (footprint run — model climbs along Z)

useGLTF.preload(RAMP_GLB_URL);

/** Map build rotation to GLB yaw; native mesh climbs from +Z (low) to −Z (high). */
function rampGlbRotationY(rotation: BuildPieceRotation): number {
  switch (rotation) {
    case 0:
      return Math.PI;
    case 90:
      return Math.PI / 2;
    case 180:
      return 0;
    case 270:
      return -Math.PI / 2;
  }
}

/**
 * Renders the custom ramp GLB, stretched to match the engine's ramp dimensions
 * (BUILD_CELL_SIZE × BUILD_RAMP_HIGH_Y × BUILD_CELL_SIZE footprint).
 */
function RampGlbMesh({ piece }: { piece: BuildPiece }) {
  const { scene } = useGLTF(RAMP_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);

  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;

  const scaleX = BUILD_CELL_SIZE / RAMP_GLB_NATIVE_W;
  const scaleY = BUILD_RAMP_HIGH_Y / RAMP_GLB_NATIVE_H;
  const scaleZ = BUILD_CELL_SIZE / RAMP_GLB_NATIVE_D;

  return (
    <group
      position={[centerX, baseY, centerZ]}
      rotation={[0, rampGlbRotationY(piece.rotation), 0]}
      scale={[scaleX, scaleY, scaleZ]}
    >
      <primitive object={model} />
    </group>
  );
}

/**
 * Renders the custom floor GLB, stretched to match the engine's floor dimensions
 * (BUILD_CELL_SIZE × BUILD_FLOOR_THICKNESS × BUILD_CELL_SIZE).
 */
function FloorGlbMesh({ piece }: { piece: BuildPiece }) {
  const { scene } = useGLTF(FLOOR_GLB_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);

  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;

  const scaleX = BUILD_CELL_SIZE / FLOOR_GLB_NATIVE_W;
  const scaleY = BUILD_FLOOR_THICKNESS / FLOOR_GLB_NATIVE_H;
  const scaleZ = BUILD_CELL_SIZE / FLOOR_GLB_NATIVE_D;

  // The GLB's local origin sits at the bottom of the slab (Y starts at 0).
  return (
    <group position={[centerX, baseY, centerZ]} scale={[scaleX, scaleY, scaleZ]}>
      <primitive object={model} />
    </group>
  );
}

// ── Image floor (tiled floor with an uploaded image texture) ──────────────────

/** Sides + underside of the image-floor slab; textured tops render in {@link ImageFloorRegionTopLayer}. */
const IMAGE_FLOOR_SLAB_COLOR = "#3a3f48";

function ImageFloorMesh({ piece }: { piece: BuildPiece }) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const y = piece.level * BUILD_LEVEL_HEIGHT + BUILD_FLOOR_THICKNESS / 2;

  return (
    <mesh position={[centerX, y, centerZ]}>
      <boxGeometry args={[BUILD_CELL_SIZE, BUILD_FLOOR_THICKNESS, BUILD_CELL_SIZE]} />
      <meshStandardMaterial color={IMAGE_FLOOR_SLAB_COLOR} roughness={0.9} metalness={0.1} />
    </mesh>
  );
}

/**
 * Renders a build wall GLB, stretched to match the engine's wall dimensions
 * (BUILD_CELL_SIZE × BUILD_WALL_HEIGHT × BUILD_WALL_THICKNESS).
 * E/W edges rotate 90° so the GLB's long axis aligns with world-Z.
 */
function WallGlbMesh({
  piece,
  glbUrl,
  nativeW,
  nativeH
}: {
  piece: BuildPiece;
  glbUrl: string;
  nativeW: number;
  nativeH: number;
}) {
  const { scene } = useGLTF(glbUrl);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);

  const wall = wallMeshTransform(piece);
  const edge = piece.edge as BuildPieceEdge;
  const isEW = edge === "e" || edge === "w";
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const facingFlip = piece.rotation === 180 ? Math.PI : 0;

  const scaleX = BUILD_CELL_SIZE / nativeW;
  const scaleY = BUILD_WALL_HEIGHT / nativeH;
  const scaleZ = scaleX;

  return (
    <group
      position={[wall.position[0], baseY, wall.position[2]]}
      rotation={[0, (isEW ? Math.PI / 2 : 0) + facingFlip, 0]}
      scale={[scaleX, scaleY, scaleZ]}
    >
      <primitive object={model} />
    </group>
  );
}

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
    const lowY = BUILD_RAMP_LOW_Y;
    const highY = BUILD_RAMP_HIGH_Y;
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

function ArborCeilingMesh({
  piece,
  materialProps,
  ghost,
  valid,
  pointerProps,
  pointerEventsPassThrough
}: {
  piece: BuildPiece;
  materialProps: ReturnType<typeof buildMaterialProps>;
  ghost?: boolean;
  valid?: boolean;
  pointerProps: Record<string, unknown>;
  pointerEventsPassThrough?: boolean;
}) {
  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;
  const rotationY = (piece.rotation * Math.PI) / 180;
  const beams = arborCeilingBeams();

  return (
    <group
      position={[centerX, baseY, centerZ]}
      rotation={[0, rotationY, 0]}
      userData={{ buildPieceId: piece.id, buildPiece: piece }}
      {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
      {...pointerProps}
    >
      {beams.map((beam, index) => (
        <mesh key={`${piece.id}-beam-${index}`} position={beam.position}>
          <boxGeometry args={beam.size} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      ))}
      {ghost ? (
        <mesh position={[0, BUILD_LEVEL_HEIGHT - 0.06, 0]}>
          <boxGeometry args={[0.01, 0.01, 0.01]} />
          <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} />
        </mesh>
      ) : null}
    </group>
  );
}

export function BuildPieceMesh({
  piece,
  ghost = false,
  trail = false,
  valid = true,
  highlighted = false,
  interactive = false,
  emitRealLight = false,
  pointerEventsPassThrough = false,
  imageFloorRegion,
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
  /** When true, mount a real point light (budgeted by BuildLayer). */
  emitRealLight?: boolean;
  pointerEventsPassThrough?: boolean;
  /** Connected-region info for image-floor pieces (computed by BuildLayer). */
  imageFloorRegion?: ImageFloorRegion | undefined;
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

  if (piece.kind === "mirror") {
    const { position, size } = wallMeshTransform(piece);
    // Rotate the plane so its normal faces toward the player who placed it.
    // nearestWallEdge returns "s" when the cursor is in the south half of the
    // hit cell (most common when clicking into the next cell ahead while facing
    // north), meaning the player is south of that edge → mirror must face south
    // (−Z). Swapping n↔s and e↔w vs. the "room-interior" convention matches
    // the actual player-facing-wall placement direction.
    const edgeToRotationY: Record<BuildPieceEdge, number> = {
      n: 0,             // faces north (+Z) — player approached from north
      s: Math.PI,       // faces south (−Z) — player approached from south
      e: Math.PI / 2,   // faces east  (+X) — player approached from east
      w: -Math.PI / 2   // faces west  (−X) — player approached from west
    };
    const planeRotationY = edgeToRotationY[piece.edge!];

    if (ghost || trail) {
      return (
        <mesh
          position={position}
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

    return (
      <mesh
        position={position}
        rotation={[0, planeRotationY, 0]}
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
        {...pointerProps}
      >
        <planeGeometry args={[BUILD_CELL_SIZE, BUILD_WALL_HEIGHT]} />
        <MeshReflectorMaterial
          resolution={1024}
          mirror={1}
          roughness={0}
          metalness={0}
          color="#a0a0a0"
          mixStrength={3}
          mixBlur={0}
          blur={[0, 0]}
          depthScale={0}
          minDepthThreshold={0.9}
          maxDepthThreshold={1}
        />
      </mesh>
    );
  }

  if (piece.kind === "wall" || piece.kind === "simple-wall") {
    const { position, rotationY, size } = wallMeshTransform(piece);
    const glbUrl = piece.kind === "simple-wall" ? SIMPLE_WALL_GLB_URL : WALL_GLB_URL;
    const nativeW = piece.kind === "simple-wall" ? SIMPLE_WALL_GLB_NATIVE_W : WALL_GLB_NATIVE_W;
    const nativeH = piece.kind === "simple-wall" ? SIMPLE_WALL_GLB_NATIVE_H : WALL_GLB_NATIVE_H;

    // Ghost / trail previews keep the simple box so the placement wireframe works.
    // Placed walls use the custom GLB.
    if (ghost || trail) {
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

    return (
      <group
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
        {...pointerProps}
      >
        <Suspense fallback={
          // Instant fallback while GLB loads — same box, no pointer events
          <mesh position={position} rotation={[0, rotationY, 0]}>
            <boxGeometry args={size} />
            <meshStandardMaterial {...materialProps} />
          </mesh>
        }>
          <WallGlbMesh piece={piece} glbUrl={glbUrl} nativeW={nativeW} nativeH={nativeH} />
        </Suspense>
      </group>
    );
  }

  if (piece.kind === "doorway" || piece.kind === "window") {
    const parts = edgeOpeningFrameParts(piece);
    const glass = piece.kind === "window";
    return (
      <group userData={{ buildPieceId: piece.id, buildPiece: piece }} {...pointerProps}>
        {parts.map((part, index) => (
          <mesh key={`${piece.id}-${index}`} position={part.position}>
            <boxGeometry args={part.size} />
            <meshStandardMaterial
              {...materialProps}
              {...(glass && index === 2
                ? { transparent: true, opacity: ghost ? 0.35 : 0.45, roughness: 0.05, metalness: 0.1 }
                : {})}
            />
          </mesh>
        ))}
        {ghost ? (
          <mesh position={parts[0]?.position ?? [0, 0, 0]}>
            <boxGeometry args={[0.01, 0.01, 0.01]} />
            <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} />
          </mesh>
        ) : null}
      </group>
    );
  }

  if (piece.kind === "arbor-ceiling") {
    return (
      <ArborCeilingMesh
        piece={piece}
        materialProps={materialProps}
        ghost={ghost}
        valid={valid}
        pointerProps={pointerProps}
        pointerEventsPassThrough={pointerEventsPassThrough}
      />
    );
  }

  if (piece.kind === "light") {
    if (ghost || trail) {
      const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
      const centerX = (footprint.minX + footprint.maxX) / 2;
      const centerZ = (footprint.minZ + footprint.maxZ) / 2;
      const baseY = piece.level * BUILD_LEVEL_HEIGHT;
      const lampScale = LAMP_TARGET_HEIGHT / LAMP_GLB_NATIVE_H;
      const bulbY = LAMP_BULB_NATIVE_Y * lampScale;
      return (
        <group position={[centerX, baseY, centerZ]} userData={{ buildPieceId: piece.id, buildPiece: piece }} {...pointerProps}>
          <mesh position={[0, LAMP_TARGET_HEIGHT * 0.35, 0]}>
            <cylinderGeometry args={[0.18 * lampScale, 0.22 * lampScale, LAMP_TARGET_HEIGHT * 0.5, 10]} />
            <meshStandardMaterial {...materialProps} emissive="#ffdd99" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[0, bulbY, 0]}>
            <sphereGeometry args={[0.12 * lampScale, 10, 10]} />
            <meshStandardMaterial color="#fff8e8" emissive="#ffe8b0" emissiveIntensity={ghost ? 0.8 : 1.2} />
          </mesh>
          {ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null}
        </group>
      );
    }

    return (
      <Suspense
        fallback={
          <group userData={{ buildPieceId: piece.id, buildPiece: piece }}>
            <LampGlbMesh
              cell={piece.cell}
              level={piece.level}
              materialId={materialId}
              bulbIntensity={1.2}
              emitRealLight={emitRealLight}
              userData={{ buildPieceId: piece.id, buildPiece: piece }}
              {...(pointerEventsPassThrough ? { pointerEventsPassThrough: true } : {})}
              {...pointerProps}
            />
          </group>
        }
      >
        <LampGlbMesh
          cell={piece.cell}
          level={piece.level}
          materialId={materialId}
          bulbIntensity={1.2}
          emitRealLight={emitRealLight}
          userData={{ buildPieceId: piece.id, buildPiece: piece }}
          {...(pointerEventsPassThrough ? { pointerEventsPassThrough: true } : {})}
          {...pointerProps}
        />
      </Suspense>
    );
  }

  if (piece.kind === "floor" || piece.kind === "image-floor") {
    const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
    const y = piece.level * BUILD_LEVEL_HEIGHT + BUILD_FLOOR_THICKNESS / 2;
    const centerX = (footprint.minX + footprint.maxX) / 2;
    const centerZ = (footprint.minZ + footprint.maxZ) / 2;
    const boxSize: [number, number, number] = [BUILD_CELL_SIZE, BUILD_FLOOR_THICKNESS, BUILD_CELL_SIZE];

    // Ghost / trail previews keep the simple box so the placement wireframe works.
    if (ghost || trail) {
      return (
        <mesh
          position={[centerX, y, centerZ]}
          userData={{ buildPieceId: piece.id, buildPiece: piece }}
          {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
          {...pointerProps}
        >
          <boxGeometry args={boxSize} />
          <meshStandardMaterial {...materialProps} />
          {ghost ? <Edges color={valid ? "#6dff9a" : "#ff6b6b"} linewidth={2} /> : null}
        </mesh>
      );
    }

    if (piece.kind === "image-floor") {
      return (
        <group
          userData={{ buildPieceId: piece.id, buildPiece: piece }}
          {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
          {...pointerProps}
        >
          <ImageFloorMesh piece={piece} />
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
            <mesh position={[centerX, y, centerZ]}>
              <boxGeometry args={boxSize} />
              <meshStandardMaterial {...materialProps} />
            </mesh>
          }
        >
          <FloorGlbMesh piece={piece} />
        </Suspense>
      </group>
    );
  }

  const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
  const centerX = (footprint.minX + footprint.maxX) / 2;
  const centerZ = (footprint.minZ + footprint.maxZ) / 2;
  const baseY = piece.level * BUILD_LEVEL_HEIGHT;

  // Ghost / trail previews keep the procedural wedge so placement wireframe works.
  if (ghost || trail) {
    return (
      <group
        position={[centerX, baseY, centerZ]}
        userData={{ buildPieceId: piece.id, buildPiece: piece }}
        {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
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

  return (
    <group
      userData={{ buildPieceId: piece.id, buildPiece: piece }}
      {...(pointerEventsPassThrough ? { raycast: () => {} } : {})}
      {...pointerProps}
    >
      <Suspense
        fallback={
          <group position={[centerX, baseY, centerZ]}>
            <mesh>
              <RampGeometry rotation={piece.rotation} />
              <meshStandardMaterial {...materialProps} side={DoubleSide} />
            </mesh>
          </group>
        }
      >
        <RampGlbMesh piece={piece} />
      </Suspense>
    </group>
  );
}
