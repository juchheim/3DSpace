// Procedural geometry + material kit for the AI World Host's RetroRobotHostAvatar.
//
// Deliberately avoids the BlockyAvatar approach of bare boxes/cylinders. Every
// primary mass is a genuinely *modeled* form:
//   · torso / head / visor / tread housing → ExtrudeGeometry of rounded profiles
//     with bevelled edges (soft injection-moulded plastic read)
//   · dome / eyes / shoulders / wheels / antenna tip / rivets → LatheGeometry
//     revolved profiles (smooth turned-metal read)
//   · arm segments / antenna stalk / claw fingers → TubeGeometry along curves
//
// A single kit is built per avatar instance (one host per room, plus an optional
// placement ghost) and disposed on unmount. Target ≈ 1.75 m tall, < 4k triangles.

import {
  CatmullRomCurve3,
  CanvasTexture,
  Color,
  DoubleSide,
  ExtrudeGeometry,
  LatheGeometry,
  type BufferGeometry,
  type Material,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3
} from "three";

// ─── Art-direction palette (PLAN §3.2) ──────────────────────────────────────

export const RETRO_ROBOT_PALETTE = {
  body: "#3ECFCC", // teal
  accent: "#FF6B4A", // coral
  secondary: "#FFD166", // warm yellow
  dark: "#2D3142", // screen bezel, treads
  tire: "#1b1e29",
  eyeIdle: "#7DF9FF", // cyan emissive
  eyeThinking: "#FF4FD8", // magenta emissive
  eyeSpeakA: "#7DF9FF",
  eyeSpeakB: "#FFD166",
  antennaTip: "#FFD166",
  ghost: "#7DF9FF"
} as const;

export type RobotAnimState = "idle" | "thinking" | "speaking";

// ─── Small geometry helpers ─────────────────────────────────────────────────

function v2(x: number, y: number): Vector2 {
  return new Vector2(x, y);
}

/** Centred rounded-rectangle outline used as the cross-section for shell parts. */
function roundedRectShape(width: number, height: number, radius: number): Shape {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const s = new Shape();
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  return s;
}

/**
 * Soft-edged block: a rounded rectangle extruded along +Z with a bevel on both
 * caps, then centred on the origin. Front face ends up at +Z so decals/screens
 * can be parented to the local +Z side.
 */
function shellGeometry(
  width: number,
  height: number,
  depth: number,
  corner: number,
  bevel = Math.min(0.035, depth * 0.22)
): BufferGeometry {
  const shape = roundedRectShape(width, height, corner);
  const geo = new ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 14,
    steps: 1
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/** Lathe a (radius, height) profile around the Y axis. */
function latheGeometry(profile: Vector2[], segments = 40): BufferGeometry {
  const geo = new LatheGeometry(profile, segments);
  geo.computeVertexNormals();
  return geo;
}

/** Sweep a circular tube of constant radius through a list of points. */
function tubeGeometry(points: Vector3[], radius: number, tubular = 28, radial = 12): BufferGeometry {
  const curve = new CatmullRomCurve3(points, false, "catmullrom", 0.5);
  return new TubeGeometry(curve, tubular, radius, radial, false);
}

/** Flat planar shape (used for the CRT screen surface) with UVs remapped to 0..1. */
function planarPanel(width: number, height: number, corner: number): BufferGeometry {
  const geo = new ShapeGeometry(roundedRectShape(width, height, corner), 14);
  const pos = geo.getAttribute("position");
  const uv = geo.getAttribute("uv");
  const minX = -width / 2;
  const minY = -height / 2;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - minX) / width, (pos.getY(i) - minY) / height);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Horizontal belt/trim frame that hugs a rounded box cross-section. */
function beltGeometry(width: number, depth: number, band: number, thickness: number): BufferGeometry {
  const outer = roundedRectShape(width, depth, Math.min(width, depth) * 0.3);
  const innerW = width - band * 2;
  const innerD = depth - band * 2;
  const inner = roundedRectShape(innerW, innerD, Math.min(innerW, innerD) * 0.3);
  outer.holes.push(new Path((inner.getPoints(24) as Vector2[]).reverse()));
  const geo = new ExtrudeGeometry(outer, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 16,
    steps: 1
  });
  geo.rotateX(-Math.PI / 2); // lay the frame flat (thin in Y, wrapping X/Z)
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

// ─── CRT chest screen texture ───────────────────────────────────────────────

const SCREEN_W = 256;
const SCREEN_H = 192;

function makeScreenCanvas(): HTMLCanvasElement {
  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : ({ width: SCREEN_W, height: SCREEN_H, getContext: () => null } as unknown as HTMLCanvasElement);
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  return canvas;
}

/**
 * Paint the chest CRT for the current animation state and time. Cheap 2D canvas
 * work — the caller throttles this to ~12 fps. `level` (0..1) drives the
 * equalizer height while speaking.
 */
export function drawRobotScreen(
  ctx: CanvasRenderingContext2D,
  state: RobotAnimState,
  t: number,
  level: number
): void {
  const w = SCREEN_W;
  const h = SCREEN_H;

  // Phosphor background with a soft radial glow.
  const glow = ctx.createRadialGradient(w / 2, h / 2, 8, w / 2, h / 2, w * 0.62);
  const tint =
    state === "thinking" ? "#2a1330" : state === "speaking" ? "#0c2230" : "#07232b";
  glow.addColorStop(0, tint);
  glow.addColorStop(1, "#04080c");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  const accent =
    state === "thinking" ? "#FF4FD8" : state === "speaking" ? "#FFD166" : "#7DF9FF";

  if (state === "speaking") {
    // Bouncing equalizer bars.
    const bars = 9;
    const gap = 6;
    const bw = (w - gap * (bars + 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const phase = t * 9 + i * 0.7;
      const amp = (0.45 + 0.55 * Math.abs(Math.sin(phase))) * (0.4 + level * 0.6);
      const bh = Math.max(6, amp * (h * 0.62));
      const x = gap + i * (bw + gap);
      ctx.fillStyle = i % 2 === 0 ? "#7DF9FF" : "#FFD166";
      ctx.globalAlpha = 0.92;
      roundRect(ctx, x, h / 2 - bh / 2, bw, bh, 3);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (state === "thinking") {
    // Scrolling thought dashes + a pulsing "thinking" trio.
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const y = 26 + i * 34;
      const off = ((t * 60 + i * 40) % (w + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(off, y);
      ctx.lineTo(off + 46, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 3; i++) {
      const pulse = 0.4 + 0.6 * Math.max(0, Math.sin(t * 4 - i * 0.6));
      ctx.fillStyle = accent;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(w / 2 - 26 + i * 26, h / 2, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // Idle: a calm oscilloscope sine sweep + a friendly mouth curve.
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    for (let x = 6; x <= w - 6; x += 4) {
      const y = h / 2 + Math.sin(x * 0.05 + t * 2) * 18 * Math.cos(x * 0.008);
      if (x === 6) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Scanlines.
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 2);

  // Vignette frame.
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, w - 10, h - 10);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/** Radial contact-shadow texture for the ground decal under the robot. */
function makeShadowTexture(): CanvasTexture {
  const canvas = makeScreenCanvas();
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    g.addColorStop(0, "rgba(0,0,0,0.42)");
    g.addColorStop(0.7, "rgba(0,0,0,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

// ─── Kit ─────────────────────────────────────────────────────────────────────

export type RetroRobotKit = {
  geo: {
    torso: BufferGeometry;
    belt: BufferGeometry;
    screenBezel: BufferGeometry;
    screen: BufferGeometry;
    neck: BufferGeometry;
    head: BufferGeometry;
    dome: BufferGeometry;
    visor: BufferGeometry;
    brow: BufferGeometry;
    eyeBezel: BufferGeometry;
    eyeLens: BufferGeometry;
    eyeIris: BufferGeometry;
    eyePupil: BufferGeometry;
    eyeCatchlight: BufferGeometry;
    earCap: BufferGeometry;
    antennaStalk: BufferGeometry;
    antennaBall: BufferGeometry;
    shoulder: BufferGeometry;
    upperArm: BufferGeometry;
    armRib: BufferGeometry;
    elbow: BufferGeometry;
    forearm: BufferGeometry;
    wrist: BufferGeometry;
    clawPalm: BufferGeometry;
    finger: BufferGeometry;
    treadHousing: BufferGeometry;
    wheel: BufferGeometry;
    hubcap: BufferGeometry;
    caster: BufferGeometry;
    rivet: BufferGeometry;
    grille: BufferGeometry;
    shadow: BufferGeometry;
  };
  mat: {
    body: MeshPhysicalMaterial;
    accent: MeshPhysicalMaterial;
    secondary: MeshPhysicalMaterial;
    dark: MeshStandardMaterial;
    tire: MeshStandardMaterial;
    glass: MeshStandardMaterial;
    eye: MeshStandardMaterial;
    eyePupil: MeshStandardMaterial;
    catchlight: MeshBasicMaterial;
    screen: MeshStandardMaterial;
    antennaTip: MeshStandardMaterial;
    shadow: MeshBasicMaterial;
  };
  screen: {
    texture: CanvasTexture;
    ctx: CanvasRenderingContext2D | null;
  };
  dispose(): void;
};

export function buildRetroRobotKit(): RetroRobotKit {
  // — Screen canvas + texture —
  const screenCanvas = makeScreenCanvas();
  const screenCtx = screenCanvas.getContext("2d");
  if (screenCtx) drawRobotScreen(screenCtx, "idle", 0, 0);
  const screenTexture = new CanvasTexture(screenCanvas);
  screenTexture.colorSpace = SRGBColorSpace;

  // — Materials —
  const body = new MeshPhysicalMaterial({
    color: RETRO_ROBOT_PALETTE.body,
    metalness: 0.45,
    roughness: 0.34,
    clearcoat: 0.7,
    clearcoatRoughness: 0.32,
    sheen: 0.25,
    sheenColor: new Color("#bdfff2")
  });
  const accent = new MeshPhysicalMaterial({
    color: RETRO_ROBOT_PALETTE.accent,
    metalness: 0.3,
    roughness: 0.4,
    clearcoat: 0.5,
    clearcoatRoughness: 0.35
  });
  const secondary = new MeshPhysicalMaterial({
    color: RETRO_ROBOT_PALETTE.secondary,
    metalness: 0.3,
    roughness: 0.4,
    clearcoat: 0.45
  });
  const dark = new MeshStandardMaterial({
    color: RETRO_ROBOT_PALETTE.dark,
    metalness: 0.55,
    roughness: 0.5
  });
  const tire = new MeshStandardMaterial({
    color: RETRO_ROBOT_PALETTE.tire,
    metalness: 0.2,
    roughness: 0.85
  });
  const glass = new MeshStandardMaterial({
    color: "#0a1016",
    metalness: 0.1,
    roughness: 0.18
  });
  // Iris — the glowing eye. Base colour is the glow colour too (so it reads
  // bright from both the lit + emissive terms), double-sided and un-tonemapped
  // so it never washes out to black against the dark visor.
  const eye = new MeshStandardMaterial({
    color: RETRO_ROBOT_PALETTE.eyeIdle,
    emissive: new Color(RETRO_ROBOT_PALETTE.eyeIdle),
    emissiveIntensity: 2.8,
    metalness: 0,
    roughness: 0.2,
    side: DoubleSide,
    toneMapped: false
  });
  // Pupil — a dark focal disc that gives the eye a "looking at you" read.
  const eyePupil = new MeshStandardMaterial({
    color: "#02060b",
    emissive: new Color("#06283f"),
    emissiveIntensity: 0.5,
    metalness: 0.3,
    roughness: 0.25
  });
  // Catchlight — a tiny always-bright sparkle that makes the eye feel alive.
  const catchlight = new MeshBasicMaterial({ color: "#ffffff", toneMapped: false });
  const screen = new MeshStandardMaterial({
    color: "#05080c",
    emissive: new Color("#ffffff"),
    emissiveMap: screenTexture,
    emissiveIntensity: 1.15,
    metalness: 0.1,
    roughness: 0.28
  });
  const antennaTip = new MeshStandardMaterial({
    color: "#3a2f12",
    emissive: new Color(RETRO_ROBOT_PALETTE.antennaTip),
    emissiveIntensity: 2.2,
    roughness: 0.3
  });
  const shadow = new MeshBasicMaterial({
    map: makeShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.85
  });

  // — Geometry —
  // Torso: barrel-ish soft block, slightly deeper than the human avatar.
  const torso = shellGeometry(0.9, 0.74, 0.62, 0.2);
  const belt = beltGeometry(0.96, 0.66, 0.06, 0.05);
  const screenBezel = shellGeometry(0.52, 0.4, 0.07, 0.08);
  const screenGeo = planarPanel(0.42, 0.3, 0.05);

  // Head + dome.
  const head = shellGeometry(0.52, 0.42, 0.46, 0.14);
  const dome = latheGeometry([
    v2(0.001, 0.14),
    v2(0.07, 0.135),
    v2(0.14, 0.11),
    v2(0.2, 0.06),
    v2(0.23, 0.0)
  ]);
  // Wrap-around dark visor band that holds the eyes.
  const visor = shellGeometry(0.5, 0.18, 0.12, 0.08);
  const brow = chevronGeometry(0.34, 0.045, 0.05, 0.05);
  // Expressive eyes — layered, all turned to face +Z so they stack toward the
  // viewer and sit clearly proud of the dark visor:
  //   coral bezel ring → dark lens glass → bright glowing iris → dark pupil → catchlight
  const eyeBezel = new TorusGeometry(0.092, 0.018, 14, 30);
  const eyeLens = latheGeometry([
    v2(0.0, 0.024),
    v2(0.04, 0.021),
    v2(0.066, 0.012),
    v2(0.078, 0.0)
  ]);
  eyeLens.rotateX(Math.PI / 2);
  const eyeIris = latheGeometry([
    v2(0.0, 0.018),
    v2(0.032, 0.016),
    v2(0.052, 0.009),
    v2(0.062, 0.0)
  ]);
  eyeIris.rotateX(Math.PI / 2);
  const eyePupilGeo = latheGeometry([
    v2(0.0, 0.013),
    v2(0.018, 0.011),
    v2(0.028, 0.0)
  ]);
  eyePupilGeo.rotateX(Math.PI / 2);
  const eyeCatchlight = latheGeometry(
    [v2(0.0, 0.009), v2(0.008, 0.006), v2(0.013, 0.0)],
    16
  );
  eyeCatchlight.rotateX(Math.PI / 2);
  const earCap = latheGeometry([
    v2(0.0, 0.05),
    v2(0.04, 0.05),
    v2(0.06, 0.03),
    v2(0.065, 0.0)
  ]);

  // Antenna: long curved stalk + glowing teardrop tip.
  const antennaStalk = tubeGeometry(
    [
      new Vector3(0, 0, 0),
      new Vector3(0.02, 0.16, 0.01),
      new Vector3(0.055, 0.33, 0.025),
      new Vector3(0.085, 0.5, 0.045)
    ],
    0.013,
    28,
    10
  );
  const antennaBall = latheGeometry([
    v2(0.0, 0.07),
    v2(0.03, 0.055),
    v2(0.05, 0.02),
    v2(0.045, -0.02),
    v2(0.025, -0.04),
    v2(0.0, -0.045)
  ]);

  // Shoulders + segmented arms.
  const shoulder = latheGeometry([
    v2(0.0, 0.14),
    v2(0.06, 0.135),
    v2(0.12, 0.1),
    v2(0.145, 0.04),
    v2(0.15, 0.0)
  ]);
  const upperArm = tubeGeometry(
    [new Vector3(0, 0, 0), new Vector3(0, -0.14, 0.01), new Vector3(0, -0.27, 0.02)],
    0.052,
    18,
    14
  );
  const armRib = new TorusGeometry(0.056, 0.014, 8, 18);
  const elbow = latheGeometry([
    v2(0.0, 0.062),
    v2(0.035, 0.055),
    v2(0.06, 0.025),
    v2(0.062, 0.0),
    v2(0.06, -0.025),
    v2(0.035, -0.055),
    v2(0.0, -0.062)
  ]);
  const forearm = tubeGeometry(
    [new Vector3(0, 0, 0), new Vector3(0, -0.12, 0.02), new Vector3(0, -0.24, 0.06)],
    0.046,
    18,
    14
  );
  const wrist = latheGeometry([
    v2(0.0, 0.05),
    v2(0.045, 0.045),
    v2(0.05, 0.0),
    v2(0.045, -0.045),
    v2(0.0, -0.05)
  ]);
  const clawPalm = latheGeometry([
    v2(0.0, 0.04),
    v2(0.05, 0.04),
    v2(0.06, 0.0),
    v2(0.05, -0.03),
    v2(0.0, -0.035)
  ]);
  const finger = tubeGeometry(
    [new Vector3(0, 0, 0), new Vector3(0.02, -0.05, 0.03), new Vector3(0.015, -0.1, 0.07)],
    0.018,
    14,
    8
  );

  // Tread / rover base.
  const treadHousing = trapezoidShell(0.7, 0.86, 0.5, 0.66, 0.14);
  const wheel = latheGeometry(
    [
      v2(0.07, 0.13),
      v2(0.2, 0.13),
      v2(0.26, 0.1),
      v2(0.275, 0.0),
      v2(0.26, -0.1),
      v2(0.2, -0.13),
      v2(0.07, -0.13)
    ],
    32
  );
  const hubcap = latheGeometry([
    v2(0.0, 0.07),
    v2(0.05, 0.06),
    v2(0.09, 0.03),
    v2(0.1, 0.0)
  ]);
  const caster = latheGeometry([
    v2(0.0, 0.07),
    v2(0.04, 0.06),
    v2(0.07, 0.03),
    v2(0.072, 0.0),
    v2(0.07, -0.03),
    v2(0.04, -0.06),
    v2(0.0, -0.07)
  ]);
  const rivet = latheGeometry(
    [v2(0.0, 0.016), v2(0.012, 0.014), v2(0.018, 0.006), v2(0.019, 0.0)],
    12
  );
  const grille = shellGeometry(0.36, 0.12, 0.04, 0.03);

  // Flat ground contact-shadow disc.
  const shadowGeo = planarPanel(0.95, 0.95, 0.45);
  shadowGeo.rotateX(-Math.PI / 2);

  const kit: RetroRobotKit = {
    geo: {
      torso,
      belt,
      screenBezel,
      screen: screenGeo,
      neck: latheGeometry([
        v2(0.0, 0.07),
        v2(0.14, 0.07),
        v2(0.16, 0.04),
        v2(0.13, -0.02),
        v2(0.15, -0.06),
        v2(0.0, -0.07)
      ]),
      head,
      dome,
      visor,
      brow,
      eyeBezel,
      eyeLens,
      eyeIris,
      eyePupil: eyePupilGeo,
      eyeCatchlight,
      earCap,
      antennaStalk,
      antennaBall,
      shoulder,
      upperArm,
      armRib,
      elbow,
      forearm,
      wrist,
      clawPalm,
      finger,
      treadHousing,
      wheel,
      hubcap,
      caster,
      rivet,
      grille,
      shadow: shadowGeo
    },
    mat: { body, accent, secondary, dark, tire, glass, eye, eyePupil, catchlight, screen, antennaTip, shadow },
    screen: { texture: screenTexture, ctx: screenCtx },
    dispose() {
      const geos = Object.values(this.geo) as BufferGeometry[];
      for (const g of geos) g.dispose();
      const mats = Object.values(this.mat) as Material[];
      for (const m of mats) {
        const anyMat = m as MeshStandardMaterial;
        anyMat.map?.dispose();
        anyMat.emissiveMap?.dispose();
        m.dispose();
      }
      screenTexture.dispose();
    }
  };
  return kit;
}

// ─── Specialised shapes ──────────────────────────────────────────────────────

/** Trapezoid (wider base) rounded shell for the rover housing. */
function trapezoidShell(
  topWidth: number,
  bottomWidth: number,
  height: number,
  depth: number,
  corner: number
): BufferGeometry {
  const tw = topWidth / 2;
  const bw = bottomWidth / 2;
  const h = height / 2;
  const r = corner;
  const s = new Shape();
  s.moveTo(-bw + r, -h);
  s.lineTo(bw - r, -h);
  s.quadraticCurveTo(bw, -h, bw - r * 0.4, -h + r);
  s.lineTo(tw, h - r);
  s.quadraticCurveTo(tw, h, tw - r, h);
  s.lineTo(-tw + r, h);
  s.quadraticCurveTo(-tw, h, -tw, h - r);
  s.lineTo(-bw + r * 0.4, -h + r);
  s.quadraticCurveTo(-bw, -h, -bw + r, -h);
  const bevel = 0.04;
  const geo = new ExtrudeGeometry(s, {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 12,
    steps: 1
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/** Soft downward chevron brow (friendly, not a hard "V"). */
function chevronGeometry(
  width: number,
  thickness: number,
  drop: number,
  depth: number
): BufferGeometry {
  const hw = width / 2;
  const s = new Shape();
  s.moveTo(-hw, drop);
  s.quadraticCurveTo(0, -drop * 0.5, hw, drop);
  s.lineTo(hw, drop + thickness);
  s.quadraticCurveTo(0, -drop * 0.5 + thickness, -hw, drop + thickness);
  s.closePath();
  const geo = new ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 2,
    curveSegments: 10,
    steps: 1
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

// Re-exported so the avatar component can reuse for the ghost outline.
export { DoubleSide };
