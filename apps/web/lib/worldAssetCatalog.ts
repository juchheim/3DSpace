export type WorldAsset = {
  slug: string;
  displayName: string;
  glbUrl: string;
  thumbnailUrl: string;
  /** Uniform render scale. Defaults to 1. */
  scale?: number;
  /** When true, avatars can sit on this asset with E. */
  sittable?: boolean;
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
    slug: "table-6-walnut",
    displayName: "Walnut Table",
    glbUrl: "/objects/table-6-walnut.glb",
    thumbnailUrl: "/objects/thumbnails/table.jpg",
    scale: 0.8
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

export function worldAssetScale(slug: string): number {
  return worldAssetBySlug(slug)?.scale ?? 1;
}
