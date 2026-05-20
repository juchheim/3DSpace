"use client";

import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html } from "@react-three/drei";
import { MathUtils, type Group, type Mesh } from "three";
import type { AvatarAppearance } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import {
  buildHeadMaterials,
  buildBodyMaterials,
  buildArmMaterials,
  buildHandMaterials,
  buildLegMaterials,
  buildFootMaterials,
  updateHeadMaterials,
  updateBodyMaterials,
  updateArmMaterials,
  updateHandMaterials,
  updateLegMaterials,
  updateFootMaterials,
  disposeMaterials,
  type FaceMaterials,
} from "../lib/avatarMaterials";

export type BlockyAvatarProps = {
  participant: ParticipantView;
  groupColor?: string;
  appearance: AvatarAppearance;
  helpRequestActive: boolean;
  waveTriggered: boolean;
  onWaveComplete: () => void;
  onClick?: () => void;
  hidden?: boolean;
};

export const DEFAULT_APPEARANCE: AvatarAppearance = {
  hairTop:     "#2a1a0e",
  hairFront:   "#2a1a0e",
  headSide:    "#2a1a0e",
  hairBack:    "#2a1a0e",
  faceSkin:    "#f0c090",
  faceAccent:  "#f0c090",
  collar:      "#ffffff",
  shirtFront:  "#4466aa",
  shirtBelly:  "#4466aa",
  shirtBack:   "#4466aa",
  shirtSide:   "#4466aa",
  shoulderTop: "#4466aa",
  shoulderCap: "#4466aa",
  sleeve:      "#4466aa",
  hand:        "#f0c090",
  thigh:       "#2a3a5a",
  shin:        "#2a3a5a",
  legSide:     "#2a3a5a",
  legBack:     "#2a3a5a",
  shoeTop:     "#1a1a1a",
  shoeToe:     "#1a1a1a",
  shoeSide:    "#1a1a1a",
  shoeSole:    "#111111",
};

export function BlockyAvatar({
  participant,
  groupColor,
  appearance,
  helpRequestActive,
  waveTriggered,
  onWaveComplete,
  onClick,
  hidden,
}: BlockyAvatarProps) {
  const position = participant.state.position;
  const movement = participant.state.movement;
  const media    = participant.state.media;

  // ── Animation group refs ───────────────────────────────────────────────
  const headGroupRef     = useRef<Group>(null);
  const bodyGroupRef     = useRef<Group>(null);
  const leftArmPivotRef  = useRef<Group>(null);
  const rightArmPivotRef = useRef<Group>(null);
  const leftLegPivotRef  = useRef<Group>(null);
  const rightLegPivotRef = useRef<Group>(null);

  // ── Persistent animation state (refs — no re-renders) ─────────────────
  const walkBlendRef  = useRef(0);
  const wavePhaseRef  = useRef(0);
  const waveActiveRef = useRef(false);

  // ── Frame loop ─────────────────────────────────────────────────────────
  useFrame((state, delta) => {
    const t  = state.clock.getElapsedTime();
    const la = leftArmPivotRef.current;
    const ra = rightArmPivotRef.current;
    const ll = leftLegPivotRef.current;
    const rl = rightLegPivotRef.current;
    if (!la || !ra || !ll || !rl) return;

    // Walk blend — lerps smoothly between 0 (idle) and 1 (walking)
    const targetBlend = movement === "walking" ? 1 : 0;
    walkBlendRef.current = MathUtils.lerp(walkBlendRef.current, targetBlend, delta * 8);
    const blend = walkBlendRef.current;

    // Walk cycle
    const WALK_FREQ = 2.5;
    const WALK_AMP  = Math.PI / 6;
    const rawSwing  = Math.sin(t * WALK_FREQ * Math.PI * 2) * WALK_AMP;
    const swing     = rawSwing * blend;

    const leftArmWalk  =  swing;
    const rightArmWalk = -swing;
    const leftLegWalk  = -swing;
    const rightLegWalk =  swing;

    // Idle body bob — fades out while walking
    const body = bodyGroupRef.current;
    if (body) {
      body.position.y = 0.77 + Math.sin(t * 0.8 * Math.PI * 2) * 0.004 * (1 - blend);
    }

    // Speaking head bob
    const head = headGroupRef.current;
    if (head) {
      head.position.y = 1.22 + ((media?.speaking ?? false)
        ? Math.sin(t * 4 * Math.PI * 2) * 0.008
        : 0);
    }

    // Wave emote — one-shot trigger
    const WAVE_DURATION = 2.0;
    const WAVE_FREQ     = 3.5;
    const WAVE_AMP      = Math.PI / 5;
    const WAVE_BASE     = -Math.PI / 2;

    if (waveTriggered && !waveActiveRef.current) {
      waveActiveRef.current = true;
      wavePhaseRef.current  = 0;
    }
    if (waveActiveRef.current) {
      wavePhaseRef.current += delta / WAVE_DURATION;
      if (wavePhaseRef.current >= 1) {
        wavePhaseRef.current  = 0;
        waveActiveRef.current = false;
        onWaveComplete();
      }
    }
    const waveProgress = wavePhaseRef.current;

    // Apply rotations — priority: wave > raise hand > walk
    la.rotation.x = leftArmWalk;
    la.rotation.z = 0;
    ll.rotation.x = leftLegWalk;
    rl.rotation.x = rightLegWalk;

    if (waveActiveRef.current) {
      const envelope    = Math.sin(waveProgress * Math.PI);
      const oscillation = Math.sin(waveProgress * WAVE_DURATION * WAVE_FREQ * Math.PI * 2) * WAVE_AMP;
      ra.rotation.x = MathUtils.lerp(ra.rotation.x, WAVE_BASE + oscillation * envelope, delta * 8);
      ra.rotation.z = MathUtils.lerp(ra.rotation.z, -(Math.PI / 3) * envelope, delta * 8);
    } else if (helpRequestActive) {
      ra.rotation.x = MathUtils.lerp(ra.rotation.x, -Math.PI * 0.80, delta * 6);
      ra.rotation.z = MathUtils.lerp(ra.rotation.z, 0, delta * 6);
    } else {
      ra.rotation.x = MathUtils.lerp(ra.rotation.x, rightArmWalk, delta * 8);
      ra.rotation.z = MathUtils.lerp(ra.rotation.z, 0, delta * 8);
    }
  });

  // ── Mesh refs — for imperative material assignment ─────────────────────
  const headMeshRef      = useRef<Mesh>(null);
  const bodyMeshRef      = useRef<Mesh>(null);
  const leftArmMeshRef   = useRef<Mesh>(null);
  const rightArmMeshRef  = useRef<Mesh>(null);
  const leftHandMeshRef  = useRef<Mesh>(null);
  const rightHandMeshRef = useRef<Mesh>(null);
  const leftLegMeshRef   = useRef<Mesh>(null);
  const rightLegMeshRef  = useRef<Mesh>(null);
  const leftFootMeshRef  = useRef<Mesh>(null);
  const rightFootMeshRef = useRef<Mesh>(null);

  // ── Material arrays — lazy-initialized once, mutated on appearance change
  const headMatsRef      = useRef<FaceMaterials | null>(null);
  const bodyMatsRef      = useRef<FaceMaterials | null>(null);
  const armMatsRef       = useRef<FaceMaterials | null>(null);
  const handMatsRef      = useRef<FaceMaterials | null>(null);
  const legMatsRef       = useRef<FaceMaterials | null>(null);
  const footMatsRef      = useRef<FaceMaterials | null>(null);

  if (headMatsRef.current === null) {
    headMatsRef.current = buildHeadMaterials(appearance);
    bodyMatsRef.current = buildBodyMaterials(appearance);
    armMatsRef.current  = buildArmMaterials(appearance);
    handMatsRef.current = buildHandMaterials(appearance);
    legMatsRef.current  = buildLegMaterials(appearance);
    footMatsRef.current = buildFootMaterials(appearance);
  }

  // ── Apply material arrays to meshes once after mount ──────────────────
  useEffect(() => {
    if (headMeshRef.current)       headMeshRef.current.material       = headMatsRef.current!;
    if (bodyMeshRef.current)       bodyMeshRef.current.material       = bodyMatsRef.current!;
    if (leftArmMeshRef.current)    leftArmMeshRef.current.material    = armMatsRef.current!;
    if (rightArmMeshRef.current)   rightArmMeshRef.current.material   = armMatsRef.current!;
    if (leftHandMeshRef.current)   leftHandMeshRef.current.material   = handMatsRef.current!;
    if (rightHandMeshRef.current)  rightHandMeshRef.current.material  = handMatsRef.current!;
    if (leftLegMeshRef.current)    leftLegMeshRef.current.material    = legMatsRef.current!;
    if (rightLegMeshRef.current)   rightLegMeshRef.current.material   = legMatsRef.current!;
    if (leftFootMeshRef.current)   leftFootMeshRef.current.material   = footMatsRef.current!;
    if (rightFootMeshRef.current)  rightFootMeshRef.current.material  = footMatsRef.current!;
  }, []);

  // ── Update materials imperatively when appearance changes ──────────────
  useEffect(() => {
    updateHeadMaterials(headMatsRef.current!, appearance);
    updateBodyMaterials(bodyMatsRef.current!, appearance);
    updateArmMaterials(armMatsRef.current!,   appearance);
    updateHandMaterials(handMatsRef.current!, appearance);
    updateLegMaterials(legMatsRef.current!,   appearance);
    updateFootMaterials(footMatsRef.current!, appearance);
  }, [appearance]);

  // ── Dispose all GPU resources on unmount ──────────────────────────────
  useEffect(() => {
    return () => {
      disposeMaterials(headMatsRef.current ?? []);
      disposeMaterials(bodyMatsRef.current ?? []);
      disposeMaterials(armMatsRef.current  ?? []);
      disposeMaterials(handMatsRef.current ?? []);
      disposeMaterials(legMatsRef.current  ?? []);
      disposeMaterials(footMatsRef.current ?? []);
    };
  }, []);

  return (
    <group
      position={[position.x, position.y ?? 0, position.z]}
      rotation={[0, participant.state.rotation.y, 0]}
      visible={!hidden}
      {...(onClick ? { onClick } : {})}
    >

      {/* Head — 0.40 × 0.40 × 0.40, center at y=1.22 */}
      <group ref={headGroupRef} position={[0, 1.22, 0]}>
        <mesh ref={headMeshRef}>
          <boxGeometry args={[0.40, 0.40, 0.40]} />
        </mesh>
      </group>

      {/* Body — 0.44 × 0.50 × 0.22, center at y=0.77 */}
      <group ref={bodyGroupRef} position={[0, 0.77, 0]}>
        <mesh ref={bodyMeshRef}>
          <boxGeometry args={[0.44, 0.50, 0.22]} />
        </mesh>
      </group>

      {/* Left arm — pivot at shoulder (x=-0.30, y=0.97) */}
      <group ref={leftArmPivotRef} position={[-0.30, 0.97, 0]}>
        <mesh ref={leftArmMeshRef} position={[0, -0.22, 0]}>
          <boxGeometry args={[0.16, 0.44, 0.16]} />
        </mesh>
        <mesh ref={leftHandMeshRef} position={[0, -0.50, 0]}>
          <boxGeometry args={[0.16, 0.12, 0.16]} />
        </mesh>
      </group>

      {/* Right arm — pivot at shoulder (x=+0.30, y=0.97) */}
      <group ref={rightArmPivotRef} position={[0.30, 0.97, 0]}>
        <mesh ref={rightArmMeshRef} position={[0, -0.22, 0]}>
          <boxGeometry args={[0.16, 0.44, 0.16]} />
        </mesh>
        <mesh ref={rightHandMeshRef} position={[0, -0.50, 0]}>
          <boxGeometry args={[0.16, 0.12, 0.16]} />
        </mesh>
      </group>

      {/* Left leg — pivot at hip (x=-0.11, y=0.52) */}
      <group ref={leftLegPivotRef} position={[-0.11, 0.52, 0]}>
        <mesh ref={leftLegMeshRef} position={[0, -0.20, 0]}>
          <boxGeometry args={[0.18, 0.40, 0.18]} />
        </mesh>
        <mesh ref={leftFootMeshRef} position={[0, -0.46, 0.05]}>
          <boxGeometry args={[0.22, 0.12, 0.32]} />
        </mesh>
      </group>

      {/* Right leg — pivot at hip (x=+0.11, y=0.52) */}
      <group ref={rightLegPivotRef} position={[0.11, 0.52, 0]}>
        <mesh ref={rightLegMeshRef} position={[0, -0.20, 0]}>
          <boxGeometry args={[0.18, 0.40, 0.18]} />
        </mesh>
        <mesh ref={rightFootMeshRef} position={[0, -0.46, 0.05]}>
          <boxGeometry args={[0.22, 0.12, 0.32]} />
        </mesh>
      </group>

      {/* Nameplate */}
      <Billboard position={[0, 1.52, 0]}>
        <Html center distanceFactor={3} style={{ pointerEvents: "none" }}>
          <div className="avatar-nameplate">
            <span className="avatar-nameplate__name">{participant.displayName}</span>
            <span className="avatar-nameplate__status">
              {groupColor ? <span className="avatar-nameplate__group" style={{ color: groupColor }}>● </span> : null}
              {participant.state.media?.speaking ? "speaking" : participant.state.media?.microphoneEnabled ? "mic on" : "mic off"}
            </span>
          </div>
        </Html>
      </Billboard>

      {/* Camera feed */}
      {participant.state.media?.cameraEnabled ? (
        <Billboard position={[0.9, 1.46, 0]}>
          <Html center distanceFactor={7}>
            <AvatarVideoCard
              stream={participant.cameraStream ?? null}
              label={participant.local ? "Your camera" : `${participant.displayName} camera`}
            />
          </Html>
        </Billboard>
      ) : null}

    </group>
  );
}

function AvatarVideoCard({ stream, label }: { stream: MediaStream | null; label: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className="avatar-video-card">
      {stream ? <video ref={videoRef} autoPlay muted playsInline /> : null}
      <div style={{ padding: "0.35rem 0.45rem" }}>{label}</div>
    </div>
  );
}
