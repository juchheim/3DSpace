// Render a product-style thumbnail for a GLB using Playwright + Three.js.
//
// Run: node scripts/render-glb-thumbnail.mjs [in.glb] [out.jpg]
// Default out: same basename as input, .jpg next to input

import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_IN = resolve(__dirname, "../GLBs/school-desk-chair3.glb");

const IN_PATH = resolve(process.argv[2] ?? DEFAULT_IN);
const OUT_PATH = resolve(
  process.argv[3] ??
    IN_PATH.replace(extname(IN_PATH), ".jpg")
);

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

      scene.add(new THREE.AmbientLight(0xffffff, 0.45));
      const key = new THREE.DirectionalLight(0xffffff, 1.15);
      key.position.set(4, 7, 5);
      key.castShadow = true;
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 0.4);
      fill.position.set(-5, 3, -3);
      scene.add(fill);

      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(20, 20),
        new THREE.ShadowMaterial({ opacity: 0.18 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);

      const loader = new GLTFLoader();
      loader.load(
        ${JSON.stringify(glbUrl)},
        (gltf) => {
          const model = gltf.scene;
          model.traverse((obj) => {
            if (obj.isMesh) {
              obj.castShadow = true;
              obj.receiveShadow = true;
            }
          });
          scene.add(model);

          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          model.position.x -= center.x;
          model.position.z -= center.z;
          model.position.y -= box.min.y;

          const maxDim = Math.max(size.x, size.y, size.z);
          const fovRad = (camera.fov * Math.PI) / 180;
          const dist = (maxDim / (2 * Math.tan(fovRad / 2))) * 1.2;
          camera.position.set(dist * 0.9, dist * 0.52, dist * 1.05);
          camera.lookAt(0, size.y * 0.38, 0);

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
  const glbName = basename(IN_PATH);
  const server = await startStaticServer(rootDir);

  const pageHtml = htmlFor(`http://127.0.0.1:${server.port}/${glbName}`);
  const htmlPath = resolve(rootDir, "__render-thumb.html");
  await writeFile(htmlPath, pageHtml);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
    await page.goto(`http://127.0.0.1:${server.port}/__render-thumb.html`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => window.__renderDone || window.__renderError, null, { timeout: 60_000 });
    const error = await page.evaluate(() => window.__renderError);
    if (error) throw new Error(error);

    const jpeg = await page.locator("canvas").screenshot({ type: "jpeg", quality: 90 });
    await writeFile(OUT_PATH, jpeg);
    console.log(`Wrote ${OUT_PATH}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
