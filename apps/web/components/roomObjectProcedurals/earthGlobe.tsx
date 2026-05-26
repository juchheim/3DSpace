"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import type { ProceduralProps } from "./types";
import { computeSolarSubpoint, solarVectorFromSubpoint } from "./earthSolar";

export const EARTH_GLOBE_PROCEDURAL_ID = "earth-globe";
export const EARTH_GLOBE_DISPLAY_NAME = "Rotating Earth globe";
export const EARTH_GLOBE_ATTRIBUTION =
  "Physical vectors: Natural Earth public domain; night lights: NASA Earth Observatory Black Marble";

const LAND_GEOJSON_URL = "/room-objects/geojson/ne_10m_land.geojson";
const LAKES_GEOJSON_URL = "/room-objects/geojson/ne_10m_lakes.geojson";
const RIVERS_GEOJSON_URL = "/room-objects/geojson/ne_10m_rivers_lake_centerlines.geojson";
const GLACIATED_AREAS_GEOJSON_URL = "/room-objects/geojson/ne_10m_glaciated_areas.geojson";
const ANTARCTIC_ICE_SHELVES_GEOJSON_URL = "/room-objects/geojson/ne_10m_antarctic_ice_shelves_polys.geojson";
const BATHYMETRY_GEOJSON_URLS = [
  { url: "/room-objects/geojson/ne_10m_bathymetry_K_200.geojson", color: "#0b4169" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_I_2000.geojson", color: "#092f58" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_G_4000.geojson", color: "#071f42" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_E_6000.geojson", color: "#041631" }
] as const;
const NIGHT_LIGHTS_URL = "/room-objects/textures/earth-black-marble-2016-3600.jpg";
const EARTH_OBLIQUITY_RAD = 23.439281 * Math.PI / 180;
const TEXTURE_WIDTH = 4096;
const TEXTURE_HEIGHT = 2048;

type SolarMode = "realtime" | "custom-date-time" | "march-equinox" | "june-solstice" | "december-solstice";

export const EARTH_GLOBE_PARAMETERS = [
  {
    key: "solarMode",
    label: "Solar date",
    type: "enum",
    default: "realtime",
    options: [
      { value: "realtime", label: "Live UTC date/time" },
      { value: "custom-date-time", label: "Custom day/time" },
      { value: "march-equinox", label: "March equinox" },
      { value: "june-solstice", label: "June solstice" },
      { value: "december-solstice", label: "December solstice" }
    ],
    help: "Uses date/time-aware solar position for the terminator; presets help compare seasonal daylight."
  },
  {
    key: "dayOfYear",
    label: "Day of year",
    type: "number",
    default: 172,
    min: 1,
    max: 366,
    step: 1,
    help: "Used when Solar date is Custom day/time. Day 172 is near the June solstice in most years."
  },
  {
    key: "utcHour",
    label: "UTC hour",
    type: "number",
    default: 12,
    min: 0,
    max: 23.75,
    step: 0.25,
    help: "Used when Solar date is Custom day/time. Fractional hours support 15-minute increments."
  },
  {
    key: "rotationPeriodSeconds",
    label: "Rotation period",
    type: "number",
    default: 90,
    min: 0,
    max: 240,
    step: 5,
    help: "Seconds per displayed Earth rotation. Set to 0 to pause visual spin while keeping live solar position."
  },
  {
    key: "nightLightsVisible",
    label: "Night lights",
    type: "boolean",
    default: true,
    help: "Blends NASA Black Marble night lights on the dark side."
  },
  {
    key: "bathymetryVisible",
    label: "Ocean depth bands",
    type: "boolean",
    default: true,
    help: "Draws Natural Earth bathymetry bands at representative ocean-depth contours."
  },
  {
    key: "iceVisible",
    label: "Glaciers and ice shelves",
    type: "boolean",
    default: true,
    help: "Adds Natural Earth glaciated areas and Antarctic ice shelves."
  },
  {
    key: "graticuleVisible",
    label: "Latitude/longitude grid",
    type: "boolean",
    default: true,
    help: "Shows equator, tropics, polar circles, and longitude meridians for geography lessons."
  },
  {
    key: "atmosphereVisible",
    label: "Atmosphere glow",
    type: "boolean",
    default: true,
    help: "Adds a thin visual atmosphere so the limb and day/night boundary read clearly."
  }
] as const;

export const EARTH_GLOBE_DEFAULT_PARAMETERS: Record<string, unknown> = {
  solarMode: "realtime",
  dayOfYear: 172,
  utcHour: 12,
  rotationPeriodSeconds: 90,
  nightLightsVisible: true,
  bathymetryVisible: true,
  iceVisible: true,
  graticuleVisible: true,
  atmosphereVisible: true
};

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString";
  coordinates: number[][] | number[][][] | number[][][][];
};

type GeoJsonFeature = {
  type: "Feature";
  geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

type BathymetryBand = { geojson: GeoJsonFeatureCollection; color: string };

const geoJsonRequests = new Map<string, Promise<GeoJsonFeatureCollection>>();

function loadGeoJson(url: string) {
  const existing = geoJsonRequests.get(url);
  if (existing) return existing;
  const request = fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Unable to load GeoJSON ${url}: ${response.status}`);
    return response.json() as Promise<GeoJsonFeatureCollection>;
  });
  geoJsonRequests.set(url, request);
  return request;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readNumber(value: unknown, fallback: number, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback;
}

function readSolarMode(value: unknown): SolarMode {
  return value === "custom-date-time" ||
    value === "march-equinox" ||
    value === "june-solstice" ||
    value === "december-solstice"
    ? value
    : "realtime";
}

function dateForSolarMode(mode: SolarMode, dayOfYear: number, utcHour: number) {
  switch (mode) {
    case "custom-date-time": {
      const year = new Date().getUTCFullYear();
      const clampedDay = Math.round(readNumber(dayOfYear, 172, 1, 366));
      const clampedHour = readNumber(utcHour, 12, 0, 23.75);
      return new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0) + (clampedDay - 1) * 86_400_000 + clampedHour * 3_600_000);
    }
    case "march-equinox":
      return new Date("2026-03-20T14:46:00.000Z");
    case "june-solstice":
      return new Date("2026-06-21T02:24:00.000Z");
    case "december-solstice":
      return new Date("2026-12-21T20:50:00.000Z");
    default:
      return new Date();
  }
}

function projectPoint(point: number[], width: number, height: number): [number, number] {
  const lon = point[0] ?? 0;
  const lat = point[1] ?? 0;
  return [((lon + 180) / 360) * width, ((90 - lat) / 180) * height];
}

function drawRing(ctx: CanvasRenderingContext2D, ring: number[][], width: number, height: number) {
  ring.forEach((point, index) => {
    const [x, y] = projectPoint(point, width, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawPolygon(ctx: CanvasRenderingContext2D, polygon: number[][][], width: number, height: number) {
  for (const ring of polygon) drawRing(ctx, ring, width, height);
}

function drawLine(ctx: CanvasRenderingContext2D, line: number[][], width: number, height: number) {
  let previousX: number | null = null;
  line.forEach((point, index) => {
    const [x, y] = projectPoint(point, width, height);
    if (index === 0 || previousX === null || Math.abs(x - previousX) > width / 2) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
    previousX = x;
  });
}

function tracePolygons(ctx: CanvasRenderingContext2D, geojson: GeoJsonFeatureCollection, width: number, height: number) {
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Polygon") {
      drawPolygon(ctx, geometry.coordinates as number[][][], width, height);
    } else if (geometry.type === "MultiPolygon") {
      for (const polygon of geometry.coordinates as number[][][][]) {
        drawPolygon(ctx, polygon, width, height);
      }
    }
  }
}

function traceLines(ctx: CanvasRenderingContext2D, geojson: GeoJsonFeatureCollection, width: number, height: number) {
  for (const feature of geojson.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "LineString") {
      drawLine(ctx, geometry.coordinates as number[][], width, height);
    } else if (geometry.type === "MultiLineString") {
      for (const line of geometry.coordinates as number[][][]) {
        drawLine(ctx, line, width, height);
      }
    }
  }
}

function createFallbackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 8;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#143a63";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createEarthTexture(input: {
  land: GeoJsonFeatureCollection;
  lakes?: GeoJsonFeatureCollection | null;
  rivers?: GeoJsonFeatureCollection | null;
  glaciatedAreas?: GeoJsonFeatureCollection | null;
  antarcticIceShelves?: GeoJsonFeatureCollection | null;
  bathymetry?: Array<{ geojson: GeoJsonFeatureCollection; color: string }>;
  bathymetryVisible: boolean;
  iceVisible: boolean;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return createFallbackTexture();

  const oceanGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  oceanGradient.addColorStop(0, "#0b2747");
  oceanGradient.addColorStop(0.5, "#0b4d78");
  oceanGradient.addColorStop(1, "#08203d");
  ctx.fillStyle = oceanGradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (input.bathymetryVisible && input.bathymetry) {
    for (const band of input.bathymetry) {
      ctx.beginPath();
      tracePolygons(ctx, band.geojson, canvas.width, canvas.height);
      ctx.fillStyle = band.color;
      ctx.fill("evenodd");
    }
  }

  ctx.beginPath();
  tracePolygons(ctx, input.land, canvas.width, canvas.height);
  ctx.save();
  ctx.clip("evenodd");
  ctx.fillStyle = "#527d3f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = "#d7bb78";
  ctx.fillRect(0, canvas.height * 0.34, canvas.width, canvas.height * 0.24);
  ctx.globalAlpha = 0.52;
  ctx.fillStyle = "#f4f1e6";
  ctx.fillRect(0, 0, canvas.width, canvas.height * 0.1);
  ctx.fillRect(0, canvas.height * 0.88, canvas.width, canvas.height * 0.12);
  ctx.restore();

  if (input.iceVisible && input.glaciatedAreas) {
    ctx.beginPath();
    tracePolygons(ctx, input.glaciatedAreas, canvas.width, canvas.height);
    ctx.fillStyle = "#f4f7f8";
    ctx.fill("evenodd");
  }

  if (input.iceVisible && input.antarcticIceShelves) {
    ctx.beginPath();
    tracePolygons(ctx, input.antarcticIceShelves, canvas.width, canvas.height);
    ctx.fillStyle = "#e9f4fb";
    ctx.fill("evenodd");
  }

  if (input.lakes) {
    ctx.beginPath();
    tracePolygons(ctx, input.lakes, canvas.width, canvas.height);
    ctx.fillStyle = "#0d4f7b";
    ctx.fill("evenodd");
  }

  if (input.rivers) {
    ctx.beginPath();
    traceLines(ctx, input.rivers, canvas.width, canvas.height);
    ctx.strokeStyle = "rgba(108, 185, 214, 0.78)";
    ctx.lineWidth = 1.1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function useGeneratedEarthTexture(input: { bathymetryVisible: boolean; iceVisible: boolean }) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    let current: Texture | null = null;
    void Promise.all([
      loadGeoJson(LAND_GEOJSON_URL),
      loadGeoJson(LAKES_GEOJSON_URL).catch(() => null),
      loadGeoJson(RIVERS_GEOJSON_URL).catch(() => null),
      loadGeoJson(GLACIATED_AREAS_GEOJSON_URL).catch(() => null),
      loadGeoJson(ANTARCTIC_ICE_SHELVES_GEOJSON_URL).catch(() => null),
      Promise.all(
        BATHYMETRY_GEOJSON_URLS.map((band) =>
          loadGeoJson(band.url)
            .then((geojson): BathymetryBand => ({ geojson, color: band.color }))
            .catch(() => null)
        )
      )
    ])
      .then(([land, lakes, rivers, glaciatedAreas, antarcticIceShelves, bathymetry]) => {
        if (disposed) return;
        current = createEarthTexture({
          land,
          lakes,
          rivers,
          glaciatedAreas,
          antarcticIceShelves,
          bathymetry: bathymetry.filter((band): band is BathymetryBand => Boolean(band)),
          bathymetryVisible: input.bathymetryVisible,
          iceVisible: input.iceVisible
        });
        setTexture(current);
      })
      .catch(() => {
        if (disposed) return;
        current = createFallbackTexture();
        setTexture(current);
      });

    return () => {
      disposed = true;
      current?.dispose();
    };
  }, [input.bathymetryVisible, input.iceVisible]);

  return texture;
}

function useLoadedTexture(url: string) {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let disposed = false;
    let current: Texture | null = null;
    const loader = new TextureLoader();
    loader.load(
      url,
      (loaded) => {
        if (disposed) {
          loaded.dispose();
          return;
        }
        loaded.colorSpace = SRGBColorSpace;
        loaded.anisotropy = 8;
        current = loaded;
        setTexture(loaded);
      },
      undefined,
      () => {
        if (!disposed) {
          current = createFallbackTexture();
          setTexture(current);
        }
      }
    );

    return () => {
      disposed = true;
      current?.dispose();
    };
  }, [url]);

  return texture;
}

function Graticule() {
  const meridians = useMemo(() => Array.from({ length: 12 }, (_, index) => index * Math.PI / 6), []);
  const parallels = useMemo(
    () => [
      { id: "antarctic", y: -Math.sin(66.563 * Math.PI / 180), radius: Math.cos(66.563 * Math.PI / 180), color: "#c8f0ff" },
      { id: "capricorn", y: -Math.sin(23.439 * Math.PI / 180), radius: Math.cos(23.439 * Math.PI / 180), color: "#f5d78a" },
      { id: "equator", y: 0, radius: 1, color: "#fff3a0" },
      { id: "cancer", y: Math.sin(23.439 * Math.PI / 180), radius: Math.cos(23.439 * Math.PI / 180), color: "#f5d78a" },
      { id: "arctic", y: Math.sin(66.563 * Math.PI / 180), radius: Math.cos(66.563 * Math.PI / 180), color: "#c8f0ff" }
    ],
    []
  );

  return (
    <group>
      {meridians.map((rotation) => (
        <mesh key={rotation} rotation={[0, rotation, 0]}>
          <torusGeometry args={[0.422, 0.0012, 4, 160]} />
          <meshBasicMaterial color="#d8eef8" transparent opacity={0.32} side={DoubleSide} />
        </mesh>
      ))}
      {parallels.map((parallel) => (
        <mesh key={parallel.id} position={[0, parallel.y * 0.422, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[parallel.radius, parallel.radius, 1]}>
          <torusGeometry args={[0.422, 0.0015, 4, 160]} />
          <meshBasicMaterial color={parallel.color} transparent opacity={parallel.id === "equator" ? 0.65 : 0.45} />
        </mesh>
      ))}
    </group>
  );
}

export function EarthGlobe({ parameters, colorTintHex }: ProceduralProps) {
  const solarMode = readSolarMode(parameters.solarMode);
  const dayOfYear = readNumber(parameters.dayOfYear, 172, 1, 366);
  const utcHour = readNumber(parameters.utcHour, 12, 0, 23.75);
  const rotationPeriodSeconds = readNumber(parameters.rotationPeriodSeconds, 90, 0, 240);
  const nightLightsVisible = readBoolean(parameters.nightLightsVisible, true);
  const bathymetryVisible = readBoolean(parameters.bathymetryVisible, true);
  const iceVisible = readBoolean(parameters.iceVisible, true);
  const graticuleVisible = readBoolean(parameters.graticuleVisible, true);
  const atmosphereVisible = readBoolean(parameters.atmosphereVisible, true);
  const accent = colorTintHex ?? "#f5c24b";

  const earthTexture = useGeneratedEarthTexture({ bathymetryVisible, iceVisible });
  const nightTexture = useLoadedTexture(NIGHT_LIGHTS_URL);
  const materialRef = useRef<ShaderMaterial>(null);
  const spinRef = useRef(0);
  const solarLabelRef = useRef("");
  const [solarLabel, setSolarLabel] = useState("");

  const uniforms = useMemo(
    () =>
      earthTexture && nightTexture
        ? {
      dayMap: { value: earthTexture },
      nightMap: { value: nightTexture },
      sunDirection: { value: new Vector3(0, 0, 1) },
      spinOffset: { value: 0 },
      nightLightsStrength: { value: nightLightsVisible ? 1 : 0 },
      twilightWidth: { value: 0.08 },
      accentColor: { value: new Color(accent) }
    }
        : null,
    [accent, earthTexture, nightLightsVisible, nightTexture]
  );

  useEffect(() => {
    if (materialRef.current && earthTexture) {
      materialRef.current.uniforms.dayMap!.value = earthTexture;
    }
  }, [earthTexture]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.nightLightsStrength!.value = nightLightsVisible ? 1 : 0;
      materialRef.current.uniforms.accentColor!.value.set(accent);
    }
  }, [accent, nightLightsVisible]);

  useFrame((_, delta) => {
    if (rotationPeriodSeconds > 0) {
      spinRef.current = (spinRef.current + delta / rotationPeriodSeconds) % 1;
    }
    const date = dateForSolarMode(solarMode, dayOfYear, utcHour);
    const subpoint = computeSolarSubpoint(date);
    const [x, y, z] = solarVectorFromSubpoint(subpoint.latitudeRad, subpoint.longitudeRad);
    const material = materialRef.current;
    if (material) {
      material.uniforms.spinOffset!.value = spinRef.current;
      material.uniforms.sunDirection!.value.set(x, y, z).normalize();
    }
    const nextLabel = `${solarMode === "realtime" ? "Live" : solarMode === "custom-date-time" ? "Custom" : "Preset"} subsolar ${Math.abs(subpoint.latitudeRad * 180 / Math.PI).toFixed(1)}°${subpoint.latitudeRad >= 0 ? "N" : "S"}`;
    if (solarLabelRef.current !== nextLabel) {
      solarLabelRef.current = nextLabel;
      setSolarLabel(nextLabel);
    }
  });

  return (
    <group rotation={[0, 0, -EARTH_OBLIQUITY_RAD]}>
      {uniforms ? (
        <mesh>
          <sphereGeometry args={[0.42, 160, 96]} />
          <shaderMaterial
            ref={materialRef}
            uniforms={uniforms}
            vertexShader={EARTH_VERTEX_SHADER}
            fragmentShader={EARTH_FRAGMENT_SHADER}
          />
        </mesh>
      ) : (
        <mesh>
          <sphereGeometry args={[0.42, 64, 32]} />
          <meshStandardMaterial color="#164a78" roughness={0.8} />
        </mesh>
      )}

      {graticuleVisible ? <Graticule /> : null}

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 1.08, 16]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.22} />
      </mesh>

      {atmosphereVisible ? (
        <mesh>
          <sphereGeometry args={[0.435, 96, 48]} />
          <meshBasicMaterial
            color="#6ec8ff"
            transparent
            opacity={0.16}
            side={BackSide}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ) : null}

      <Html transform center position={[0, -0.64, 0]} scale={0.08} className="room-object-html">
        <span className="room-object-label" style={{ borderColor: accent }}>
          23.44° axial tilt · {solarLabel}
        </span>
      </Html>
    </group>
  );
}

const EARTH_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAGMENT_SHADER = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  uniform float spinOffset;
  uniform float nightLightsStrength;
  uniform float twilightWidth;
  uniform vec3 accentColor;
  varying vec2 vUv;

  vec3 sphereNormalFromUv(vec2 uv) {
    float lon = uv.x * 6.28318530718 - 3.14159265359;
    float lat = 1.57079632679 - uv.y * 3.14159265359;
    float cosLat = cos(lat);
    return normalize(vec3(cosLat * sin(lon), sin(lat), cosLat * cos(lon)));
  }

  void main() {
    vec2 spunUv = vec2(fract(vUv.x + spinOffset), vUv.y);
    vec3 normal = sphereNormalFromUv(vUv);
    float daylight = dot(normal, normalize(sunDirection));
    float dayMix = smoothstep(-twilightWidth, twilightWidth, daylight);
    vec3 dayColor = texture2D(dayMap, spunUv).rgb;
    vec3 nightColor = texture2D(nightMap, spunUv).rgb;
    vec3 darkEarth = dayColor * vec3(0.05, 0.075, 0.12);
    vec3 cityLights = nightColor * vec3(1.35, 1.18, 0.82) * nightLightsStrength;
    vec3 color = mix(darkEarth + cityLights, dayColor, dayMix);
    float terminator = 1.0 - smoothstep(0.0, twilightWidth * 2.0, abs(daylight));
    color += accentColor * terminator * 0.08;
    gl_FragColor = vec4(color, 1.0);
  }
`;
