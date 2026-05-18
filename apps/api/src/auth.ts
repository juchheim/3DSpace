import type { FastifyRequest } from "fastify";
import { verifyToken } from "@clerk/backend";
import type { AppConfig } from "./config.js";
import { unauthorized } from "./errors.js";

export type AuthContext = {
  userId: string;
  displayName: string;
  provider: "clerk" | "dev";
};

function displayNameFromClaims(claims: Record<string, unknown> & { sub: string }) {
  if (typeof claims.name === "string" && claims.name.trim()) return claims.name.trim();
  const fromParts = [claims.given_name, claims.family_name]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .trim();
  if (fromParts) return fromParts;
  if (typeof claims.email === "string" && claims.email.trim()) return claims.email.trim();
  return claims.sub;
}

function headerValue(request: FastifyRequest, key: string) {
  const value = request.headers[key.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function bearerToken(request: FastifyRequest) {
  const authorization = headerValue(request, "authorization");
  if (!authorization?.startsWith("Bearer ")) return undefined;
  return authorization.slice("Bearer ".length).trim();
}

function hintedDisplayName(request: FastifyRequest) {
  const value = headerValue(request, "x-dev-user-name");
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function authenticate(request: FastifyRequest, config: AppConfig): Promise<AuthContext> {
  const token = bearerToken(request);

  if (config.clerkSecretKey && token && !token.startsWith("dev-")) {
    try {
      const claims = await verifyToken(token, { secretKey: config.clerkSecretKey });
      return {
        userId: claims.sub,
        displayName: hintedDisplayName(request) ?? displayNameFromClaims(claims as Record<string, unknown> & { sub: string }),
        provider: "clerk"
      };
    } catch {
      throw unauthorized("Invalid or expired Clerk session token");
    }
  }

  if (config.nodeEnv !== "production") {
    const userId = headerValue(request, "x-dev-user-id") ?? token ?? "dev-teacher";
    const displayName = headerValue(request, "x-dev-user-name") ?? userId;
    return {
      userId,
      displayName,
      provider: "dev"
    };
  }

  throw unauthorized();
}
