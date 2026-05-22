"use client";

import { useMemo, type CSSProperties } from "react";
import { Html } from "@react-three/drei";
import { DoubleSide, MathUtils } from "three";
import type { ProceduralProps } from "./types";

// ── Identity ────────────────────────────────────────────────────────────────

export const WATER_MOLECULE_PROCEDURAL_ID = "water-molecule";
export const WATER_MOLECULE_DISPLAY_NAME = "Water molecule (H₂O)";
export const WATER_MOLECULE_ATTRIBUTION = "3DSpace — built-in procedural manipulative";

// ── Parameter value types ───────────────────────────────────────────────────

type PaletteId = "cpk" | "accessible";
type ModelStyle = "ball-and-stick" | "space-filling";

// ── Chemistry constants ─────────────────────────────────────────────────────
// Scene units are metres (1 unit = 1 m), matching RoomManifest.dimensions.

/** Measured H–O–H angle of liquid water. Fixed — water's geometry is not a variable. */
const BOND_ANGLE_DEG = 104.5;
/** O–H centre-to-centre distance, sized so the manipulative reads well from ~3 m. */
const BOND_LENGTH = 0.42;
/** Stick radius for the ball-and-stick model. */
const BOND_RADIUS = 0.05;

/** Atom radii per model convention. Space-filling approximates van der Waals radii. */
const ATOM_RADII: Record<ModelStyle, { oxygen: number; hydrogen: number }> = {
  "ball-and-stick": { oxygen: 0.17, hydrogen: 0.105 },
  "space-filling": { oxygen: 0.36, hydrogen: 0.285 },
};

/** Atom colours. CPK is the chemistry standard; the accessible palette swaps red→blue for colour-vision safety. */
const PALETTES: Record<PaletteId, { oxygen: string; hydrogen: string }> = {
  cpk: { oxygen: "#e23c2b", hydrogen: "#eef1f4" },
  accessible: { oxygen: "#1f78c8", hydrogen: "#eef1f4" },
};

/** Annotation accent used when no instance `colorTintHex` is supplied. */
const DEFAULT_ANNOTATION_ACCENT = "#f4b63f";

// ── Parameter contract (drafted here; Phase 1 moves it into @3dspace/contracts) ──

export type HeroParameterDef =
  | { key: string; label: string; type: "boolean"; default: boolean; help: string }
  | {
      key: string;
      label: string;
      type: "enum";
      default: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      help: string;
    };

export const WATER_MOLECULE_PARAMETERS: readonly HeroParameterDef[] = [
  {
    key: "modelStyle",
    label: "Model style",
    type: "enum",
    default: "ball-and-stick",
    options: [
      { value: "ball-and-stick", label: "Ball & stick" },
      { value: "space-filling", label: "Space-filling" },
    ],
    help: "Ball-and-stick exposes the bonds and bent geometry; space-filling shows relative atom sizes (van der Waals radii).",
  },
  {
    key: "bondAngleVisible",
    label: "Bond-angle readout",
    type: "boolean",
    default: true,
    help: "Draws the 104.5° H–O–H angle measurement at the oxygen vertex.",
  },
  {
    key: "palette",
    label: "Colour palette",
    type: "enum",
    default: "cpk",
    options: [
      { value: "cpk", label: "CPK standard" },
      { value: "accessible", label: "Colourblind-safe" },
    ],
    help: "CPK is the standard chemistry colour code (oxygen red); the colourblind-safe palette swaps red for blue.",
  },
];

export const WATER_MOLECULE_DEFAULT_PARAMETERS: Record<string, unknown> = {
  modelStyle: "ball-and-stick",
  bondAngleVisible: true,
  palette: "cpk",
};

// ── Defensive parameter readers ─────────────────────────────────────────────
// `parameters` values arrive as `unknown`; fall back to defaults on anything odd.

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

// ── Molecule geometry ───────────────────────────────────────────────────────

type Vec3 = [number, number, number];

type BondHalf = { id: string; position: Vec3; rotationZ: number; length: number; element: "O" | "H" };

/**
 * Water's three atoms are coplanar. They are placed in the local XY plane with
 * the oxygen at the origin and the H–O–H angle opening symmetrically upward, so
 * the molecule reads as a wide "V". Each O–H bond is split into two half-
 * cylinders (oxygen-coloured near O, hydrogen-coloured near H) — the classic
 * model-kit look.
 */
function buildLayout(bondAngleDeg: number, bondLength: number) {
  const half = MathUtils.degToRad(bondAngleDeg) / 2;
  const offsetX = Math.sin(half) * bondLength;
  const offsetY = Math.cos(half) * bondLength;

  const oxygen: Vec3 = [0, 0, 0];
  const hydrogens: { id: string; position: Vec3 }[] = [
    { id: "h-left", position: [-offsetX, offsetY, 0] },
    { id: "h-right", position: [offsetX, offsetY, 0] },
  ];

  const halfLength = bondLength / 2 + 0.005; // 0.005 overlap hides the mid-bond seam
  const bonds: BondHalf[] = [];
  for (const dir of [-1, 1] as const) {
    const side = dir < 0 ? "left" : "right";
    const rotationZ = -dir * half; // rotates the cylinder's +Y axis onto the bond direction
    bonds.push({
      id: `bond-${side}-o`,
      position: [dir * offsetX * 0.25, offsetY * 0.25, 0],
      rotationZ,
      length: halfLength,
      element: "O",
    });
    bonds.push({
      id: `bond-${side}-h`,
      position: [dir * offsetX * 0.75, offsetY * 0.75, 0],
      rotationZ,
      length: halfLength,
      element: "H",
    });
  }

  return { oxygen, hydrogens, bonds };
}

// ── Label styling (transform Html scales with the manipulative export root) ─

const ATOM_LABEL_STYLE: CSSProperties = {
  padding: "1px 7px 2px",
  borderRadius: "999px",
  background: "rgba(9, 12, 18, 0.82)",
  border: "1px solid rgba(255, 255, 255, 0.22)",
  color: "#f4f6f8",
  font: "600 13px 'Barlow', system-ui, sans-serif",
  letterSpacing: "0.04em",
  lineHeight: 1.2,
  pointerEvents: "none",
  userSelect: "none",
  whiteSpace: "nowrap",
};

// ── Sub-components ──────────────────────────────────────────────────────────

function AtomLabel({ symbol, radius }: { symbol: string; radius: number }) {
  return (
    <Html
      transform
      center
      position={[0, radius * 0.72, 0]}
      scale={radius * 0.55}
      style={{ pointerEvents: "none" }}
    >
      <div style={ATOM_LABEL_STYLE}>{symbol}</div>
    </Html>
  );
}

function Atom({
  position,
  radius,
  color,
  symbol,
}: {
  position: Vec3;
  radius: number;
  color: string;
  symbol: string;
}) {
  return (
    <group position={position}>
      <mesh scale={radius}>
        <sphereGeometry args={[1, 64, 48]} />
        <meshStandardMaterial color={color} roughness={0.26} metalness={0} />
      </mesh>
      <AtomLabel symbol={symbol} radius={radius} />
    </group>
  );
}

function BondAngleAnnotation({ oxygenRadius, accent }: { oxygenRadius: number; accent: string }) {
  const innerRadius = oxygenRadius + 0.05;
  const outerRadius = innerRadius + 0.028;
  const half = MathUtils.degToRad(BOND_ANGLE_DEG) / 2;

  // ringGeometry's theta is measured from +X; centre the band on +Y (theta = π/2).
  const thetaStart = Math.PI / 2 - half;
  const thetaLength = half * 2;

  const degreeChipStyle: CSSProperties = {
    padding: "2px 9px 3px",
    borderRadius: "999px",
    background: "rgba(9, 12, 18, 0.86)",
    border: `1.5px solid ${accent}`,
    color: accent,
    font: "600 13px 'Barlow', system-ui, sans-serif",
    letterSpacing: "0.02em",
    lineHeight: 1.2,
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  return (
    <group>
      <mesh>
        <ringGeometry args={[innerRadius, outerRadius, 72, 1, thetaStart, thetaLength]} />
        <meshBasicMaterial color={accent} side={DoubleSide} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <Html
        transform
        center
        position={[0, outerRadius + 0.08, 0]}
        scale={outerRadius * 0.45}
        style={{ pointerEvents: "none" }}
      >
        <div style={degreeChipStyle}>{`${BOND_ANGLE_DEG}°`}</div>
      </Html>
    </group>
  );
}

// ── Hero component ──────────────────────────────────────────────────────────

/**
 * The Phase 0 hero manipulative: a procedural H₂O molecule.
 *
 * `colorTintHex` is intentionally applied only to the bond-angle annotation,
 * never to the atoms — tinting the atoms would break the CPK colour convention
 * the palette parameter exists to teach.
 */
export function WaterMolecule({ parameters, scale, colorTintHex }: ProceduralProps) {
  const modelStyle = readEnum(parameters.modelStyle, ["ball-and-stick", "space-filling"] as const, "ball-and-stick");
  const palette = readEnum(parameters.palette, ["cpk", "accessible"] as const, "cpk");
  const bondAngleVisible = readBoolean(parameters.bondAngleVisible, true);

  const colors = PALETTES[palette];
  const radii = ATOM_RADII[modelStyle];
  const accent = colorTintHex ?? DEFAULT_ANNOTATION_ACCENT;

  const layout = useMemo(() => buildLayout(BOND_ANGLE_DEG, BOND_LENGTH), []);

  return (
    <group scale={scale}>
      {/* Oxygen sits at the local origin — the molecule's natural anchor point. */}
      <Atom position={layout.oxygen} radius={radii.oxygen} color={colors.oxygen} symbol="O" />
      {layout.hydrogens.map((hydrogen) => (
        <Atom
          key={hydrogen.id}
          position={hydrogen.position}
          radius={radii.hydrogen}
          color={colors.hydrogen}
          symbol="H"
        />
      ))}

      {/* Bonds are only meaningful in the ball-and-stick model. */}
      {modelStyle === "ball-and-stick"
        ? layout.bonds.map((bond) => (
            <mesh key={bond.id} position={bond.position} rotation={[0, 0, bond.rotationZ]}>
              <cylinderGeometry args={[BOND_RADIUS, BOND_RADIUS, bond.length, 24]} />
              <meshStandardMaterial
                color={bond.element === "O" ? colors.oxygen : colors.hydrogen}
                roughness={0.5}
                metalness={0}
              />
            </mesh>
          ))
        : null}

      {bondAngleVisible ? <BondAngleAnnotation oxygenRadius={radii.oxygen} accent={accent} /> : null}
    </group>
  );
}
