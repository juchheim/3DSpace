/** Built-in floor images available in the World Builder Image Floor tool. */
export type BuildFloorTexturePreset = {
  slug: string;
  label: string;
  fileName: string;
  url: string;
};

export const BUILD_FLOOR_TEXTURE_PRESETS: BuildFloorTexturePreset[] = [
  {
    slug: "grass-v2",
    label: "Grass",
    fileName: "grass-v2.png",
    url: "/build/floor-textures/grass-v2.png"
  },
  {
    slug: "floor-dirt-v3",
    label: "Dirt",
    fileName: "floor-dirt-v3.png",
    url: "/build/floor-textures/floor-dirt-v3.png"
  },
  {
    slug: "floor-slight-marbled-concrete",
    label: "Concrete",
    fileName: "floor-slight-marbled-concrete.jpg",
    url: "/build/floor-textures/floor-slight-marbled-concrete.jpg"
  }
];

const presetFileNames = new Set(BUILD_FLOOR_TEXTURE_PRESETS.map((preset) => preset.fileName));

export function isBuildFloorTexturePresetFileName(fileName: string | undefined) {
  return fileName !== undefined && presetFileNames.has(fileName);
}
