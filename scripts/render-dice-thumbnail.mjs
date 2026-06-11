// Render the "Pair of dice" catalog thumbnail: two dice posed like the in-room
// dice-pair procedural (lane offsets, face-up orientations, natural yaw).
//
// Run: node scripts/render-dice-thumbnail.mjs
// Output: apps/web/public/room-objects/thumbnails/dice-pair.png

import { createServer } from "node:http";
import { readFile, writeFile, rm } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const IN_PATH = resolve(__dirname, "../apps/web/public/room-objects/assets/dice.glb");
const OUT_PATH = resolve(__dirname, "../apps/web/public/room-objects/thumbnails/dice-pair.png");

const WIDTH = 800;
const HEIGHT = 600;

function htmlFor(glbUrl) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="importmap">
      {
        "imports": {
          "three": "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
          "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/"
        }
      }
    </script>
    <style>
      html, body { margin: 0; background: #f2f2f0; }
      canvas { display: block; width: ${WIDTH}px; height: ${HEIGHT}px; }
    </style>
  </head>
  <body>
    <canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
    <script type="module">
      import * as THREE from "three";
      import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

      const canvas = document.getElementById("c");
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setSize(${WIDTH}, ${HEIGHT}, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf2f2f0);

      const camera = new THREE.PerspectiveCamera(32, ${WIDTH / HEIGHT}, 0.01, 100);

      scene.add(new THREE.AmbientLight(0xffffff, 1.1));
      const key = new THREE.DirectionalLight(0xffffff, 1.5);
      key.position.set(4, 7, 5);
      key.castShadow = true;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.6);
      fill.position.set(-5, 3, -3);
      scene.add(fill);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.ShadowMaterial({ opacity: 0.18 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const DIE_SIZE = 0.36;
      const HALF = DIE_SIZE / 2;

      const loader = new GLTFLoader();
      loader.load(
        ${JSON.stringify(glbUrl)},
        (gltf) => {
          const die = gltf.scene.getObjectByName("Cube") ?? gltf.scene;
          die.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });

          // Same pip mapping as lib/diceRoll.ts: -X=6 up via rotZ(-90°), -Z=5 up via rotX(+90°).
          const dice = [
            { x: -0.28, z: 0.03, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2), yaw: 0.5 },
            { x: 0.28, z: -0.05, quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), yaw: -0.35 }
          ];
          for (const pose of dice) {
            const clone = die.clone(true);
            clone.scale.setScalar(HALF);
            clone.position.set(pose.x, HALF, pose.z);
            const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw);
            clone.quaternion.copy(yawQ.multiply(pose.quat));
            scene.add(clone);
          }

          const dist = 1.7;
          camera.position.set(dist * 0.55, dist * 0.5, dist * 0.95);
          camera.lookAt(0, HALF * 0.8, 0);

          renderer.render(scene, camera);
          window.__renderDone = true;
        },
        undefined,
        (error) => {
          window.__renderError = String(error);
        }
      );
    </script>
  </body>
</html>`;
}

async function startStaticServer(rootDir) {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const filePath = resolve(rootDir, `.${urlPath}`);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const data = await readFile(filePath);
      const ext = extname(filePath).toLowerCase();
      const type =
        ext === ".glb"
          ? "model/gltf-binary"
          : ext === ".html"
            ? "text/html; charset=utf-8"
            : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type, "Access-Control-Allow-Origin": "*" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });

  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = server.address();
  return {
    port,
    close: () => new Promise((resolvePromise, reject) => server.close((err) => (err ? reject(err) : resolvePromise())))
  };
}

async function main() {
  const rootDir = dirname(IN_PATH);
  const server = await startStaticServer(rootDir);
  const htmlPath = resolve(rootDir, "__render-dice-thumb.html");
  await writeFile(htmlPath, htmlFor(`http://127.0.0.1:${server.port}/${basename(IN_PATH)}`));

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.goto(`http://127.0.0.1:${server.port}/__render-dice-thumb.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__renderDone || window.__renderError, null, { timeout: 60_000 });
    const error = await page.evaluate(() => window.__renderError);
    if (error) throw new Error(error);

    await writeFile(OUT_PATH, await page.locator("canvas").screenshot({ type: "png" }));
    console.log(`Wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
    await server.close();
    await rm(htmlPath, { force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
