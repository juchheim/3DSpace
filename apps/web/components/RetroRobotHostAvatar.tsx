"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { Color, MathUtils, type Group, type Material } from "three";
import {
  buildRetroRobotKit,
  drawRobotScreen,
  RETRO_ROBOT_PALETTE,
  type RetroRobotKit
} from "../lib/retroRobotMaterials";

export type RetroRobotHostAvatarProps = {
  /** Host placement in world space (feet at position.y). */
  position: { x: number; y: number; z: number };
  rotationY: number;
  displayName: string;
  /** Drives the thinking animation (eye pulse, head tilt, screen scroll). */
  thinking?: boolean;
  /** Drives the speaking animation (head nod, equalizer screen, eye flicker). */
  speaking?: boolean;
  /** Viewer-local last reply; truncated into a billboard speech bubble. */
  bubbleText?: string | null;
  /** Semi-transparent placement preview that follows the cursor. */
  ghost?: boolean;
  /** Open / focus the World Host panel. */
  onInteract?: () => void;
  /** Uniform scale (matches world-skin avatarScale). */
  scale?: number;
};

const BUBBLE_MAX = 120;
const TWO_PI = Math.PI * 2;

function setCursor(value: string) {
  if (typeof document !== "undefined") document.body.style.cursor = value;
}

export function RetroRobotHostAvatar({
  position,
  rotationY,
  displayName,
  thinking = false,
  speaking = false,
  bubbleText = null,
  ghost = false,
  onInteract,
  scale = 1
}: RetroRobotHostAvatarProps) {
  const kit = useMemo<RetroRobotKit>(() => buildRetroRobotKit(), []);

  // Dispose all GPU resources for this instance on unmount.
  useEffect(() => () => kit.dispose(), [kit]);

  // Apply the translucent placement-ghost look once (per instance — the ghost
  // and the real host never share materials because each builds its own kit).
  useEffect(() => {
    if (!ghost) return;
    const cyan = new Color(RETRO_ROBOT_PALETTE.ghost);
    for (const material of Object.values(kit.mat) as Material[]) {
      material.transparent = true;
      material.opacity = 0.4;
      material.depthWrite = false;
      const std = material as { color?: Color; emissive?: Color; emissiveIntensity?: number };
      if (std.emissive) std.emissive.copy(cyan);
      if (typeof std.emissiveIntensity === "number") std.emissiveIntensity = 0.6;
      if (std.color) std.color.lerp(cyan, 0.4);
    }
  }, [ghost, kit]);

  // ── Animation refs ─────────────────────────────────────────────────────────
  const bobRef = useRef<Group>(null);
  const headRef = useRef<Group>(null);
  const antennaRef = useRef<Group>(null);
  const eyesRef = useRef<Group>(null);
  const leftClawRef = useRef<Group>(null);
  const rightClawRef = useRef<Group>(null);
  const screenAccum = useRef(0);

  const eyeIdle = useMemo(() => new Color(RETRO_ROBOT_PALETTE.eyeIdle), []);
  const eyeThinking = useMemo(() => new Color(RETRO_ROBOT_PALETTE.eyeThinking), []);
  const eyeSpeakA = useMemo(() => new Color(RETRO_ROBOT_PALETTE.eyeSpeakA), []);
  const eyeSpeakB = useMemo(() => new Color(RETRO_ROBOT_PALETTE.eyeSpeakB), []);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // Body bob — idle breathing; ghost hovers a touch higher.
    if (bobRef.current) {
      bobRef.current.position.y = Math.sin(t * 1.5 * TWO_PI) * 0.022 + (ghost ? 0.04 : 0);
    }

    // Antenna sway — primary idle motion; faster while thinking.
    if (antennaRef.current) {
      antennaRef.current.rotation.z = Math.sin(t * (thinking ? 3.2 : 2.0)) * (thinking ? 0.22 : 0.14);
    }

    // Head — gentle tilt while thinking, quick nods while speaking.
    if (headRef.current) {
      const tiltTarget = thinking ? 0.1 + Math.sin(t * 1.4) * 0.08 : 0;
      const nodTarget = speaking ? Math.sin(t * 8) * 0.06 : 0;
      headRef.current.rotation.z = MathUtils.lerp(headRef.current.rotation.z, tiltTarget, delta * 5);
      headRef.current.rotation.x = MathUtils.lerp(headRef.current.rotation.x, nodTarget, delta * 9);
    }

    if (!ghost) {
      // Eyes — emissive colour + pulse by state.
      const eye = kit.mat.eye;
      if (thinking) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 1.2 * TWO_PI); // 1.2 Hz (PLAN §3.2)
        eye.emissive.copy(eyeThinking);
        eye.emissiveIntensity = 1.5 + pulse * 1.9;
      } else if (speaking) {
        eye.emissive.copy(Math.sin(t * 6) > 0 ? eyeSpeakA : eyeSpeakB);
        eye.emissiveIntensity = 2.6;
      } else {
        eye.emissive.copy(eyeIdle);
        eye.emissiveIntensity = 2.2;
      }

      // Soft blink every ~3.4 s.
      const blinkPhase = t % 3.4;
      const blink = blinkPhase < 0.13 ? Math.sin((blinkPhase / 0.13) * Math.PI) : 0;
      if (eyesRef.current) eyesRef.current.scale.y = 1 - blink * 0.82;

      // Antenna tip glow.
      kit.mat.antennaTip.emissiveIntensity =
        1.5 + (0.5 + 0.5 * Math.sin(t * (thinking ? 6 : 2.2))) * 1.3;

      // Chest CRT — throttled repaint.
      screenAccum.current += delta;
      if (screenAccum.current > 0.08 && kit.screen.ctx) {
        screenAccum.current = 0;
        const level = speaking ? 0.5 + 0.5 * Math.sin(t * 7) : 0.3;
        drawRobotScreen(
          kit.screen.ctx,
          thinking ? "thinking" : speaking ? "speaking" : "idle",
          t,
          level
        );
        kit.screen.texture.needsUpdate = true;
      }
    }

    // Claws — slow idle open / close, slightly out of phase between hands.
    if (leftClawRef.current) {
      const o = 1 + Math.sin(t * 1.1) * 0.13;
      leftClawRef.current.scale.set(o, 1, o);
    }
    if (rightClawRef.current) {
      const o = 1 + Math.sin(t * 1.1 + 1.3) * 0.13;
      rightClawRef.current.scale.set(o, 1, o);
    }
  });

  const { geo, mat } = kit;
  const bubble = bubbleText && bubbleText.trim().length > 0 ? bubbleText.trim() : null;
  const nameplateDistanceFactor = scale !== 1 ? Math.round(9 / scale) : 9;

  const interactionHandlers = onInteract
    ? {
        onClick: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          onInteract();
        },
        onPointerOver: (event: { stopPropagation: () => void }) => {
          event.stopPropagation();
          setCursor("pointer");
        },
        onPointerOut: () => setCursor("auto")
      }
    : {};

  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotationY, 0]} scale={scale}>
      {/* Ground contact shadow (skipped for the ghost preview). */}
      {ghost ? null : <mesh geometry={geo.shadow} material={mat.shadow} position={[0, 0.014, 0]} />}

      {/* All body meshes bob together and share the click/hover target. */}
      <group ref={bobRef} {...interactionHandlers}>
        {/* ── Rover base ── */}
        <group position={[0, 0, 0]}>
          <mesh geometry={geo.treadHousing} material={mat.body} position={[0, 0.33, 0]} />
          <mesh geometry={geo.grille} material={mat.dark} position={[0, 0.27, 0.34]} />
          {/* Side wheels + hubcaps (lathe discs, axis rotated to roll forward). */}
          {([-1, 1] as const).map((side) => (
            <group key={`wheel-${side}`} position={[0.42 * side, 0.26, 0]} scale={0.94}>
              <mesh geometry={geo.wheel} material={mat.tire} rotation={[0, 0, Math.PI / 2]} />
              <mesh
                geometry={geo.hubcap}
                material={mat.secondary}
                position={[0.12 * side, 0, 0]}
                rotation={[0, 0, (-Math.PI / 2) * side]}
              />
              <mesh
                geometry={geo.rivet}
                material={mat.accent}
                position={[0.16 * side, 0, 0]}
                rotation={[0, 0, (-Math.PI / 2) * side]}
              />
            </group>
          ))}
          {/* Front caster. */}
          <mesh geometry={geo.caster} material={mat.dark} position={[0, 0.12, 0.36]} />
          {/* Housing trim belt. */}
          <mesh geometry={geo.belt} material={mat.secondary} position={[0, 0.52, 0]} scale={[0.82, 1, 0.92]} />
        </group>

        {/* ── Torso ── */}
        <group position={[0, 0.95, 0]}>
          <mesh geometry={geo.torso} material={mat.body} />
          <mesh geometry={geo.belt} material={mat.secondary} position={[0, 0.06, 0]} />
          {/* CRT chest screen: dark bezel + emissive surface. */}
          <mesh geometry={geo.screenBezel} material={mat.dark} position={[0, 0.04, 0.3]} />
          <mesh geometry={geo.screen} material={mat.screen} position={[0, 0.04, 0.34]} />
          {/* Lower vent grille + rivet row. */}
          <mesh geometry={geo.grille} material={mat.dark} position={[0, -0.24, 0.31]} />
          {[-0.32, -0.16, 0, 0.16, 0.32].map((x) => (
            <mesh key={`torso-rivet-${x}`} geometry={geo.rivet} material={mat.accent} position={[x, 0.24, 0.31]} />
          ))}
        </group>

        {/* ── Neck ── */}
        <mesh geometry={geo.neck} material={mat.dark} position={[0, 1.36, 0]} />

        {/* ── Head ── */}
        <group ref={headRef} position={[0, 1.52, 0]}>
          <mesh geometry={geo.head} material={mat.body} />
          <mesh geometry={geo.dome} material={mat.secondary} position={[0, 0.2, 0]} />
          {/* Dark visor band holding the eyes. */}
          <mesh geometry={geo.visor} material={mat.dark} position={[0, 0.02, 0.18]} />
          <mesh geometry={geo.brow} material={mat.accent} position={[0, 0.11, 0.25]} />
          {/* Side "ear" caps. */}
          {([-1, 1] as const).map((side) => (
            <mesh
              key={`ear-${side}`}
              geometry={geo.earCap}
              material={mat.accent}
              position={[0.27 * side, 0.01, 0]}
              rotation={[0, 0, (Math.PI / 2) * side]}
            />
          ))}
          {/* LED eyes. */}
          <group ref={eyesRef}>
            {([-1, 1] as const).map((side) => (
              <group key={`eye-${side}`} position={[0.12 * side, 0.02, 0.24]} rotation={[Math.PI / 2, 0, 0]}>
                <mesh geometry={geo.eyeSocket} material={mat.dark} />
                <mesh geometry={geo.eyeLens} material={mat.eye} />
              </group>
            ))}
          </group>
          {/* Antenna. */}
          <group ref={antennaRef} position={[0, 0.22, 0]}>
            <mesh geometry={geo.antennaStalk} material={mat.dark} />
            <mesh geometry={geo.antennaBall} material={mat.antennaTip} position={[0.05, 0.24, 0.03]} />
          </group>
        </group>

        {/* ── Arms ── */}
        <RobotArm
          kit={kit}
          side={-1}
          rotation={[0.12, 0, 0.18]}
          clawRef={leftClawRef}
        />
        <RobotArm
          kit={kit}
          side={1}
          rotation={[-1.0, 0.12, -0.12]} // raised "ready to help"
          clawRef={rightClawRef}
        />
      </group>

      {/* Nameplate. */}
      {ghost ? null : (
        <Billboard position={[0, 2.02, 0]}>
          <Html center distanceFactor={nameplateDistanceFactor} style={{ pointerEvents: "none" }}>
            <div className="world-host-nameplate" data-testid="ai-host-nameplate">
              <span className="world-host-nameplate__name">{displayName}</span>
              <span className="world-host-nameplate__subtitle">AI guide</span>
            </div>
          </Html>
        </Billboard>
      )}

      {/* Speech bubble (viewer-local). */}
      {!ghost && bubble ? (
        <Billboard position={[0, 2.42, 0]}>
          <Html center distanceFactor={9} className="world-host-bubble-html" style={{ pointerEvents: "none" }}>
            <div className={`world-host-bubble${thinking ? " world-host-bubble--thinking" : ""}`} data-testid="ai-host-bubble">
              {bubble.length > BUBBLE_MAX ? `${bubble.slice(0, BUBBLE_MAX)}…` : bubble}
            </div>
          </Html>
        </Billboard>
      ) : null}

      {/* Thinking indicator on the bubble anchor when there is no reply yet. */}
      {!ghost && !bubble && thinking ? (
        <Billboard position={[0, 2.32, 0]}>
          <Html center distanceFactor={9} className="world-host-bubble-html" style={{ pointerEvents: "none" }}>
            <div className="world-host-bubble world-host-bubble--thinking world-host-bubble--typing" aria-label="Guide is thinking">
              <span />
              <span />
              <span />
            </div>
          </Html>
        </Billboard>
      ) : null}
    </group>
  );
}

// ── Segmented arm (shoulder cap → upper → elbow → forearm → claw) ─────────────

function RobotArm({
  kit,
  side,
  rotation,
  clawRef
}: {
  kit: RetroRobotKit;
  side: 1 | -1;
  rotation: [number, number, number];
  clawRef: React.RefObject<Group | null>;
}) {
  const { geo, mat } = kit;
  return (
    <group position={[0.5 * side, 1.12, 0.02]} rotation={rotation}>
      <mesh geometry={geo.shoulder} material={mat.accent} rotation={[0, 0, (Math.PI / 2) * side]} />
      <mesh geometry={geo.upperArm} material={mat.body} position={[0, -0.05, 0]} />
      <mesh geometry={geo.armRib} material={mat.dark} position={[0, -0.12, 0.01]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.armRib} material={mat.dark} position={[0, -0.2, 0.015]} rotation={[Math.PI / 2, 0, 0]} />
      <mesh geometry={geo.elbow} material={mat.dark} position={[0, -0.28, 0.02]} />
      <mesh geometry={geo.forearm} material={mat.body} position={[0, -0.3, 0.04]} />
      <mesh geometry={geo.wrist} material={mat.dark} position={[0, -0.54, 0.08]} />
      {/* Claw — 3 fingers around the palm; group scale animates open/close. */}
      <group ref={clawRef} position={[0, -0.6, 0.1]}>
        <mesh geometry={geo.clawPalm} material={mat.secondary} />
        {[0, 1, 2].map((i) => (
          <group key={`finger-${i}`} rotation={[0, (i * TWO_PI) / 3, 0]}>
            <mesh geometry={geo.finger} material={mat.dark} position={[0.04, -0.02, 0]} />
          </group>
        ))}
      </group>
    </group>
  );
}
