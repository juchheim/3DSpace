import type { ClassroomBoardAccessGrant } from "@3dspace/contracts";

export function isBoardGrantActive(grant: ClassroomBoardAccessGrant, now = Date.now()) {
  if (grant.status !== "active") return false;
  if (!grant.expiresAt) return true;
  const expiresAt = Date.parse(grant.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt > now;
}
