"use client";

import { Color, type MeshStandardMaterial, type Texture, type WebGLProgramParametersWithUniforms } from "three";
import type { AvatarAppearance } from "@3dspace/contracts";
import { appearanceToZoneColorArray, AVATAR_ZONE_COUNT } from "./avatarZoneRegistry";

export type AvatarRecolorTextures = {
  zoneMask: Texture;
};

type AvatarRecolorUserData = {
  avatarRecolorPatched?: boolean;
  avatarRecolorColors?: Float32Array;
  avatarRecolorTintStrength?: number;
  avatarRecolorUniforms?: {
    zoneColors: Color[];
    tintStrength: { value: number };
  };
};

type AvatarRecolorMaterial = MeshStandardMaterial & {
  userData: MeshStandardMaterial["userData"] & AvatarRecolorUserData;
};

function buildZoneColorUniformValue(colors: Float32Array) {
  const out: Color[] = [];
  for (let i = 0; i < AVATAR_ZONE_COUNT; i += 1) {
    const offset = i * 3;
    out.push(new Color(colors[offset] ?? 0, colors[offset + 1] ?? 0, colors[offset + 2] ?? 0));
  }
  return out;
}

function syncUniformColors(material: AvatarRecolorMaterial) {
  const uniformColors = material.userData.avatarRecolorUniforms?.zoneColors;
  const colors = material.userData.avatarRecolorColors;
  if (!uniformColors || !colors) return;
  for (let i = 0; i < AVATAR_ZONE_COUNT; i += 1) {
    const offset = i * 3;
    uniformColors[i]?.setRGB(colors[offset] ?? 0, colors[offset + 1] ?? 0, colors[offset + 2] ?? 0);
  }
}

function buildZoneColorLookupShader() {
  const branches: string[] = [];
  for (let zoneId = 1; zoneId < AVATAR_ZONE_COUNT; zoneId += 1) {
    branches.push(`${zoneId === 1 ? "if" : "else if"} (avatarZone == ${zoneId}) { avatarZoneColor = zoneColors[${zoneId}]; }`);
  }
  return `vec3 avatarZoneColor = vec3(-1.0);
    ${branches.join("\n    ")}
    if (avatarZoneColor.r >= 0.0) {
        diffuseColor.rgb = mix(diffuseColor.rgb, avatarZoneColor, tintStrength);
    }`;
}

export function applyAvatarRecolorShader(
  material: MeshStandardMaterial,
  textures: AvatarRecolorTextures
): void {
  const target = material as AvatarRecolorMaterial;
  target.userData.avatarRecolorColors ??= new Float32Array(AVATAR_ZONE_COUNT * 3);
  target.userData.avatarRecolorTintStrength ??= 1;

  if (target.userData.avatarRecolorPatched) {
    target.needsUpdate = true;
    return;
  }

  target.userData.avatarRecolorPatched = true;
  target.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.zoneMask = { value: textures.zoneMask };
    shader.uniforms.zoneColors = {
      value: buildZoneColorUniformValue(target.userData.avatarRecolorColors ?? new Float32Array(AVATAR_ZONE_COUNT * 3))
    };
    shader.uniforms.tintStrength = { value: target.userData.avatarRecolorTintStrength ?? 1 };

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_pars_fragment>",
      `#include <map_pars_fragment>
uniform sampler2D zoneMask;
uniform vec3 zoneColors[${AVATAR_ZONE_COUNT}];
uniform float tintStrength;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <map_fragment>",
      `#include <map_fragment>
#ifdef USE_MAP
  float avatarZoneId = texture2D(zoneMask, vMapUv).r * 255.0;
  int avatarZone = int(avatarZoneId + 0.5);
  if (avatarZone > 0 && avatarZone < ${AVATAR_ZONE_COUNT}) {
    ${buildZoneColorLookupShader()}
  }
#endif`
    );

    target.userData.avatarRecolorUniforms = {
      zoneColors: shader.uniforms.zoneColors.value as Color[],
      tintStrength: shader.uniforms.tintStrength as { value: number }
    };
    syncUniformColors(target);
    target.userData.avatarRecolorUniforms.tintStrength.value = target.userData.avatarRecolorTintStrength ?? 1;
  };

  target.needsUpdate = true;
}

export function updateAvatarRecolorColors(material: MeshStandardMaterial, appearance: AvatarAppearance): void {
  const target = material as AvatarRecolorMaterial;
  target.userData.avatarRecolorColors = appearanceToZoneColorArray(appearance);
  syncUniformColors(target);
}

export function updateAvatarRecolorTintStrength(material: MeshStandardMaterial, tintStrength: number): void {
  const target = material as AvatarRecolorMaterial;
  target.userData.avatarRecolorTintStrength = tintStrength;
  if (target.userData.avatarRecolorUniforms) {
    target.userData.avatarRecolorUniforms.tintStrength.value = tintStrength;
  }
}
