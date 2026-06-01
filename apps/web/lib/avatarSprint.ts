/** Walk speed multiplier while Shift is held and the avatar is moving. */
export const AVATAR_SPRINT_SPEED_MULTIPLIER = 1.65;
/** Jump height multiplier when sprinting at takeoff (longer horizontal carry). */
export const AVATAR_SPRINT_JUMP_HEIGHT_MULTIPLIER = 1.35;

const MOVEMENT_KEY_CODES = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD"
] as const;

export function isShiftHeld(keys: ReadonlySet<string>) {
  return keys.has("ShiftLeft") || keys.has("ShiftRight");
}

export function hasMovementInput(keys: ReadonlySet<string>, touch: { x: number; z: number }) {
  if (Math.hypot(touch.x, touch.z) > 0) return true;
  return MOVEMENT_KEY_CODES.some((code) => keys.has(code));
}

export function isSprinting(
  keys: ReadonlySet<string>,
  touch: { x: number; z: number },
  moving: boolean
) {
  return moving && isShiftHeld(keys);
}

/** Sprint jump when Shift is held and the player is trying to move (includes mid-air strafe). */
export function wantsSprintJump(keys: ReadonlySet<string>, touch: { x: number; z: number }) {
  return isShiftHeld(keys) && hasMovementInput(keys, touch);
}
