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
  Group,
  ShaderMaterial,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  Vector3
} from "three";
import type { ProceduralProps } from "./types";
import {
  computeSolarSubpoint,
  dateWithPhysicalElapsedDay,
  solarVectorFromSubpoint,
  spinOffsetFromUnwrappedSubsolarLongitude,
  unwrapRadiansDelta
} from "./earthSolar";

export const EARTH_GLOBE_PROCEDURAL_ID = "earth-globe";
export const EARTH_GLOBE_DISPLAY_NAME = "Rotating Earth globe";
export const EARTH_GLOBE_ATTRIBUTION =
  "Physical vectors: Natural Earth public domain; night lights, cloud composite, topography, and GEBCO bathymetry relief: NASA Earth Observatory";

const LAND_GEOJSON_URL = "/room-objects/geojson/ne_10m_land.geojson";
const LAKES_GEOJSON_URL = "/room-objects/geojson/ne_10m_lakes.geojson";
const RIVERS_GEOJSON_URL = "/room-objects/geojson/ne_10m_rivers_lake_centerlines.geojson";
const GLACIATED_AREAS_GEOJSON_URL = "/room-objects/geojson/ne_10m_glaciated_areas.geojson";
const ANTARCTIC_ICE_SHELVES_GEOJSON_URL = "/room-objects/geojson/ne_10m_antarctic_ice_shelves_polys.geojson";
const ELEVATION_POINTS_GEOJSON_URL = "/room-objects/geojson/ne_10m_geography_regions_elevation_points.geojson";
const BATHYMETRY_GEOJSON_URLS = [
  { url: "/room-objects/geojson/ne_10m_bathymetry_K_200.geojson", color: "#0b4169" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_I_2000.geojson", color: "#092f58" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_G_4000.geojson", color: "#071f42" },
  { url: "/room-objects/geojson/ne_10m_bathymetry_E_6000.geojson", color: "#041631" }
] as const;
const DAY_TEXTURE_URL = "/room-objects/textures/earth-physical-base-4096.webp";
const BATHYMETRY_TEXTURE_URL = "/room-objects/textures/earth-bathymetry-4096.webp";
const ICE_TEXTURE_URL = "/room-objects/textures/earth-ice-4096.webp";
const NIGHT_LIGHTS_URL = "/room-objects/textures/earth-black-marble-2016-3600.jpg";
const CLOUD_TEXTURE_URL = "/room-objects/textures/earth-clouds-blue-marble-2048.webp";
const TOPOGRAPHY_RELIEF_URL = "/room-objects/textures/earth-topography-relief-4096.webp";
const BATHYMETRY_RELIEF_URL = "/room-objects/textures/earth-bathymetry-relief-4096.webp";
const EARTH_OBLIQUITY_RAD = 23.439281 * Math.PI / 180;
const EARTH_POLAR_RADIUS_RATIO = 6356.7523142 / 6378.137;
const EARTH_RENDER_RADIUS = 0.42;
const EARTH_EQUATORIAL_RADIUS_M = 6_378_137;
const WORLD_Y_AXIS = new Vector3(0, 1, 0);
const WORLD_Z_AXIS = new Vector3(0, 0, 1);
const TEXTURE_WIDTH = 4096;
const TEXTURE_HEIGHT = 2048;

type SolarMode = "realtime" | "custom-date-time" | "march-equinox" | "june-solstice" | "december-solstice";
type TimeFlowMode = "physical-accelerated" | "live-utc" | "demo-spin";

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
    key: "timeFlowMode",
    label: "Time flow",
    type: "enum",
    default: "physical-accelerated",
    options: [
      { value: "physical-accelerated", label: "Accelerated physical day" },
      { value: "live-utc", label: "Live UTC clock" },
      { value: "demo-spin", label: "Fixed-date demo spin" }
    ],
    help: "Physical modes couple rotation to advancing UTC solar time; demo spin rotates the globe around a fixed date."
  },
  {
    key: "customYear",
    label: "Custom year",
    type: "number",
    default: 2026,
    min: 1900,
    max: 2100,
    step: 1,
    help: "Used when Solar date is Custom day/time. Years matter because leap years shift day-of-year dates."
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
    max: 23,
    step: 1,
    help: "Used when Solar date is Custom day/time."
  },
  {
    key: "utcMinute",
    label: "UTC minute",
    type: "number",
    default: 0,
    min: 0,
    max: 59,
    step: 1,
    help: "Used when Solar date is Custom day/time for minute-level terminator position."
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
    key: "cloudsVisible",
    label: "Cloud layer",
    type: "boolean",
    default: true,
    help: "Adds a NASA Blue Marble cloud composite as a separate transparent atmosphere shell."
  },
  {
    key: "terrainReliefVisible",
    label: "Terrain relief",
    type: "boolean",
    default: true,
    help: "Adds true-scale radial terrain displacement plus NASA topography and GEBCO bathymetry relief shading."
  },
  {
    key: "solarMarkersVisible",
    label: "Subsolar markers",
    type: "boolean",
    default: true,
    help: "Marks the point where the Sun is directly overhead and the opposite solar-midnight point."
  },
  {
    key: "terminatorGuideVisible",
    label: "Terminator guide",
    type: "boolean",
    default: true,
    help: "Draws the sunrise/sunset great circle from the same solar vector used by the day/night shader."
  },
  {
    key: "elevationMarkersVisible",
    label: "Major elevation markers",
    type: "boolean",
    default: true,
    help: "Marks Natural Earth high-elevation points such as Everest and K2."
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
  timeFlowMode: "physical-accelerated",
  customYear: 2026,
  dayOfYear: 172,
  utcHour: 12,
  utcMinute: 0,
  rotationPeriodSeconds: 90,
  nightLightsVisible: true,
  bathymetryVisible: true,
  iceVisible: true,
  cloudsVisible: true,
  terrainReliefVisible: true,
  solarMarkersVisible: true,
  terminatorGuideVisible: true,
  elevationMarkersVisible: true,
  graticuleVisible: true,
  atmosphereVisible: true
};

type GeoJsonGeometry = {
  type: "Polygon" | "MultiPolygon" | "LineString" | "MultiLineString" | "Point";
  coordinates: number[] | number[][] | number[][][] | number[][][][];
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
type ElevationMarker = {
  id: string;
  name: string;
  elevation: number;
  position: [number, number, number];
  labelVisible: boolean;
};

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

function readTimeFlowMode(value: unknown): TimeFlowMode {
  return value === "live-utc" || value === "demo-spin" ? value : "physical-accelerated";
}

function dateForSolarMode(mode: SolarMode, customYear: number, dayOfYear: number, utcHour: number, utcMinute: number) {
  switch (mode) {
    case "custom-date-time": {
      const year = Math.round(readNumber(customYear, new Date().getUTCFullYear(), 1900, 2100));
      const clampedDay = Math.round(readNumber(dayOfYear, 172, 1, 366));
      const clampedHour = Math.floor(readNumber(utcHour, 12, 0, 23));
      const clampedMinute = Math.round(readNumber(utcMinute, 0, 0, 59));
      return new Date(Date.UTC(year, 0, 1, clampedHour, clampedMinute, 0, 0) + (clampedDay - 1) * 86_400_000);
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

function globePosition(longitudeDeg: number, latitudeDeg: number, radius: number): [number, number, number] {
  const lon = longitudeDeg * Math.PI / 180;
  const lat = latitudeDeg * Math.PI / 180;
  const cosLat = Math.cos(lat);
  return [
    radius * cosLat * Math.sin(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.cos(lon)
  ];
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

function createTransparentFallbackTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 8;
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

function useLoadedTexture(url: string, transparentFallback = false) {
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
          current = transparentFallback ? createTransparentFallbackTexture() : createFallbackTexture();
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

function useElevationMarkers(enabled: boolean) {
  const [markers, setMarkers] = useState<ElevationMarker[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMarkers([]);
      return;
    }

    let disposed = false;
    void loadGeoJson(ELEVATION_POINTS_GEOJSON_URL)
      .then((geojson) => {
        if (disposed) return;
        const next = geojson.features
          .map((feature) => {
            const geometry = feature.geometry;
            if (!geometry || geometry.type !== "Point") return null;
            const coordinates = geometry.coordinates as number[];
            const longitude = coordinates[0];
            const latitude = coordinates[1];
            const props = (feature as GeoJsonFeature & { properties?: Record<string, unknown> }).properties ?? {};
            const elevation = typeof props.elevation === "number" ? props.elevation : null;
            const name = typeof props.name === "string" ? props.name : "Elevation point";
            if (typeof longitude !== "number" || typeof latitude !== "number" || elevation === null) return null;
            return {
              id: `${name}-${longitude}-${latitude}`,
              name,
              elevation,
              position: globePosition(longitude, latitude, 0.435),
              labelVisible: false
            };
          })
          .filter((marker): marker is ElevationMarker => Boolean(marker))
          .filter((marker) => marker.elevation >= 5000)
          .sort((left, right) => right.elevation - left.elevation)
          .map((marker, index) => ({ ...marker, labelVisible: index < 5 }));
        setMarkers(next);
      })
      .catch(() => {
        if (!disposed) setMarkers([]);
      });

    return () => {
      disposed = true;
    };
  }, [enabled]);

  return markers;
}

function ElevationMarkers({ markers }: { markers: ElevationMarker[] }) {
  if (markers.length === 0) return null;
  return (
    <group>
      {markers.map((marker, index) => {
        const radius = marker.elevation >= 8000 ? 0.008 : marker.elevation >= 6500 ? 0.006 : 0.0045;
        const color = marker.elevation >= 8000 ? "#fff2a8" : marker.elevation >= 6500 ? "#f8c66a" : "#d68b38";
        return (
          <group key={marker.id} position={marker.position}>
            <mesh>
              <sphereGeometry args={[radius, 12, 8]} />
              <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.62} />
            </mesh>
            {marker.labelVisible ? (
              <Html transform center position={[0, 0.035 + index * 0.002, 0]} scale={0.035} className="room-object-html">
                <span className="room-object-label" style={{ borderColor: color }}>
                  {marker.name} · {marker.elevation.toLocaleString()} m
                </span>
              </Html>
            ) : null}
          </group>
        );
      })}
    </group>
  );
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
  const timeFlowMode = readTimeFlowMode(parameters.timeFlowMode);
  const customYear = readNumber(parameters.customYear, 2026, 1900, 2100);
  const dayOfYear = readNumber(parameters.dayOfYear, 172, 1, 366);
  const utcHour = readNumber(parameters.utcHour, 12, 0, 23);
  const utcMinute = readNumber(parameters.utcMinute, 0, 0, 59);
  const rotationPeriodSeconds = readNumber(parameters.rotationPeriodSeconds, 90, 0, 240);
  const nightLightsVisible = readBoolean(parameters.nightLightsVisible, true);
  const bathymetryVisible = readBoolean(parameters.bathymetryVisible, true);
  const iceVisible = readBoolean(parameters.iceVisible, true);
  const cloudsVisible = readBoolean(parameters.cloudsVisible, true);
  const terrainReliefVisible = readBoolean(parameters.terrainReliefVisible, true);
  const solarMarkersVisible = readBoolean(parameters.solarMarkersVisible, true);
  const terminatorGuideVisible = readBoolean(parameters.terminatorGuideVisible, true);
  const elevationMarkersVisible = readBoolean(parameters.elevationMarkersVisible, true);
  const graticuleVisible = readBoolean(parameters.graticuleVisible, true);
  const atmosphereVisible = readBoolean(parameters.atmosphereVisible, true);
  const accent = colorTintHex ?? "#f5c24b";

  const earthTexture = useLoadedTexture(DAY_TEXTURE_URL);
  const bathymetryTexture = useLoadedTexture(BATHYMETRY_TEXTURE_URL, true);
  const iceTexture = useLoadedTexture(ICE_TEXTURE_URL, true);
  const cloudTexture = useLoadedTexture(CLOUD_TEXTURE_URL, true);
  const topographyReliefTexture = useLoadedTexture(TOPOGRAPHY_RELIEF_URL, true);
  const bathymetryReliefTexture = useLoadedTexture(BATHYMETRY_RELIEF_URL, true);
  const elevationMarkers = useElevationMarkers(elevationMarkersVisible);
  const nightTexture = useLoadedTexture(NIGHT_LIGHTS_URL);
  const materialRef = useRef<ShaderMaterial>(null);
  const elevationGroupRef = useRef<Group>(null);
  const cloudGroupRef = useRef<Group>(null);
  const solarMarkerGroupRef = useRef<Group>(null);
  const subsolarMarkerRef = useRef<Group>(null);
  const midnightMarkerRef = useRef<Group>(null);
  const terminatorGuideRef = useRef<Group>(null);
  const timeAnchorDateRef = useRef<Date | null>(null);
  const spinRef = useRef(0);
  const sunAnchorLongitudeRef = useRef<number | null>(null);
  const previousSunLongitudeRef = useRef<number | null>(null);
  const unwrappedSunLongitudeRef = useRef<number | null>(null);
  const solarLabelRef = useRef("");
  const [solarLabel, setSolarLabel] = useState("");

  const uniforms = useMemo(
    () =>
      earthTexture && nightTexture
        ? {
      dayMap: { value: earthTexture },
      bathymetryMap: { value: bathymetryTexture ?? createTransparentFallbackTexture() },
      iceMap: { value: iceTexture ?? createTransparentFallbackTexture() },
      nightMap: { value: nightTexture },
      topographyReliefMap: { value: topographyReliefTexture ?? createTransparentFallbackTexture() },
      bathymetryReliefMap: { value: bathymetryReliefTexture ?? createTransparentFallbackTexture() },
      sunDirection: { value: new Vector3(0, 0, 1) },
      spinOffset: { value: 0 },
      nightLightsStrength: { value: nightLightsVisible ? 1 : 0 },
      bathymetryStrength: { value: bathymetryVisible ? 1 : 0 },
      iceStrength: { value: iceVisible ? 1 : 0 },
      terrainReliefStrength: { value: terrainReliefVisible && topographyReliefTexture && bathymetryReliefTexture ? 1 : 0 },
      terrainDisplacementRadius: { value: EARTH_RENDER_RADIUS / EARTH_EQUATORIAL_RADIUS_M },
      twilightWidth: { value: 0.08 },
      accentColor: { value: new Color(accent) }
    }
        : null,
    [
      accent,
      bathymetryReliefTexture,
      bathymetryTexture,
      bathymetryVisible,
      earthTexture,
      iceTexture,
      iceVisible,
      nightLightsVisible,
      nightTexture,
      terrainReliefVisible,
      topographyReliefTexture
    ]
  );

  useEffect(() => {
    if (materialRef.current && earthTexture) {
      materialRef.current.uniforms.dayMap!.value = earthTexture;
    }
  }, [earthTexture]);

  useEffect(() => {
    if (materialRef.current && bathymetryTexture) {
      materialRef.current.uniforms.bathymetryMap!.value = bathymetryTexture;
    }
  }, [bathymetryTexture]);

  useEffect(() => {
    if (materialRef.current && iceTexture) {
      materialRef.current.uniforms.iceMap!.value = iceTexture;
    }
  }, [iceTexture]);

  useEffect(() => {
    if (materialRef.current && topographyReliefTexture) {
      materialRef.current.uniforms.topographyReliefMap!.value = topographyReliefTexture;
    }
  }, [topographyReliefTexture]);

  useEffect(() => {
    if (materialRef.current && bathymetryReliefTexture) {
      materialRef.current.uniforms.bathymetryReliefMap!.value = bathymetryReliefTexture;
    }
  }, [bathymetryReliefTexture]);

  useEffect(() => {
    if (materialRef.current) {
      materialRef.current.uniforms.nightLightsStrength!.value = nightLightsVisible ? 1 : 0;
      materialRef.current.uniforms.bathymetryStrength!.value = bathymetryVisible ? 1 : 0;
      materialRef.current.uniforms.iceStrength!.value = iceVisible ? 1 : 0;
      materialRef.current.uniforms.terrainReliefStrength!.value =
        terrainReliefVisible && topographyReliefTexture && bathymetryReliefTexture ? 1 : 0;
      materialRef.current.uniforms.accentColor!.value.set(accent);
    }
  }, [
    accent,
    bathymetryReliefTexture,
    bathymetryVisible,
    iceVisible,
    nightLightsVisible,
    terrainReliefVisible,
    topographyReliefTexture
  ]);

  useEffect(() => {
    timeAnchorDateRef.current = dateForSolarMode(solarMode, customYear, dayOfYear, utcHour, utcMinute);
    spinRef.current = 0;
    sunAnchorLongitudeRef.current = null;
    previousSunLongitudeRef.current = null;
    unwrappedSunLongitudeRef.current = null;
  }, [customYear, dayOfYear, solarMode, timeFlowMode, utcHour, utcMinute]);

  useFrame((state, delta) => {
    if (timeFlowMode === "demo-spin" && rotationPeriodSeconds > 0) {
      spinRef.current = (spinRef.current + delta / rotationPeriodSeconds) % 1;
    }
    const baseDate =
      timeAnchorDateRef.current ?? dateForSolarMode(solarMode, customYear, dayOfYear, utcHour, utcMinute);
    const date =
      timeFlowMode === "live-utc"
        ? new Date()
        : timeFlowMode === "physical-accelerated"
          ? dateWithPhysicalElapsedDay(baseDate, state.clock.elapsedTime, rotationPeriodSeconds)
          : baseDate;
    const subpoint = computeSolarSubpoint(date);
    if (timeFlowMode !== "demo-spin") {
      if (
        sunAnchorLongitudeRef.current === null ||
        previousSunLongitudeRef.current === null ||
        unwrappedSunLongitudeRef.current === null
      ) {
        sunAnchorLongitudeRef.current = subpoint.longitudeRad;
        previousSunLongitudeRef.current = subpoint.longitudeRad;
        unwrappedSunLongitudeRef.current = subpoint.longitudeRad;
        spinRef.current = 0;
      } else {
        const deltaLongitude = unwrapRadiansDelta(subpoint.longitudeRad, previousSunLongitudeRef.current);
        unwrappedSunLongitudeRef.current += deltaLongitude;
        previousSunLongitudeRef.current = subpoint.longitudeRad;
        spinRef.current = spinOffsetFromUnwrappedSubsolarLongitude(
          unwrappedSunLongitudeRef.current,
          sunAnchorLongitudeRef.current
        );
      }
    }
    const [x, y, z] = solarVectorFromSubpoint(subpoint.latitudeRad, subpoint.longitudeRad);
    const material = materialRef.current;
    if (material) {
      material.uniforms.spinOffset!.value = spinRef.current;
      material.uniforms.sunDirection!.value.set(x, y, z).normalize();
    }
    if (elevationGroupRef.current) {
      elevationGroupRef.current.rotation.y = -spinRef.current * Math.PI * 2;
    }
    if (solarMarkerGroupRef.current) {
      solarMarkerGroupRef.current.rotation.y = -spinRef.current * Math.PI * 2;
    }
    if (terminatorGuideRef.current) {
      const displaySun = new Vector3(x, y, z)
        .applyAxisAngle(WORLD_Y_AXIS, -spinRef.current * Math.PI * 2)
        .normalize();
      terminatorGuideRef.current.quaternion.setFromUnitVectors(WORLD_Z_AXIS, displaySun);
    }
    if (solarMarkersVisible && subsolarMarkerRef.current && midnightMarkerRef.current) {
      const subsolarLongitudeDeg = subpoint.longitudeRad * 180 / Math.PI;
      const subsolarLatitudeDeg = subpoint.latitudeRad * 180 / Math.PI;
      const midnightLongitudeDeg = subsolarLongitudeDeg + 180;
      const midnightLatitudeDeg = -subsolarLatitudeDeg;
      subsolarMarkerRef.current.position.set(...globePosition(subsolarLongitudeDeg, subsolarLatitudeDeg, EARTH_RENDER_RADIUS + 0.026));
      midnightMarkerRef.current.position.set(...globePosition(midnightLongitudeDeg, midnightLatitudeDeg, EARTH_RENDER_RADIUS + 0.024));
    }
    if (cloudGroupRef.current) {
      cloudGroupRef.current.rotation.y = -spinRef.current * Math.PI * 2 - state.clock.elapsedTime * 0.006;
    }
    const flowLabel =
      timeFlowMode === "physical-accelerated" ? "Accelerated physical" : timeFlowMode === "live-utc" ? "Live UTC" : "Demo spin";
    const nextLabel = `${flowLabel} · ${solarMode === "realtime" ? "Live" : solarMode === "custom-date-time" ? "Custom" : "Preset"} subsolar ${Math.abs(subpoint.latitudeRad * 180 / Math.PI).toFixed(1)}°${subpoint.latitudeRad >= 0 ? "N" : "S"}`;
    if (solarLabelRef.current !== nextLabel) {
      solarLabelRef.current = nextLabel;
      setSolarLabel(nextLabel);
    }
  });

  return (
    <group rotation={[0, 0, -EARTH_OBLIQUITY_RAD]}>
      <group scale={[1, EARTH_POLAR_RADIUS_RATIO, 1]}>
        {uniforms ? (
          <mesh>
            <sphereGeometry args={[EARTH_RENDER_RADIUS, 256, 128]} />
            <shaderMaterial
              ref={materialRef}
              uniforms={uniforms}
              vertexShader={EARTH_VERTEX_SHADER}
              fragmentShader={EARTH_FRAGMENT_SHADER}
            />
          </mesh>
        ) : (
          <mesh>
            <sphereGeometry args={[EARTH_RENDER_RADIUS, 64, 32]} />
            <meshStandardMaterial color="#164a78" roughness={0.8} />
          </mesh>
        )}

        {graticuleVisible ? <Graticule /> : null}
        {terminatorGuideVisible ? (
          <group ref={terminatorGuideRef}>
            <mesh>
              <torusGeometry args={[EARTH_RENDER_RADIUS + 0.018, 0.0017, 6, 256]} />
              <meshBasicMaterial color={accent} transparent opacity={0.72} side={DoubleSide} />
            </mesh>
          </group>
        ) : null}
        {solarMarkersVisible ? (
          <group ref={solarMarkerGroupRef}>
            <group ref={subsolarMarkerRef} position={[0, 0, EARTH_RENDER_RADIUS + 0.026]}>
              <mesh>
                <sphereGeometry args={[0.011, 18, 12]} />
                <meshStandardMaterial color="#ffd34f" emissive="#ffd34f" emissiveIntensity={0.85} roughness={0.35} />
              </mesh>
              <Html transform center position={[0, 0.04, 0]} scale={0.035} className="room-object-html">
                <span className="room-object-label" style={{ borderColor: "#ffd34f" }}>
                  Sun overhead
                </span>
              </Html>
            </group>
            <group ref={midnightMarkerRef} position={[0, 0, -(EARTH_RENDER_RADIUS + 0.024)]}>
              <mesh>
                <sphereGeometry args={[0.008, 16, 10]} />
                <meshStandardMaterial color="#8eb7ff" emissive="#234a88" emissiveIntensity={0.55} roughness={0.45} />
              </mesh>
              <Html transform center position={[0, 0.032, 0]} scale={0.03} className="room-object-html">
                <span className="room-object-label" style={{ borderColor: "#8eb7ff" }}>
                  Solar midnight
                </span>
              </Html>
            </group>
          </group>
        ) : null}
        {cloudsVisible && cloudTexture ? (
          <group ref={cloudGroupRef}>
            <mesh>
              <sphereGeometry args={[EARTH_RENDER_RADIUS + 0.012, 128, 64]} />
              <meshBasicMaterial map={cloudTexture} transparent opacity={0.56} depthWrite={false} />
            </mesh>
          </group>
        ) : null}
        {elevationMarkersVisible ? (
          <group ref={elevationGroupRef}>
            <ElevationMarkers markers={elevationMarkers} />
          </group>
        ) : null}

        {atmosphereVisible ? (
          <mesh>
            <sphereGeometry args={[EARTH_RENDER_RADIUS + 0.015, 96, 48]} />
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
      </group>

      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 1.08, 16]} />
        <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.22} />
      </mesh>

      <Html transform center position={[0, -0.64, 0]} scale={0.08} className="room-object-html">
        <span className="room-object-label" style={{ borderColor: accent }}>
          23.44° axial tilt · WGS84 oblateness · {solarLabel}
        </span>
      </Html>
    </group>
  );
}

const EARTH_VERTEX_SHADER = `
  uniform sampler2D topographyReliefMap;
  uniform sampler2D bathymetryReliefMap;
  uniform float spinOffset;
  uniform float terrainReliefStrength;
  uniform float terrainDisplacementRadius;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec2 spunUv = vec2(fract(uv.x + spinOffset), uv.y);
    float topographyRelief = texture2D(topographyReliefMap, spunUv).r;
    float bathymetryRelief = texture2D(bathymetryReliefMap, spunUv).r;
    float landReliefMask = smoothstep(0.08, 0.2, topographyRelief);
    float oceanReliefMask = (1.0 - landReliefMask) * smoothstep(0.02, 0.94, 1.0 - bathymetryRelief);
    float terrainMeters = topographyRelief * 6400.0 * landReliefMask - (1.0 - bathymetryRelief) * 8000.0 * oceanReliefMask;
    vec3 displaced = position + normalize(position) * terrainMeters * terrainDisplacementRadius * terrainReliefStrength;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const EARTH_FRAGMENT_SHADER = `
  uniform sampler2D dayMap;
  uniform sampler2D bathymetryMap;
  uniform sampler2D iceMap;
  uniform sampler2D nightMap;
  uniform sampler2D topographyReliefMap;
  uniform sampler2D bathymetryReliefMap;
  uniform vec3 sunDirection;
  uniform float spinOffset;
  uniform float nightLightsStrength;
  uniform float bathymetryStrength;
  uniform float iceStrength;
  uniform float terrainReliefStrength;
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
    vec3 normal = sphereNormalFromUv(spunUv);
    float daylight = dot(normal, normalize(sunDirection));
    float dayMix = smoothstep(-twilightWidth, twilightWidth, daylight);
    vec3 dayColor = texture2D(dayMap, spunUv).rgb;
    vec4 bathymetry = texture2D(bathymetryMap, spunUv);
    vec4 ice = texture2D(iceMap, spunUv);
    dayColor = mix(dayColor, bathymetry.rgb, bathymetry.a * bathymetryStrength);
    dayColor = mix(dayColor, ice.rgb, ice.a * iceStrength);
    float topographyRelief = texture2D(topographyReliefMap, spunUv).r;
    float bathymetryRelief = texture2D(bathymetryReliefMap, spunUv).r;
    float landReliefMask = smoothstep(0.08, 0.2, topographyRelief);
    float oceanReliefMask = (1.0 - landReliefMask) * smoothstep(0.02, 0.94, 1.0 - bathymetryRelief);
    float reliefShade = 1.0;
    reliefShade += (topographyRelief - 0.26) * 0.42 * landReliefMask * terrainReliefStrength;
    reliefShade += (bathymetryRelief - 0.62) * 0.28 * oceanReliefMask * terrainReliefStrength;
    dayColor *= clamp(reliefShade, 0.68, 1.24);
    vec3 nightColor = texture2D(nightMap, spunUv).rgb;
    vec3 darkEarth = dayColor * vec3(0.05, 0.075, 0.12);
    vec3 cityLights = nightColor * vec3(1.35, 1.18, 0.82) * nightLightsStrength;
    vec3 color = mix(darkEarth + cityLights, dayColor, dayMix);
    float terminator = 1.0 - smoothstep(0.0, twilightWidth * 2.0, abs(daylight));
    color += accentColor * terminator * 0.08;
    gl_FragColor = vec4(color, 1.0);
  }
`;
