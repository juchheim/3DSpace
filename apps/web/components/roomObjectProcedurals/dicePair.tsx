"use client";

import { Html, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Group } from "three";
import type { ProceduralProps } from "./types";
import {
  createDiceRollSpec,
  dieRestSample,
  sampleDieMotion,
  DICE_PAIR_DIE_SIZE_M,
  type DieSample,
  type DieStart,
  type DiceRollSpec
} from "../../lib/diceRoll";

export const DICE_PAIR_PROCEDURAL_ID = "dice-pair";
export const DICE_PAIR_DISPLAY_NAME = "Pair of dice";

const DICE_GLB_URL = "/room-objects/assets/dice.glb";
/** The bundled die GLB is a 2-unit cube; scale each clone to the real die size. */
const DIE_MESH_SCALE = DICE_PAIR_DIE_SIZE_M / 2;

export const DICE_PAIR_DEFAULT_PARAMETERS: Record<string, unknown> = {
  rollId: 0,
  rollSeed: 20260611
};

function readRoll(parameters: Record<string, unknown>): { rollId: number; rollSeed: number } {
  const rollId = typeof parameters.rollId === "number" && Number.isFinite(parameters.rollId) ? parameters.rollId : 0;
  const rollSeed =
    typeof parameters.rollSeed === "number" && Number.isFinite(parameters.rollSeed)
      ? parameters.rollSeed >>> 0
      : (DICE_PAIR_DEFAULT_PARAMETERS.rollSeed as number);
  return { rollId, rollSeed };
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Playback = {
  spec: DiceRollSpec;
  elapsed: number;
  starts: [DieStart, DieStart];
};

function applySample(group: Group | null, sample: DieSample) {
  if (!group) return;
  group.position.set(sample.x, sample.y, sample.z);
  group.quaternion.set(sample.quat.x, sample.quat.y, sample.quat.z, sample.quat.w);
}

function dieStartFrom(group: Group | null, spec: DiceRollSpec, dieIndex: 0 | 1): DieStart {
  if (!group) {
    const rest = dieRestSample(spec.dice[dieIndex]);
    return { x: rest.x, z: rest.z, quat: rest.quat };
  }
  const q = group.quaternion;
  return { x: group.position.x, z: group.position.z, quat: { x: q.x, y: q.y, z: q.z, w: q.w } };
}

export function DicePair({ parameters, exportRootRef, interaction }: ProceduralProps) {
  const { scene } = useGLTF(DICE_GLB_URL);
  const dieSource = useMemo(() => scene.getObjectByName("Cube") ?? scene, [scene]);
  const dice = useMemo(() => {
    return [0, 1].map(() => {
      const clone = dieSource.clone(true);
      clone.traverse((child) => {
        child.castShadow = true;
      });
      return clone;
    });
  }, [dieSource]);

  const { rollId, rollSeed } = readRoll(parameters);
  const spec = useMemo(() => createDiceRollSpec(rollSeed), [rollSeed]);

  const die0Ref = useRef<Group>(null);
  const die1Ref = useRef<Group>(null);
  const playbackRef = useRef<Playback | null>(null);
  const lastRollIdRef = useRef<number | null>(null);
  const [rolling, setRolling] = useState(false);

  // First mount (including late joiners): pose the dice at the persisted
  // result without replaying the toss. Subsequent rollId changes animate.
  // Layout effect so the rest pose lands before the first painted frame.
  useLayoutEffect(() => {
    if (lastRollIdRef.current === null) {
      lastRollIdRef.current = rollId;
      applySample(die0Ref.current, dieRestSample(spec.dice[0]));
      applySample(die1Ref.current, dieRestSample(spec.dice[1]));
      return;
    }
    if (lastRollIdRef.current === rollId) return;
    lastRollIdRef.current = rollId;

    if (prefersReducedMotion()) {
      playbackRef.current = null;
      applySample(die0Ref.current, dieRestSample(spec.dice[0]));
      applySample(die1Ref.current, dieRestSample(spec.dice[1]));
      setRolling(false);
      return;
    }

    playbackRef.current = {
      spec,
      elapsed: 0,
      starts: [dieStartFrom(die0Ref.current, spec, 0), dieStartFrom(die1Ref.current, spec, 1)]
    };
    setRolling(true);
  }, [rollId, spec]);

  useFrame((_, delta) => {
    const playback = playbackRef.current;
    if (!playback) return;
    playback.elapsed += delta;
    const s0 = sampleDieMotion(playback.spec.dice[0], playback.elapsed, playback.starts[0]);
    const s1 = sampleDieMotion(playback.spec.dice[1], playback.elapsed, playback.starts[1]);
    applySample(die0Ref.current, s0);
    applySample(die1Ref.current, s1);
    if (s0.settled && s1.settled) {
      playbackRef.current = null;
      setRolling(false);
    }
  });

  const roll = useCallback(() => {
    if (!interaction?.canInteract || playbackRef.current) return;
    interaction.setParameters({
      rollId: rollId + 1,
      rollSeed: Math.floor(Math.random() * 0x100000000) >>> 0
    });
  }, [interaction, rollId]);

  const faces = useMemo(() => [spec.dice[0].face, spec.dice[1].face] as const, [spec]);
  const total = faces[0] + faces[1];

  return (
    <group>
      <group ref={exportRootRef ?? null}>
        {/* Die poses are driven imperatively (mount layout effect + useFrame playback). */}
        <group ref={die0Ref}>
          <primitive object={dice[0]!} scale={DIE_MESH_SCALE} />
        </group>
        <group ref={die1Ref}>
          <primitive object={dice[1]!} scale={DIE_MESH_SCALE} />
        </group>
      </group>

      <Html transform center position={[0, 0.2, 0.62]} scale={0.15} className="room-object-html">
        <div className="dice-pair-panel">
          <div
            className={`dice-pair-panel__result${rolling ? " dice-pair-panel__result--rolling" : ""}`}
            aria-live="polite"
          >
            {rolling ? (
              "Rolling…"
            ) : (
              <>
                {faces[0]} + {faces[1]} = <strong>{total}</strong>
              </>
            )}
          </div>
          {interaction?.canInteract ? (
            <button
              type="button"
              className="dice-pair-panel__roll"
              disabled={rolling}
              aria-label="Roll the dice"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                roll();
              }}
            >
              Roll dice
            </button>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

useGLTF.preload(DICE_GLB_URL);
