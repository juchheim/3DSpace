"use client";

import { useGLTF } from "@react-three/drei";
import type { RetroRobotHostAvatarProps } from "./RetroRobotHostAvatar";
import { GlbHostAvatar } from "./GlbHostAvatar";

/** Served from apps/web/public; built by scripts/build-model-lp-glb.mjs. */
const MODEL_LP_URL = "/world-hosts/model-lp.glb";
// The GLB stands ~2.15 m tall natively (tread feet at y ≈ -0.051, antenna tip at top).
const MODEL_NATIVE_HEIGHT = 2.151;
const MODEL_NATIVE_GROUND_Y = -0.051;

/**
 * GLB-backed World Host avatar — the red-and-steel utility mech "MODEL-LP" (the
 * default host). A thin wrapper over {@link GlbHostAvatar} (which owns the
 * cloning, eye-glow pulse, and lifelike gaze shared by every GLB host). The cyan
 * screen eyes are "eyeGlow"/"eyeIris_*" nodes the shared component pulses + darts.
 */
export function ModelLpHostAvatar(props: RetroRobotHostAvatarProps) {
  return (
    <GlbHostAvatar
      {...props}
      url={MODEL_LP_URL}
      nativeHeight={MODEL_NATIVE_HEIGHT}
      nativeGroundY={MODEL_NATIVE_GROUND_Y}
    />
  );
}

useGLTF.preload(MODEL_LP_URL);
