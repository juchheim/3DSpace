import { useState } from "react";
import type { AvatarAppearance } from "@3dspace/contracts";
import { DEFAULT_APPEARANCE } from "./avatarAppearance";
import { appearanceEqualsDefault } from "./avatarZoneRegistry";

type AppearanceMap = Map<string, AvatarAppearance>;
type CustomizedMap = Map<string, boolean>;

export function useAvatarAppearance() {
  const [appearances, setAppearances] = useState<AppearanceMap>(new Map());
  const [customizedByParticipant, setCustomizedByParticipant] = useState<CustomizedMap>(new Map());

  function receiveAppearance(participantId: string, appearance: AvatarAppearance, customized?: boolean) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
    setCustomizedByParticipant((prev) => {
      const next = new Map(prev);
      next.set(participantId, customized ?? !appearanceEqualsDefault(appearance));
      return next;
    });
  }

  function setLocalAppearance(participantId: string, appearance: AvatarAppearance, customized = false) {
    setAppearances(prev => new Map(prev).set(participantId, appearance));
    setCustomizedByParticipant((prev) => new Map(prev).set(participantId, customized));
  }

  function getAppearance(participantId: string): AvatarAppearance {
    const stored = appearances.get(participantId);
    if (!stored) return DEFAULT_APPEARANCE;
    // Fill any keys absent from older stored appearances with defaults
    return { ...DEFAULT_APPEARANCE, ...stored };
  }

  function getAppearanceCustomized(participantId: string): boolean {
    return customizedByParticipant.get(participantId) ?? false;
  }

  return { receiveAppearance, setLocalAppearance, getAppearance, getAppearanceCustomized };
}
