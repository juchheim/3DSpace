export function parseAllowedEmailDomains(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ""))
        .filter(Boolean)
    )
  ];
}

export function emailDomain(email: string): string | undefined {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 1 || at === trimmed.length - 1) return undefined;
  return trimmed.slice(at + 1);
}

export function isEmailDomainAllowed(email: string, allowedDomains: string[]): boolean {
  const domain = emailDomain(email);
  return Boolean(domain && allowedDomains.includes(domain));
}
