import type { AvatarAppearance } from "@3dspace/contracts";
import { appearanceEqualsDefault } from "./avatarZoneRegistry";

export type AvatarRecolorGateInput = {
  flagEnabled: boolean;
  appearanceCustomized: boolean;
  editorPreviewActive?: boolean;
  customizedFieldPresent?: boolean;
  appearance: AvatarAppearance;
};

export function shouldApplyAvatarRecolor(input: AvatarRecolorGateInput): boolean {
  if (!input.flagEnabled) return false;
  if (input.editorPreviewActive) return true;
  if (input.appearanceCustomized) return true;
  if (input.customizedFieldPresent === false) return false;
  if (input.customizedFieldPresent === undefined) {
    return !appearanceEqualsDefault(input.appearance);
  }
  return false;
}
