import { useState } from "react";
import { AvatarEquippedAccessoriesSchema, type AvatarEquippedAccessories } from "@3dspace/contracts";

type AccessoriesMap = Map<string, AvatarEquippedAccessories>;

export const DEFAULT_EQUIPPED_ACCESSORIES = AvatarEquippedAccessoriesSchema.parse(undefined);

export function useAvatarAccessories() {
  const [accessoriesByParticipant, setAccessoriesByParticipant] = useState<AccessoriesMap>(new Map());

  function receiveAccessories(participantId: string, accessories: AvatarEquippedAccessories) {
    setAccessoriesByParticipant((prev) => new Map(prev).set(participantId, accessories));
  }

  function setLocalAccessories(participantId: string, accessories: AvatarEquippedAccessories) {
    setAccessoriesByParticipant((prev) => new Map(prev).set(participantId, accessories));
  }

  function getAccessories(participantId: string): AvatarEquippedAccessories {
    return accessoriesByParticipant.get(participantId) ?? DEFAULT_EQUIPPED_ACCESSORIES;
  }

  return { receiveAccessories, setLocalAccessories, getAccessories };
}
