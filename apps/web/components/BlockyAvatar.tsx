"use client";

import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, useAnimations, useGLTF } from "@react-three/drei";
import { MathUtils, type Group } from "three";
import { SkeletonUtils } from "three-stdlib";
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
// The participant avatar is the rigged "Azure Vanguard" GLB (one skinned mesh +
// a 24-bone skeleton + three baked clips), served from apps/web/public. It is
// exported feet-on-floor (origin at the soles) at ~1.69 m, so we only scale it
// to TARGET_HEIGHT — no vertical offset needed. It faces +Z, which is the app's
// forward axis, so no rotation correction is applied.
const AVATAR_URL    = "/avatars/azure-vanguard.glb";
const NATIVE_HEIGHT = 1.69;
const TARGET_HEIGHT = 1.7;
const MODEL_SCALE   = TARGET_HEIGHT / NATIVE_HEIGHT;

// Baked clip names (see scripts inspection): a long idle plus a walk + run cycle.
// Meshy-6 export has mislabelled clip names; actual motion matches as follows:
const CLIP = { idle: "Running", walking: "Idle_02", running: "Walking" } as const;
type ClipName = (typeof CLIP)[keyof typeof CLIP];

useGLTF.preload(AVATAR_URL);

/**
 * Per-instance skinned clone of the avatar GLB, cross-fading between the idle /
 * walk / run clips to match the participant's movement state. SkeletonUtils.clone
 * gives each instance its own skeleton so participants animate independently
 * (geometry + material stay shared/cached).
 */
function AvatarModel({ clip }: { clip: ClipName }) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const groupRef = useRef<Group>(null);
  const { actions } = useAnimations(animations, groupRef);

  // Cross-fade to the desired clip whenever the movement state changes.
  useEffect(() => {
    const action = actions[clip];
    if (!action) return;
    action.reset().fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.25);
    };
  }, [actions, clip]);

  return (
    <group ref={groupRef}>
      <primitive object={model} scale={MODEL_SCALE} />
    </group>
  );
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

  // Movement → clip. Idle covers everything that isn't an active stride.
  const clip: ClipName =
    movement === "running" ? CLIP.running : movement === "walking" ? CLIP.walking : CLIP.idle;

  // ── Wave emote ────────────────────────────────────────────────────────────
  // The clips don't include a wave, so the emote is a brief whole-body sway on
  // the wrapper group; it still completes + notifies so the UI state resets.
  const waveRef = useRef<Group>(null);
  const wavePhaseRef = useRef(0);
  const waveActiveRef = useRef(false);

  useFrame((_, delta) => {
    const g = waveRef.current;
    if (!g) return;

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
    const envelope = waveActiveRef.current ? Math.sin(wavePhaseRef.current * Math.PI) : 0;
    const targetTilt = envelope * Math.sin(wavePhaseRef.current * Math.PI * 8) * 0.08;
    g.rotation.z = MathUtils.lerp(g.rotation.z, targetTilt, delta * 12);
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
      {/* Avatar mesh — wrapper carries the wave sway; model feet already at y=0 */}
      <group ref={waveRef}>
        <Suspense fallback={null}>
          <AvatarModel clip={clip} />
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
