"use client";

import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, useGLTF } from "@react-three/drei";
import { MathUtils, type Group, type Mesh } from "three";
import type { AvatarAppearance, AvatarReactionSlug, ParticipantAudioMode } from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";

const REACTION_EMOJI: Record<AvatarReactionSlug, string> = {
  "thumbs-up": "👍",
  "confused":  "😕",
  "question":  "❓",
  "me":        "🙋",
  "pause":     "🤚",
  "celebrate": "🎉"
};

// ── Avatar model ────────────────────────────────────────────────────────────
// The participant avatar is the modelled IXR female GLB (geometry + a single
// baked material), served from apps/web/public. It is exported normalised to a
// 2 m-tall mesh centred on the origin (feet at y=-1), so we scale it to
// TARGET_HEIGHT and lift it by half so the boots rest on the ground plane (y=0).
const AVATAR_URL    = "/avatars/ixr-female.glb";
const NATIVE_HEIGHT = 2.0;
const TARGET_HEIGHT = 1.7;
const MODEL_SCALE   = TARGET_HEIGHT / NATIVE_HEIGHT;
const FEET_OFFSET   = MODEL_SCALE * (NATIVE_HEIGHT / 2); // model centre → feet on ground

useGLTF.preload(AVATAR_URL);

/** Clones the loaded GLB per instance (geometry + material stay shared/cached). */
function AvatarModel() {
  const { scene } = useGLTF(AVATAR_URL);
  const model = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((object) => {
      if ((object as Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    return root;
  }, [scene]);

  return <primitive object={model} scale={MODEL_SCALE} />;
}

export type BlockyAvatarProps = {
  participant: ParticipantView;
  groupColor?: string;
  /** Retained for API/editor compatibility; the GLB avatar is not recoloured. */
  appearance: AvatarAppearance;
  helpRequestActive: boolean;
  waveTriggered: boolean;
  onWaveComplete: () => void;
  onClick?: () => void;
  hidden?: boolean;
  reaction?: AvatarReactionSlug;
  audioMode?: ParticipantAudioMode;
  recordingActive?: boolean;
  whisperRadiusMeters?: number;
  crossPodOutlineColor?: string;
  /** Skin-driven uniform scale applied to the avatar root. Defaults to 1. */
  avatarScale?: number;
};

// Kept for backwards compatibility — consumed by RoomClient / useAvatarAppearance
// as the fallback appearance. The GLB avatar ignores these colours.
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
  appearance: _appearance,
  helpRequestActive: _helpRequestActive,
  waveTriggered,
  onWaveComplete,
  onClick,
  hidden,
  reaction,
  audioMode,
  recordingActive = false,
  whisperRadiusMeters = 3,
  crossPodOutlineColor,
  avatarScale = 1,
}: BlockyAvatarProps) {
  const position = participant.state.position;
  const movement = participant.state.movement;
  const media    = participant.state.media;

  // ── Animation state (refs — no re-renders) ────────────────────────────────
  // The supplied GLB is a single static mesh (no skeleton / clips), so motion is
  // conveyed by the root: a step-synced bob while moving, a gentle idle bob, and
  // a whole-body acknowledgement when the wave emote fires.
  const bobRef       = useRef<Group>(null);
  const walkBlendRef = useRef(0);
  const wavePhaseRef = useRef(0);
  const waveActiveRef = useRef(false);

  useFrame((state, delta) => {
    const g = bobRef.current;
    if (!g) return;
    const t = state.clock.getElapsedTime();

    // Walk blend — smooth 0 (idle) ↔ 1 (moving)
    const targetBlend = movement === "walking" || movement === "running" ? 1 : 0;
    walkBlendRef.current = MathUtils.lerp(walkBlendRef.current, targetBlend, delta * 8);
    const blend = walkBlendRef.current;

    // Wave emote — one-shot trigger that still notifies completion.
    const WAVE_DURATION = 2.0;
    if (waveTriggered && !waveActiveRef.current) {
      waveActiveRef.current = true;
      wavePhaseRef.current = 0;
    }
    if (waveActiveRef.current) {
      wavePhaseRef.current += delta / WAVE_DURATION;
      if (wavePhaseRef.current >= 1) {
        wavePhaseRef.current = 0;
        waveActiveRef.current = false;
        onWaveComplete();
      }
    }
    const waveEnvelope = waveActiveRef.current ? Math.sin(wavePhaseRef.current * Math.PI) : 0;

    // Vertical bob: a stride bounce while moving + a faint idle sway + a wave hop.
    const stepFreq = movement === "running" ? 3.6 : 2.4;
    const walkBob  = Math.abs(Math.sin(t * stepFreq * Math.PI)) * 0.035 * blend;
    const idleBob  = Math.sin(t * 0.8 * Math.PI * 2) * 0.005 * (1 - blend);
    const waveHop  = waveEnvelope * Math.abs(Math.sin(wavePhaseRef.current * Math.PI * 6)) * 0.045;
    g.position.y = FEET_OFFSET + idleBob + walkBob + waveHop;

    // A small side-to-side sway during the wave reads as a friendly greeting.
    const targetTilt = waveEnvelope * Math.sin(t * 8) * 0.05;
    g.rotation.z = MathUtils.lerp(g.rotation.z, targetTilt, delta * 10);
  });

  // Compensate nameplate distanceFactor so the plate stays the same on-screen size
  // when the avatar is scaled down (e.g. Cell Interior at 0.6×).
  const nameplateDistanceFactor = avatarScale !== 1 ? Math.round(8 / avatarScale) : 8;

  return (
    <group
      position={[position.x, position.y ?? 0, position.z]}
      rotation={[0, participant.state.rotation.y, 0]}
      scale={avatarScale}
      visible={!hidden}
      {...(onClick ? { onClick } : {})}
    >
      {/* Avatar mesh — bob group lifts the centred model so its feet hit y=0 */}
      <group ref={bobRef} position={[0, FEET_OFFSET, 0]}>
        <Suspense fallback={null}>
          <AvatarModel />
        </Suspense>
      </group>

      {/* Whisper floor ring + outer fade band */}
      {audioMode === "whisper" ? (
        <>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[Math.max(0.01, whisperRadiusMeters - 0.08), whisperRadiusMeters, 48]} />
            <meshBasicMaterial color="#4488cc" transparent opacity={0.45} />
          </mesh>
          <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[whisperRadiusMeters, whisperRadiusMeters + 0.5, 48]} />
            <meshBasicMaterial color="#4488cc" transparent opacity={0.12} />
          </mesh>
        </>
      ) : null}

      {/* Nameplate and camera feed are skipped when hidden (e.g. first-person) because Html ignores visible={false} */}
      {!hidden ? (
        <>
          {reaction ? (
            <Billboard position={[0, 2.15, 0]}>
              <Html center style={{ pointerEvents: "none" }}>
                <div className="avatar-reaction">{REACTION_EMOJI[reaction]}</div>
              </Html>
            </Billboard>
          ) : null}
          <Billboard position={[0, 1.92, 0]}>
            <Html center distanceFactor={nameplateDistanceFactor} style={{ pointerEvents: "none" }}>
              <div
                className={`avatar-nameplate${crossPodOutlineColor ? " avatar-nameplate--cross-pod" : ""}`}
                data-testid={`participant-${participant.id}-nameplate`}
                style={crossPodOutlineColor ? ({ "--avatar-cross-pod-ring": crossPodOutlineColor } as CSSProperties) : undefined}
              >
                <span className="avatar-nameplate__name">
                  {participant.displayName}
                  {audioMode === "whisper" ? " 🔇" : ""}
                  {recordingActive && participant.state.media?.microphoneEnabled ? <span className="avatar-nameplate__recording-dot" aria-hidden="true" /> : null}
                </span>
                <span className="avatar-nameplate__status">
                  {groupColor ? <span className="avatar-nameplate__group" style={{ color: groupColor }}>● </span> : null}
                  {participant.state.media?.speaking ? "speaking" : participant.state.media?.microphoneEnabled ? "mic on" : "mic off"}
                </span>
              </div>
            </Html>
          </Billboard>
          {participant.state.media?.cameraEnabled ? (
            <Billboard position={[0.9, 1.74, 0]}>
              <Html center distanceFactor={7}>
                <AvatarVideoCard
                  stream={participant.cameraStream ?? null}
                  label={participant.local ? "Your camera" : `${participant.displayName} camera`}
                />
              </Html>
            </Billboard>
          ) : null}
        </>
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
