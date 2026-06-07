import { useState } from "react";
import type { AvatarBodySlug } from "@3dspace/contracts";
import { DEFAULT_AVATAR_BODY_SLUG } from "./avatarBodyCatalog";

type BodyMap = Map<string, AvatarBodySlug>;

export function useAvatarBody() {
  const [bodyByParticipant, setBodyByParticipant] = useState<BodyMap>(new Map());

  function receiveBody(participantId: string, bodySlug: AvatarBodySlug) {
    setBodyByParticipant((prev) => new Map(prev).set(participantId, bodySlug));
  }

  function setLocalBody(participantId: string, bodySlug: AvatarBodySlug) {
    setBodyByParticipant((prev) => new Map(prev).set(participantId, bodySlug));
  }

  function getBodySlug(participantId: string): AvatarBodySlug {
    return bodyByParticipant.get(participantId) ?? DEFAULT_AVATAR_BODY_SLUG;
  }

  return { receiveBody, setLocalBody, getBodySlug };
}
