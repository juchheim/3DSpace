import type { FastifyRequest } from "fastify";
import type { AppConfig } from "../config.js";

export function normalizeRequestOrigin(origin: string) {
  return origin.trim().replace(/\/+$/, "");
}

export function originAllowed(origin: string, allowedOrigins: AppConfig["corsAllowedOrigins"]) {
  const normalizedOrigin = normalizeRequestOrigin(origin);
  return allowedOrigins.some((allowedOrigin) =>
    typeof allowedOrigin === "string"
      ? normalizeRequestOrigin(allowedOrigin) === normalizedOrigin
      : allowedOrigin.test(normalizedOrigin)
  );
}

/** CORS response headers for hijacked streams (bypass @fastify/cors). */
export function corsHeadersForRequest(
  request: FastifyRequest,
  config: AppConfig
): Record<string, string> {
  const origin = request.headers.origin;
  if (!origin || typeof origin !== "string") return {};
  if (!originAllowed(origin, config.corsAllowedOrigins)) return {};
  return {
    "access-control-allow-origin": origin,
    vary: "Origin"
  };
}
