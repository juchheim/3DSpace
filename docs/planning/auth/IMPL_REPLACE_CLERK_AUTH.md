# Implementation — Replace Clerk with Google SSO

Plan: [`./PLAN_REPLACE_CLERK_AUTH.md`](./PLAN_REPLACE_CLERK_AUTH.md)
Branch target: `feature/google-sso-auth`
Last updated: 2026-06-06

---

## Status / Scope

- **Auth providers (v1):** Google OAuth only.
- **Access control:** `AUTH_ALLOWED_EMAIL_DOMAINS` enforced server-side on verified Google email (exact domain match; no subdomain wildcards in v1).
- **Session:** First-party HS256 **access JWT** + **refresh tokens** (v1 — see plan §13).
- **Clerk cutover:** **Strategy A (clean break)** — new `google:{sub}` user ids; no email-link migration script (plan §13).
- **Profile photos:** Deferred — keep generated initials/color avatars only (plan §13).
- **Dev/E2E:** Preserve header-based dev auth when OAuth env unset or `NEXT_PUBLIC_E2E_DEV_AUTH=true`.

This doc is written for phase-by-phase execution. Each phase is independently testable.

### Locked decisions (from plan §13)

| Question | Decision | IMPL impact |
| --- | --- | --- |
| Refresh tokens in v1? | **Yes** | Phases 1–2 ship refresh + silent renew; not deferred |
| Profile photos from Google? | Defer | No `pictureUrl` work in v1 |
| Subdomain allowlist? | Exact-match only | `domains.ts` stays simple; no suffix matching |
| Clerk user migration? | **Strategy A** | No migration script; Phase 6 removed |

---

## Codebase context (pre-implementation)

Confirmed by reading the tree on 2026-06-06:

| Area | Location | Notes |
| --- | --- | --- |
| API auth | [`apps/api/src/auth.ts`](../../../apps/api/src/auth.ts) | Clerk `verifyToken`; dev fallback |
| Auth guards | [`apps/api/src/http/auth-guards.ts`](../../../apps/api/src/http/auth-guards.ts) | `requireAuth` → `ensureUser` |
| Config | [`apps/api/src/config.ts`](../../../apps/api/src/config.ts) | `clerkSecretKey`, `clerkWebhookSecret` |
| Ready check | [`apps/api/src/routes/ops.ts`](../../../apps/api/src/routes/ops.ts) | Reports Clerk configured |
| User upsert | [`apps/api/src/models/mongoose.ts`](../../../apps/api/src/models/mongoose.ts) L908 | `id` / `externalAuthId` = auth.userId |
| Contracts | [`packages/contracts/src/index.ts`](../../../packages/contracts/src/index.ts) | `UserSchema` — no email yet |
| Web auth | [`apps/web/lib/auth.tsx`](../../../apps/web/lib/auth.tsx) | ClerkProvider bridge |
| Identity hook | [`apps/web/lib/usePersistentIdentity.ts`](../../../apps/web/lib/usePersistentIdentity.ts) | Merges Clerk + dev role |
| API client | [`apps/web/lib/api.ts`](../../../apps/web/lib/api.ts) | `getAuthToken()` → Bearer header |
| Middleware | [`apps/web/proxy.ts`](../../../apps/web/proxy.ts) | `clerkMiddleware` |
| Sign-in/up | [`apps/web/app/sign-in/`](../../../apps/web/app/sign-in/), [`sign-up/`](../../../apps/web/app/sign-up/) | Clerk components |
| Lobby gates | [`apps/web/components/Lobby.tsx`](../../../apps/web/components/Lobby.tsx), [`RoomClient.tsx`](../../../apps/web/components/RoomClient.tsx) | `clerkEnabled` checks |
| Display name | [`apps/web/lib/displayName.ts`](../../../apps/web/lib/displayName.ts) | `resolveClerkDisplayName` — generalize |
| E2E bypass | [`apps/web/lib/config.ts`](../../../apps/web/lib/config.ts) | `NEXT_PUBLIC_E2E_DEV_AUTH` clears Clerk key |

**Clerk webhook:** Not implemented in API despite `CLERK_WEBHOOK_SECRET` in config — safe to delete with Clerk.

---

## Design decisions locked for this implementation

1. **OAuth callback on the API** — client secret never shipped to the browser.
2. **User id = `google:{sub}`** — distinct from legacy Clerk `user_*` and dev ids (**Strategy A**; no linking by email).
3. **Domain allowlist is exact-match** on the part after `@`, lowercase, server-only.
4. **No Clerk dual-verify in production** — single cutover deploy (optional feature flag only for local testing).
5. **Split-domain session handoff** via single-use exchange code → `POST /v1/auth/session/exchange`.
6. **Access JWT in client memory** — `AppAuthContext`; optional `sessionStorage` for tab refresh; **refresh token in httpOnly cookie on the web origin** (see §Refresh-token split-domain pattern below).
7. **Refresh tokens in v1** — hashed in MongoDB `auth_sessions`; rotate on use; 7–30 day TTL (env tunable).
8. **Remove `/sign-up`** — first Google login creates the user via existing `ensureUser`.

### Refresh-token split-domain pattern (Vercel + Koyeb)

The API and web app are on different origins, so the refresh token **cannot** be an httpOnly cookie set by the Koyeb callback. v1 flow:

1. Web `/auth/complete` calls **Next.js** `POST /api/auth/session/exchange` (same origin).
2. Route handler proxies to Koyeb `POST /v1/auth/session/exchange`, receives `{ accessToken, refreshToken, expiresAt, user }`.
3. Route handler sets `Set-Cookie: 3dspace.refresh=…; HttpOnly; Secure; SameSite=Lax; Path=/` on the **Vercel** origin and returns `{ accessToken, expiresAt, user }` to the client (refresh token never exposed to JS).
4. Silent renew: client calls `POST /api/auth/session/refresh` (Next route) before access JWT expiry; route reads cookie, proxies to Koyeb `POST /v1/auth/session/refresh`, rotates refresh token + cookie, returns new access token.
5. Sign out: client calls `POST /api/auth/logout` → clears cookie + Koyeb `POST /v1/auth/logout` revokes hashed session row.

Local dev (same machine, different ports): same pattern — Next route on `:3000` owns the cookie even when API is `:8080`.

---

## Shared modules (new)

Add under `apps/api/src/auth/`:

```
apps/api/src/auth/
  index.ts              # re-export authenticate, types
  jwt.ts                # signAccessToken, verifyAccessToken
  domains.ts            # parseAllowedDomains, isEmailDomainAllowed
  google-oauth.ts       # buildAuthUrl, exchangeCode, verifyIdToken
  session-exchange.ts   # createExchangeCode, consumeExchangeCode
  refresh-sessions.ts   # createRefreshSession, rotateRefreshSession, revokeRefreshSession
  types.ts              # AuthContext extensions
```

Suggested dependencies (API):

- `jose` — JWT sign/verify (or continue manual with `jsonwebtoken` if already present; prefer `jose` for ESM)
- No `@clerk/backend`

Google ID token verification: use Google's token endpoint response + `oauth2.googleapis.com/tokeninfo` **or** verify JWT locally with Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`). Prefer **local JWKS verify** (no extra round trip).

---

## Phase 0 — Contracts, config, domain parser

**Goal:** Env parsing, allowlist helper, extended user shape, `/ready` auth check — no OAuth yet.

### `packages/contracts/src/index.ts`

- Extend `UserSchema`:
  ```ts
  email: z.string().email().optional(),           // present for google users
  authProvider: z.enum(["google", "dev"]).optional(),
  lastLoginAt: z.string().optional(),
  ```
- Add auth API schemas:
  ```ts
  AuthUserSchema = z.object({ id, displayName, email })
  AuthSessionExchangeRequestSchema = z.object({ code: z.string().min(1) })
  AuthSessionExchangeResponseSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.string(),
    refreshExpiresAt: z.string(),
    user: AuthUserSchema
  })
  AuthSessionRefreshRequestSchema = z.object({ refreshToken: z.string().min(1) })
  AuthSessionRefreshResponseSchema = z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresAt: z.string(),
    refreshExpiresAt: z.string()
  })
  AuthMeResponseSchema = z.object({ user: AuthUserSchema })
  ```
- Add error codes: `auth-domain-not-allowed`, `auth-email-not-verified`, `auth-oauth-state-invalid`, `auth-session-expired`, `auth-oauth-failed`.
- Regenerate OpenAPI.

### `apps/api/src/config.ts`

Replace Clerk fields:

```ts
googleOAuthClientId: string | undefined;
googleOAuthClientSecret: string | undefined;
authJwtSecret: string | undefined;
authAllowedEmailDomains: string[];  // parsed from AUTH_ALLOWED_EMAIL_DOMAINS
authJwtTtlSeconds: number;          // default 3600
authRefreshTtlSeconds: number;      // default 2592000 (30 days)
authExchangeTtlSeconds: number;   // default 60
authGoogleHostedDomainHint: string | undefined;
```

Add startup validation helper `assertAuthConfig(config)` used by `/ready`:

- Production + OAuth enabled → require client id/secret, jwt secret, non-empty allowlist.
- Log parsed allowlist at info level (domains only, not secrets).

### `apps/api/src/auth/domains.ts`

```ts
export function parseAllowedEmailDomains(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(
    raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean)
  )];
}

export function emailDomain(email: string): string | undefined { /* ... */ }

export function isEmailDomainAllowed(email: string, allowed: string[]): boolean {
  const domain = emailDomain(email);
  return domain !== undefined && allowed.includes(domain);
}
```

### Tests

- `apps/api/tests/auth/domains.test.ts` — parsing, case insensitivity, empty, exact match, reject `user@gmail.com` when allowlist is `company.com`.

### Checkpoint

- `npm run typecheck -w @3dspace/api`
- Domain unit tests green
- `/ready` returns `auth: degraded` locally without OAuth env

---

## Phase 1 — API JWT auth + Google OAuth routes

**Goal:** Full sign-in flow on API; replace Clerk verification in `authenticate()`.

### 1.1 JWT module (`apps/api/src/auth/jwt.ts`)

```ts
export type AccessTokenClaims = {
  sub: string;
  email: string;
  name: string;
};

export function signAccessToken(claims: AccessTokenClaims, config: AppConfig): { token: string; expiresAt: string }
export function verifyAccessToken(token: string, config: AppConfig): AccessTokenClaims
```

- Algorithm: HS256
- Issuer claim: `"3dspace"`
- TTL from `config.authJwtTtlSeconds`

### 1.2 Update `AuthContext` (`apps/api/src/auth.ts`)

```ts
export type AuthContext = {
  userId: string;
  displayName: string;
  email?: string;
  provider: "google" | "dev";
};
```

Replace Clerk branch:

```ts
if (config.authJwtSecret && token && !token.startsWith("dev-")) {
  const claims = verifyAccessToken(token, config);
  return {
    userId: claims.sub,
    displayName: hintedDisplayName(request) ?? claims.name,
    email: claims.email,
    provider: "google"
  };
}
```

Keep dev branch unchanged for non-production.

### 1.3 Google OAuth (`apps/api/src/auth/google-oauth.ts`)

Implement authorization code flow with PKCE:

| Step | Action |
| --- | --- |
| Start | Generate `state`, `code_verifier`, store `{ state, verifier, returnTo, createdAt }` in memory map or Mongo `oauth_states` with TTL index |
| Redirect | `https://accounts.google.com/o/oauth2/v2/auth` with `scope=openid email profile`, `response_type=code`, `code_challenge` (S256), optional `hd` from hint |
| Callback | Validate `state`, exchange `code` + `code_verifier` at `https://oauth2.googleapis.com/token` |
| Verify | Validate ID token (`aud`, `iss`, `exp`, `email_verified`, `email`, `sub`) |
| Gate | `isEmailDomainAllowed(email, config.authAllowedEmailDomains)` or throw `auth-domain-not-allowed` |
| User | Build `AuthContext` with `userId: \`google:${sub}\``, call `repository.ensureUser` |
| Session | Create exchange code via `session-exchange.ts`, redirect `{APP_URL}/auth/complete?code=...` or `?error=...` |

Redirect URI (must match Google console):

```
{API_PUBLIC_URL}/v1/auth/google/callback
```

Also accept `CORS_ALLOWED_ORIGINS` for `returnTo` validation — only path strings like `/` or `/rooms/xyz`.

### 1.4 Session exchange (`apps/api/src/auth/session-exchange.ts`)

In-memory or Mongo collection `auth_exchange_codes`:

```ts
{ code, userId, expiresAt, consumed: boolean }
```

- `createExchangeCode(userId)` → random 32-byte hex (does **not** embed tokens — exchange handler mints fresh access + refresh)
- `consumeExchangeCode(code)` → marks consumed, returns `{ userId }` once
- TTL enforced on read

### 1.5 Refresh sessions (`apps/api/src/auth/refresh-sessions.ts`)

Mongo collection `auth_sessions` (TTL index on `expiresAt`):

```ts
{
  id: string;              // session row id
  userId: string;
  tokenHash: string;     // sha256(refreshToken) — never store plaintext
  expiresAt: string;
  revokedAt?: string;
  createdAt: string;
  rotatedFromId?: string;
}
```

- `createRefreshSession(userId, config)` → `{ refreshToken, refreshExpiresAt, sessionId }` (random 32-byte token, persist hash)
- `rotateRefreshSession(refreshToken, config)` → verify hash, revoke old row, issue new pair (**rotation on every refresh**)
- `revokeRefreshSession(refreshToken)` → set `revokedAt` (logout)
- Reject reused/revoked tokens (detect token theft)

Wire into memory repo for tests when `MONGODB_URI` unset.

### 1.6 Routes (`apps/api/src/routes/auth.ts`)

Register in [`apps/api/src/build-app.ts`](../../../apps/api/src/build-app.ts) or route index:

| Route | Handler |
| --- | --- |
| `GET /v1/auth/google/start` | Redirect to Google |
| `GET /v1/auth/google/callback` | OAuth completion |
| `POST /v1/auth/session/exchange` | `{ code }` → mint access JWT + refresh session → return both |
| `POST /v1/auth/session/refresh` | `{ refreshToken }` → rotate refresh + new access JWT |
| `GET /v1/auth/me` | `requireAuth` → user profile |
| `POST /v1/auth/logout` | `{ refreshToken }` → revoke refresh session |

Rate limit: exchange + refresh endpoints (10/min/IP).

**OAuth callback user id (Strategy A):** always `userId = \`google:${sub}\`` — no `findUserByEmail` linking to legacy Clerk rows.

### 1.7 `ensureUser` updates

[`mongoose.ts`](../../../apps/api/src/models/mongoose.ts) + [`repository.ts`](../../../apps/api/src/repository.ts):

```ts
$set: {
  displayName: auth.displayName,
  email: auth.email,
  authProvider: auth.provider,
  lastLoginAt: time,
  updatedAt: time
},
$setOnInsert: {
  id: auth.userId,
  externalAuthId: auth.provider === "google" ? auth.userId.replace(/^google:/, "") : auth.userId,
  ...
}
```

Pass `email` through `AuthContext` from OAuth handler before `ensureUser`. Do **not** add `pictureUrl` from Google (deferred per plan §13).

### 1.8 Ops route

[`ops.ts`](../../../apps/api/src/routes/ops.ts): replace Clerk check with Google OAuth + JWT + allowlist presence.

### Tests

- `apps/api/tests/routes/auth-google.test.ts` — mock Google token endpoint + JWKS; allowed domain succeeds; gmail.com blocked when allowlist is org-only.
- `apps/api/tests/auth/jwt.test.ts` — sign/verify round trip, expired token rejected.
- `apps/api/tests/auth/refresh-sessions.test.ts` — create, rotate, revoke, reject reused token.
- Update [`storage.test.ts`](../../../apps/api/tests/storage.test.ts) mock config (remove clerk keys, add auth keys).

### Checkpoint

- Manual: set Google test client + allowlist with your domain; hit start URL; complete flow; call `/v1/auth/me` with Bearer token.
- `npm run typecheck -w @3dspace/api` && API test suite green.

---

## Phase 2 — Web client auth replacement

**Goal:** Remove Clerk from runtime path; Google sign-in UX; token wired to API client.

### 2.1 Config (`apps/web/lib/config.ts`)

Remove `CLERK_PUBLISHABLE_KEY`. Add:

```ts
export const AUTH_REQUIRED =
  process.env.NEXT_PUBLIC_E2E_DEV_AUTH !== "true" &&
  process.env.NEXT_PUBLIC_AUTH_REQUIRED !== "false" &&
  Boolean(process.env.NEXT_PUBLIC_API_URL); // prod builds always require when API set

export const API_AUTH_START_URL = `${API_URL}/v1/auth/google/start`;
```

Note: `AUTH_REQUIRED` mirrors “Clerk key present” — in production, API `/ready` enforces OAuth; web treats auth as required when not in E2E dev mode. Optional explicit `NEXT_PUBLIC_AUTH_REQUIRED=true` on Vercel.

### 2.2 Replace `apps/web/lib/auth.tsx`

Remove all `@clerk/nextjs` imports. Implement:

```tsx
type AppAuthContextValue = {
  authRequired: boolean;
  loaded: boolean;
  signedIn: boolean;
  userId?: string;
  displayName?: string;
  email?: string;
  getToken?: () => Promise<string | null>;
  signOut: () => void;
};
```

- On mount: read `sessionStorage` key `3dspace.accessToken` + expiry; if valid, set signed in; schedule silent refresh (§2.6).
- `getToken`: return stored access token if not expired; opportunistically refresh if near expiry.
- `signOut`: `POST /api/auth/logout` (clears httpOnly refresh cookie) + clear client storage/state.
- `AuthGate`: “Sign in with Google” link → `${API_URL}/v1/auth/google/start?returnTo=${encodeURIComponent(pathname)}`; signed-in chip + Sign out button.

### 2.3 Next.js auth route handlers (refresh cookie owner)

**New:** server routes on the **web origin** (refresh token never in JS):

| Route | Behavior |
| --- | --- |
| `POST /api/auth/session/exchange` | Body `{ code }` → proxy Koyeb exchange → set httpOnly `3dspace.refresh` cookie → return `{ accessToken, expiresAt, user }` |
| `POST /api/auth/session/refresh` | Read cookie → proxy Koyeb refresh → rotate cookie → return `{ accessToken, expiresAt }` |
| `POST /api/auth/logout` | Read cookie → proxy Koyeb logout → clear cookie |

Cookie flags: `HttpOnly; Secure` (production); `SameSite=Lax`; `Path=/`; no `Domain` (host-only).

### 2.4 Auth complete page

**New:** `apps/web/app/auth/complete/page.tsx`

Client component:

1. Read `code` or `error` from search params.
2. If `error`, redirect to `/sign-in?error=...`.
3. If `code`, `POST /api/auth/session/exchange` with `{ code }` (same origin — sets refresh cookie server-side).
4. Store `{ accessToken, expiresAt, user }` in auth context / optional `sessionStorage`.
5. `router.replace(returnTo ?? "/")`.

### 2.5 Sign-in page

Replace [`apps/web/app/sign-in/[[...sign-in]]/page.tsx`](../../../apps/web/app/sign-in/[[...sign-in]]/page.tsx):

- Branded panel with Google button (link to API start URL).
- Map `error` query to user-friendly copy (domain not allowed, etc.).

**Delete:** `apps/web/app/sign-up/` directory (or redirect `/sign-up` → `/sign-in` for bookmarked links).

### 2.6 Silent access-token refresh (`apps/web/lib/auth.tsx`)

- On mount and on a timer (e.g. 1 min interval), if signed in and access token expires within 5 min, call `POST /api/auth/session/refresh`.
- On success, update access token in context / `sessionStorage`.
- On `401` / `auth-session-expired`, clear client state and redirect to `/sign-in`.
- `getToken()` may trigger opportunistic refresh if token is near expiry.

### 2.7 `usePersistentIdentity.ts`

Rename exports:

- `clerkEnabled` → `authRequired`
- Condition: `appAuth.authRequired && appAuth.signedIn && appAuth.userId`

### 2.8 Component copy updates

| File | Change |
| --- | --- |
| [`Lobby.tsx`](../../../apps/web/components/Lobby.tsx) | `clerkEnabled` → `authRequired`; comment “Auth (Google)” |
| [`RoomClient.tsx`](../../../apps/web/components/RoomClient.tsx) | same |
| [`LegacyLobby.tsx`](../../../apps/web/components/LegacyLobby.tsx) | same if still shipped |
| [`LiveKitSafariDebug.tsx`](../../../apps/web/components/LiveKitSafariDebug.tsx) | same |

### 2.9 `displayName.ts`

Rename `resolveClerkDisplayName` → `resolveAuthDisplayName` or delete if unused after Clerk removal.

### 2.10 Middleware

Replace [`apps/web/proxy.ts`](../../../apps/web/proxy.ts):

```ts
export default function proxy() {
  // no-op — auth gating remains in components
}
export const config = { matcher: ["/((?!_next|...).*)"] }; // keep matcher or simplify per Next 16 docs
```

Verify Next.js 16 middleware file naming (`proxy.ts` vs `middleware.ts`) — follow existing project convention.

### 2.11 API client (`apps/web/lib/api.ts`)

No structural change if `getAuthToken` still works (Bearer access JWT only — refresh stays in httpOnly cookie + Next routes).

### Tests

- `apps/web/tests/auth-context.test.ts` — mock sessionStorage; token expiry triggers refresh mock; failed refresh clears signedIn.
- Update any tests referencing `clerkEnabled`.

### Checkpoint

- Local with OAuth env: full sign-in → lobby → create room.
- Local without OAuth env: dev identity still works.
- `npm run typecheck -w @3dspace/web` && `npm run build -w @3dspace/web`.

---

## Phase 3 — Remove Clerk dependencies & update docs

### 3.1 Packages

```sh
npm uninstall @clerk/nextjs -w @3dspace/web
npm uninstall @clerk/backend -w @3dspace/api
```

### 3.2 Env files

Update:

- [`.env.example`](../../../.env.example)
- [`apps/api/.env.example`](../../../apps/api/.env.example)
- [`apps/web/.env.example`](../../../apps/web/.env.example)

Remove `CLERK_*`. Add Google + auth vars from PLAN §10 (incl. `AUTH_REFRESH_TTL_SECONDS`).

### 3.3 Documentation

- [`docs/planning/mvp/MVP_STATUS.md`](../mvp/MVP_STATUS.md) — auth row
- [`docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`](../mvp/DEPLOYMENT_CHECKLIST.md) — Google OAuth setup steps
- [`README.md`](../../../README.md) — auth section
- [`.cursor/memory.md`](../../../.cursor/memory.md) — Stack table Auth row

### 3.4 Google Cloud Console setup (ops)

Document in DEPLOYMENT_CHECKLIST:

1. APIs & Services → Credentials → OAuth 2.0 Client ID (Web application).
2. Authorized JavaScript origins: `https://3d-space-seven.vercel.app` (and localhost for dev).
3. Authorized redirect URIs: `{API_PUBLIC_URL}/v1/auth/google/callback`.
4. OAuth consent screen: Internal (Workspace) or External as needed.
5. Copy client id + secret to Koyeb env.

### Checkpoint

- `grep -r clerk apps/` returns nothing (except changelog/historical docs).
- Production `/ready` auth ok with new vars.

---

## Phase 4 — Production cutover & validation

### Pre-deploy

- [ ] Google OAuth client created with correct redirect URI
- [ ] `AUTH_ALLOWED_EMAIL_DOMAINS` set to production org domain(s)
- [ ] `AUTH_JWT_SECRET` generated (32+ random bytes)
- [ ] Clerk vars removed from Koyeb + Vercel
- [ ] Stakeholders notified: users must sign in with Google (@allowed domain); **Strategy A** — existing Clerk sessions/history won't carry over to new user ids

### Deploy order

1. **API** — deploy with new auth routes + JWT verify (Clerk verify removed)
2. **Web** — deploy Google sign-in UI
3. Smoke test production URLs from DEPLOYMENT_CHECKLIST

### Smoke tests

| # | Test |
| --- | --- |
| 1 | `GET /ready` → `auth: ok` |
| 2 | `/sign-in` shows Google button |
| 3 | Allowed-domain Google account → lands on lobby signed in |
| 4 | Personal Gmail (not in allowlist) → error on sign-in |
| 5 | Create class + room + join session (Bearer JWT on API) |
| 6 | LiveKit token issuance works with new user id |
| 7 | Sign out clears access token + refresh cookie + Mongo session row |
| 8 | Reload tab after 1h+ — silent refresh keeps user signed in (no Google re-login) |
| 9 | Playwright CI with `NEXT_PUBLIC_E2E_DEV_AUTH=true` still passes |

### Rollback

Keep Clerk env vars in password manager (not in platform) for 48h. Rollback = redeploy previous image + restore Clerk env. **Strategy A:** Google cutover creates new user rows — rollback does not restore Google-era data cleanly; treat rollback as emergency-only.

---

## Follow-ups (post-v1)

Not in scope for the Clerk replacement PR:

| Item | Notes |
| --- | --- |
| Google profile photos | Populate `pictureUrl` / avatar from Google `picture` claim (plan §13: defer) |
| Subdomain allowlist | Suffix matching if districts need `*.k12.ca.us` (plan §13: exact-match for now) |
| Clerk Strategy B migration | Rejected — Strategy A clean break only |

---

## File change checklist (summary)

| Action | Path |
| --- | --- |
| Add | `apps/api/src/auth/*` (incl. `refresh-sessions.ts`) |
| Add | `apps/api/src/routes/auth.ts` |
| Add | `apps/web/app/auth/complete/page.tsx` |
| Add | `apps/web/app/api/auth/session/exchange/route.ts`, `…/refresh/route.ts`, `…/logout/route.ts` |
| Add | `apps/api/tests/auth/*`, `apps/api/tests/routes/auth-google.test.ts` |
| Edit | `apps/api/src/auth.ts` |
| Edit | `apps/api/src/config.ts` |
| Edit | `apps/api/src/routes/ops.ts` |
| Edit | `apps/api/src/models/mongoose.ts`, `repository.ts` |
| Edit | `packages/contracts/src/index.ts` |
| Edit | `apps/web/lib/auth.tsx`, `config.ts`, `usePersistentIdentity.ts`, `displayName.ts` |
| Edit | `apps/web/proxy.ts` |
| Edit | `apps/web/app/sign-in/**` |
| Delete | `apps/web/app/sign-up/**` |
| Edit | `Lobby.tsx`, `RoomClient.tsx`, `LegacyLobby.tsx`, `LiveKitSafariDebug.tsx` |
| Edit | `.env.example` files, MVP docs, README |
| Remove deps | `@clerk/nextjs`, `@clerk/backend` |

---

## Validation evidence (fill on completion)

| Phase | Evidence |
| --- | --- |
| 0 | `domains.test.ts` output; `/ready` screenshot locally |
| 1 | `auth-google.test.ts` + `refresh-sessions.test.ts` green; manual OAuth with test client |
| 2 | Web build green; screen recording sign-in → room join; tab reload stays signed in via refresh |
| 3 | No clerk imports in `apps/` |
| 4 | Production smoke checklist signed off (incl. refresh + Strategy A comms) |
