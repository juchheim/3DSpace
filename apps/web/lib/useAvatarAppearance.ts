import { useState } from "react";
import type { AvatarAppearance } from "@3dspace/contracts";
import { DEFAULT_APPEARANCE } from "../components/BlockyAvatar";

type AppearanceMap = Map<string, AvatarAppearance>;

export function useAvatarAppearance() {
  const [appearances, setAppearances] = useState<AppearanceMap>(new Map());

  function receiveAppearance(participantId: string, appearance: AvatarAppearance) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
  }

  function setLocalAppearance(participantId: string, appearance: AvatarAppearance) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
  }

  function getAppearance(participantId: string): AvatarAppearance {
    const stored = appearances.get(participantId);
    if (!stored) return DEFAULT_APPEARANCE;
    // Fill any keys absent from older stored appearances with defaults
    return { ...DEFAULT_APPEARANCE, ...stored };
  }

  return { receiveAppearance, setLocalAppearance, getAppearance };
}
