import { readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");
const geojsonDir = join(root, "apps/web/public/room-objects/geojson");
const textureDir = join(root, "apps/web/public/room-objects/textures");
const width = 4096;
const height = 2048;

function readGeoJson(fileName) {
  return JSON.parse(readFileSync(join(geojsonDir, fileName), "utf8"));
}

function project(point) {
  const [lon = 0, lat = 0] = point;
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
}

function ringPath(ring) {
  return ring
    .map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ") + " Z";
}

function polygonPaths(geojson) {
  const paths = [];
  for (const feature of geojson.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") {
      paths.push(geometry.coordinates.map(ringPath).join(" "));
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates) {
        paths.push(polygon.map(ringPath).join(" "));
      }
    }
  }
  return paths;
}

function linePath(line) {
  let previousX = null;
  return line
    .map((point, index) => {
      const [x, y] = project(point);
      const command = index === 0 || previousX === null || Math.abs(x - previousX) > width / 2 ? "M" : "L";
      previousX = x;
      return `${command}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function linePaths(geojson) {
  const paths = [];
  for (const feature of geojson.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") {
      paths.push(linePath(geometry.coordinates));
    } else if (geometry.type === "MultiLineString") {
      for (const line of geometry.coordinates) paths.push(linePath(line));
    }
  }
  return paths;
}

function svg(children, background = "transparent") {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="${background}"/>` +
      children.join("") +
      "</svg>"
  );
}

function pathLayer(paths, fill, extra = "") {
  return paths.map((path) => `<path d="${path}" fill="${fill}" fill-rule="evenodd" ${extra}/>`).join("");
}

function strokeLayer(paths, stroke, widthPx, extra = "") {
  return paths
    .map((path) => `<path d="${path}" fill="none" stroke="${stroke}" stroke-width="${widthPx}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`)
    .join("");
}

async function render() {
  await mkdir(textureDir, { recursive: true });

  const land = readGeoJson("ne_10m_land.geojson");
  const landPaths = polygonPaths(land);
  const lakes = readGeoJson("ne_10m_lakes.geojson");
  const rivers = readGeoJson("ne_10m_rivers_lake_centerlines.geojson");
  const glaciated = readGeoJson("ne_10m_glaciated_areas.geojson");
  const iceShelves = readGeoJson("ne_10m_antarctic_ice_shelves_polys.geojson");

  const baseSvg = svg([
    `<defs><linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2747"/><stop offset="0.5" stop-color="#0b4d78"/><stop offset="1" stop-color="#08203d"/></linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#ocean)"/>`,
    `<clipPath id="landClip">${landPaths.map((path) => `<path d="${path}" fill-rule="evenodd"/>`).join("")}</clipPath>`,
    pathLayer(landPaths, "#527d3f"),
    `<g clip-path="url(#landClip)">`,
    `<rect x="0" y="${height * 0.34}" width="${width}" height="${height * 0.24}" fill="#d7bb78" opacity="0.28"/>`,
    `<rect x="0" y="0" width="${width}" height="${height * 0.1}" fill="#f4f1e6" opacity="0.52"/>`,
    `<rect x="0" y="${height * 0.88}" width="${width}" height="${height * 0.12}" fill="#f4f1e6" opacity="0.52"/>`,
    `</g>`,
    pathLayer(polygonPaths(lakes), "#0d4f7b"),
    strokeLayer(linePaths(rivers), "rgba(108,185,214,0.78)", 1.1)
  ], "#0b2747");

  await sharp(baseSvg).webp({ quality: 84 }).toFile(join(textureDir, "earth-physical-base-4096.webp"));

  const bathymetryBands = [
    ["ne_10m_bathymetry_K_200.geojson", "#0b4169"],
    ["ne_10m_bathymetry_I_2000.geojson", "#092f58"],
    ["ne_10m_bathymetry_G_4000.geojson", "#071f42"],
    ["ne_10m_bathymetry_E_6000.geojson", "#041631"]
  ];
  const bathymetrySvg = svg(
    bathymetryBands.map(([fileName, color]) => pathLayer(polygonPaths(readGeoJson(fileName)), color, 'opacity="0.82"')),
    "transparent"
  );
  await sharp(bathymetrySvg).webp({ quality: 84, alphaQuality: 90 }).toFile(join(textureDir, "earth-bathymetry-4096.webp"));

  const iceSvg = svg([
    pathLayer(polygonPaths(glaciated), "#f4f7f8", 'opacity="0.95"'),
    pathLayer(polygonPaths(iceShelves), "#e9f4fb", 'opacity="0.95"')
  ]);
  await sharp(iceSvg).webp({ quality: 88, alphaQuality: 92 }).toFile(join(textureDir, "earth-ice-4096.webp"));
}

await render();
