"use client";

import { useMemo } from "react";
import { Quaternion, Vector3 } from "three";
import type { ProceduralProps } from "./types";

// ── Identity ────────────────────────────────────────────────────────────────

export const CAFFEINE_MOLECULE_PROCEDURAL_ID = "caffeine-molecule";
export const CAFFEINE_MOLECULE_DISPLAY_NAME = "Caffeine molecule (C₈H₁₀N₄O₂)";
export const CAFFEINE_MOLECULE_ATTRIBUTION = "3DSpace — built-in procedural manipulative";

// ── Parameter value types ───────────────────────────────────────────────────

type PaletteId = "cpk" | "accessible";
type ModelStyle = "ball-and-stick" | "space-filling";
type ElementSymbol = "C" | "H" | "N" | "O";

export type MoleculeParameterDef =
  | { key: string; label: string; type: "boolean"; default: boolean; help: string }
  | {
      key: string;
      label: string;
      type: "enum";
      default: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      help: string;
    };

export const CAFFEINE_MOLECULE_PARAMETERS: readonly MoleculeParameterDef[] = [
  {
    key: "modelStyle",
    label: "Model style",
    type: "enum",
    default: "ball-and-stick",
    options: [
      { value: "ball-and-stick", label: "Ball & stick" },
      { value: "space-filling", label: "Space-filling" },
    ],
    help: "Ball-and-stick makes the fused ring and functional groups readable; space-filling shows the molecule's fuller volume.",
  },
  {
    key: "ringGuideVisible",
    label: "Ring guide",
    type: "boolean",
    default: true,
    help: "Highlights caffeine's fused xanthine ring scaffold so students can spot the central structure before studying the branches.",
  },
  {
    key: "heteroAtomLabelsVisible",
    label: "N/O atom labels",
    type: "boolean",
    default: true,
    help: "Adds mesh-built labels to nitrogen and oxygen atoms, emphasizing the heteroatoms that make caffeine chemically distinctive.",
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
    help: "CPK is the standard chemistry colour code; the colourblind-safe palette increases contrast between oxygen and nitrogen.",
  },
];

export const CAFFEINE_MOLECULE_DEFAULT_PARAMETERS: Record<string, unknown> = {
  modelStyle: "ball-and-stick",
  ringGuideVisible: true,
  heteroAtomLabelsVisible: true,
  palette: "cpk",
};

// ── Chemistry constants ─────────────────────────────────────────────────────

type Vec3 = [number, number, number];

type AtomDef = {
  id: string;
  element: ElementSymbol;
  position: Vec3;
  label?: ElementSymbol;
};

type BondDef = {
  id: string;
  from: string;
  to: string;
  order?: 1 | 2;
};

type BondSegment = {
  id: string;
  start: Vec3;
  end: Vec3;
  element: ElementSymbol;
  radius: number;
};

const UNIT = 0.36;
const BOND_RADIUS = 0.022;
const DOUBLE_BOND_RADIUS = 0.017;
const DOUBLE_BOND_OFFSET = 0.032;

const ATOM_RADII: Record<ModelStyle, Record<ElementSymbol, number>> = {
  "ball-and-stick": {
    C: 0.105,
    H: 0.066,
    N: 0.112,
    O: 0.116,
  },
  "space-filling": {
    C: 0.205,
    H: 0.145,
    N: 0.19,
    O: 0.185,
  },
};

const PALETTES: Record<PaletteId, Record<ElementSymbol, string>> = {
  cpk: {
    C: "#30343a",
    H: "#eef1f4",
    N: "#2d5bd1",
    O: "#e23c2b",
  },
  accessible: {
    C: "#4a4f58",
    H: "#f4f6f8",
    N: "#0072b2",
    O: "#d55e00",
  },
};

const LABEL_COLORS: Record<ElementSymbol, string> = {
  C: "#f3f6fb",
  H: "#17202b",
  N: "#f7fbff",
  O: "#f7fbff",
};

const DEFAULT_GUIDE_ACCENT = "#f4b63f";

function p(x: number, y: number, z = 0): Vec3 {
  return [x * UNIT, y * UNIT, z * UNIT];
}

/**
 * A classroom-readable caffeine topology, not a crystallographic coordinate
 * file. The fused xanthine core is planar; methyl hydrogens fan outward so the
 * object presents as a richer 3D manipulative when rotated.
 */
const ATOMS: readonly AtomDef[] = [
  { id: "n1", element: "N", position: p(-0.62, 0.18), label: "N" },
  { id: "c2", element: "C", position: p(-0.3, 0.64) },
  { id: "n3", element: "N", position: p(0.28, 0.58), label: "N" },
  { id: "c4", element: "C", position: p(0.58, 0.1) },
  { id: "c5", element: "C", position: p(0.27, -0.4) },
  { id: "c6", element: "C", position: p(-0.34, -0.34) },
  { id: "n7", element: "N", position: p(1.1, 0.1), label: "N" },
  { id: "c8", element: "C", position: p(1.25, -0.45) },
  { id: "n9", element: "N", position: p(0.74, -0.78), label: "N" },
  { id: "o2", element: "O", position: p(-0.46, 1.14), label: "O" },
  { id: "o6", element: "O", position: p(-0.8, -0.82), label: "O" },
  { id: "m1", element: "C", position: p(-1.18, 0.2) },
  { id: "m1h1", element: "H", position: p(-1.58, 0.22) },
  { id: "m1h2", element: "H", position: p(-1.24, 0.58, 0.28) },
  { id: "m1h3", element: "H", position: p(-1.26, -0.16, -0.24) },
  { id: "m3", element: "C", position: p(0.48, 1.1) },
  { id: "m3h1", element: "H", position: p(0.88, 1.26) },
  { id: "m3h2", element: "H", position: p(0.18, 1.43, 0.26) },
  { id: "m3h3", element: "H", position: p(0.36, 0.76, -0.26) },
  { id: "m7", element: "C", position: p(1.65, 0.24) },
  { id: "m7h1", element: "H", position: p(2.05, 0.28) },
  { id: "m7h2", element: "H", position: p(1.64, 0.62, 0.24) },
  { id: "m7h3", element: "H", position: p(1.8, -0.11, -0.26) },
  { id: "c8h", element: "H", position: p(1.58, -0.72) },
];

const BONDS: readonly BondDef[] = [
  { id: "n1-c2", from: "n1", to: "c2" },
  { id: "c2-n3", from: "c2", to: "n3" },
  { id: "n3-c4", from: "n3", to: "c4", order: 2 },
  { id: "c4-c5", from: "c4", to: "c5" },
  { id: "c5-c6", from: "c5", to: "c6", order: 2 },
  { id: "c6-n1", from: "c6", to: "n1" },
  { id: "c4-n7", from: "c4", to: "n7" },
  { id: "n7-c8", from: "n7", to: "c8" },
  { id: "c8-n9", from: "c8", to: "n9", order: 2 },
  { id: "n9-c5", from: "n9", to: "c5" },
  { id: "c2-o2", from: "c2", to: "o2", order: 2 },
  { id: "c6-o6", from: "c6", to: "o6", order: 2 },
  { id: "n1-m1", from: "n1", to: "m1" },
  { id: "m1-h1", from: "m1", to: "m1h1" },
  { id: "m1-h2", from: "m1", to: "m1h2" },
  { id: "m1-h3", from: "m1", to: "m1h3" },
  { id: "n3-m3", from: "n3", to: "m3" },
  { id: "m3-h1", from: "m3", to: "m3h1" },
  { id: "m3-h2", from: "m3", to: "m3h2" },
  { id: "m3-h3", from: "m3", to: "m3h3" },
  { id: "n7-m7", from: "n7", to: "m7" },
  { id: "m7-h1", from: "m7", to: "m7h1" },
  { id: "m7-h2", from: "m7", to: "m7h2" },
  { id: "m7-h3", from: "m7", to: "m7h3" },
  { id: "c8-h", from: "c8", to: "c8h" },
];

const RING_GUIDE_BONDS: readonly [string, string][] = [
  ["n1", "c2"],
  ["c2", "n3"],
  ["n3", "c4"],
  ["c4", "c5"],
  ["c5", "c6"],
  ["c6", "n1"],
  ["c4", "n7"],
  ["n7", "c8"],
  ["c8", "n9"],
  ["n9", "c5"],
];

// ── Defensive parameter readers ─────────────────────────────────────────────

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function offsetPoint([x, y, z]: Vec3, [ox, oy, oz]: Vec3): Vec3 {
  return [x + ox, y + oy, z + oz];
}

function scalePoint([x, y, z]: Vec3, scale: number): Vec3 {
  return [x * scale, y * scale, z * scale];
}

function addPoint([ax, ay, az]: Vec3, [bx, by, bz]: Vec3): Vec3 {
  return [ax + bx, ay + by, az + bz];
}

function subtractPoint([ax, ay, az]: Vec3, [bx, by, bz]: Vec3): Vec3 {
  return [ax - bx, ay - by, az - bz];
}

function bondOffset(from: Vec3, to: Vec3, magnitude: number): Vec3 {
  const [dx, dy] = subtractPoint(to, from);
  const length = Math.hypot(dx, dy) || 1;
  return [(-dy / length) * magnitude, (dx / length) * magnitude, 0];
}

function buildBondSegments(atoms: readonly AtomDef[], bonds: readonly BondDef[]): BondSegment[] {
  const atomsById = new Map(atoms.map((atom) => [atom.id, atom]));
  const segments: BondSegment[] = [];

  for (const bond of bonds) {
    const from = atomsById.get(bond.from);
    const to = atomsById.get(bond.to);
    if (!from || !to) continue;

    const offsets = bond.order === 2 ? [-DOUBLE_BOND_OFFSET, DOUBLE_BOND_OFFSET] : [0];
    for (const offsetValue of offsets) {
      const offset = offsetValue === 0 ? ([0, 0, 0] as Vec3) : bondOffset(from.position, to.position, offsetValue);
      const start = offsetPoint(from.position, offset);
      const end = offsetPoint(to.position, offset);
      const midpoint = scalePoint(addPoint(start, end), 0.5);
      const radius = bond.order === 2 ? DOUBLE_BOND_RADIUS : BOND_RADIUS;

      segments.push({
        id: `${bond.id}-${offsetValue}-from`,
        start,
        end: midpoint,
        element: from.element,
        radius,
      });
      segments.push({
        id: `${bond.id}-${offsetValue}-to`,
        start: midpoint,
        end,
        element: to.element,
        radius,
      });
    }
  }

  return segments;
}

function useCylinderTransform(start: Vec3, end: Vec3) {
  return useMemo(() => {
    const a = new Vector3(...start);
    const b = new Vector3(...end);
    const midpoint = a.clone().add(b).multiplyScalar(0.5);
    const direction = b.clone().sub(a);
    const length = direction.length();
    const quaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize());
    return { midpoint, quaternion, length };
  }, [start, end]);
}

// ── Sub-components ──────────────────────────────────────────────────────────

const ATOM_SYMBOL_SCALE = 0.42;

function HydrogenSurfaceLabel({ radius }: { radius: number }) {
  const height = radius * 1.35 * ATOM_SYMBOL_SCALE;
  const width = radius * 0.9 * ATOM_SYMBOL_SCALE;
  const stroke = radius * 0.2 * ATOM_SYMBOL_SCALE;
  const depth = radius * 0.08 * ATOM_SYMBOL_SCALE;
  const z = radius * 1.04;

  return (
    <group position={[0, 0, z]}>
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[stroke, height, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.H} />
      </mesh>
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[stroke, height, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.H} />
      </mesh>
      <mesh>
        <boxGeometry args={[width + stroke, stroke, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.H} />
      </mesh>
    </group>
  );
}

function OxygenSurfaceLabel({ radius }: { radius: number }) {
  return (
    <mesh position={[0, 0, radius * 1.04]}>
      <torusGeometry args={[radius * 0.42 * ATOM_SYMBOL_SCALE, radius * 0.075 * ATOM_SYMBOL_SCALE, 12, 32]} />
      <meshBasicMaterial color={LABEL_COLORS.O} />
    </mesh>
  );
}

function NitrogenSurfaceLabel({ radius }: { radius: number }) {
  const height = radius * 1.34 * ATOM_SYMBOL_SCALE;
  const width = radius * 0.95 * ATOM_SYMBOL_SCALE;
  const stroke = radius * 0.18 * ATOM_SYMBOL_SCALE;
  const depth = radius * 0.08 * ATOM_SYMBOL_SCALE;
  const diagonalLength = Math.hypot(width, height);
  const diagonalRotation = Math.atan2(-width, height);
  const z = radius * 1.04;

  return (
    <group position={[0, 0, z]}>
      <mesh position={[-width / 2, 0, 0]}>
        <boxGeometry args={[stroke, height, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.N} />
      </mesh>
      <mesh position={[width / 2, 0, 0]}>
        <boxGeometry args={[stroke, height, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.N} />
      </mesh>
      <mesh rotation={[0, 0, diagonalRotation]}>
        <boxGeometry args={[stroke, diagonalLength, depth]} />
        <meshBasicMaterial color={LABEL_COLORS.N} />
      </mesh>
    </group>
  );
}

function AtomSurfaceLabel({ symbol, radius }: { symbol: ElementSymbol; radius: number }) {
  if (symbol === "O") return <OxygenSurfaceLabel radius={radius} />;
  if (symbol === "N") return <NitrogenSurfaceLabel radius={radius} />;
  if (symbol === "H") return <HydrogenSurfaceLabel radius={radius} />;
  return null;
}

function Atom({
  atom,
  radius,
  color,
  labelsVisible,
}: {
  atom: AtomDef;
  radius: number;
  color: string;
  labelsVisible: boolean;
}) {
  const label = labelsVisible ? atom.label : undefined;

  return (
    <group position={atom.position}>
      <mesh scale={radius}>
        <sphereGeometry args={[1, 32, 24]} />
        <meshStandardMaterial color={color} roughness={0.28} metalness={0} />
      </mesh>
      {label ? <AtomSurfaceLabel symbol={label} radius={radius} /> : null}
    </group>
  );
}

function BondCylinder({ segment, color }: { segment: BondSegment; color: string }) {
  const { midpoint, quaternion, length } = useCylinderTransform(segment.start, segment.end);

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[segment.radius, segment.radius, length, 18]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0} />
    </mesh>
  );
}

function GuideCylinder({ start, end, color }: { start: Vec3; end: Vec3; color: string }) {
  const { midpoint, quaternion, length } = useCylinderTransform(start, end);

  return (
    <mesh position={midpoint} quaternion={quaternion}>
      <cylinderGeometry args={[0.0075, 0.0075, length, 10]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

function RingGuide({ accent }: { accent: string }) {
  const atomsById = useMemo(() => new Map(ATOMS.map((atom) => [atom.id, atom])), []);
  const zLift = 0.018;

  return (
    <group>
      {RING_GUIDE_BONDS.map(([fromId, toId]) => {
        const from = atomsById.get(fromId);
        const to = atomsById.get(toId);
        if (!from || !to) return null;
        const start: Vec3 = [from.position[0], from.position[1], from.position[2] + zLift];
        const end: Vec3 = [to.position[0], to.position[1], to.position[2] + zLift];
        return <GuideCylinder key={`${fromId}-${toId}`} start={start} end={end} color={accent} />;
      })}
    </group>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

/**
 * A procedural caffeine molecule for the RoomObject catalog.
 *
 * `colorTintHex` is reserved for the educational ring guide. Atom colours stay
 * chemically meaningful through the CPK/accessibility palette parameter.
 */
export function CaffeineMolecule({ parameters, scale, colorTintHex }: ProceduralProps) {
  const modelStyle = readEnum(parameters.modelStyle, ["ball-and-stick", "space-filling"] as const, "ball-and-stick");
  const palette = readEnum(parameters.palette, ["cpk", "accessible"] as const, "cpk");
  const ringGuideVisible = readBoolean(parameters.ringGuideVisible, true);
  const heteroAtomLabelsVisible = readBoolean(parameters.heteroAtomLabelsVisible, true);

  const colors = PALETTES[palette];
  const radii = ATOM_RADII[modelStyle];
  const accent = colorTintHex ?? DEFAULT_GUIDE_ACCENT;
  const segments = useMemo(() => buildBondSegments(ATOMS, BONDS), []);

  return (
    <group scale={scale} rotation={[0.15, 0, -0.08]}>
      {ringGuideVisible ? <RingGuide accent={accent} /> : null}

      {modelStyle === "ball-and-stick"
        ? segments.map((segment) => <BondCylinder key={segment.id} segment={segment} color={colors[segment.element]} />)
        : null}

      {ATOMS.map((atom) => (
        <Atom
          key={atom.id}
          atom={atom}
          radius={radii[atom.element]}
          color={colors[atom.element]}
          labelsVisible={heteroAtomLabelsVisible}
        />
      ))}
    </group>
  );
}
