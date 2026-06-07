import { describe, expect, it } from "vitest";
import { MeshStandardMaterial, Texture } from "three";
import { DEFAULT_APPEARANCE } from "../lib/avatarAppearance";
import {
  applyAvatarRecolorShader,
  updateAvatarRecolorColors,
  updateAvatarRecolorTintStrength
} from "../lib/avatarRecolorShader";

describe("avatar recolor shader", () => {
  it("patches the material fragment shader once", () => {
    const material = new MeshStandardMaterial();
    const textures = { neutralAlbedo: new Texture(), zoneMask: new Texture() };
    applyAvatarRecolorShader(material, textures);
    applyAvatarRecolorShader(material, textures);

    const shader = {
      uniforms: {},
      fragmentShader: [
        "#include <map_pars_fragment>",
        "void main() {",
        "  #include <map_fragment>",
        "}"
      ].join("\n")
    };

    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.fragmentShader.match(/uniform sampler2D zoneMask/g)?.length ?? 0).toBe(1);
    expect(shader.fragmentShader.match(/float avatarZoneId =/g)?.length ?? 0).toBe(1);
    expect(shader.fragmentShader).toContain("else if (avatarZone == 14) { avatarTint = zoneColors[14]; }");
    expect(shader.fragmentShader).toContain("diffuseColor.rgb = mix(diffuseColor.rgb, avatarTint, tintStrength);");
  });

  it("stores and syncs the zone-color uniform payload", () => {
    const material = new MeshStandardMaterial();
    const textures = { neutralAlbedo: new Texture(), zoneMask: new Texture() };
    applyAvatarRecolorShader(material, textures);

    const shader = {
      uniforms: {},
      fragmentShader: [
        "#include <map_pars_fragment>",
        "void main() {",
        "  #include <map_fragment>",
        "}"
      ].join("\n")
    };
    material.onBeforeCompile(shader as never, {} as never);

    updateAvatarRecolorColors(material, { ...DEFAULT_APPEARANCE, shirtFront: "#ff0000" });
    updateAvatarRecolorTintStrength(material, 0.42);

    expect((material.userData.avatarRecolorColors as Float32Array).length).toBe(72);
    expect(((shader.uniforms as any).zoneColors.value as Array<{ r: number; g: number; b: number }>).length).toBe(24);
    expect((shader.uniforms as any).tintStrength.value).toBeCloseTo(0.42);
  });
});
