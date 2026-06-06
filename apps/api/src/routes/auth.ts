import type { FastifyInstance } from "fastify";
import {
  AuthMeResponseSchema,
  AuthSessionExchangeRequestSchema,
  AuthSessionExchangeResponseSchema,
  AuthSessionRefreshRequestSchema,
  AuthSessionRefreshResponseSchema
} from "@3dspace/contracts";
import type { AppContext } from "../app-context.js";
import { authEmailNotVerified, authOAuthFailed, authOAuthStateInvalid, authSessionExpired } from "../errors.js";
import { requireUser } from "../http/auth-guards.js";
import { authConfigured } from "../config.js";
import { isEmailDomainAllowed } from "../auth/domains.js";
import { buildGoogleAuthUrl, exchangeGoogleCode, randomToken, verifyGoogleIdToken } from "../auth/google-oauth.js";
import { signAccessToken } from "../auth/jwt.js";
import { createRefreshSession, revokeRefreshSession, rotateRefreshSession } from "../auth/refresh-sessions.js";
import { consumeExchangeCode, createExchangeCode } from "../auth/session-exchange.js";
import type { AuthContext } from "../auth.js";
import { authDomainNotAllowed } from "../errors.js";

function safeReturnTo(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function completeRedirect(appUrl: string, params: Record<string, string>) {
  const url = new URL(`${appUrl}/auth/complete`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function signInRedirect(appUrl: string, error: string) {
  const url = new URL(`${appUrl}/sign-in`);
  url.searchParams.set("error", error);
  return url.toString();
}

async function signSession(ctx: AppContext, auth: Pick<AuthContext, "userId" | "displayName" | "email" | "provider">) {
  const access = signAccessToken(
    {
      sub: auth.userId,
      name: auth.displayName,
      provider: auth.provider,
      ...(auth.email ? { email: auth.email } : {})
    },
    ctx.config
  );
  const refresh = await createRefreshSession(ctx.repository, ctx.config, { userId: auth.userId });
  return {
    accessToken: access.token,
    expiresAt: access.expiresAt,
    refreshToken: refresh.refreshToken,
    refreshExpiresAt: refresh.refreshExpiresAt
  };
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.get("/v1/auth/google/start", async (request, reply) => {
    if (!authConfigured(ctx.config)) throw authOAuthFailed("Google sign-in is not configured.");
    const query = request.query as { returnTo?: string };
    const now = new Date();
    const state = randomToken(32);
    const codeVerifier = randomToken(64);
    await ctx.repository.createOAuthState({
      state,
      codeVerifier,
      returnTo: safeReturnTo(query.returnTo),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + ctx.config.authOAuthStateTtlSeconds * 1000).toISOString()
    });
    return reply.redirect(buildGoogleAuthUrl({ config: ctx.config, state, codeVerifier }));
  });

  app.get("/v1/auth/google/callback", async (request, reply) => {
    const query = request.query as { code?: string; state?: string; error?: string };
    try {
      if (query.error) throw authOAuthFailed(query.error);
      if (!query.code || !query.state) throw authOAuthStateInvalid();
      const oauthState = await ctx.repository.consumeOAuthState(query.state);
      if (!oauthState) throw authOAuthStateInvalid();

      const idToken = await exchangeGoogleCode({
        config: ctx.config,
        code: query.code,
        codeVerifier: oauthState.codeVerifier
      });
      const profile = await verifyGoogleIdToken(idToken, ctx.config);
      if (!profile.emailVerified) throw authEmailNotVerified();
      if (!isEmailDomainAllowed(profile.email, ctx.config.authAllowedEmailDomains)) {
        throw authDomainNotAllowed();
      }

      const auth: AuthContext = {
        userId: `google:${profile.sub}`,
        displayName: profile.name,
        email: profile.email,
        provider: "google",
        lastLoginAt: new Date().toISOString()
      };
      await ctx.repository.ensureUser(auth);
      const code = await createExchangeCode(ctx.repository, ctx.config, auth);
      return reply.redirect(completeRedirect(ctx.config.appUrl, { code, returnTo: oauthState.returnTo }));
    } catch (error) {
      const code = typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : "auth-oauth-failed";
      request.log.warn({ error }, "Google OAuth callback failed");
      return reply.redirect(signInRedirect(ctx.config.appUrl, code));
    }
  });

  app.post("/v1/auth/session/exchange", async (request) => {
    const body = AuthSessionExchangeRequestSchema.parse(request.body);
    const exchange = await consumeExchangeCode(ctx.repository, body.code);
    const session = await signSession(ctx, {
      userId: exchange.userId,
      displayName: exchange.displayName,
      ...(exchange.email ? { email: exchange.email } : {}),
      provider: "google"
    });
    return AuthSessionExchangeResponseSchema.parse({
      ...session,
      user: {
        id: exchange.userId,
        displayName: exchange.displayName,
        ...(exchange.email ? { email: exchange.email } : {})
      }
    });
  });

  app.post("/v1/auth/session/refresh", async (request) => {
    const body = AuthSessionRefreshRequestSchema.parse(request.body);
    const refresh = await rotateRefreshSession(ctx.repository, ctx.config, body.refreshToken);
    const user = await ctx.repository.getUser(refresh.session.userId);
    if (!user) throw authSessionExpired();
    const access = signAccessToken(
      {
        sub: user.id,
        name: user.displayName,
        provider: user.authProvider === "google" ? "google" : "dev",
        ...(user.email ? { email: user.email } : {})
      },
      ctx.config
    );
    return AuthSessionRefreshResponseSchema.parse({
      accessToken: access.token,
      expiresAt: access.expiresAt,
      refreshToken: refresh.refreshToken,
      refreshExpiresAt: refresh.refreshExpiresAt
    });
  });

  app.get("/v1/auth/me", async (request) => {
    const auth = await requireUser(request, ctx.config, ctx.repository);
    return AuthMeResponseSchema.parse({
      user: {
        id: auth.userId,
        displayName: auth.displayName,
        ...(auth.email ? { email: auth.email } : {})
      }
    });
  });

  app.post("/v1/auth/logout", async (request) => {
    const body = AuthSessionRefreshRequestSchema.parse(request.body);
    await revokeRefreshSession(ctx.repository, body.refreshToken);
    return { ok: true as const };
  });
}
