"use client";

import { useGLTF } from "@react-three/drei";
import type { RetroRobotHostAvatarProps } from "./RetroRobotHostAvatar";
import { GlbHostAvatar } from "./GlbHostAvatar";

/** Served from apps/web/public; built by scripts/build-sprocket-bot-glb.mjs. */
const SPROCKET_BOT_URL = "/world-hosts/sprocket-bot.glb";
// The GLB stands ~2.28 m tall natively (feet at y=0, antenna tip at the top).
const MODEL_NATIVE_HEIGHT = 2.275;

/**
 * GLB-backed World Host avatar — the high-detail steampunk "Sprocket-Bot". A thin
 * wrapper over {@link GlbHostAvatar} (which owns the cloning, eye-glow pulse, and
 * lifelike gaze shared by every GLB host).
 */
export function SprocketBotHostAvatar(props: RetroRobotHostAvatarProps) {
  return <GlbHostAvatar {...props} url={SPROCKET_BOT_URL} nativeHeight={MODEL_NATIVE_HEIGHT} />;
}

useGLTF.preload(SPROCKET_BOT_URL);
