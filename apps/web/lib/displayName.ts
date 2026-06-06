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
