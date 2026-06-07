"use client";

import { Suspense, useEffect, useMemo, useRef, type CSSProperties } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import {
  ClampToEdgeWrapping,
  Color,
  MathUtils,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  type Group,
  type Object3D,
  type SkinnedMesh,
  type Texture
} from "three";
import { SkeletonUtils } from "three-stdlib";
import type {
  AvatarAppearance,
  AvatarBodyCatalogEntry,
  AvatarBodySlug,
  AvatarEquippedAccessories,
  AvatarReactionSlug,
  ParticipantAudioMode
} from "@3dspace/contracts";
import type { ParticipantView } from "./RoomClient";
import { CLIENT_TUNING } from "../lib/config";
import { AvatarAccessoryLayer } from "./AvatarAccessoryLayer";
import { BUILTIN_AVATAR_ACCESSORY_CATALOG } from "../lib/avatarAccessoryCatalog";
import {
  avatarBodyModelScale,
  DEFAULT_AVATAR_BODY_SLUG,
  resolveAvatarBodyEntry
} from "../lib/avatarBodyCatalog";
import { applyHairSuppressionRules, bindHairSuppressionToMixer, collectHairSuppressionRules, restoreHairSuppressionRules } from "./avatarHairSuppression";
import { shouldApplyAvatarRecolor } from "../lib/avatarRecolorGate";
import {
  applyAvatarRecolorShader,
  updateAvatarRecolorColors,
  updateAvatarRecolorTintStrength,
  type AvatarRecolorTextures
} from "../lib/avatarRecolorShader";
export { DEFAULT_APPEARANCE } from "../lib/avatarAppearance";

const REACTION_EMOJI: Record<AvatarReactionSlug, string> = {
  "thumbs-up": "👍",
  "confused":  "😕",
  "question":  "❓",
  "me":        "🙋",
  "pause":     "🤚",
  "celebrate": "🎉"
};

// ── Avatar model ────────────────────────────────────────────────────────────
// Rigged GLB bodies (skinned mesh + 24-bone skeleton + idle/walk/run clips),
// served from apps/web/public/avatars. Each body entry supplies clip names,
// native height, and recolor mask URLs via the avatar body catalog.
const TARGET_HEIGHT = 1.7;

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return (object as SkinnedMesh).isSkinnedMesh === true;
}

function configureRecolorTextures(textures: AvatarRecolorTextures) {
  // zoneMask: raw integer IDs 0-23 encoded in the R channel as byte values.
  // MUST be NoColorSpace — sRGB gamma-decoding would corrupt the zone IDs
  // (zone 8 stored as 8/255 would decode to ~47, falling outside 0-23 → no tint).
  textures.zoneMask.colorSpace = NoColorSpace;
  textures.zoneMask.flipY = false;
  textures.zoneMask.wrapS = ClampToEdgeWrapping;
  textures.zoneMask.wrapT = ClampToEdgeWrapping;
  textures.zoneMask.magFilter = NearestFilter;
  textures.zoneMask.minFilter = NearestFilter;
  textures.zoneMask.generateMipmaps = false;
  textures.zoneMask.needsUpdate = true;
}

type AvatarRecolorManagedMaterial = MeshStandardMaterial & {
  userData: MeshStandardMaterial["userData"] & {
    avatarBakedMap?: Texture | null;
    avatarBakedEmissiveMap?: Texture | null;
    avatarBakedEmissiveColor?: Color;
    avatarBakedMetalness?: number;
    avatarBakedRoughness?: number;
  };
};

/**
 * Per-instance skinned clone of the avatar GLB, cross-fading between the idle /
 * walk / run clips to match the participant's movement state. SkeletonUtils.clone
 * gives each instance its own skeleton so participants animate independently
 * (geometry + material stay shared/cached).
 */
function AvatarModel({
  body,
  clip,
  appearance,
  recolorActive,
  accessories,
  showAccessories
}: {
  body: AvatarBodyCatalogEntry;
  clip: string;
  appearance: AvatarAppearance;
  recolorActive: boolean;
  accessories: AvatarEquippedAccessories;
  showAccessories: boolean;
}) {
  const { scene, animations } = useGLTF(body.glbUrl);
  const zoneMask = useTexture(body.zoneMaskUrl) as Texture;
  const modelScale = avatarBodyModelScale(body);
  const recolorTextures = useMemo<AvatarRecolorTextures>(
    () => ({ zoneMask }),
    [zoneMask]
  );
  // Configure texture settings once (not in the render body — setting texture
  // properties marks them needsUpdate every frame, causing a constant loop).
  useEffect(() => {
    configureRecolorTextures(recolorTextures);
  }, [recolorTextures]);
  const model = useMemo(() => {
    const root = SkeletonUtils.clone(scene) as Group;
    root.traverse((object) => {
      if (!isSkinnedMesh(object)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const sourceMaterial = object.material as MeshStandardMaterial;
      const material = sourceMaterial.clone();
      object.material = material;
    });
    return root;
  }, [scene]);
  const { actions, mixer } = useAnimations(animations, model);

  const equippedHeadEntry = useMemo(() => {
    const slug = accessories.head;
    if (!slug) return undefined;
    return BUILTIN_AVATAR_ACCESSORY_CATALOG.find((entry) => entry.slug === slug);
  }, [accessories.head]);

  const hairSuppressionRulesRef = useRef(collectHairSuppressionRules(model, []));

  useEffect(() => {
    if (!showAccessories || !equippedHeadEntry) {
      restoreHairSuppressionRules(hairSuppressionRulesRef.current);
      hairSuppressionRulesRef.current = [];
      return;
    }

    hairSuppressionRulesRef.current = collectHairSuppressionRules(model, [equippedHeadEntry]);
    applyHairSuppressionRules(hairSuppressionRulesRef.current);

    return () => {
      restoreHairSuppressionRules(hairSuppressionRulesRef.current);
      hairSuppressionRulesRef.current = [];
    };
  }, [model, showAccessories, equippedHeadEntry]);

  useEffect(() => {
    if (!mixer || !showAccessories || !equippedHeadEntry) return;
    return bindHairSuppressionToMixer(mixer, () => hairSuppressionRulesRef.current);
  }, [mixer, showAccessories, equippedHeadEntry]);

  useEffect(() => {
    model.traverse((object) => {
      if (!isSkinnedMesh(object)) return;
      const material = object.material as AvatarRecolorManagedMaterial;
      material.userData.avatarBakedMap ??= material.map ?? null;
      material.userData.avatarBakedEmissiveMap ??= material.emissiveMap ?? null;
      material.userData.avatarBakedEmissiveColor ??= material.emissive.clone();
      material.userData.avatarBakedMetalness ??= material.metalness;
      material.userData.avatarBakedRoughness ??= material.roughness;
      applyAvatarRecolorShader(material, recolorTextures);
    });
  }, [model, recolorTextures]);

  useEffect(
    () => () => {
      model.traverse((object) => {
        if (isSkinnedMesh(object)) {
          (object.material as MeshStandardMaterial).dispose();
        }
      });
    },
    [model]
  );

  // Cross-fade to the desired clip whenever the movement state changes.
  useEffect(() => {
    const action = actions[clip];
    if (!action) return;
    action.reset().fadeIn(0.25).play();
    return () => {
      action.fadeOut(0.25);
    };
  }, [actions, clip]);

  useEffect(() => {
    model.traverse((object) => {
      if (!isSkinnedMesh(object)) return;
      const material = object.material as AvatarRecolorManagedMaterial;
      const nextEmissiveMap = recolorActive ? null : (material.userData.avatarBakedEmissiveMap ?? null);
      if (material.emissiveMap !== nextEmissiveMap) {
        material.emissiveMap = nextEmissiveMap;
        material.needsUpdate = true;
      }
      if (recolorActive) {
        material.emissive.setRGB(0, 0, 0);
        material.metalness = 0;
        material.roughness = 0.72;
      } else if (material.userData.avatarBakedEmissiveColor) {
        material.emissive.copy(material.userData.avatarBakedEmissiveColor);
        material.metalness = material.userData.avatarBakedMetalness ?? material.metalness;
        material.roughness = material.userData.avatarBakedRoughness ?? material.roughness;
      }
      // Uniform value updates do NOT need needsUpdate — they go straight to GPU.
      updateAvatarRecolorColors(material, appearance);
      updateAvatarRecolorTintStrength(material, recolorActive ? 1 : 0);
    });
  }, [appearance, model, recolorActive, recolorTextures]);

  return (
    <group>
      <primitive object={model} scale={modelScale} />
      {showAccessories ? (
        <Suspense fallback={null}>
          <AvatarAccessoryLayer root={model} equipped={accessories} />
        </Suspense>
      ) : null}
    </group>
  );
}

export type BlockyAvatarProps = {
  participant: ParticipantView;
  groupColor?: string;
  appearance: AvatarAppearance;
  appearanceCustomized: boolean;
  editorPreviewActive?: boolean;
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
  /** Equipped accessory slugs per slot. Defaults to unequipped. */
  accessories?: AvatarEquippedAccessories;
  /** Selected avatar body slug. Defaults to Azure Vanguard. */
  bodySlug?: AvatarBodySlug;
};

export function BlockyAvatar({
  participant,
  groupColor,
  appearance,
  appearanceCustomized,
  editorPreviewActive = false,
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
  accessories = { head: null, hands: null },
  bodySlug = DEFAULT_AVATAR_BODY_SLUG,
}: BlockyAvatarProps) {
  const position = participant.state.position;
  const movement = participant.state.movement;
  const body = resolveAvatarBodyEntry(
    CLIENT_TUNING.enableAvatarBodies ? bodySlug : DEFAULT_AVATAR_BODY_SLUG
  );
  const recolorActive = shouldApplyAvatarRecolor({
    flagEnabled: CLIENT_TUNING.enableAvatarGlbRecolor,
    appearanceCustomized,
    editorPreviewActive,
    customizedFieldPresent: true,
    appearance
  });

  // Movement → clip. Idle covers everything that isn't an active stride.
  const clip =
    movement === "running" ? body.clips.running : movement === "walking" ? body.clips.walking : body.clips.idle;

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
  const showAccessories = CLIENT_TUNING.enableAvatarAccessories && !hidden;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const debugWindow = window as Window & {
      __debug?: Record<string, unknown>;
      __avatarRecolorStates?: Record<string, {
        recolorActive: boolean;
        appearanceCustomized: boolean;
        editorPreviewActive: boolean;
      }>;
    };
    debugWindow.__debug = debugWindow.__debug ?? {};
    debugWindow.__avatarRecolorStates = debugWindow.__avatarRecolorStates ?? {};
    debugWindow.__avatarRecolorStates[participant.id] = {
      recolorActive,
      appearanceCustomized,
      editorPreviewActive
    };
    debugWindow.__debug.avatarRecolor = {
      enabled: CLIENT_TUNING.enableAvatarGlbRecolor,
      getRenderState: (participantId: string) => debugWindow.__avatarRecolorStates?.[participantId] ?? null
    };
    return () => {
      delete debugWindow.__avatarRecolorStates?.[participant.id];
    };
  }, [appearanceCustomized, editorPreviewActive, participant.id, recolorActive]);

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
          <AvatarModel
            key={body.slug}
            body={body}
            clip={clip}
            appearance={appearance}
            recolorActive={recolorActive}
            accessories={accessories}
            showAccessories={showAccessories}
          />
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
