"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Mesh, type Group } from "three";
import { renderProcedural } from "./index";
import {
  WATER_MOLECULE_ATTRIBUTION,
  WATER_MOLECULE_DEFAULT_PARAMETERS,
  WATER_MOLECULE_DISPLAY_NAME,
  WATER_MOLECULE_PARAMETERS,
  WATER_MOLECULE_PROCEDURAL_ID,
  type HeroParameterDef,
} from "./waterMolecule";
import type { ProceduralProps } from "./types";
import styles from "./RoomObjectHeroHarness.module.css";

/**
 * Dev-only authoring harness for the RoomObject Phase 0 hero. No LiveKit, no room,
 * no API — just the procedural renderer, orbit controls, and parameter widgets, so
 * visual and pedagogical quality can be signed off before the platform exists.
 */

const HERO_RATIONALE =
  "Water (H₂O) is fully procedural — no texture or licensed asset — yet instantly readable from across a classroom. " +
  "Three pedagogical parameters (model style, bond-angle readout, palette) prove the manipulative is alive, not a static prop.";

const ACCENT_TINTS: ReadonlyArray<{ label: string; value: string | null }> = [
  { label: "Auto", value: null },
  { label: "Cyan", value: "#45c8d6" },
  { label: "Rose", value: "#ef6f8e" },
  { label: "Lime", value: "#8fce5a" },
];

/** Sums renderable triangles under the export root — also confirms `exportRootRef` is populated. */
function countTriangles(root: Group | null): number {
  if (!root) return 0;
  let total = 0;
  root.traverse((object) => {
    if (object.type !== "Mesh") return;
    const geometry = (object as Mesh).geometry;
    if (!geometry) return;
    if (geometry.index) {
      total += geometry.index.count / 3;
      return;
    }
    const position = geometry.getAttribute("position");
    if (position) total += position.count / 3;
  });
  return Math.round(total);
}

// ── Parameter widgets ───────────────────────────────────────────────────────

function BooleanControl({ checked, onToggle }: { checked: boolean; onToggle: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`${styles.toggle}${checked ? ` ${styles.toggleOn}` : ""}`}
      onClick={() => onToggle(!checked)}
    >
      <span className={styles.toggleTrack}>
        <span className={styles.toggleThumb} />
      </span>
      <span>{checked ? "On" : "Off"}</span>
    </button>
  );
}

function SegmentedControl({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<{ value: string; label: string }>;
  selected: string;
  onSelect: (next: string) => void;
}) {
  return (
    <div className={styles.segmented} role="group">
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            className={`${styles.segment}${active ? ` ${styles.segmentActive}` : ""}`}
            onClick={() => onSelect(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ParameterWidget({
  def,
  value,
  onChange,
}: {
  def: HeroParameterDef;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className={styles.param}>
      <span className={styles.paramLabel}>{def.label}</span>
      {def.type === "boolean" ? (
        <BooleanControl
          checked={typeof value === "boolean" ? value : def.default}
          onToggle={(next) => onChange(def.key, next)}
        />
      ) : (
        <SegmentedControl
          options={def.options}
          selected={typeof value === "string" ? value : def.default}
          onSelect={(next) => onChange(def.key, next)}
        />
      )}
      <p className={styles.paramHelp}>{def.help}</p>
    </div>
  );
}

// ── In-canvas thumbnail capture ─────────────────────────────────────────────

function CaptureBridge({ register }: { register: (capture: () => void) => void }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    register(() => {
      gl.render(scene, camera); // force a fresh frame before reading the buffer
      const source = gl.domElement;
      const targetWidth = 800;
      const targetHeight = 600;
      const out = document.createElement("canvas");
      out.width = targetWidth;
      out.height = targetHeight;
      const ctx = out.getContext("2d");
      if (!ctx) return;

      // Centre-crop the live canvas to the catalog card's 4:3 aspect.
      const targetAspect = targetWidth / targetHeight;
      const sourceAspect = source.width / source.height;
      let sx = 0;
      let sy = 0;
      let sw = source.width;
      let sh = source.height;
      if (sourceAspect > targetAspect) {
        sw = source.height * targetAspect;
        sx = (source.width - sw) / 2;
      } else {
        sh = source.width / targetAspect;
        sy = (source.height - sh) / 2;
      }
      ctx.drawImage(source, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

      out.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "water-molecule.png";
        link.click();
        URL.revokeObjectURL(url);
      }, "image/png");
    });
  }, [gl, scene, camera, register]);

  return null;
}

// ── Harness ─────────────────────────────────────────────────────────────────

export function RoomObjectHeroHarness() {
  const [parameters, setParameters] = useState<Record<string, unknown>>(() => ({
    ...WATER_MOLECULE_DEFAULT_PARAMETERS,
  }));
  const [accentTint, setAccentTint] = useState<string | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);
  const [triangleCount, setTriangleCount] = useState(0);

  const exportRootRef = useRef<Group>(null);
  const captureRef = useRef<(() => void) | null>(null);

  // Re-measure after the scene graph commits for the current parameters.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setTriangleCount(countTriangles(exportRootRef.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [parameters]);

  const setParameter = useCallback((key: string, value: unknown) => {
    setParameters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const resetParameters = useCallback(() => {
    setParameters({ ...WATER_MOLECULE_DEFAULT_PARAMETERS });
    setAccentTint(null);
  }, []);

  const registerCapture = useCallback((capture: () => void) => {
    captureRef.current = capture;
  }, []);

  const proceduralProps: ProceduralProps = {
    parameters,
    scale: 1,
    ...(accentTint ? { colorTintHex: accentTint } : {}),
  };

  return (
    <div className={styles.harness}>
      <aside className={styles.panel}>
        <header className={styles.panelHeader}>
          <p className={styles.kicker}>RoomObject · Phase 0 hero harness</p>
          <h1 className={styles.title}>{WATER_MOLECULE_DISPLAY_NAME}</h1>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Parameters</h2>
          {WATER_MOLECULE_PARAMETERS.map((def) => (
            <ParameterWidget key={def.key} def={def} value={parameters[def.key]} onChange={setParameter} />
          ))}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>
            Accent tint <span className={styles.sublabel}>· instance colorTintHex</span>
          </h2>
          <div className={styles.swatchRow}>
            {ACCENT_TINTS.map((tint) => {
              const active = tint.value === accentTint;
              return (
                <button
                  key={tint.label}
                  type="button"
                  title={tint.label}
                  aria-pressed={active}
                  className={`${styles.swatch}${active ? ` ${styles.swatchActive}` : ""}`}
                  onClick={() => setAccentTint(tint.value)}
                  {...(tint.value ? { style: { background: tint.value } } : {})}
                >
                  {tint.value ? "" : "Auto"}
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.section}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={autoRotate}
              onChange={(event) => setAutoRotate(event.target.checked)}
            />
            <span>Auto-rotate camera</span>
          </label>
        </section>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={resetParameters}>
            Reset parameters
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => captureRef.current?.()}>
            Capture thumbnail
          </button>
          <p className={styles.hint}>
            Capture downloads an 800×600 PNG of the current view for the catalog card. Pause auto-rotate to frame a still.
          </p>
        </div>
      </aside>

      <div className={styles.stage}>
        <Canvas
          camera={{ position: [1.55, 0.92, 2.35], fov: 40 }}
          dpr={[1, 2]}
          gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#0e131c"]} />
          <hemisphereLight args={["#cfe0ff", "#1a1712", 0.5]} />
          <directionalLight position={[4, 6, 5]} intensity={2.4} color="#fff4e6" />
          <directionalLight position={[-5, 2, 1.5]} intensity={0.7} color="#bcd2ff" />
          <directionalLight position={[-1.5, 3.5, -6]} intensity={1.15} />
          <group ref={exportRootRef}>{renderProcedural(WATER_MOLECULE_PROCEDURAL_ID, proceduralProps)}</group>
          <OrbitControls
            makeDefault
            enablePan={false}
            enableDamping
            autoRotate={autoRotate}
            autoRotateSpeed={0.8}
            minDistance={1.4}
            maxDistance={6}
            maxPolarAngle={Math.PI * 0.92}
            target={[0, 0.14, 0]}
          />
          <CaptureBridge register={registerCapture} />
        </Canvas>

        <footer className={styles.footer}>
          <div className={styles.footerMain}>
            <span className={styles.footerName}>{WATER_MOLECULE_DISPLAY_NAME}</span>
            <span className={styles.footerMeta}>
              {WATER_MOLECULE_ATTRIBUTION} · ~{triangleCount.toLocaleString()} triangles
            </span>
          </div>
          <p className={styles.footerRationale}>{HERO_RATIONALE}</p>
        </footer>
      </div>
    </div>
  );
}
