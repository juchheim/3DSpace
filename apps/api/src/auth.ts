import type { FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";
import { unauthorized } from "./errors.js";
import { verifyAccessToken } from "./auth/jwt.js";

export type AuthContext = {
  userId: string;
  displayName: string;
  email?: string;
  provider: "google" | "dev";
  lastLoginAt?: string;
};

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

  if (config.authJwtSecret && token && !token.startsWith("dev-")) {
    try {
      const claims = verifyAccessToken(token, config);
      return {
        userId: claims.sub,
        displayName: hintedDisplayName(request) ?? claims.name,
        ...(claims.email ? { email: claims.email } : {}),
        provider: claims.provider
      };
    } catch {
      throw unauthorized("Invalid or expired session token");
    }
  }

  if (config.nodeEnv !== "production") {
    const userId = headerValue(request, "x-dev-user-id") ?? token ?? "dev-teacher";
    const displayName = headerValue(request, "x-dev-user-name") ?? userId;
    return {
      userId,
      displayName,
      ...(typeof headerValue(request, "x-dev-user-email") === "string"
        ? { email: headerValue(request, "x-dev-user-email") as string }
        : {}),
      provider: "dev"
    };
  }

  throw unauthorized();
}
