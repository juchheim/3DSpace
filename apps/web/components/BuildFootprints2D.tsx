"use client";

import type { BuildPiece, RoomManifest } from "@3dspace/contracts";
import {
  buildMaterialStroke,
  floorFootprintRect,
  levelFillOpacity,
  rampFootprintArrow,
  wallFootprintSegment
} from "../lib/buildFootprints2d";

export function BuildFootprints2D({
  manifest,
  pieces
}: {
  manifest: RoomManifest;
  pieces: BuildPiece[];
}) {
  if (pieces.length === 0) return null;

  return (
    <g className="build-footprints-2d" aria-label="Build pieces" pointerEvents="none">
      {pieces.map((piece) => {
        const stroke = buildMaterialStroke(piece.materialId);
        const opacity = levelFillOpacity(piece.level);

        if (piece.kind === "floor") {
          const rect = floorFootprintRect(manifest, piece);
          return (
            <rect
              key={piece.id}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={stroke}
              fillOpacity={opacity}
              stroke={stroke}
              strokeWidth={0.35}
              strokeOpacity={0.9}
            />
          );
        }

        if (piece.kind === "wall" || piece.kind === "doorway" || piece.kind === "window") {
          const segment = wallFootprintSegment(manifest, piece);
          if (!segment) return null;
          return (
            <line
              key={piece.id}
              x1={segment.start.x}
              y1={segment.start.y}
              x2={segment.end.x}
              y2={segment.end.y}
              stroke={stroke}
              strokeWidth={1.1}
              strokeOpacity={0.95}
              strokeLinecap="round"
            />
          );
        }

        const arrow = rampFootprintArrow(manifest, piece);
        if (!arrow) return null;
        const dx = arrow.tip.x - arrow.tail.x;
        const dy = arrow.tip.y - arrow.tail.y;
        const len = Math.hypot(dx, dy) || 1;
        const head = 1.4;
        const ux = dx / len;
        const uy = dy / len;
        const leftX = arrow.tip.x - ux * head - uy * (head * 0.55);
        const leftY = arrow.tip.y - uy * head + ux * (head * 0.55);
        const rightX = arrow.tip.x - ux * head + uy * (head * 0.55);
        const rightY = arrow.tip.y - uy * head - ux * (head * 0.55);

        return (
          <g key={piece.id} stroke={stroke} strokeWidth={0.9} strokeOpacity={0.95} fill={stroke} fillOpacity={opacity}>
            <line x1={arrow.tail.x} y1={arrow.tail.y} x2={arrow.tip.x} y2={arrow.tip.y} strokeLinecap="round" />
            <polygon points={`${arrow.tip.x},${arrow.tip.y} ${leftX},${leftY} ${rightX},${rightY}`} />
          </g>
        );
      })}
    </g>
  );
}
