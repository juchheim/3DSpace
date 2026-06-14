/** Palette grouping in World Builder. Defaults to `"object"`. */
export type WorldAssetCategory = "object" | "scene";

/** Scatter placement: one click strews several instances across a square. */
export type WorldAssetScatter = {
  /** Instances dropped per placement click by default. */
  defaultCount: number;
  minCount: number;
  maxCount: number;
  /** Side length (m) of the square the instances are strewn across, centred on the click. */
  areaSize: number;
};

export type WorldAsset = {
  slug: string;
  displayName: string;
  glbUrl: string;
  thumbnailUrl: string;
  /** World Builder tab; `"scene"` entries appear under Scenes. */
  category?: WorldAssetCategory;
  /** Uniform catalog render scale before per-placement variance. Defaults to 1. */
  scale?: number;
  /**
   * When set (e.g. 0.15), each placement samples an instance scale in
   * [catalogScale×(1−v), catalogScale×(1+v)] so repeated props look natural.
   */
  scaleVariance?: number;
  /** When true, avatars can sit on this asset with E. */
  sittable?: boolean;
  /** When true, sitting on this asset opens the personal desk notebook. */
  deskNotebook?: boolean;
  /** When set, a placement click strews several instances across a square. */
  scatter?: WorldAssetScatter;
  /** When true, the renderer applies a gentle vertex-shader wind sway. */
  windSway?: boolean;
  /** When true, avatars can stand & lock at this asset with E (podium/lectern). */
  podiumStand?: boolean;
  /** When true, the placed mesh becomes a Rapier static trimesh collider (walk/jump on). */
  staticCollider?: boolean;
};

export const WORLD_ASSET_CATALOG: WorldAsset[] = [
  {
    slug: "folding-chair",
    displayName: "Folding Chair",
    glbUrl: "/objects/folding-chair.glb",
    thumbnailUrl: "/objects/thumbnails/folding-chair.jpg",
    sittable: true
  },
  {
    slug: "chair-walnut",
    displayName: "Walnut Chair",
    glbUrl: "/objects/chair-walnut.glb",
    thumbnailUrl: "/objects/thumbnails/chair.jpg",
    scale: 0.8,
    sittable: true
  },
  {
    slug: "table-6-walnut",
    displayName: "Walnut Table",
    glbUrl: "/objects/table-6-walnut.glb",
    thumbnailUrl: "/objects/thumbnails/table.jpg",
    scale: 0.8
  },
  {
    slug: "table-round-walnut",
    displayName: "Round Walnut Table",
    glbUrl: "/objects/table-round-walnut.glb",
    thumbnailUrl: "/objects/thumbnails/round-table.jpg"
  },
  {
    slug: "school-desk-chair2",
    displayName: "Student Desk",
    glbUrl: "/objects/school-desk-chair2.glb",
    thumbnailUrl: "/objects/thumbnails/student-desk.jpg",
    sittable: true,
    deskNotebook: true
  },
  {
    slug: "tree",
    displayName: "Tree",
    glbUrl: "/objects/tree.glb",
    thumbnailUrl: "/objects/thumbnails/tree.jpg",
    scaleVariance: 0.15
  },
  {
    slug: "tree-in-a-pot",
    displayName: "Tree in a Pot",
    glbUrl: "/objects/tree-in-a-pot.glb",
    thumbnailUrl: "/objects/thumbnails/tree-in-a-pot.jpg",
    scaleVariance: 0.15
  },
  {
    slug: "live-oak",
    displayName: "Southern Live Oak",
    glbUrl: "/objects/live-oak.glb",
    thumbnailUrl: "/objects/thumbnails/live-oak.jpg",
    scaleVariance: 0.15
  },
  {
    slug: "tall-grass",
    displayName: "Tall Grass",
    glbUrl: "/objects/tall-grass.glb",
    thumbnailUrl: "/objects/thumbnails/tall-grass.jpg",
    scaleVariance: 0.25,
    windSway: true,
    // One build cell (2 m) per click; the density slider picks the patch count.
    scatter: { defaultCount: 6, minCount: 1, maxCount: 12, areaSize: 2 }
  },
  {
    slug: "podium",
    displayName: "Podium",
    glbUrl: "/objects/podium.glb",
    thumbnailUrl: "/objects/thumbnails/podium.jpg",
    scale: 0.42,
    podiumStand: true
  },
  {
    slug: "vienna-market",
    displayName: "Vienna Market",
    glbUrl: "/objects/vienna-market.glb",
    thumbnailUrl: "/objects/thumbnails/vienna-market.jpg",
    category: "scene",
    staticCollider: true
  }
];

const WORLD_ASSET_BY_SLUG = new Map(WORLD_ASSET_CATALOG.map((asset) => [asset.slug, asset]));

export function worldAssetCategory(asset: WorldAsset): WorldAssetCategory {
  return asset.category ?? "object";
}

export const WORLD_OBJECT_CATALOG = WORLD_ASSET_CATALOG.filter((asset) => worldAssetCategory(asset) === "object");
export const WORLD_SCENE_CATALOG = WORLD_ASSET_CATALOG.filter((asset) => worldAssetCategory(asset) === "scene");

export function worldAssetBySlug(slug: string): WorldAsset | undefined {
  return WORLD_ASSET_BY_SLUG.get(slug);
}

export function worldAssetGlbUrl(slug: string): string {
  return worldAssetBySlug(slug)?.glbUrl ?? `/objects/${slug}.glb`;
}

export function isSittableWorldAsset(slug: string): boolean {
  return worldAssetBySlug(slug)?.sittable === true;
}

/** True when sitting on this asset should open the personal desk notebook. */
export function hasDeskNotebook(slug: string): boolean {
  return worldAssetBySlug(slug)?.deskNotebook === true;
}

export function isPodiumWorldAsset(slug: string): boolean {
  return worldAssetBySlug(slug)?.podiumStand === true;
}

export function isStaticColliderWorldAsset(slug: string): boolean {
  return worldAssetBySlug(slug)?.staticCollider === true;
}

/** True when standing at this asset should open the importable notebook. */
export function hasPodiumNotebook(slug: string): boolean {
  return worldAssetBySlug(slug)?.podiumStand === true;
}

export function worldAssetScale(slug: string): number {
  return worldAssetBySlug(slug)?.scale ?? 1;
}

/** Sample a placement scale for `slug`, applying `scaleVariance` when configured. */
export function sampleWorldAssetPlacementScale(slug: string): number {
  const asset = worldAssetBySlug(slug);
  const base = asset?.scale ?? 1;
  const variance = asset?.scaleVariance ?? 0;
  if (variance <= 0) return base;
  const factor = 1 + (Math.random() * 2 - 1) * variance;
  return base * factor;
}

/** Render scale for a placed instance (persisted scale, else catalog default). */
export function placedWorldAssetRenderScale(asset: { slug: string; scale?: number }): number {
  return asset.scale ?? worldAssetScale(asset.slug);
}

export type ScatterOffset = { dx: number; dz: number; yaw: number };

/**
 * Strew `count` instances across the scatter square: a jittered grid keeps
 * the spread random-looking without the clumps and bald spots of a pure
 * uniform sample. Each instance also gets a random yaw.
 */
export function scatterWorldAssetOffsets(
  scatter: WorldAssetScatter,
  count: number,
  random: () => number = Math.random
): ScatterOffset[] {
  const n = Math.max(scatter.minCount, Math.min(scatter.maxCount, Math.round(count)));
  const cells = Math.ceil(Math.sqrt(n));
  const cellSize = scatter.areaSize / cells;
  const slots: Array<{ cx: number; cz: number }> = [];
  for (let gx = 0; gx < cells; gx++) {
    for (let gz = 0; gz < cells; gz++) {
      slots.push({
        cx: (gx + 0.5) * cellSize - scatter.areaSize / 2,
        cz: (gz + 0.5) * cellSize - scatter.areaSize / 2
      });
    }
  }
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j]!, slots[i]!];
  }
  return slots.slice(0, n).map((slot) => ({
    dx: slot.cx + (random() - 0.5) * cellSize * 0.8,
    dz: slot.cz + (random() - 0.5) * cellSize * 0.8,
    yaw: random() * Math.PI * 2
  }));
}
