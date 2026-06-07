"use client";

import { useGLTF } from "@react-three/drei";
import type { RetroRobotHostAvatarProps } from "./RetroRobotHostAvatar";
import { GlbHostAvatar } from "./GlbHostAvatar";

/** Served from apps/web/public; sourced from GLBs/simple-bot.glb (JPEG base color). */
const SIMPLE_BOT_URL = "/world-hosts/simple-bot.glb";
// The GLB spans ~1.9 m natively, centered on the origin (feet at y ≈ -0.956).
const MODEL_NATIVE_HEIGHT = 1.91;
const MODEL_NATIVE_GROUND_Y = -0.956;

/**
 * GLB-backed World Host avatar — the lightweight textured robot (the default
 * host). A thin wrapper over {@link GlbHostAvatar}.
 */
export function SimpleBotHostAvatar(props: RetroRobotHostAvatarProps) {
  return (
    <GlbHostAvatar
      {...props}
      url={SIMPLE_BOT_URL}
      nativeHeight={MODEL_NATIVE_HEIGHT}
      nativeGroundY={MODEL_NATIVE_GROUND_Y}
    />
  );
}

useGLTF.preload(SIMPLE_BOT_URL);
