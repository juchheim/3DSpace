import { describe, expect, it } from "vitest";

import {
  createDiceRollSpec,
  diceRollResult,
  dieRestSample,
  faceUpQuaternion,
  rotateVectorByQuat,
  sampleDieMotion,
  DICE_PAIR_DIE_SIZE_M,
  DICE_PAIR_REST_Y_M,
  DIE_FACE_NORMALS
} from "../lib/diceRoll";

const SEEDS = [1, 42, 20260611, 0xdeadbeef, 987654321];

describe("faceUpQuaternion", () => {
  it("rotates each pip face's normal to world +Y", () => {
    for (let face = 1; face <= 6; face++) {
      const rotated = rotateVectorByQuat(faceUpQuaternion(face), DIE_FACE_NORMALS[face]!);
      expect(rotated[0]).toBeCloseTo(0, 6);
      expect(rotated[1]).toBeCloseTo(1, 6);
      expect(rotated[2]).toBeCloseTo(0, 6);
    }
  });
});

describe("createDiceRollSpec", () => {
  it("is deterministic for a given seed", () => {
    for (const seed of SEEDS) {
      expect(createDiceRollSpec(seed)).toEqual(createDiceRollSpec(seed));
    }
    const a = createDiceRollSpec(7);
    const b = createDiceRollSpec(7);
    for (const t of [0, 0.2, 0.5, 0.9, 1.4, 2.0, 3.0]) {
      expect(sampleDieMotion(a.dice[0], t)).toEqual(sampleDieMotion(b.dice[0], t));
      expect(sampleDieMotion(a.dice[1], t)).toEqual(sampleDieMotion(b.dice[1], t));
    }
  });

  it("varies between seeds", () => {
    const results = new Set(SEEDS.map((seed) => JSON.stringify(diceRollResult(seed))));
    expect(results.size).toBeGreaterThan(1);
    const specA = createDiceRollSpec(1);
    const specB = createDiceRollSpec(2);
    expect(specA.dice[0].launchSpeed).not.toBe(specB.dice[0].launchSpeed);
  });

  it("produces faces in 1..6 and a sane duration", () => {
    for (const seed of SEEDS) {
      const spec = createDiceRollSpec(seed);
      for (const die of spec.dice) {
        expect(die.face).toBeGreaterThanOrEqual(1);
        expect(die.face).toBeLessThanOrEqual(6);
      }
      expect(spec.totalDurationSec).toBeGreaterThan(0.8);
      expect(spec.totalDurationSec).toBeLessThan(4);
    }
  });

  it("keeps the two dice in separated lanes so they never collide", () => {
    for (const seed of SEEDS) {
      const spec = createDiceRollSpec(seed);
      expect(Math.abs(spec.dice[0].endX - spec.dice[1].endX)).toBeGreaterThan(DICE_PAIR_DIE_SIZE_M);
    }
  });
});

describe("sampleDieMotion", () => {
  it("never sinks below the floor and stays continuous", () => {
    for (const seed of SEEDS) {
      const spec = createDiceRollSpec(seed);
      for (const die of spec.dice) {
        let prev = sampleDieMotion(die, 0);
        for (let t = 0; t <= die.durationSec + 0.2; t += 1 / 120) {
          const sample = sampleDieMotion(die, t);
          expect(sample.y).toBeGreaterThanOrEqual(DICE_PAIR_REST_Y_M - 1e-6);
          // No teleports: max speed bounded (~5 m/s vertical, far less horizontal).
          const dist = Math.hypot(sample.x - prev.x, sample.y - prev.y, sample.z - prev.z);
          expect(dist).toBeLessThan(0.1);
          prev = sample;
        }
      }
    }
  });

  it("leaves the ground during the toss", () => {
    const spec = createDiceRollSpec(123);
    for (const die of spec.dice) {
      let maxY = 0;
      for (let t = 0; t <= die.durationSec; t += 1 / 120) {
        maxY = Math.max(maxY, sampleDieMotion(die, t).y);
      }
      expect(maxY).toBeGreaterThan(DICE_PAIR_REST_Y_M + 0.3);
    }
  });

  it("settles exactly on the final rest pose with the chosen face up", () => {
    for (const seed of SEEDS) {
      const spec = createDiceRollSpec(seed);
      for (const die of spec.dice) {
        const sample = sampleDieMotion(die, die.durationSec + 0.01);
        const rest = dieRestSample(die);
        expect(sample).toEqual(rest);
        expect(sample.settled).toBe(true);
        const up = rotateVectorByQuat(sample.quat, DIE_FACE_NORMALS[die.face]!);
        expect(up[1]).toBeCloseTo(1, 5);
      }
    }
  });

  it("starts continuously from a custom start pose", () => {
    const spec = createDiceRollSpec(55);
    const start = { x: spec.dice[0].homeX + 0.05, z: -0.04, quat: faceUpQuaternion(3) };
    const before = sampleDieMotion(spec.dice[0], 0, start);
    expect(before.x).toBe(start.x);
    expect(before.z).toBe(start.z);
    expect(before.quat).toEqual(start.quat);
    const end = sampleDieMotion(spec.dice[0], spec.dice[0].durationSec + 1, start);
    expect(end).toEqual(dieRestSample(spec.dice[0]));
  });

  it("is roughly uniform across faces over many seeds", () => {
    const counts = new Map<number, number>();
    for (let seed = 1; seed <= 600; seed++) {
      const { faces } = diceRollResult(seed);
      for (const face of faces) counts.set(face, (counts.get(face) ?? 0) + 1);
    }
    for (let face = 1; face <= 6; face++) {
      const share = (counts.get(face) ?? 0) / 1200;
      expect(share).toBeGreaterThan(0.1);
      expect(share).toBeLessThan(0.24);
    }
  });
});
