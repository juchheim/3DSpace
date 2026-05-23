"use client";

// Phase 0 dev harness for the Mars Surface pilot skin.
// Shows the default theater (A) alongside the Mars skin (B) for visual sign-off.
// No production code paths are touched — this component is only mounted by the
// dev-only route at apps/web/app/dev/world-skin-hero/page.tsx.

import { useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { BufferAttribute, BufferGeometry } from "three";
import { MARS_SKIN } from "./MarsSkin";
import type { SkinDescriptor, LightingPreset } from "./types";
import styles from "./SkinHarness.module.css";

// ── Classroom geometry constants ──────────────────────────────────────────────
// Mirror of packages/room-engine default manifest. Skins may NOT alter these.

const ROOM_WIDTH = 30;
const ROOM_DEPTH = 24;

type WallDef = { id: string; sx: number; sz: number; ex: number; ez: number; h: number };

const CLASSROOM_WALLS: WallDef[] = [
  { id: "wall-front",    sx: -15, sz: -11, ex:  15,  ez: -11,  h: 8 },
  { id: "wall-left",     sx: -15, sz: -11, ex: -15,  ez:  11,  h: 8 },
  { id: "wall-right",    sx:  15, sz: -11, ex:  15,  ez:  11,  h: 8 },
  { id: "wall-back-lo",  sx: -15, sz:  11, ex:  -9,  ez:  11,  h: 8 },
  { id: "wall-back-li",  sx:  -9, sz:  11, ex:  -3,  ez:  11,  h: 8 },
  { id: "wall-back-c",   sx:  -3, sz:  11, ex:   3,  ez:  11,  h: 8 },
  { id: "wall-back-ri",  sx:   3, sz:  11, ex:   9,  ez:  11,  h: 8 },
  { id: "wall-back-ro",  sx:   9, sz:  11, ex:  15,  ez:  11,  h: 8 },
];

type TierDef = { minZ: number; maxZ: number; floorY: number };

const CLASSROOM_TIERS: TierDef[] = [
  { minZ: 3.0, maxZ:  7.0, floorY: 0.5 },
  { minZ: 7.0, maxZ: 10.5, floorY: 1.0 },
];

const DEFAULT_LIGHTING: LightingPreset = {
  backgroundColor:      "#16231d",
  ambientColor:         "#ffffff",
  ambientIntensity:     0.82,
  directionalColor:     "#ffffff",
  directionalIntensity: 1.4,
  directionalPosition:  [4, 8, 6],
};

const DEFAULT_WALL_COLOR  = "#8ea487";
const DEFAULT_FLOOR_COLOR = "#d8c99f";
const DEFAULT_TIER_COLORS = ["#cac0a2", "#bfb498"] as const;

// ── Three.js geometry helpers ─────────────────────────────────────────────────

function WallMesh({ id, sx, sz, ex, ez, h, skin }: WallDef & { skin: SkinDescriptor | null }) {
  const length = Math.hypot(ex - sx, ez - sz);
  const midX   = (sx + ex) / 2;
  const midZ   = (sz + ez) / 2;
  const midY   = h / 2;
  const angle  = Math.atan2(ez - sz, ex - sx);
  const mat    = skin?.wallMaterials[id];
  return (
    <mesh position={[midX, midY, midZ]} rotation={[0, -angle, 0]}>
      <boxGeometry args={[length, h, 0.12]} />
      <meshStandardMaterial
        color={mat?.colorHex ?? DEFAULT_WALL_COLOR}
        roughness={mat?.roughness ?? 0.85}
      />
    </mesh>
  );
}

function TierMesh({
  tier,
  prevFloorY,
  color,
  roughness,
}: {
  tier: TierDef;
  prevFloorY: number;
  color: string;
  roughness: number;
}) {
  const geometry = useMemo(() => {
    const hw    = ROOM_WIDTH / 2;
    const rh    = tier.floorY - prevFloorY;
    const bevel = rh * 0.28;  // angled front riser at ~74° — matches RoomView3D

    // 8 vertices: left face (v0-v3), right face (v4-v7)
    const pos = new Float32Array([
      -hw, prevFloorY,    tier.minZ - bevel,  // 0
      -hw, tier.floorY,   tier.minZ,           // 1
      -hw, tier.floorY,   tier.maxZ,           // 2
      -hw, prevFloorY,    tier.maxZ,           // 3
       hw, prevFloorY,    tier.minZ - bevel,  // 4
       hw, tier.floorY,   tier.minZ,           // 5
       hw, tier.floorY,   tier.maxZ,           // 6
       hw, prevFloorY,    tier.maxZ,           // 7
    ]);
    const idx = new Uint16Array([
      1, 2, 6,  1, 6, 5,   // top face    (+y)
      0, 1, 5,  0, 5, 4,   // front riser (angled)
      2, 3, 7,  2, 7, 6,   // back face   (+z)
      0, 2, 1,  0, 3, 2,   // left cap    (−x)
      4, 5, 6,  4, 6, 7,   // right cap   (+x)
      0, 4, 7,  0, 7, 3,   // bottom face (−y)
    ]);
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }, [tier, prevFloorY]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={roughness} />
    </mesh>
  );
}

function ClassroomScene({ skin }: { skin: SkinDescriptor | null }) {
  const l             = skin?.lighting ?? DEFAULT_LIGHTING;
  const floorColor    = skin?.floor.colorHex    ?? DEFAULT_FLOOR_COLOR;
  const floorRoughness = skin?.floor.roughness  ?? 0.92;

  return (
    <>
      <color attach="background" args={[l.backgroundColor]} />
      {l.fogColor !== undefined && (
        <fog attach="fog" args={[l.fogColor, l.fogNear ?? 20, l.fogFar ?? 60]} />
      )}
      {l.hemisphereSkyColor ? (
        <>
          <hemisphereLight
            args={[
              l.hemisphereSkyColor as string,
              (l.hemisphereGroundColor ?? "#000") as string,
              l.hemisphereIntensity ?? 1,
            ]}
          />
          <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
        </>
      ) : (
        <ambientLight color={l.ambientColor} intensity={l.ambientIntensity} />
      )}
      <directionalLight
        color={l.directionalColor}
        intensity={l.directionalIntensity}
        position={l.directionalPosition}
      />
      {l.directionalFillIntensity !== undefined && l.directionalFillIntensity > 0 ? (
        <directionalLight
          color={(l.directionalFillColor ?? l.directionalColor) as string}
          intensity={l.directionalFillIntensity}
          position={(l.directionalFillPosition ?? [0, 10, 14]) as [number, number, number]}
        />
      ) : null}

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[ROOM_WIDTH, ROOM_DEPTH]} />
        <meshStandardMaterial color={floorColor} roughness={floorRoughness} />
      </mesh>

      {/* Grid overlay — subtle on Mars, visible on default */}
      <gridHelper
        args={[Math.max(ROOM_WIDTH, ROOM_DEPTH), 24, "#4c6b58", "#31473b"]}
        position={[0, 0.01, 0]}
      />

      {/* Tier platforms */}
      {CLASSROOM_TIERS.map((tier, i) => {
        const prevFloorY = i === 0 ? 0 : CLASSROOM_TIERS[i - 1]!.floorY;
        const color = skin?.tiers?.colorHex ?? DEFAULT_TIER_COLORS[i % DEFAULT_TIER_COLORS.length]!;
        const roughness = skin?.tiers?.roughness ?? 0.92;
        return (
          <TierMesh key={i} tier={tier} prevFloorY={prevFloorY} color={color} roughness={roughness} />
        );
      })}

      {/* Walls */}
      {CLASSROOM_WALLS.map((wall) => (
        <WallMesh key={wall.id} {...wall} skin={skin} />
      ))}
    </>
  );
}

// ── Control widgets ───────────────────────────────────────────────────────────

type ViewMode = "A" | "AB" | "B";

const VIEW_OPTIONS: ReadonlyArray<{ value: ViewMode; label: string }> = [
  { value: "A",  label: "A · Default" },
  { value: "AB", label: "A | B" },
  { value: "B",  label: "B · Mars" },
];

function SegmentedControl({
  options,
  selected,
  onSelect,
}: {
  options: ReadonlyArray<{ value: ViewMode; label: string }>;
  selected: ViewMode;
  onSelect: (v: ViewMode) => void;
}) {
  return (
    <div className={styles.segmented} role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === selected}
          className={`${styles.segment}${o.value === selected ? ` ${styles.segmentActive}` : ""}`}
          onClick={() => onSelect(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Canvas wrapper ────────────────────────────────────────────────────────────

const CAMERA = { position: [0, 12, 14] as [number, number, number], fov: 48 };

function SceneCanvas({ skin, label }: { skin: SkinDescriptor | null; label: string }) {
  return (
    <div className={styles.canvasWrap}>
      <Canvas
        camera={CAMERA}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <ClassroomScene skin={skin} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          minDistance={5}
          maxDistance={40}
          maxPolarAngle={Math.PI * 0.72}
          target={[0, 2, 0]}
        />
      </Canvas>
      <div className={styles.canvasLabel}>{label}</div>
    </div>
  );
}

// ── Harness ───────────────────────────────────────────────────────────────────

export function SkinHarness() {
  const [viewMode, setViewMode] = useState<ViewMode>("AB");
  const [ambientGain, setAmbientGain] = useState(MARS_SKIN.ambient?.defaultGain ?? 0.15);

  return (
    <div className={styles.harness}>
      {/* ── Left control panel ── */}
      <aside className={styles.panel}>
        <header className={styles.panelHeader}>
          <p className={styles.kicker}>World Skins · Phase 0 harness</p>
          <h1 className={styles.title}>{MARS_SKIN.label}</h1>
          <p className={styles.description}>{MARS_SKIN.description}</p>
        </header>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>View</h2>
          <SegmentedControl options={VIEW_OPTIONS} selected={viewMode} onSelect={setViewMode} />
          <p className={styles.paramHelp}>Compare default theater (A) with Mars skin (B) side-by-side.</p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Walk speed</h2>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Mars</span>
            <span className={styles.statValue}>{MARS_SKIN.walkSpeedMultiplier}×</span>
          </div>
          <div className={styles.statRow}>
            <span className={styles.statLabel}>Default</span>
            <span className={styles.statValue}>1.0×</span>
          </div>
          <p className={styles.paramHelp}>
            Code-only multiplier applied in Phase 7 via{" "}
            <code>useAvatarMovement</code>. Value displayed here for design review.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Ambient gain</h2>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={ambientGain}
              onChange={(e) => setAmbientGain(parseFloat(e.target.value))}
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{Math.round(ambientGain * 100)}%</span>
          </div>
          <p className={styles.paramHelp}>
            Cap at 15% per P3 (voice is primary). Ambient player wired in Phase 5.
          </p>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Skin details</h2>
          <dl className={styles.details}>
            <dt>Slug</dt>         <dd>{MARS_SKIN.slug}</dd>
            <dt>Avatar scale</dt> <dd>{MARS_SKIN.avatarScale}×</dd>
            <dt>Grade bands</dt>  <dd>5–12</dd>
            <dt>Subjects</dt>     <dd>Earth &amp; space science</dd>
          </dl>
        </section>

        <div className={styles.actions}>
          <p className={styles.hint}>
            <strong>Phase 0 quality gate:</strong> walls/floor look credibly Martian; board area text
            reads at WCAG AA contrast; walk speed value is 0.38×; ambient gain caps at 15%.
          </p>
        </div>
      </aside>

      {/* ── Right stage ── */}
      <div className={styles.stage}>
        {viewMode === "A" && (
          <SceneCanvas skin={null} label="A · Default theater" />
        )}
        {viewMode === "B" && (
          <SceneCanvas skin={MARS_SKIN} label="B · Mars Surface" />
        )}
        {viewMode === "AB" && (
          <div className={styles.splitStage}>
            <SceneCanvas skin={null}      label="A · Default" />
            <SceneCanvas skin={MARS_SKIN} label="B · Mars" />
          </div>
        )}
      </div>
    </div>
  );
}
