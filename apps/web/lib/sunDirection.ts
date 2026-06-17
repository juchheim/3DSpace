/**
 * Sun direction helpers — pure math, no THREE import needed.
 *
 * Azimuth convention: 0° = south (+Z in Three.js), 90° = west (+X).
 * Elevation convention: 0° = horizon, 90° = zenith (+Y).
 *
 * The resulting direction vector points FROM the light position TOWARD the origin
 * (i.e., the direction light rays travel, which is the opposite of the position vector).
 */

export type Vec3 = { x: number; y: number; z: number };

/**
 * Returns a normalised unit direction vector pointing FROM the sun toward the scene.
 * @param azimuthDeg  0=South(+Z), 90=West(+X), 180=North(-Z), 270=East(-X)
 * @param elevationDeg  0=horizon, 90=zenith
 */
export function sunDirectionVector(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;

  const x = Math.sin(az) * Math.cos(el);
  const y = Math.sin(el);
  const z = Math.cos(az) * Math.cos(el);

  // Normalise (should already be unit length but guard against floating point drift)
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Returns a position vector for the sun, suitable for a Three.js directional light.
 * Multiply the unit direction by `radius` so the light sits far from the scene.
 * @param azimuthDeg  0=South(+Z), 90=West(+X)
 * @param elevationDeg  0=horizon, 90=zenith
 * @param radius  Distance from origin (default 50 m)
 */
export function sunPosition(azimuthDeg: number, elevationDeg: number, radius = 50): Vec3 {
  const dir = sunDirectionVector(azimuthDeg, elevationDeg);
  return { x: dir.x * radius, y: dir.y * radius, z: dir.z * radius };
}
