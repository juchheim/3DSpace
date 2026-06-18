/**
 * Pure helper for the in-world light editor's "Focus" action: given the
 * camera's look anchor (the avatar eye) and a world point (the light), return
 * the third-person yaw/pitch that orient the view toward that point.
 *
 * Conventions match `useThirdPersonCamera` + `RoomView3D`: yaw = atan2(dx, dz)
 * (the camera sits opposite this heading and looks at the avatar), and a
 * *positive* pitch tilts the camera arm up so it looks down — hence we invert
 * the elevation to look up toward a higher light. Pitch is clamped to the same
 * range the camera enforces.
 */
export type Point3 = { x: number; y: number; z: number };

/** Pitch clamp mirrored from `useThirdPersonCamera` (MIN_PITCH / MAX_PITCH). */
export const CAMERA_MIN_PITCH = -0.55;
export const CAMERA_MAX_PITCH = 1.22;

export function framingAnglesForPoint(eye: Point3, point: Point3): { yaw: number; pitch: number } {
  const dx = point.x - eye.x;
  const dz = point.z - eye.z;
  const yaw = Math.atan2(dx, dz);
  const horizontal = Math.hypot(dx, dz);
  const elevation = Math.atan2(point.y - eye.y, Math.max(0.001, horizontal));
  const pitch = Math.min(CAMERA_MAX_PITCH, Math.max(CAMERA_MIN_PITCH, -elevation));
  return { yaw, pitch };
}
