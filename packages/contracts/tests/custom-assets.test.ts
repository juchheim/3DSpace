import { describe, expect, it } from "vitest";
import {
  CreateCustomAssetRequestSchema,
  CreateCustomAssetUploadRequestSchema,
  CreateWorldAssetRequestSchema,
  CustomWorldAssetSchema,
  PlacedWorldAssetSchema,
  WorldAssetPlacementKindSchema
} from "../src/index";

describe("custom world-asset contracts", () => {
  it("accepts every placement classification", () => {
    for (const kind of ["floor", "wall", "ceiling", "other"]) {
      expect(WorldAssetPlacementKindSchema.parse(kind)).toBe(kind);
    }
    expect(() => WorldAssetPlacementKindSchema.parse("roof")).toThrow();
  });

  it("round-trips a custom library asset", () => {
    const asset = {
      id: "ca-1",
      ownerUserId: "user-1",
      displayName: "My Lamp",
      glbStorageKey: "users/user-1/custom-assets/glb/abc-lamp.glb",
      glbUrl: "https://api.example/v1/room-object-assets/users/user-1/custom-assets/glb/abc-lamp.glb",
      thumbnailStorageKey: "users/user-1/custom-assets/thumbnail/abc-lamp.webp",
      thumbnailUrl: "https://api.example/v1/room-object-assets/users/user-1/custom-assets/thumbnail/abc-lamp.webp",
      placement: "ceiling" as const,
      scale: 1.2,
      createdAt: new Date().toISOString()
    };
    expect(CustomWorldAssetSchema.parse(asset)).toEqual(asset);
  });

  it("carries the denormalized custom payload on a placed world asset", () => {
    const placed = PlacedWorldAssetSchema.parse({
      id: "wa-1",
      roomId: "room-1",
      slug: "ca-1",
      position: { x: 1, y: 2.4, z: -3 },
      yaw: 0.5,
      scale: 1.2,
      custom: { glbUrl: "https://api.example/model.glb", placement: "wall", thumbnailUrl: "https://api.example/t.webp" },
      placedByUserId: "user-1",
      createdAt: new Date().toISOString()
    });
    expect(placed.custom?.placement).toBe("wall");
  });

  it("allows a create-placement request to omit the custom payload (catalog asset)", () => {
    const req = CreateWorldAssetRequestSchema.parse({
      slug: "folding-chair",
      position: { x: 0, y: 0, z: 0 },
      yaw: 0
    });
    expect(req.custom).toBeUndefined();
  });

  it("validates the upload-presign and finalize requests", () => {
    expect(
      CreateCustomAssetUploadRequestSchema.parse({
        glbFileName: "lamp.glb",
        glbContentType: "model/gltf-binary",
        thumbnailFileName: "lamp.webp",
        thumbnailContentType: "image/webp"
      }).glbContentType
    ).toBe("model/gltf-binary");

    expect(() =>
      CreateCustomAssetRequestSchema.parse({
        displayName: "Lamp",
        glbStorageKey: "k",
        glbUrl: "u",
        thumbnailStorageKey: "tk",
        thumbnailUrl: "tu",
        placement: "floor"
      })
    ).not.toThrow();
  });
});
