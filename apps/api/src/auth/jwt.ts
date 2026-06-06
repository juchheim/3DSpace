import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { unauthorized } from "../errors.js";

export type AccessTokenClaims = {
  sub: string;
  email?: string;
  name: string;
  provider: "google" | "dev";
};

type JwtPayload = AccessTokenClaims & {
  iss: "3dspace";
  iat: number;
  exp: number;
};

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

function signInput(input: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

function parseJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  } catch {
    throw unauthorized("Invalid or expired session token");
  }
}

export function signAccessToken(
  claims: AccessTokenClaims,
  config: AppConfig
): { token: string; expiresAt: string } {
  if (!config.authJwtSecret) throw unauthorized("Authentication is not configured");

  const nowSeconds = Math.floor(Date.now() / 1000);
  const exp = nowSeconds + config.authJwtTtlSeconds;
  const header = { alg: "HS256", typ: "JWT" };
  const payload: JwtPayload = {
    ...claims,
    iss: "3dspace",
    iat: nowSeconds,
    exp
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = signInput(unsigned, config.authJwtSecret);
  return {
    token: `${unsigned}.${signature}`,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

export function verifyAccessToken(token: string, config: AppConfig): AccessTokenClaims {
  if (!config.authJwtSecret) throw unauthorized("Authentication is not configured");

  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized("Invalid or expired session token");
  const [encodedHeader, encodedPayload, signature] = parts as [string, string, string];
  const header = parseJsonSegment(encodedHeader) as { alg?: unknown; typ?: unknown };
  if (header.alg !== "HS256" || header.typ !== "JWT") throw unauthorized("Invalid or expired session token");

  const expected = signInput(`${encodedHeader}.${encodedPayload}`, config.authJwtSecret);
  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  ) {
    throw unauthorized("Invalid or expired session token");
  }

  const payload = parseJsonSegment(encodedPayload) as Partial<JwtPayload>;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    payload.iss !== "3dspace" ||
    typeof payload.sub !== "string" ||
    typeof payload.name !== "string" ||
    (payload.provider !== "google" && payload.provider !== "dev") ||
    typeof payload.exp !== "number" ||
    payload.exp <= nowSeconds
  ) {
    throw unauthorized("Invalid or expired session token");
  }

  return {
    sub: payload.sub,
    name: payload.name,
    provider: payload.provider,
    ...(typeof payload.email === "string" ? { email: payload.email } : {})
  };
}
