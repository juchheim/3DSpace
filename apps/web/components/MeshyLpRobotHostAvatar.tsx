"use client";

import { useGLTF } from "@react-three/drei";
import type { RetroRobotHostAvatarProps } from "./RetroRobotHostAvatar";
import { GlbHostAvatar } from "./GlbHostAvatar";

/** Served from apps/web/public; sourced from GLBs/Meshy_AI_Model_LP_Robot_0607002057_texture.glb. */
const MESHY_LP_ROBOT_URL = "/world-hosts/meshy-lp-robot.glb";
// The GLB spans ~1.9 m natively, centered on the origin (feet at y ≈ -0.951).
const MODEL_NATIVE_HEIGHT = 1.9;
const MODEL_NATIVE_GROUND_Y = -0.951;

/**
 * GLB-backed World Host avatar — the high-detail textured LP robot from Meshy AI.
 * A thin wrapper over {@link GlbHostAvatar}.
 */
export function MeshyLpRobotHostAvatar(props: RetroRobotHostAvatarProps) {
  return (
    <GlbHostAvatar
      {...props}
      url={MESHY_LP_ROBOT_URL}
      nativeHeight={MODEL_NATIVE_HEIGHT}
      nativeGroundY={MODEL_NATIVE_GROUND_Y}
    />
  );
}

useGLTF.preload(MESHY_LP_ROBOT_URL);
