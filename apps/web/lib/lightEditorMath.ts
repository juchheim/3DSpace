/**
 * Pure, framework-free math for the in-world light editor.
 *
 * No `three` / React imports so the helpers stay trivially unit-testable. All
 * vectors are plain `{ x, y, z }`. Angle conventions (Three.js / Y-up):
 *   - azimuth = atan2(dir.x, dir.z) in degrees (0° points toward +Z, +90° → +X)
 *   - elevation = asin(dir.y) in degrees (+90° straight up, -90° straight down)
 */
import {
  LIGHT_MAX_INTENSITY,
  LIGHT_MAX_DISTANCE,
  LIGHT_MAX_AREA_SIZE,
} from "@3dspace/contracts";

export type Vec3 = { x: number; y: number; z: number };

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

// ── tiny vector helpers ─────────────────────────────────────────────────────
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (a: Vec3): number => Math.sqrt(dot(a, a));
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
}
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Intersect a pointer ray with the plane through `anchor` whose normal is
 * `planeNormal`. Used for camera-relative target / handle drags so a small
 * mouse move never flings the light at grazing angles. Returns null when the
 * ray is (near-)parallel to the plane.
 */
export function projectPointerToDragPlane(
  rayOrigin: Vec3,
  rayDir: Vec3,
  anchor: Vec3,
  planeNormal: Vec3
): Vec3 | null {
  const n = normalize(planeNormal);
  const denom = dot(rayDir, n);
  if (Math.abs(denom) < 1e-6) return null;
  const t = dot(sub(anchor, rayOrigin), n) / denom;
  if (!Number.isFinite(t)) return null;
  return add(rayOrigin, scale(rayDir, t));
}

/** Direction from `position` toward `target` expressed as azimuth/elevation. */
export function targetToAngles(position: Vec3, target: Vec3): { azimuthDeg: number; elevationDeg: number } {
  const d = normalize(sub(target, position));
  const elevationDeg = Math.asin(clamp(d.y, -1, 1)) * DEG;
  const azimuthDeg = Math.atan2(d.x, d.z) * DEG;
  return { azimuthDeg, elevationDeg };
}

/** Inverse of {@link targetToAngles}: place a target `distance` from `position`. */
export function anglesToTarget(position: Vec3, azimuthDeg: number, elevationDeg: number, distance: number): Vec3 {
  const az = azimuthDeg * RAD;
  const el = elevationDeg * RAD;
  const horizontal = Math.cos(el);
  const dir: Vec3 = {
    x: horizontal * Math.sin(az),
    y: Math.sin(el),
    z: horizontal * Math.cos(az),
  };
  return add(position, scale(dir, distance));
}

/** A unit vector perpendicular to `axis` (stable for near-vertical axes). */
function perpendicular(axis: Vec3): Vec3 {
  const a = normalize(axis);
  const ref: Vec3 = Math.abs(a.y) > 0.99 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  return normalize(cross(a, ref));
}

/**
 * Cone half-angle (degrees, clamped 1–90) implied by a `mouthPoint` dragged off
 * the cone axis (`position` → `target`).
 */
export function coneAngleFromConeMouth(position: Vec3, target: Vec3, mouthPoint: Vec3): number {
  const axis = normalize(sub(target, position));
  const v = normalize(sub(mouthPoint, position));
  const angle = Math.acos(clamp(dot(axis, v), -1, 1)) * DEG;
  return clamp(angle, 1, 90);
}

/**
 * A point on the cone-mouth rim for placing the shape handle: travel `distance`
 * along the axis from `position`, then offset by the mouth radius along a
 * perpendicular.
 */
export function coneMouthForAngle(position: Vec3, target: Vec3, angleDeg: number, distance: number): Vec3 {
  const axis = normalize(sub(target, position));
  const center = add(position, scale(axis, distance));
  const radius = distance * Math.tan(clamp(angleDeg, 1, 90) * RAD);
  return add(center, scale(perpendicular(axis), radius));
}

/** Snap `value` to the nearest multiple of `step` (no-op for step ≤ 0). */
export function snap(value: number, step: number): number {
  if (!(step > 0)) return value;
  return Math.round(value / step) * step;
}

/** Adjustable scalar fields with contract-defined numeric bounds. */
export type ClampableLightField =
  | "intensity"
  | "distance"
  | "decay"
  | "angleDeg"
  | "penumbra"
  | "width"
  | "height";

const FIELD_BOUNDS: Record<ClampableLightField, { min: number; max: number }> = {
  intensity: { min: 0, max: LIGHT_MAX_INTENSITY },
  distance: { min: 0, max: LIGHT_MAX_DISTANCE },
  decay: { min: 0, max: 4 },
  angleDeg: { min: 1, max: 90 },
  penumbra: { min: 0, max: 1 },
  // width/height are `.positive()` in the schema; use a tiny floor so a drag to
  // zero never produces a rejected value.
  width: { min: 0.1, max: LIGHT_MAX_AREA_SIZE },
  height: { min: 0.1, max: LIGHT_MAX_AREA_SIZE },
};

/** Clamp a scalar light field to its contract bounds. */
export function clampLightField(field: ClampableLightField, value: number): number {
  const b = FIELD_BOUNDS[field];
  return clamp(value, b.min, b.max);
}
