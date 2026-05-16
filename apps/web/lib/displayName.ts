type ClerkUserLike = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  username?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
};

export function resolveClerkDisplayName(user: ClerkUserLike | null | undefined, fallbackId?: string) {
  if (!user) return fallbackId ?? "Guest";
  const fromParts = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  if (user.fullName?.trim()) return user.fullName.trim();
  const email = user.primaryEmailAddress?.emailAddress?.trim();
  if (email) return email;
  if (user.username?.trim()) return user.username.trim();
  return fallbackId ?? user.id;
}

export function isOpaqueParticipantLabel(value: string, participantId: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (trimmed === participantId) return true;
  if (trimmed.includes(":")) return true;
  return /^user_[A-Za-z0-9]+$/.test(trimmed);
}

export function pickDisplayName(participantId: string, ...candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && !isOpaqueParticipantLabel(trimmed, participantId)) return trimmed;
  }
  return candidates.find((candidate) => candidate?.trim())?.trim() || participantId;
}
