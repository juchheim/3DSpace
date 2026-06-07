"use client";

import { useGLTF } from "@react-three/drei";
import { GlbHostAvatar } from "./GlbHostAvatar";
import type { WorldHostAvatarProps } from "./GlbHostAvatar";

/** Served from apps/web/public; sourced from GLBs/lp.glb (JPEG base color). */
const LP_URL = "/world-hosts/lp.glb";
// The GLB spans ~1.9 m natively, centered on the origin (feet at y ≈ -0.956).
const MODEL_NATIVE_HEIGHT = 1.91;
const MODEL_NATIVE_GROUND_Y = -0.956;

/** GLB-backed World Host avatar — the LP robot (only host appearance). */
export function LpHostAvatar(props: WorldHostAvatarProps) {
  return (
    <GlbHostAvatar
      {...props}
      url={LP_URL}
      nativeHeight={MODEL_NATIVE_HEIGHT}
      nativeGroundY={MODEL_NATIVE_GROUND_Y}
    />
  );
}

useGLTF.preload(LP_URL);
