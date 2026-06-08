export type WorldAsset = {
  slug: string;
  displayName: string;
  glbUrl: string;
  thumbnailUrl: string;
};

export const WORLD_ASSET_CATALOG: WorldAsset[] = [
  {
    slug: "folding-chair",
    displayName: "Folding Chair",
    glbUrl: "/objects/folding-chair.glb",
    thumbnailUrl: "/objects/thumbnails/folding-chair.jpg"
  }
];
