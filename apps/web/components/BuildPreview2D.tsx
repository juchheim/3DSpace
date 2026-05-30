"use client";

import type { BuildPiece, RoomManifest } from "@3dspace/contracts";
import type { BuildPlacementTarget } from "../lib/buildPlacement";
import { cellFootprintRect, wallFootprintSegment } from "../lib/buildFootprints2d";
import { buildPlacementPreviewPiece } from "../lib/buildPlacement";

export type Build2DPreview =
  | { mode: "place"; target: BuildPlacementTarget; allowed: boolean; roomId: string; userId: string }
  | { mode: "destroy"; piece: BuildPiece }
  | null;

export function BuildPreview2D({
  manifest,
  preview
}: {
  manifest: RoomManifest;
  preview: Build2DPreview;
}) {
  if (!preview) return null;

  if (preview.mode === "destroy") {
    if (preview.piece.kind === "wall") {
      const segment = wallFootprintSegment(manifest, preview.piece);
      if (!segment) return null;
      return (
        <line
          x1={segment.start.x}
          y1={segment.start.y}
          x2={segment.end.x}
          y2={segment.end.y}
          stroke="#ff6b6b"
          strokeWidth={1.6}
          strokeOpacity={0.95}
          strokeLinecap="round"
          pointerEvents="none"
        />
      );
    }
    const rect = cellFootprintRect(manifest, preview.piece.cell);
    return (
      <rect
        x={rect.x}
        y={rect.y}
        width={rect.width}
        height={rect.height}
        fill="#ff6b6b"
        fillOpacity={0.35}
        stroke="#ff4040"
        strokeWidth={0.6}
        pointerEvents="none"
      />
    );
  }

  const piece = buildPlacementPreviewPiece(preview.roomId, preview.target, preview.userId);
  const valid = preview.allowed;
  const stroke = valid ? "#6dff9a" : "#ff6b6b";
  const fillOpacity = valid ? 0.32 : 0.38;

  if (preview.target.kind === "wall") {
    const segment = wallFootprintSegment(manifest, piece);
    if (!segment) return null;
    return (
      <line
        x1={segment.start.x}
        y1={segment.start.y}
        x2={segment.end.x}
        y2={segment.end.y}
        stroke={stroke}
        strokeWidth={1.8}
        strokeOpacity={0.95}
        strokeLinecap="round"
        pointerEvents="none"
      />
    );
  }

  const rect = cellFootprintRect(manifest, preview.target.cell);
  return (
    <rect
      x={rect.x}
      y={rect.y}
      width={rect.width}
      height={rect.height}
      fill={stroke}
      fillOpacity={fillOpacity}
      stroke={stroke}
      strokeWidth={0.55}
      strokeDasharray={valid ? undefined : "1.2 0.8"}
      pointerEvents="none"
    />
  );
}
