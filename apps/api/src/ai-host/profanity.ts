const PROFANITY_BLOCKLIST = new Set(["ass", "damn", "fuck", "shit"]);

/** Returns true when the normalized display name contains a blocked word as a token. */
export function displayNameContainsProfanity(normalizedName: string): boolean {
  const lowered = normalizedName.toLowerCase();
  for (const word of PROFANITY_BLOCKLIST) {
    const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${word}(?:[^\\p{L}\\p{N}]|$)`, "iu");
    if (pattern.test(lowered)) return true;
  }
  return false;
}
