import type { FastifyRequest } from "fastify";
import { verifyToken } from "@clerk/backend";
import type { AppConfig } from "./config";
import { unauthorized } from "./errors";

export type AuthContext = {
  userId: string;
  displayName: string;
  provider: "clerk" | "dev";
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

export async function authenticate(request: FastifyRequest, config: AppConfig): Promise<AuthContext> {
  const token = bearerToken(request);

  if (config.clerkSecretKey && token && !token.startsWith("dev-")) {
    const claims = await verifyToken(token, { secretKey: config.clerkSecretKey });
    return {
      userId: claims.sub,
      displayName:
        (typeof claims.name === "string" && claims.name) ||
        (typeof claims.email === "string" && claims.email) ||
        claims.sub,
      provider: "clerk"
    };
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
