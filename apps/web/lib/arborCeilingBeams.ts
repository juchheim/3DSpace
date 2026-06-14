import { BUILD_CELL_SIZE, BUILD_LEVEL_HEIGHT } from "@3dspace/room-engine";

/** Thin trellis beam cross-section (m). */
const BEAM_THICK = 0.1;
const BEAM_HEIGHT = 0.12;
/** Clear square at the cell center where sky light passes through (m). */
const OPEN_HALF = 0.38;

export type ArborCeilingBeam = {
  position: [number, number, number];
  size: [number, number, number];
};

/** Procedural pergola beams for one 2×2 m cell — perimeter frame plus partial cross members. */
export function arborCeilingBeams(): ArborCeilingBeam[] {
  const half = BUILD_CELL_SIZE / 2;
  const inset = BEAM_THICK / 2;
  const span = BUILD_CELL_SIZE - BEAM_THICK;
  const y = BUILD_LEVEL_HEIGHT - BEAM_HEIGHT / 2;
  const armLen = half - inset - OPEN_HALF;

  if (armLen <= 0.05) return [];

  const beams: ArborCeilingBeam[] = [
    { position: [0, y, half - inset], size: [span, BEAM_HEIGHT, BEAM_THICK] },
    { position: [0, y, -half + inset], size: [span, BEAM_HEIGHT, BEAM_THICK] },
    { position: [half - inset, y, 0], size: [BEAM_THICK, BEAM_HEIGHT, span] },
    { position: [-half + inset, y, 0], size: [BEAM_THICK, BEAM_HEIGHT, span] },
    { position: [0, y, half - inset - armLen / 2], size: [BEAM_THICK, BEAM_HEIGHT, armLen] },
    { position: [0, y, -(half - inset - armLen / 2)], size: [BEAM_THICK, BEAM_HEIGHT, armLen] },
    { position: [half - inset - armLen / 2, y, 0], size: [armLen, BEAM_HEIGHT, BEAM_THICK] },
    { position: [-(half - inset - armLen / 2), y, 0], size: [armLen, BEAM_HEIGHT, BEAM_THICK] }
  ];

  return beams;
}
