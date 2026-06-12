"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useTexture } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from "three";
import type { BuildPiece } from "@3dspace/contracts";
import { BUILD_FLOOR_THICKNESS, BUILD_LEVEL_HEIGHT, buildCellFootprint } from "@3dspace/room-engine";
import { imageFloorUvAt, type ImageFloorRegion, uniqueImageFloorRegions } from "../lib/imageFloorRegions";
import { imageFloorTextureUrl } from "../lib/imageFloorTexture";

/** Lift above the slab so the textured top does not z-fight. */
export const IMAGE_FLOOR_TOP_LIFT = 0.002;

function buildRegionTopGeometry(region: ImageFloorRegion, pieceById: Map<string, BuildPiece>) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let vertexOffset = 0;

  for (const pieceId of region.pieceIds) {
    const piece = pieceById.get(pieceId);
    if (!piece) continue;

    const footprint = buildCellFootprint(piece.cell.ix, piece.cell.iz);
    const y = piece.level * BUILD_LEVEL_HEIGHT + BUILD_FLOOR_THICKNESS + IMAGE_FLOOR_TOP_LIFT;
    const corners: Array<[number, number]> = [
      [footprint.minX, footprint.minZ],
      [footprint.maxX, footprint.minZ],
      [footprint.maxX, footprint.maxZ],
      [footprint.minX, footprint.maxZ]
    ];

    for (const [x, z] of corners) {
      positions.push(x, y, z);
      const { u, v } = imageFloorUvAt(region, x, z);
      uvs.push(u, v);
    }

    indices.push(
      vertexOffset,
      vertexOffset + 2,
      vertexOffset + 1,
      vertexOffset,
      vertexOffset + 3,
      vertexOffset + 2
    );
    vertexOffset += 4;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** One merged textured top per connected image-floor region (one texture load per region). */
function ImageFloorRegionTop({
  region,
  pieceById
}: {
  region: ImageFloorRegion;
  pieceById: Map<string, BuildPiece>;
}) {
  const texture = useTexture(imageFloorTextureUrl(region.textureStorageKey!));

  useEffect(() => {
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  const geometry = useMemo(() => buildRegionTopGeometry(region, pieceById), [pieceById, region]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial map={texture} roughness={0.85} metalness={0.05} />
    </mesh>
  );
}

export function ImageFloorRegionTopLayer({
  regions,
  pieces
}: {
  regions: Map<string, ImageFloorRegion>;
  pieces: BuildPiece[];
}) {
  const uniqueRegions = useMemo(() => uniqueImageFloorRegions(regions), [regions]);
  const pieceById = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces]);

  return (
    <>
      {uniqueRegions.map((region) =>
        region.textureStorageKey ? (
          <Suspense key={region.regionId} fallback={null}>
            <ImageFloorRegionTop region={region} pieceById={pieceById} />
          </Suspense>
        ) : null
      )}
    </>
  );
}
