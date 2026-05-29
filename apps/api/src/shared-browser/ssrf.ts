import dns from "node:dns/promises";
import net from "node:net";
import { badRequest } from "../errors.js";

export type NavigationGuardSettings = {
  allowlistEnabled: boolean;
  allowlist: string[];
  blockedHostSuffixes: string[];
  /** When true, allow http:// and localhost/loopback targets (dev only). */
  allowInsecureLocal?: boolean;
};

const BLOCKED_SCHEMES = ["file:", "javascript:", "data:", "blob:", "ftp:", "ws:", "wss:"];

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").toLowerCase();
}

/** IPv4/IPv6 ranges that must never be reachable from a server-driven browser. */
function isPrivateOrReservedIp(ip: string): boolean {
  const type = net.isIP(ip);
  if (type === 4) {
    const parts = ip.split(".").map((p) => Number(p));
    const [a, b] = parts as [number, number, number, number];
    if (a === 10) return true;
    if (a === 127) return true; // loopback
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (type === 6) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true; // loopback / unspecified
    if (lower.startsWith("fe80")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      const mapped = lower.slice("::ffff:".length);
      if (net.isIP(mapped) === 4) return isPrivateOrReservedIp(mapped);
    }
    return false;
  }
  return false;
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  const h = normalizeHost(host);
  const s = normalizeHost(suffix);
  if (!s) return false;
  return h === s || h.endsWith(`.${s}`);
}

/**
 * Validate that a URL is safe for the shared browser to navigate to. Throws
 * `badRequest` (code `navigation_blocked` semantics) when rejected. Resolves the
 * hostname via DNS and blocks any answer in a private/reserved range — call this
 * for the initial navigation AND every redirect hop.
 */
export async function assertNavigationAllowed(
  rawUrl: string,
  settings: NavigationGuardSettings
): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw badRequest("navigation_blocked: invalid URL");
  }

  if (BLOCKED_SCHEMES.includes(parsed.protocol)) {
    throw badRequest(`navigation_blocked: scheme ${parsed.protocol} is not allowed`);
  }

  const isHttps = parsed.protocol === "https:";
  const isHttp = parsed.protocol === "http:";
  if (!isHttps && !(isHttp && settings.allowInsecureLocal)) {
    throw badRequest("navigation_blocked: only https:// URLs are allowed");
  }

  const host = parsed.hostname;

  for (const suffix of settings.blockedHostSuffixes) {
    if (hostMatchesSuffix(host, suffix)) {
      throw badRequest("navigation_blocked: host is blocked by policy");
    }
  }

  if (settings.allowlistEnabled) {
    const allowed = settings.allowlist.some((entry) => hostMatchesSuffix(host, entry));
    if (!allowed) throw badRequest("navigation_blocked: host is not on the room allowlist");
  }

  // If the host is a literal IP, validate it directly.
  if (net.isIP(host)) {
    if (isPrivateOrReservedIp(host) && !settings.allowInsecureLocal) {
      throw badRequest("navigation_blocked: target IP is private or reserved");
    }
    return parsed;
  }

  if ((host === "localhost" || host.endsWith(".localhost")) && !settings.allowInsecureLocal) {
    throw badRequest("navigation_blocked: localhost is not allowed");
  }

  let answers: { address: string; family: number }[];
  try {
    answers = await dns.lookup(host, { all: true });
  } catch {
    throw badRequest("navigation_blocked: host could not be resolved");
  }
  if (answers.length === 0) {
    throw badRequest("navigation_blocked: host could not be resolved");
  }
  for (const answer of answers) {
    if (isPrivateOrReservedIp(answer.address) && !settings.allowInsecureLocal) {
      throw badRequest("navigation_blocked: host resolves to a private or reserved IP");
    }
  }

  return parsed;
}

export const __testing = { isPrivateOrReservedIp, hostMatchesSuffix, normalizeHost };
