// ── Dream IXR Verses ──────────────────────────────────────────────────────────
// Single source of truth for the six themed worlds ("Verses") that organize the
// platform. Branding, color keys (hue), prefill defaults, and the per-verse 3D
// galaxy configuration all live here so the lobby and the in-room theming stay in
// sync. See dream-IXR-verses/Lobby Redesign.html for the original design values.

import { verseRoomTypeFromVerseId, type RoomType } from "@3dspace/contracts";

/** Per-verse galaxy structure for the 3D orb on the verse card. */
export type VerseGalaxy = {
  arms: number;
  spin: number;
  speed: number;
  dir: 1 | -1;
  tilt: number;
  scatter: number;
  count: number;
  psize: number;
};

export type Verse = {
  /** Stable id used in URLs (`?verse=<id>`) and lookups. */
  id: string;
  /** Display name, e.g. "SkillVerse" (the "IXR" suffix is rendered separately). */
  name: string;
  /** Short uppercase tag shown on the verse card. */
  tag: string;
  /** One-line description shown on the verse card. */
  desc: string;
  /** OKLCH hue (degrees) — the verse's color key. */
  hue: number;
  /** Prefill for the class name field when creating a room in this verse. */
  defaultClass: string;
  /** Prefill for the room name field when creating a room in this verse. */
  defaultRoom: string;
  /** 3D galaxy configuration for the verse card orb. */
  galaxy: VerseGalaxy;
};

// DOM order is significant: it matches the design's verse-grid + galaxy CONFIGS.
export const VERSES: Verse[] = [
  {
    id: "skill",
    name: "SkillVerse",
    tag: "Digital skills",
    desc: "Digital skills, AI, WebXR, and career-training labs that turn curiosity into capability.",
    hue: 255,
    defaultClass: "Digital Skills 101",
    defaultRoom: "WebXR Lab",
    galaxy: { arms: 3, spin: 3.1, speed: 0.52, dir: 1, tilt: 0.78, scatter: 0.3, count: 2600, psize: 0.078 }
  },
  {
    id: "culture",
    name: "CultureVerse",
    tag: "Heritage & language",
    desc: "Culture, heritage, language, and global exchange spaces that connect communities.",
    hue: 195,
    defaultClass: "Cultural Studies",
    defaultRoom: "Heritage Exchange",
    galaxy: { arms: 4, spin: 2.3, speed: 0.46, dir: -1, tilt: 0.66, scatter: 0.34, count: 2800, psize: 0.074 }
  },
  {
    id: "creator",
    name: "CreatorVerse",
    tag: "Art & media",
    desc: "Art, media, storytelling, music, and design studios for creative production.",
    hue: 305,
    defaultClass: "Creative Media",
    defaultRoom: "Design Studio",
    galaxy: { arms: 2, spin: 4.4, speed: 0.58, dir: 1, tilt: 0.92, scatter: 0.26, count: 2400, psize: 0.082 }
  },
  {
    id: "food",
    name: "FoodVerse",
    tag: "Culinary arts",
    desc: "Culinary arts, food culture, and recipe storytelling brought vividly to life.",
    hue: 160,
    defaultClass: "Culinary Arts",
    defaultRoom: "Recipe Showcase",
    galaxy: { arms: 5, spin: 1.9, speed: 0.62, dir: -1, tilt: 0.58, scatter: 0.4, count: 3000, psize: 0.072 }
  },
  {
    id: "mondi",
    name: "MondiVerse",
    tag: "Global learning",
    desc: "Global learning, language practice, and international collaboration rooms.",
    hue: 225,
    defaultClass: "Global Learning",
    defaultRoom: "Language Exchange",
    galaxy: { arms: 11, spin: 1.1, speed: 0.4, dir: 1, tilt: 0.74, scatter: 0.62, count: 3200, psize: 0.066 }
  },
  {
    id: "work",
    name: "WorkVerse",
    tag: "Workforce",
    desc: "Workforce training, entrepreneurship, and paid project simulations.",
    hue: 280,
    defaultClass: "Workforce Training",
    defaultRoom: "Career Simulation",
    galaxy: { arms: 2, spin: 3.6, speed: 0.3, dir: -1, tilt: 0.88, scatter: 0.24, count: 2400, psize: 0.084 }
  }
];

/** Look up a verse by its id. */
export function verseById(id: string | null | undefined): Verse | null {
  if (!id) return null;
  return VERSES.find((v) => v.id === id) ?? null;
}

/** Room type slug for a verse's blank base canvas (e.g. SkillVerse → `skill-verse`). */
export function verseRoomType(verse: Verse): RoomType {
  const roomType = verseRoomTypeFromVerseId(verse.id);
  if (!roomType) throw new Error(`No room type mapped for verse id: ${verse.id}`);
  return roomType;
}

/**
 * The class name that holds a verse's rooms. A room's verse is persisted by
 * placing it in a class with this exact name (no backend schema change needed).
 */
export function verseClassName(verse: Verse): string {
  return `${verse.name} IXR`;
}

/** Reverse of {@link verseClassName}: map a class name back to its verse. */
export function verseFromClassName(name: string | null | undefined): Verse | null {
  if (!name) return null;
  return VERSES.find((v) => verseClassName(v) === name) ?? null;
}

/** CSS custom properties for theming the lobby access region to a verse. */
export function verseThemeVars(hue: number): Record<string, string> {
  return {
    "--vsel": `oklch(0.72 0.18 ${hue})`,
    "--vacc": `oklch(0.60 0.19 ${hue})`,
    "--vblu": `oklch(0.72 0.17 ${hue})`
  };
}

/** CSS custom properties that recolor the in-room HUD to a verse's color key. */
export function verseRoomThemeVars(hue: number): Record<string, string> {
  return {
    "--hud-acc": `oklch(0.60 0.19 ${hue})`,
    "--hud-blu": `oklch(0.72 0.17 ${hue})`
  };
}
