"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import type { RoomLight } from "@3dspace/contracts";

/** Cone/beam length used for the spot helper when the light has no distance. */
const SPOT_FALLBACK_LEN = 6;

/**
 * Always-on (while selected) tinted visualization for a light: a range sphere
 * (point), beam cone (spot), or panel rect (area) oriented at the target, plus
 * a faint vertical stem + ground disc so the fixture's height and ground
 * position read at a glance. Pure custom meshes/lines (tinted) — no real-light
 * refs needed.
 */
export function LightHelpers({ light, tint }: { light: RoomLight; tint: string }) {
  const p = light.position;

  const spot = useMemo(() => {
    if (light.type !== "spot") return null;
    const t = light.target ?? { x: p.x, y: 0, z: p.z };
    const dir = new Vector3(t.x - p.x, t.y - p.y, t.z - p.z);
    if (dir.lengthSq() < 1e-9) dir.set(0, -1, 0);
    dir.normalize();
    const L = light.distance && light.distance > 0 ? light.distance : SPOT_FALLBACK_LEN;
    const R = L * Math.tan(((light.angleDeg ?? 30) * Math.PI) / 180);
    const center = new Vector3(p.x, p.y, p.z).add(dir.clone().multiplyScalar(L / 2));
    // ConeGeometry apex points +Y; orient +Y to -dir so the apex sits at the light.
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().negate());
    return { L, R, center: [center.x, center.y, center.z] as [number, number, number], quat };
  }, [light, p.x, p.y, p.z]);

  const area = useMemo(() => {
    if (light.type !== "area") return null;
    const t = light.target ?? { x: p.x, y: p.y - 1, z: p.z };
    const normal = new Vector3(t.x - p.x, t.y - p.y, t.z - p.z);
    if (normal.lengthSq() < 1e-9) normal.set(0, -1, 0);
    normal.normalize();
    const w = light.width ?? 2;
    const h = light.height ?? 2;
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
    const corners: [number, number, number][] = [
      [-w / 2, -h / 2, 0],
      [w / 2, -h / 2, 0],
      [w / 2, h / 2, 0],
      [-w / 2, h / 2, 0],
      [-w / 2, -h / 2, 0],
    ];
    return { quat, corners };
  }, [light, p.x, p.y, p.z]);

  const stem: [number, number, number][] = [
    [p.x, p.y, p.z],
    [p.x, 0, p.z],
  ];

  return (
    <>
      {/* Vertical stem + ground disc */}
      <Line points={stem} color={tint} lineWidth={1} dashed dashSize={0.15} gapSize={0.1} transparent opacity={0.5} depthTest={false} renderOrder={500} />
      <mesh position={[p.x, 0.02, p.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={500}>
        <ringGeometry args={[0.22, 0.3, 28]} />
        <meshBasicMaterial color={tint} transparent opacity={0.5} depthWrite={false} />
      </mesh>

      {/* Range sphere (point) */}
      {light.type === "point" && (light.distance ?? 0) > 0 ? (
        <mesh position={[p.x, p.y, p.z]} renderOrder={500}>
          <sphereGeometry args={[light.distance as number, 24, 16]} />
          <meshBasicMaterial color={tint} wireframe transparent opacity={0.1} depthWrite={false} />
        </mesh>
      ) : null}

      {/* Beam cone (spot) */}
      {spot ? (
        <mesh position={spot.center} quaternion={spot.quat} renderOrder={500}>
          <coneGeometry args={[spot.R, spot.L, 28, 1, true]} />
          <meshBasicMaterial color={tint} wireframe transparent opacity={0.18} depthWrite={false} />
        </mesh>
      ) : null}

      {/* Panel rect (area) */}
      {area ? (
        <group position={[p.x, p.y, p.z]} quaternion={area.quat}>
          <Line points={area.corners} color={tint} lineWidth={2} transparent opacity={0.85} depthTest={false} renderOrder={500} />
        </group>
      ) : null}
    </>
  );
}
