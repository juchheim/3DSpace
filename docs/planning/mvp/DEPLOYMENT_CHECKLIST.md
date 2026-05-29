# MVP Deployment Checklist

**Status:** MVP production deployment **complete** as of 2026-05-17.

This document records what was required for deployment and what remains optional. For live status, URLs, and validation evidence, see `MVP_STATUS.md`.

Environment variable reference:

- `.env.example` — full local template
- `apps/api/.env.example` — Koyeb/backend variables
- `apps/web/.env.example` — Vercel/frontend variables
- `docs/planning/mvp/MVP_STATUS.md` — authoritative matrix and deployment URLs

## Production URLs

| Service | URL |
| --- | --- |
| **API (Koyeb)** | https://content-jeanine-juchheim-71a4f131.koyeb.app |
| **Frontend (Vercel)** | https://3d-space-seven.vercel.app |

Verify API health:

```sh
curl -sS https://content-jeanine-juchheim-71a4f131.koyeb.app/health
curl -sS https://content-jeanine-juchheim-71a4f131.koyeb.app/ready
```

Expected `/ready`: `"status":"ready"` with checks `auth`, `mongodb`, `livekit`, and `object-storage` all `"ok"`.

---

## Backend On Koyeb — completed

- [x] Deploy from `apps/api/Dockerfile` (build context = **repository root**).
- [x] Dockerfile **Target** field empty (or `runner`) — not HTTP port `8080`.
- [x] `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=8080`.
- [x] `API_PUBLIC_URL` = Koyeb HTTPS URL.
- [x] `CORS_ALLOWED_ORIGINS` = Vercel frontend URL(s).
- [x] `MONGODB_URI` from Atlas (Koyeb secret/env).
- [x] `CLERK_SECRET_KEY` (same Clerk app as Vercel).
- [x] `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
- [x] `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` (R2).
- [ ] `SENTRY_DSN` — **not provisioned** (optional).
- [ ] `CLERK_WEBHOOK_SECRET` — optional; not required for MVP.

**Command / work directory:** default image `CMD` (`node apps/api/dist/server.js`); work directory = repo root for builds.

**Smoke checks:**

- [x] `GET /health` returns ok.
- [x] `GET /ready` returns ready with all dependency checks ok.
- [x] `GET /openapi.json` available.
- [x] Clerk bearer auth accepted from Vercel frontend.
- [x] LiveKit tokens are non-development JWTs in production.
- [x] Session join rate limit returns `429` when exceeded.
- [x] Wall attachment signed upload/download URLs work with R2.

---

## Frontend On Vercel — completed

- [x] Vercel project linked; build from **repository root** using `vercel.json`.
- [x] `NEXT_PUBLIC_APP_URL` = Vercel HTTPS URL.
- [x] `NEXT_PUBLIC_API_URL` = Koyeb HTTPS URL.
- [x] `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (+ `CLERK_SECRET_KEY` on Vercel for middleware).
- [x] `NEXT_PUBLIC_LIVEKIT_URL` (optional; session response also provides URL).
- [ ] `NEXT_PUBLIC_SENTRY_DSN` — **not provisioned** (optional).

**Clerk note:** Clerk **Production** instances do not support `*.vercel.app`. MVP uses a Clerk **Development** instance on Vercel until a custom domain is added.

**Smoke checks:**

- [x] Teacher can create/open a class room from the deployed URL.
- [x] Clerk sign-in; API calls use bearer tokens (not dev headers).
- [x] Student can join with an invite.
- [x] 3D room loads; movement visible.
- [x] 2D analog loads; movement visible.
- [x] Camera/microphone controls and LiveKit remote media work.
- [x] Wall anchor UI can prepare signed upload/download URLs.

---

## Signoff Gates

| Gate | Status |
| --- | --- |
| `npm run typecheck` | Passed (local) |
| `npm test` | Passed (local) |
| `npm run build` | Passed (local + Vercel) |
| `npm run test:e2e` | Passed (local) |
| `npm audit --omit=dev` | Moderate advisories risk-accepted |
| Deployed API `/health` + `/ready` | Passed (2026-05-17) |
| LiveKit two-browser teacher/student | Passed in production use |
| 30-participant LiveKit load test | Recommended; not formally recorded |
| Low-end / throttled browser on deployed URL | Recommended; not formally recorded |
| Sentry | Deferred |

---

## Optional Next Steps (not MVP blockers)

1. **Sentry** — create project; set `SENTRY_DSN` (Koyeb) and `NEXT_PUBLIC_SENTRY_DSN` (Vercel).
2. **Custom domain** — point DNS to Vercel; add Clerk Production instance; update `CORS_ALLOWED_ORIGINS` and Clerk allowed origins.
3. **MVP+1** — implement wall media per `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`.

## Shared Browser Deployment Notes

- `ENABLE_SHARED_BROWSERS=true` requires Chromium/Puppeteer headroom on the API worker. Budget roughly 200-400 MB RAM per active session.
- Koyeb / container deployments should keep `SHARED_BROWSER_MAX_ACTIVE_PER_ROOM` low (`2` by default) and pair it with `SHARED_BROWSER_IDLE_PAUSE_MINUTES`.
- For a 0.5 vCPU / 1 GB API worker, start with `SHARED_BROWSER_VIEWPORT_WIDTH=1280`, `SHARED_BROWSER_VIEWPORT_HEIGHT=720`, `SHARED_BROWSER_DEVICE_SCALE_FACTOR=1.5`, `SHARED_BROWSER_SCREENCAST_QUALITY=85`, and `SHARED_BROWSER_SCREENCAST_EVERY_NTH_FRAME=2`. Increase quality before increasing viewport size.
- Production must use LiveKit publishing for shared browsers. Keep `SHARED_BROWSER_USE_JPEG_FALLBACK=false` when `NODE_ENV=production`.
- If the main API container becomes memory-bound, move the shared-browser driver into a sidecar service that shares MongoDB + LiveKit credentials rather than introducing a hosted browser vendor.
