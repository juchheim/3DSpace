"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useAnimations, useGLTF } from "@react-three/drei";
import type { AvatarAccessoryCatalogEntry, AvatarEquippedAccessories } from "@3dspace/contracts";
import { Group } from "three";
import { SkeletonUtils } from "three-stdlib";
import { AvatarAccessoryLayer } from "../../components/AvatarAccessoryLayer";
import { applyHairSuppressionRules, bindHairSuppressionToMixer, collectHairSuppressionRules, restoreHairSuppressionRules } from "../../components/avatarHairSuppression";
import { BUILTIN_AVATAR_ACCESSORY_CATALOG } from "../../lib/avatarAccessoryCatalog";

const AVATAR_URL = "/avatars/azure-vanguard.glb";
const NATIVE_HEIGHT = 1.69;
const TARGET_HEIGHT = 1.7;
const MODEL_SCALE = TARGET_HEIGHT / NATIVE_HEIGHT;
const CLIP_IDLE = "Idle_12";

useGLTF.preload(AVATAR_URL);

const DEFAULT_ENTRY =
  BUILTIN_AVATAR_ACCESSORY_CATALOG.find((entry) => entry.slug === "bowler-hat") ??
  BUILTIN_AVATAR_ACCESSORY_CATALOG[0]!;

function equippedForEntry(entry: AvatarAccessoryCatalogEntry): AvatarEquippedAccessories {
  return {
    head: entry.slot === "head" ? entry.slug : null,
    hands: entry.slot === "hands" ? entry.slug : null
  };
}

function AvatarAccessoryPreview({ entry }: { entry: AvatarAccessoryCatalogEntry }) {
  const { scene, animations } = useGLTF(AVATAR_URL);
  const model = useMemo(() => SkeletonUtils.clone(scene) as Group, [scene]);
  const groupRef = useRef<Group>(null);
  const hairSuppressionRulesRef = useRef(collectHairSuppressionRules(model, []));
  const { actions, mixer } = useAnimations(animations, groupRef);

  useEffect(() => {
    hairSuppressionRulesRef.current = collectHairSuppressionRules(model, [entry]);
    applyHairSuppressionRules(hairSuppressionRulesRef.current);
    return () => {
      restoreHairSuppressionRules(hairSuppressionRulesRef.current);
      hairSuppressionRulesRef.current = [];
    };
  }, [model, entry]);

  useEffect(() => {
    if (!mixer) return;
    return bindHairSuppressionToMixer(mixer, () => hairSuppressionRulesRef.current);
  }, [mixer, entry]);

  useEffect(() => {
    const action = actions[CLIP_IDLE];
    if (!action) return;
    action.reset().fadeIn(0.2).play();
    return () => {
      action.fadeOut(0.2);
    };
  }, [actions]);

  return (
    <group ref={groupRef} position={[0, 0, 0]}>
      <primitive object={model} scale={MODEL_SCALE} />
      <AvatarAccessoryLayer root={model} equipped={equippedForEntry(entry)} catalog={[entry]} />
    </group>
  );
}

function sliderRow(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onChange: (next: number) => void
) {
  return (
    <label key={label} style={{ display: "grid", gap: "0.25rem", fontSize: "0.85rem" }}>
      <span>
        {label}: <code>{value.toFixed(3)}</code>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

export function AvatarAccessoryHarness() {
  const [localPosition, setLocalPosition] = useState(DEFAULT_ENTRY.localPosition);
  const [localRotation, setLocalRotation] = useState(DEFAULT_ENTRY.localRotation);

  const entry = useMemo(
    (): AvatarAccessoryCatalogEntry => ({
      ...DEFAULT_ENTRY,
      localPosition,
      localRotation
    }),
    [localPosition, localRotation]
  );

  const catalogSnippet = JSON.stringify(
    {
      localPosition: {
        x: Number(localPosition.x.toFixed(3)),
        y: Number(localPosition.y.toFixed(3)),
        z: Number(localPosition.z.toFixed(3))
      },
      localRotation: {
        x: Number(localRotation.x.toFixed(3)),
        y: Number(localRotation.y.toFixed(3)),
        z: Number(localRotation.z.toFixed(3))
      }
    },
    null,
    2
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: "100vh", background: "#10141c", color: "#e8edf5" }}>
      <aside style={{ padding: "1.25rem", borderRight: "1px solid #243044", display: "grid", gap: "1rem", alignContent: "start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "1.1rem" }}>Avatar accessory tuning</h1>
          <p style={{ margin: "0.5rem 0 0", color: "#9fb0c9", fontSize: "0.85rem", lineHeight: 1.45 }}>
            Azure Vanguard + bowler hat. Adjust offsets, then copy values into{" "}
            <code>packages/avatar-accessories/catalog/builtin.json</code>.
          </p>
        </div>

        <section style={{ display: "grid", gap: "0.65rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>localPosition (m)</h2>
          {sliderRow("Y", localPosition.y, -0.2, 0.25, 0.005, (y) => setLocalPosition((prev) => ({ ...prev, y })))}
          {sliderRow("X", localPosition.x, -0.15, 0.15, 0.005, (x) => setLocalPosition((prev) => ({ ...prev, x })))}
          {sliderRow("Z", localPosition.z, -0.15, 0.15, 0.005, (z) => setLocalPosition((prev) => ({ ...prev, z })))}
        </section>

        <section style={{ display: "grid", gap: "0.65rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>localRotation (rad)</h2>
          {sliderRow("X", localRotation.x, -Math.PI, Math.PI, 0.01, (x) => setLocalRotation((prev) => ({ ...prev, x })))}
          {sliderRow("Y", localRotation.y, -Math.PI, Math.PI, 0.01, (y) => setLocalRotation((prev) => ({ ...prev, y })))}
          {sliderRow("Z", localRotation.z, -Math.PI, Math.PI, 0.01, (z) => setLocalRotation((prev) => ({ ...prev, z })))}
        </section>

        <button
          type="button"
          onClick={() => {
            setLocalPosition(DEFAULT_ENTRY.localPosition);
            setLocalRotation(DEFAULT_ENTRY.localRotation);
          }}
          style={{
            padding: "0.55rem 0.75rem",
            borderRadius: "8px",
            border: "1px solid #3a4d68",
            background: "#182233",
            color: "#e8edf5",
            cursor: "pointer"
          }}
        >
          Reset to catalog defaults
        </button>

        <section style={{ display: "grid", gap: "0.5rem" }}>
          <h2 style={{ margin: 0, fontSize: "0.95rem" }}>Copy into builtin.json</h2>
          <pre
            style={{
              margin: 0,
              padding: "0.75rem",
              borderRadius: "8px",
              background: "#0b1018",
              border: "1px solid #243044",
              fontSize: "0.75rem",
              overflow: "auto"
            }}
          >
            {catalogSnippet}
          </pre>
        </section>
      </aside>

      <div style={{ minHeight: "100vh" }}>
        <Canvas camera={{ position: [0.2, 1.55, 2.4], fov: 42 }} dpr={[1, 2]}>
          <color attach="background" args={["#0e131c"]} />
          <hemisphereLight args={["#cfe0ff", "#1a1712", 0.55]} />
          <directionalLight position={[4, 6, 5]} intensity={2.2} />
          <directionalLight position={[-4, 3, -2]} intensity={0.8} />
          <Suspense fallback={null}>
            <AvatarAccessoryPreview entry={entry} />
          </Suspense>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            minDistance={1.2}
            maxDistance={4.5}
            target={[0, 1.45, 0]}
            maxPolarAngle={Math.PI * 0.95}
          />
        </Canvas>
      </div>
    </div>
  );
}
