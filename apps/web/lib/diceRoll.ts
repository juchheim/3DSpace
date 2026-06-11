/**
 * Deterministic seeded dice-roll motion for the "Pair of dice" room object.
 *
 * A roll is broadcast to the room as `{ rollId, rollSeed }` template parameters;
 * every client derives the exact same toss (ballistic arcs, tumbling, bounce
 * schedule, final faces) from the seed, so the animation and the result stay in
 * sync without streaming poses. The toss is piecewise closed-form — parabolic
 * hops with restitution-damped bounces, a tumble that slows on each impact, and
 * a final slerp that settles the chosen face up — which keeps it cheap, fully
 * reproducible, and naturally varied from seed to seed.
 *
 * All distances are object-local meters at template scale 1.
 */

export const DICE_PAIR_DIE_SIZE_M = 0.36;
/** Lane offset for each die from the object's center. */
export const DICE_PAIR_HOME_X_M = 0.28;
/** Resting height of a die center above the object's origin. */
export const DICE_PAIR_REST_Y_M = DICE_PAIR_DIE_SIZE_M / 2;

const GRAVITY = 9.81;
/** Stop bouncing when the next hop apex would be below this. */
const MIN_BOUNCE_APEX_M = 0.05;
/** End-position jitter around the lane home, kept small so dice never collide. */
const END_JITTER_M = 0.07;
const SETTLE_DURATION_S = 0.42;

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface DieMotionSpec {
  /** Up-facing pip count once settled (1-6). */
  face: number;
  /** Lane rest position the toss is centered on. */
  homeX: number;
  homeZ: number;
  /** Final rest position (home plus seeded jitter). */
  endX: number;
  endZ: number;
  /** Seconds after roll start before this die lifts off. */
  delaySec: number;
  /** Launch vertical speed for hop k = `launchSpeed * restitution^k`. */
  launchSpeed: number;
  restitution: number;
  /** Per-hop durations; hop k spans `2 * vy_k / g`. */
  hopDurations: number[];
  /** Tumble axis (unit) and initial rate; rate decays by `spinDamping` per hop. */
  spinAxis: [number, number, number];
  spinRate: number;
  spinDamping: number;
  /** Orientation at rest: chosen face up plus a seeded yaw. */
  finalQuat: Quat;
  /** Seconds from roll start until this die is fully settled. */
  durationSec: number;
}

export interface DiceRollSpec {
  seed: number;
  dice: [DieMotionSpec, DieMotionSpec];
  /** Seconds until both dice are settled. */
  totalDurationSec: number;
}

export interface DieStart {
  x: number;
  z: number;
  quat: Quat;
}

export interface DieSample {
  x: number;
  y: number;
  z: number;
  quat: Quat;
  settled: boolean;
}

/** Small fast deterministic PRNG (32-bit state, uniform [0, 1)). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDENTITY_QUAT: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function quatFromAxisAngle(axis: [number, number, number], angleRad: number): Quat {
  const half = angleRad / 2;
  const s = Math.sin(half);
  return { x: axis[0] * s, y: axis[1] * s, z: axis[2] * s, w: Math.cos(half) };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
  };
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const target = dot < 0 ? { x: -b.x, y: -b.y, z: -b.z, w: -b.w } : b;
  dot = Math.abs(dot);
  if (dot > 0.9995) {
    return quatNormalize({
      x: a.x + (target.x - a.x) * t,
      y: a.y + (target.y - a.y) * t,
      z: a.z + (target.z - a.z) * t,
      w: a.w + (target.w - a.w) * t
    });
  }
  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return quatNormalize({
    x: a.x * wa + target.x * wb,
    y: a.y * wa + target.y * wb,
    z: a.z * wa + target.z * wb,
    w: a.w * wa + target.w * wb
  });
}

export function rotateVectorByQuat(q: Quat, v: [number, number, number]): [number, number, number] {
  // v' = v + 2w(q×v) + 2(q×(q×v))
  const qv: [number, number, number] = [q.x, q.y, q.z];
  const cross1: [number, number, number] = [
    qv[1] * v[2] - qv[2] * v[1],
    qv[2] * v[0] - qv[0] * v[2],
    qv[0] * v[1] - qv[1] * v[0]
  ];
  const cross2: [number, number, number] = [
    qv[1] * cross1[2] - qv[2] * cross1[1],
    qv[2] * cross1[0] - qv[0] * cross1[2],
    qv[0] * cross1[1] - qv[1] * cross1[0]
  ];
  return [
    v[0] + 2 * (q.w * cross1[0] + cross2[0]),
    v[1] + 2 * (q.w * cross1[1] + cross2[1]),
    v[2] + 2 * (q.w * cross1[2] + cross2[2])
  ];
}

const HALF_PI = Math.PI / 2;

/**
 * Pip layout of the bundled die GLB (verified by axis-view renders; opposite
 * faces sum to 7): +X=1, −X=6, +Y=4, −Y=3, +Z=2, −Z=5.
 */
export const DIE_FACE_NORMALS: Record<number, [number, number, number]> = {
  1: [1, 0, 0],
  2: [0, 0, 1],
  3: [0, -1, 0],
  4: [0, 1, 0],
  5: [0, 0, -1],
  6: [-1, 0, 0]
};

/** Rotation bringing the given pip face's outward normal to world +Y. */
export function faceUpQuaternion(face: number): Quat {
  switch (face) {
    case 1: return quatFromAxisAngle([0, 0, 1], HALF_PI);
    case 6: return quatFromAxisAngle([0, 0, 1], -HALF_PI);
    case 4: return IDENTITY_QUAT;
    case 3: return quatFromAxisAngle([1, 0, 0], Math.PI);
    case 2: return quatFromAxisAngle([1, 0, 0], -HALF_PI);
    case 5: return quatFromAxisAngle([1, 0, 0], HALF_PI);
    default: return IDENTITY_QUAT;
  }
}

function smoothstep(t: number) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

function createDieSpec(rng: () => number, dieIndex: 0 | 1): DieMotionSpec {
  const face = 1 + Math.floor(rng() * 6);
  const launchSpeed = 2.7 + rng() * 0.8;
  const restitution = 0.4 + rng() * 0.1;
  const spinRate = 9 + rng() * 6;

  // Tumble axis biased toward horizontal for a natural end-over-end look.
  const ax = rng() * 2 - 1;
  const ay = (rng() * 2 - 1) * 0.4;
  const az = rng() * 2 - 1;
  const axisLen = Math.hypot(ax, ay, az) || 1;

  const endXJitter = (rng() * 2 - 1) * END_JITTER_M;
  const endZJitter = (rng() * 2 - 1) * END_JITTER_M;
  const endYaw = rng() * Math.PI * 2;
  const delayDraw = 0.05 + rng() * 0.1;

  const hopDurations: number[] = [];
  let vy = launchSpeed;
  while ((vy * vy) / (2 * GRAVITY) >= MIN_BOUNCE_APEX_M) {
    hopDurations.push((2 * vy) / GRAVITY);
    vy *= restitution;
  }

  const homeX = (dieIndex === 0 ? -1 : 1) * DICE_PAIR_HOME_X_M;
  const delaySec = dieIndex === 0 ? 0 : delayDraw;
  const airDuration = hopDurations.reduce((sum, d) => sum + d, 0);

  return {
    face,
    homeX,
    homeZ: 0,
    endX: homeX + endXJitter,
    endZ: endZJitter,
    delaySec,
    launchSpeed,
    restitution,
    hopDurations,
    spinAxis: [ax / axisLen, ay / axisLen, az / axisLen],
    spinRate,
    spinDamping: 0.55,
    finalQuat: quatNormalize(quatMultiply(quatFromAxisAngle([0, 1, 0], endYaw), faceUpQuaternion(face))),
    durationSec: delaySec + airDuration + SETTLE_DURATION_S
  };
}

export function createDiceRollSpec(seed: number): DiceRollSpec {
  const rng = mulberry32(seed);
  const dice: [DieMotionSpec, DieMotionSpec] = [createDieSpec(rng, 0), createDieSpec(rng, 1)];
  return {
    seed,
    dice,
    totalDurationSec: Math.max(dice[0].durationSec, dice[1].durationSec)
  };
}

/** Faces and total for a seed without sampling motion (for result UI). */
export function diceRollResult(seed: number): { faces: [number, number]; total: number } {
  const spec = createDiceRollSpec(seed);
  return {
    faces: [spec.dice[0].face, spec.dice[1].face],
    total: spec.dice[0].face + spec.dice[1].face
  };
}

/** Final rest pose for a die (used when mounting mid-state or after settle). */
export function dieRestSample(spec: DieMotionSpec): DieSample {
  return { x: spec.endX, y: DICE_PAIR_REST_Y_M, z: spec.endZ, quat: spec.finalQuat, settled: true };
}

/**
 * Sample a die's pose `tSec` seconds after roll start. `start` is the pose the
 * die had when the roll began so liftoff is continuous from wherever the die
 * was resting; it defaults to the lane home with identity orientation.
 */
export function sampleDieMotion(spec: DieMotionSpec, tSec: number, start?: DieStart): DieSample {
  const startX = start?.x ?? spec.homeX;
  const startZ = start?.z ?? spec.homeZ;
  const startQuat = start?.quat ?? IDENTITY_QUAT;

  if (tSec <= spec.delaySec) {
    return { x: startX, y: DICE_PAIR_REST_Y_M, z: startZ, quat: startQuat, settled: false };
  }
  if (tSec >= spec.durationSec) {
    return dieRestSample(spec);
  }

  const airDuration = spec.hopDurations.reduce((sum, d) => sum + d, 0);
  const t = tSec - spec.delaySec;

  // Horizontal drift: constant velocity per hop, damped on each bounce, sized
  // so the cumulative displacement lands exactly on the end position.
  const friction = 0.55;
  let weight = 0;
  for (let k = 0; k < spec.hopDurations.length; k++) {
    weight += Math.pow(friction, k) * spec.hopDurations[k]!;
  }
  const vx0 = weight > 0 ? (spec.endX - startX) / weight : 0;
  const vz0 = weight > 0 ? (spec.endZ - startZ) / weight : 0;

  // Tumble angle accumulates per hop at a damped rate.
  let x = startX;
  let z = startZ;
  let y = DICE_PAIR_REST_Y_M;
  let spinAngle = 0;
  let inAir = false;

  if (t < airDuration) {
    let elapsed = 0;
    for (let k = 0; k < spec.hopDurations.length; k++) {
      const dur = spec.hopDurations[k]!;
      const damp = Math.pow(friction, k);
      const spinDamp = Math.pow(spec.spinDamping, k);
      if (t < elapsed + dur) {
        const local = t - elapsed;
        const vy = spec.launchSpeed * Math.pow(spec.restitution, k);
        y = DICE_PAIR_REST_Y_M + vy * local - 0.5 * GRAVITY * local * local;
        x += vx0 * damp * local;
        z += vz0 * damp * local;
        spinAngle += spec.spinRate * spinDamp * local;
        inAir = true;
        break;
      }
      x += vx0 * damp * dur;
      z += vz0 * damp * dur;
      spinAngle += spec.spinRate * spinDamp * dur;
      elapsed += dur;
    }
  } else {
    x = spec.endX;
    z = spec.endZ;
    let total = 0;
    for (let k = 0; k < spec.hopDurations.length; k++) {
      total += spec.spinRate * Math.pow(spec.spinDamping, k) * spec.hopDurations[k]!;
    }
    // Residual slow tumble through the settle window, blended out by the slerp.
    const settleRate = spec.spinRate * Math.pow(spec.spinDamping, spec.hopDurations.length);
    spinAngle = total + settleRate * (t - airDuration);
  }

  const tumble = quatNormalize(quatMultiply(quatFromAxisAngle(spec.spinAxis, spinAngle), startQuat));

  if (inAir) {
    // Begin steering toward the final orientation during the last hop so the
    // die visibly "lands" on its result instead of snapping after touchdown.
    const lastHopStart = airDuration - (spec.hopDurations[spec.hopDurations.length - 1] ?? 0);
    if (t > lastHopStart) {
      const lastDur = airDuration - lastHopStart;
      const blend = 0.55 * smoothstep((t - lastHopStart) / lastDur);
      return { x, y, z, quat: quatSlerp(tumble, spec.finalQuat, blend), settled: false };
    }
    return { x, y, z, quat: tumble, settled: false };
  }

  const settleT = smoothstep((t - airDuration) / SETTLE_DURATION_S);
  // Carry the landing blend (0.55) into the settle window for continuity.
  const blend = 0.55 + 0.45 * settleT;
  return { x, y, z, quat: quatSlerp(tumble, spec.finalQuat, blend), settled: false };
}
