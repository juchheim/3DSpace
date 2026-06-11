export type WorldAsset = {
  slug: string;
  displayName: string;
  glbUrl: string;
  thumbnailUrl: string;
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
  }
];

const WORLD_ASSET_BY_SLUG = new Map(WORLD_ASSET_CATALOG.map((asset) => [asset.slug, asset]));

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
