"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { VerseGalaxy } from "../lib/verses";

// ── Dream IXR verse galaxy orb ────────────────────────────────────────────────
// A small spinning galaxy rendered per verse card, tinted to the verse hue.
// Ported from the three.js sketch in dream-IXR-verses/Lobby Redesign.html. The
// CSS radial-gradient halo on `.verse-orb` remains the fallback if WebGL fails.

const ORB = 92;

// Soft round point sprite shared by every galaxy instance on the page.
let sharedSprite: THREE.Texture | null = null;
function getSprite(): THREE.Texture {
  if (sharedSprite) return sharedSprite;
  const s = 64;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.7)");
  g.addColorStop(0.65, "rgba(255,255,255,0.18)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  const t = new THREE.Texture(c);
  t.needsUpdate = true;
  sharedSprite = t;
  return t;
}

// OKLCH -> sRGB done in JS (getComputedStyle does not resolve oklch() here).
function oklch(L: number, C: number, H: number): THREE.Color {
  const hr = (H * Math.PI) / 180;
  const a = C * Math.cos(hr);
  const b = C * Math.sin(hr);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const enc = (v: number) => {
    v = Math.max(0, Math.min(1, v));
    return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  };
  return new THREE.Color(enc(r), enc(g), enc(bb));
}

type GalaxyHandle = {
  update: (dt: number) => void;
  dispose: () => void;
};

function createGalaxy(canvas: HTMLCanvasElement, cfg: VerseGalaxy & { h: number }): GalaxyHandle {
  const sprite = getSprite();
  let t = 0;

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(ORB, ORB, false);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0, 0, 2.6);
  camera.lookAt(0, 0, 0);

  const tilt = new THREE.Group();
  tilt.rotation.x = cfg.tilt;
  scene.add(tilt);
  const disk = new THREE.Group();
  disk.rotation.y = Math.random() * Math.PI * 2;
  tilt.add(disk);

  const R = 1.18;
  const N = cfg.count;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const core = oklch(0.88, 0.155, cfg.h);
  const mid = oklch(0.7, 0.235, cfg.h);
  const edge = oklch(0.55, 0.215, cfg.h);
  const coreCol = oklch(0.82, 0.18, cfg.h);

  for (let i = 0; i < N; i++) {
    const rr = Math.pow(Math.random(), 1.25) * R; // concentrate toward core
    const branch = ((i % cfg.arms) / cfg.arms) * Math.PI * 2;
    const twist = rr * cfg.spin;
    const sc = cfg.scatter * (0.14 + rr / R); // arms fan out
    const aS = (Math.random() - 0.5) * sc;
    const rS = (Math.random() - 0.5) * sc * 0.6 * R;
    const ang = branch + twist + aS;
    const r2 = Math.max(0, rr + rS);
    pos[i * 3] = Math.cos(ang) * r2;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 0.16 * (1 - (0.5 * rr) / R); // thin disk, bulge center
    pos[i * 3 + 2] = Math.sin(ang) * r2;

    const tt = rr / R;
    const c = core.clone().lerp(mid, Math.min(1, tt / 0.4));
    if (tt > 0.45) c.lerp(edge, Math.min(1, (tt - 0.45) / 0.55) * 0.7);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: cfg.psize,
    sizeAttenuation: true,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.62
  });
  const points = new THREE.Points(geo, mat);
  disk.add(points);

  // Luminous core + soft halo, tinted to the verse hue.
  const coreMat = new THREE.SpriteMaterial({
    map: sprite,
    color: coreCol,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.85
  });
  const coreS = new THREE.Sprite(coreMat);
  coreS.scale.set(0.4, 0.4, 1);
  tilt.add(coreS);
  const haloMat = new THREE.SpriteMaterial({
    map: sprite,
    color: mid,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    opacity: 0.18
  });
  const haloS = new THREE.Sprite(haloMat);
  haloS.scale.set(2.2, 2.2, 1);
  tilt.add(haloS);

  function update(dt: number) {
    t += dt;
    disk.rotation.y += dt * cfg.speed * cfg.dir; // disk spin
    tilt.rotation.x = cfg.tilt + Math.sin(t * 0.4) * 0.07; // gentle nod
    tilt.rotation.z += dt * 0.04 * cfg.dir; // slow precession
    renderer.render(scene, camera);
  }

  function dispose() {
    geo.dispose();
    mat.dispose();
    coreMat.dispose();
    haloMat.dispose();
    renderer.dispose();
  }

  update(0);
  return { update, dispose };
}

export function VerseOrb({ galaxy, hue }: { galaxy: VerseGalaxy; hue: number }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !window.WebGLRenderingContext) return;

    let handle: GalaxyHandle;
    try {
      handle = createGalaxy(canvas, { ...galaxy, h: hue });
    } catch {
      return; // leave the CSS halo fallback
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      return () => handle.dispose();
    }

    let visible = true;
    let onscreen = true;
    let raf = 0;
    let last = performance.now();

    let io: IntersectionObserver | null = null;
    try {
      io = new IntersectionObserver(
        (entries) => {
          for (const e of entries) onscreen = e.isIntersecting;
        },
        { threshold: 0.01 }
      );
      io.observe(canvas);
    } catch {
      /* keep always running */
    }

    function loop(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (visible && onscreen) handle.update(dt);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    function onVisibility() {
      visible = !document.hidden;
      last = performance.now();
    }
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      if (io) io.disconnect();
      handle.dispose();
    };
  }, [galaxy, hue]);

  return <canvas ref={canvasRef} aria-hidden="true" />;
}
