"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF, useTexture } from "@react-three/drei";
import type { AvatarAppearance } from "@3dspace/contracts";
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  Group,
  MeshStandardMaterial,
  NearestFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Object3D,
  type SkinnedMesh,
  type Texture
} from "three";
import { SkeletonUtils } from "three-stdlib";
import { DEFAULT_APPEARANCE } from "../../lib/avatarAppearance";
import {
  applyAvatarRecolorShader,
  updateAvatarRecolorColors,
  updateAvatarRecolorTintStrength,
  type AvatarRecolorTextures
} from "../../lib/avatarRecolorShader";
import { ZONE_GROUPS, ZONE_LABELS } from "../../lib/avatarMaterials";

const AVATAR_URL = "/avatars/azure-vanguard.glb";
const NEUTRAL_ALBEDO_URL = "/avatars/azure-vanguard-albedo-neutral.jpg";
const ZONE_MASK_URL = "/avatars/azure-vanguard-zone-mask.png";
const UV_REFERENCE_URL = "/avatars/azure-vanguard-uv-reference.png";
const NATIVE_HEIGHT = 1.69;
const TARGET_HEIGHT = 1.7;
const MODEL_SCALE = TARGET_HEIGHT / NATIVE_HEIGHT;
const CLIPS = {
  idle: "Idle_12",
  walking: "Walking",
  running: "Running"
} as const;

type ClipKey = keyof typeof CLIPS;

useGLTF.preload(AVATAR_URL);
useTexture.preload(NEUTRAL_ALBEDO_URL);
useTexture.preload(ZONE_MASK_URL);

function isSkinnedMesh(object: Object3D): object is SkinnedMesh {
  return (object as SkinnedMesh).isSkinnedMesh === true;
}

function configureRecolorTextures(textures: AvatarRecolorTextures) {
  textures.neutralAlbedo.colorSpace = SRGBColorSpace;
  textures.neutralAlbedo.flipY = false;
  textures.neutralAlbedo.wrapS = RepeatWrapping;
  textures.neutralAlbedo.wrapT = RepeatWrapping;
  textures.zoneMask.colorSpace = NoColorSpace;
  textures.zoneMask.flipY = false;
  textures.zoneMask.wrapS = ClampToEdgeWrapping;
  textures.zoneMask.wrapT = ClampToEdgeWrapping;
  textures.zoneMask.magFilter = NearestFilter;
  textures.zoneMask.minFilter = NearestFilter;
  textures.zoneMask.generateMipmaps = false;
  textures.neutralAlbedo.needsUpdate = true;
  textures.zoneMask.needsUpdate = true;
}

function buildMaskPreviewTexture(zoneMask: Texture) {
  const source = zoneMask.image as HTMLImageElement | HTMLCanvasElement | undefined;
  if (!source) return zoneMask;

  const canvas = document.createElement("canvas");
  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return zoneMask;
  ctx.drawImage(source, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const palette = [
    [24, 28, 36],
    [239, 68, 68],
    [249, 115, 22],
    [234, 179, 8],
    [132, 204, 22],
    [34, 197, 94],
    [20, 184, 166],
    [6, 182, 212],
    [59, 130, 246],
    [99, 102, 241],
    [139, 92, 246],
    [168, 85, 247],
    [217, 70, 239],
    [236, 72, 153],
    [244, 114, 182],
    [251, 146, 60],
    [250, 204, 21],
    [163, 230, 53],
    [74, 222, 128],
    [45, 212, 191],
    [56, 189, 248],
    [96, 165, 250],
    [129, 140, 248],
    [192, 132, 252]
  ];

  for (let offset = 0; offset < image.data.length; offset += 4) {
    const zoneId = image.data[offset] ?? 0;
    const color = palette[zoneId] ?? palette[0];
    const [r = 0, g = 0, b = 0] = color ?? [];
    image.data[offset] = r;
    image.data[offset + 1] = g;
    image.data[offset + 2] = b;
    image.data[offset + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

function AvatarRecolorPreview({
  appearance,
  clip,
  showMaskOverlay,
  tintStrength,
  useOriginalAlbedo
}: {
  appearance: AvatarAppearance;
  clip: ClipKey;
  showMaskOverlay: boolean;
  tintStrength: number;
  useOriginalAlbedo: boolean;
}) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const [neutralAlbedo, zoneMask] = useTexture([NEUTRAL_ALBEDO_URL, ZONE_MASK_URL]) as [Texture, Texture];
  const maskPreviewTexture = useMemo(() => buildMaskPreviewTexture(zoneMask), [zoneMask]);
  const recolorTextures = useMemo<AvatarRecolorTextures>(() => ({ neutralAlbedo, zoneMask }), [neutralAlbedo, zoneMask]);
  configureRecolorTextures(recolorTextures);

  const model = useMemo(() => {
    const root = SkeletonUtils.clone(scene) as Group;
    root.traverse((object) => {
      if (!isSkinnedMesh(object)) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const sourceMaterial = object.material as MeshStandardMaterial;
      const material = sourceMaterial.clone();
      object.material = material;

      if (showMaskOverlay) {
        material.map = maskPreviewTexture;
        material.emissiveMap = null;
        material.emissive.setRGB(0, 0, 0);
        material.metalness = 0;
        material.roughness = 0.72;
        material.needsUpdate = true;
        return;
      }

      const albedo = useOriginalAlbedo ? (sourceMaterial.map ?? neutralAlbedo) : neutralAlbedo;
      material.emissiveMap = null;
      material.emissive.setRGB(0, 0, 0);
      material.metalness = 0;
      material.roughness = 0.72;
      applyAvatarRecolorShader(material, { neutralAlbedo: albedo, zoneMask });
      updateAvatarRecolorColors(material, appearance);
      updateAvatarRecolorTintStrength(material, tintStrength);
    });
    return root;
  }, [appearance, maskPreviewTexture, neutralAlbedo, scene, showMaskOverlay, tintStrength, useOriginalAlbedo, zoneMask]);
  const { actions } = useAnimations(animations, model);

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

  useEffect(() => {
    const action = actions[CLIPS[clip]];
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions, clip]);

  useEffect(() => {
    if (showMaskOverlay) return;
    model.traverse((object) => {
      if (!isSkinnedMesh(object)) return;
      updateAvatarRecolorColors(object.material as MeshStandardMaterial, appearance);
      updateAvatarRecolorTintStrength(object.material as MeshStandardMaterial, tintStrength);
    });
  }, [appearance, model, showMaskOverlay, tintStrength]);

  return <primitive object={model} scale={MODEL_SCALE} />;
}

export function AvatarRecolorHarness() {
  const [appearance, setAppearance] = useState<AvatarAppearance>(DEFAULT_APPEARANCE);
  const [clip, setClip] = useState<ClipKey>("idle");
  const [showMaskOverlay, setShowMaskOverlay] = useState(false);
  const [useOriginalAlbedo, setUseOriginalAlbedo] = useState(false);
  const [tintStrength, setTintStrength] = useState(1);

  const exportJson = useMemo(() => JSON.stringify(appearance, null, 2), [appearance]);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        minHeight: "100vh",
        background: "#0d131b",
        color: "#e5edf7"
      }}
    >
      <aside
        style={{
          borderRight: "1px solid #223042",
          display: "grid",
          gap: "1rem",
          alignContent: "start",
          padding: "1.25rem",
          overflowY: "auto"
        }}
      >
        <div style={{ display: "grid", gap: "0.4rem" }}>
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Avatar recolor harness</h1>
          <p style={{ margin: 0, color: "#a4b4ca", fontSize: "0.88rem", lineHeight: 1.45 }}>
            Azure Vanguard recolor preview with the shipped zone mask and neutral albedo.
          </p>
        </div>

        <section style={{ display: "grid", gap: "0.65rem" }}>
          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.88rem" }}>
            <span>Animation</span>
            <select value={clip} onChange={(event) => setClip(event.target.value as ClipKey)} style={{ padding: "0.45rem", background: "#121b27", color: "#e5edf7", border: "1px solid #33445b", borderRadius: "6px" }}>
              <option value="idle">Idle</option>
              <option value="walking">Walking</option>
              <option value="running">Running</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: "0.25rem", fontSize: "0.88rem" }}>
            <span>Tint strength: {tintStrength.toFixed(2)}</span>
            <input type="range" min={0} max={1} step={0.01} value={tintStrength} onChange={(event) => setTintStrength(Number(event.target.value))} />
          </label>

          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
            <input type="checkbox" checked={showMaskOverlay} onChange={(event) => setShowMaskOverlay(event.target.checked)} />
            Show zone mask overlay
          </label>

          <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.88rem" }}>
            <input type="checkbox" checked={useOriginalAlbedo} onChange={(event) => setUseOriginalAlbedo(event.target.checked)} />
            Use original baked albedo
          </label>

          <button
            onClick={() => setAppearance(DEFAULT_APPEARANCE)}
            style={{
              padding: "0.45rem 0.75rem",
              background: "#1c2d40",
              color: "#e5edf7",
              border: "1px solid #33445b",
              borderRadius: "6px",
              fontSize: "0.88rem",
              cursor: "pointer",
              alignSelf: "start"
            }}
          >
            Reset to defaults
          </button>
        </section>

        {ZONE_GROUPS.map((group) => (
          <section key={group.label} style={{ display: "grid", gap: "0.55rem" }}>
            <h2 style={{ margin: 0, fontSize: "0.95rem" }}>{group.label}</h2>
            {group.keys.map((key) => (
              <label key={key} style={{ display: "grid", gap: "0.25rem", fontSize: "0.84rem" }}>
                <span>{ZONE_LABELS[key]}</span>
                <input
                  type="color"
                  value={appearance[key]}
                  onChange={(event) => setAppearance((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              </label>
            ))}
          </section>
        ))}

        <section style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>UV reference</h2>
          <img
            src={UV_REFERENCE_URL}
            alt="Azure Vanguard UV reference"
            style={{ width: "100%", borderRadius: "6px", border: "1px solid #223042", background: "#fff" }}
          />
        </section>

        <section style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>Appearance JSON</h2>
          <pre
            style={{
              margin: 0,
              border: "1px solid #223042",
              borderRadius: "6px",
              background: "#0a1017",
              overflow: "auto",
              padding: "0.75rem",
              fontSize: "0.75rem"
            }}
          >
            {exportJson}
          </pre>
        </section>
      </aside>

      <div style={{ minHeight: "100vh" }}>
        <Canvas camera={{ position: [0.2, 1.5, 2.6], fov: 38 }} dpr={[1, 2]}>
          <color attach="background" args={["#0b1017"]} />
          <hemisphereLight args={["#d7e5ff", "#1a1815", 0.6]} />
          <directionalLight position={[4, 6, 5]} intensity={2.1} />
          <directionalLight position={[-4, 3, -2]} intensity={0.75} />
          <Suspense fallback={null}>
            <group position={[0, 0, 0]}>
              <AvatarRecolorPreview
                appearance={appearance}
                clip={clip}
                showMaskOverlay={showMaskOverlay}
                tintStrength={tintStrength}
                useOriginalAlbedo={useOriginalAlbedo}
              />
            </group>
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            minDistance={1.25}
            maxDistance={4.5}
            target={[0, 1.35, 0]}
            maxPolarAngle={Math.PI * 0.95}
          />
        </Canvas>
      </div>
    </div>
  );
}
