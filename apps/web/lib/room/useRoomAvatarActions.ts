"use client";

import { useCallback, type MutableRefObject } from "react";
import type {
  AvatarAppearance,
  AvatarBodySlug,
  AvatarEquippedAccessories
} from "@3dspace/contracts";
import { clearAvatarAppearance, patchAvatarAppearance, patchAvatarAccessories, patchAvatarBody } from "../api";
import { DEFAULT_APPEARANCE } from "../avatarAppearance";
import type { ApiIdentity } from "../identity";
import type { RealtimeMessage } from "../realtime";

type UseRoomAvatarActionsInput = {
  identity: ApiIdentity;
  participantId?: string | undefined;
  localAppearanceRef: MutableRefObject<AvatarAppearance>;
  localAppearanceCustomizedRef: MutableRefObject<boolean>;
  localAccessoriesRef: MutableRefObject<AvatarEquippedAccessories>;
  localBodySlugRef: MutableRefObject<AvatarBodySlug>;
  setLocalAppearance(participantId: string, appearance: AvatarAppearance, customized: boolean): void;
  setLocalAccessories(participantId: string, accessories: AvatarEquippedAccessories): void;
  setLocalBody(participantId: string, bodySlug: AvatarBodySlug): void;
  publishRealtime(message: RealtimeMessage): void;
};

export function useRoomAvatarActions({
  identity,
  participantId,
  localAppearanceRef,
  localAppearanceCustomizedRef,
  localAccessoriesRef,
  localBodySlugRef,
  setLocalAppearance,
  setLocalAccessories,
  setLocalBody,
  publishRealtime
}: UseRoomAvatarActionsInput) {
  const resetToDefaultSkin = useCallback(async () => {
    if (!participantId) return;
    await clearAvatarAppearance(identity);
    localAppearanceRef.current = DEFAULT_APPEARANCE;
    localAppearanceCustomizedRef.current = false;
    setLocalAppearance(participantId, DEFAULT_APPEARANCE, false);
    publishRealtime({
      type: "avatar.appearance.v1",
      participantId,
      appearance: DEFAULT_APPEARANCE,
      customized: false
    });
  }, [
    identity,
    localAppearanceCustomizedRef,
    localAppearanceRef,
    participantId,
    publishRealtime,
    setLocalAppearance
  ]);

  const saveAppearance = useCallback(
    async (appearance: AvatarAppearance) => {
      if (!participantId) return;
      await patchAvatarAppearance(identity, appearance);
      localAppearanceRef.current = appearance;
      localAppearanceCustomizedRef.current = true;
      setLocalAppearance(participantId, appearance, true);
      publishRealtime({
        type: "avatar.appearance.v1",
        participantId,
        appearance,
        customized: true
      });
    },
    [
      identity,
      localAppearanceCustomizedRef,
      localAppearanceRef,
      participantId,
      publishRealtime,
      setLocalAppearance
    ]
  );

  const saveAccessories = useCallback(
    async (accessories: AvatarEquippedAccessories) => {
      if (!participantId) return;
      await patchAvatarAccessories(identity, accessories);
      localAccessoriesRef.current = accessories;
      setLocalAccessories(participantId, accessories);
      publishRealtime({
        type: "avatar.accessories.v1",
        participantId,
        accessories
      });
    },
    [identity, localAccessoriesRef, participantId, publishRealtime, setLocalAccessories]
  );

  const saveBody = useCallback(
    async (bodySlug: AvatarBodySlug) => {
      if (!participantId) return;
      await patchAvatarBody(identity, bodySlug);
      localBodySlugRef.current = bodySlug;
      setLocalBody(participantId, bodySlug);
      publishRealtime({
        type: "avatar.body.v1",
        participantId,
        bodySlug
      });
    },
    [identity, localBodySlugRef, participantId, publishRealtime, setLocalBody]
  );

  return {
    resetToDefaultSkin,
    saveAppearance,
    saveAccessories,
    saveBody
  };
}
