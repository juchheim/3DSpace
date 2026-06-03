// Offline render of the Sprocket-Bot host GLB — proof/thumbnail helper that
// needs neither the dev server nor an env map. Serves the repo over a tiny
// static server, loads the GLB with three's GLTFLoader in headless Chromium,
// and screenshots it. Run: node scripts/render-sprocket-bot.mjs [out.png]
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.argv[2] || "/tmp/sprocket-bot.png";
const AZ = Number(process.argv[3] ?? 22); // camera azimuth in degrees (0 = dead front)
const DIST = Number(process.argv[4] ?? 3.6); // camera distance
const TY = Number(process.argv[5] ?? 1.0); // look-at height (for zooming on the head)
const TX = Number(process.argv[6] ?? 0); // look-at X offset (for zooming on a hand)

const MIME = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".html": "text/html",
  ".glb": "model/gltf-binary",
  ".json": "application/json"
};

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#0e151f;overflow:hidden}</style>
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
</head><body><script type="module">
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const W = 900, H = 1200;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#0e151f");
scene.add(new THREE.HemisphereLight("#cfe0ff", "#1a1712", 0.7));
const key = new THREE.DirectionalLight("#fff4e6", 2.6); key.position.set(4, 7, 5); scene.add(key);
const fill = new THREE.DirectionalLight("#9fc0ff", 0.9); fill.position.set(-5, 3, -2); scene.add(fill);
const rim = new THREE.DirectionalLight("#ffffff", 0.8); rim.position.set(0, 2, -6); scene.add(rim);

const q = new URLSearchParams(location.search);
const az = Number(q.get("az") || "22") * Math.PI / 180;
const dist = Number(q.get("dist") || "3.6");
const ty = Number(q.get("ty") || "1.0");
const tx = Number(q.get("tx") || "0");
const camera = new THREE.PerspectiveCamera(36, W / H, 0.1, 100);
camera.position.set(tx + Math.sin(az) * dist, ty + 0.3, Math.cos(az) * dist);
camera.lookAt(tx, ty, 0);

// Optional iris offset (ex,ey) to preview the runtime gaze extremes.
const ex = Number(q.get("ex") || "0"), ey = Number(q.get("ey") || "0");
const loader = new GLTFLoader();
loader.load("/apps/web/public/world-hosts/sprocket-bot.glb", (gltf) => {
  if (ex || ey) gltf.scene.traverse((o) => { if (o.name && o.name.startsWith("eyeIris")) { o.position.x += ex; o.position.y += ey; } });
  scene.add(gltf.scene);
  renderer.render(scene, camera);
  window.__done = true;
}, undefined, (err) => { window.__error = String(err); window.__done = true; });
</script></body></html>`;

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(req.url.split("?")[0]);
    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE);
      return;
    }
    const path = normalize(join(ROOT, pathname));
    if (!path.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const data = await readFile(path);
    res.writeHead(200, { "content-type": MIME[extname(path)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404); res.end();
  }
});

await new Promise((r) => server.listen(8099, r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 } });
page.on("console", (m) => console.log("PAGE:", m.text()));
const EX = process.argv[7] ?? "0", EY = process.argv[8] ?? "0";
await page.goto(`http://localhost:8099/?az=${AZ}&dist=${DIST}&ty=${TY}&tx=${TX}&ex=${EX}&ey=${EY}`, { waitUntil: "load" });
await page.waitForFunction(() => window.__done === true, { timeout: 30000 });
const error = await page.evaluate(() => window.__error || null);
if (error) console.log("LOAD ERROR:", error);
await page.waitForTimeout(500);
await page.screenshot({ path: OUT });
console.log("wrote", OUT);
await browser.close();
await new Promise((r) => server.close(r));
