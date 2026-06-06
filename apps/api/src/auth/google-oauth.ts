import crypto from "node:crypto";
import type { AppConfig } from "../config.js";
import { authOAuthFailed } from "../errors.js";

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function codeChallenge(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function googleRedirectUri(config: AppConfig) {
  return `${config.apiPublicUrl.replace(/\/+$/, "")}/v1/auth/google/callback`;
}

export function buildGoogleAuthUrl(input: {
  config: AppConfig;
  state: string;
  codeVerifier: string;
}) {
  if (!input.config.googleOAuthClientId) throw authOAuthFailed("Google sign-in is not configured.");

  const params = new URLSearchParams({
    client_id: input.config.googleOAuthClientId,
    redirect_uri: googleRedirectUri(input.config),
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    code_challenge: codeChallenge(input.codeVerifier),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "select_account"
  });

  if (input.config.authGoogleHostedDomainHint) {
    params.set("hd", input.config.authGoogleHostedDomainHint);
  }

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function readGoogleJson(response: Response) {
  const payload = await response.json().catch(() => undefined) as Record<string, unknown> | undefined;
  if (!response.ok) {
    const message = typeof payload?.error_description === "string"
      ? payload.error_description
      : typeof payload?.error === "string"
        ? payload.error
        : "Google sign-in failed. Try again.";
    throw authOAuthFailed(message);
  }
  return payload ?? {};
}

export async function exchangeGoogleCode(input: {
  config: AppConfig;
  code: string;
  codeVerifier: string;
}) {
  if (!input.config.googleOAuthClientId || !input.config.googleOAuthClientSecret) {
    throw authOAuthFailed("Google sign-in is not configured.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: input.config.googleOAuthClientId,
      client_secret: input.config.googleOAuthClientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(input.config)
    })
  });
  const payload = await readGoogleJson(response);
  if (typeof payload.id_token !== "string") throw authOAuthFailed();
  return payload.id_token;
}

export async function verifyGoogleIdToken(idToken: string, config: AppConfig): Promise<GoogleProfile> {
  if (!config.googleOAuthClientId) throw authOAuthFailed("Google sign-in is not configured.");

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  const payload = await readGoogleJson(response);
  const aud = payload.aud;
  const issuer = payload.iss;
  const exp = typeof payload.exp === "string" ? Number(payload.exp) : payload.exp;
  const email = typeof payload.email === "string" ? payload.email : "";
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  const name = typeof payload.name === "string" && payload.name.trim()
    ? payload.name.trim()
    : email.split("@")[0] || sub;
  const emailVerified = payload.email_verified === true || payload.email_verified === "true";

  if (
    aud !== config.googleOAuthClientId ||
    (issuer !== "accounts.google.com" && issuer !== "https://accounts.google.com") ||
    typeof exp !== "number" ||
    exp <= Math.floor(Date.now() / 1000) ||
    !email ||
    !sub
  ) {
    throw authOAuthFailed();
  }

  return { sub, email, emailVerified, name };
}
