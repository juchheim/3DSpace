# 3DSpace MVP Status

Last updated: 2026-05-17 (production deployment complete)

## Current Status

Status: **MVP complete and operational in production.**

Current phase: **Phase 7 complete** (deployment and hardening). Optional observability (Sentry) remains unprovisioned. Post-MVP work continues on branch `mvp-plus-one` per `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`; local MVP+1 wall-object implementation is in progress on that branch.

The browser app is deployed on Vercel, the API on Koyeb, and production uses MongoDB Atlas, Clerk, LiveKit Cloud, and Cloudflare R2 (S3-compatible object storage). Teachers can create classes and rooms, invite students, join in 3D or 2D, move avatars, use camera/microphone with spatial audio, and use wall attachment readiness (signed upload/download targets).

## MVP Deliverables

| Deliverable | Status |
| --- | --- |
| Fully functional browser-based multi-user 3D educational space | **Complete** — production LiveKit + Clerk auth |
| Functional 2D analog for the same room/session | **Complete** |
| Frontend deployed on Vercel | **Complete** |
| Backend deployed on Koyeb | **Complete** |
| Status document kept current | **Complete** (this file) |

## Stack Requirements

| Layer | Selected stack | Status | Notes |
| --- | --- | --- | --- |
| Frontend hosting | Vercel | **Deployed** | Monorepo root build via `vercel.json`; Next.js 16 production build |
| Frontend app | Next.js 16, React 19, TypeScript | **Implemented** | `apps/web` |
| 3D renderer | Three.js 0.184, R3F, Drei | **Implemented** | Third-person camera, pointer + keyboard movement, camera billboards |
| 2D analog | Shared room model, React/SVG | **Implemented** | Same manifest/session/movement model as 3D |
| Backend hosting | Koyeb | **Deployed** | Docker image from `apps/api/Dockerfile` |
| Backend app | Node.js, Fastify 5, TypeScript | **Implemented** | `apps/api` |
| Contracts | Zod + OpenAPI | **Implemented** | `packages/contracts` |
| Database | MongoDB Atlas | **Provisioned** | Mongoose repository in production |
| ODM | Mongoose | **Implemented** | Users, classes, rooms, manifests, attachments, sessions, events |
| Realtime media | LiveKit Cloud | **Provisioned** | Camera/mic publish/subscribe; non-dev session tokens |
| Realtime avatar state | LiveKit data channels | **Implemented** | `avatar.state.v1`; local BroadcastChannel fallback for dev only |
| Object storage | Cloudflare R2 (S3-compatible) | **Provisioned** | Signed PUT/GET for wall attachments |
| Auth | Clerk + backend membership | **Provisioned** | Clerk **Development** instance on `*.vercel.app` (see limitations) |
| Tests | Vitest, Playwright, API tests | **Implemented** | Local CI green; deployed flows validated in production |
| Observability | Sentry + platform logs / health | **Partial** | `/health` and `/ready` live; Sentry DSN not set |

## Environment Variables

Rules for implementers:

- Discover variables via `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example`.
- Vercel hosts frontend public vars; Koyeb hosts backend secrets and tuning.
- Never expose server secrets through `NEXT_PUBLIC_*` variables.
- Production backend fails fast when required secrets are missing.
- Record secret **location** (provider dashboard), not values, in this doc.

| Variable | Platform | Required | Default | Purpose | Production status |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Vercel/Koyeb | Yes | `development` | Runtime mode | `production` on deploy targets |
| `HOST` | Koyeb | Optional | `0.0.0.0` in production | API bind host | Configured on Koyeb |
| `NEXT_PUBLIC_APP_URL` | Vercel | Yes | localhost | Public frontend base URL | `https://3d-space-seven.vercel.app` |
| `NEXT_PUBLIC_API_URL` | Vercel | Yes | localhost | Browser API base URL | `https://content-jeanine-juchheim-71a4f131.koyeb.app` |
| `API_PUBLIC_URL` | Koyeb | Yes | localhost | Public backend URL for uploads/metadata | `https://content-jeanine-juchheim-71a4f131.koyeb.app` |
| `CORS_ALLOWED_ORIGINS` | Koyeb | Yes | localhost | Allowed frontend origins | `https://3d-space-seven.vercel.app` |
| `CLERK_SECRET_KEY` | Koyeb (+ Vercel for middleware) | Yes | None | Server JWT verification | Clerk dashboard → same app as frontend |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | Yes | None | Browser Clerk key | Clerk dashboard (Development instance on Vercel) |
| `CLERK_WEBHOOK_SECRET` | Koyeb | Optional | None | Webhook verification | Not required for MVP |
| `MONGODB_URI` | Koyeb | Yes | None | Atlas connection string | Koyeb secret / env |
| `MONGODB_DB_NAME` | Koyeb | Optional | `3dspace` | Database name (case-sensitive on Atlas) | Configured on Koyeb |
| `LIVEKIT_URL` | Koyeb | Yes | — | Token minting WebSocket URL | LiveKit Cloud project |
| `LIVEKIT_API_KEY` | Koyeb | Yes | None | LiveKit API key | LiveKit Cloud |
| `LIVEKIT_API_SECRET` | Koyeb | Yes | None | LiveKit API secret | LiveKit Cloud |
| `NEXT_PUBLIC_LIVEKIT_URL` | Vercel | Optional | None | Browser hint; session also returns URL | LiveKit Cloud |
| `OBJECT_STORAGE_*` | Koyeb | Yes when wall attachments enabled | None | R2 S3-compatible credentials | Cloudflare R2 |
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | Koyeb | Optional | None | CDN/public asset base | Optional |
| `SENTRY_DSN` | Koyeb | Optional | None | Backend error reporting | **Not provisioned** |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | Optional | None | Frontend error reporting | **Not provisioned** |
| `AVATAR_STATE_SEND_HZ` | Koyeb/Vercel | Yes | `12` | Avatar update rate | Default |
| `AVATAR_INTERPOLATION_MS` | Koyeb/Vercel | Yes | `120` | Interpolation buffer | Default |
| `MAX_ROOM_PARTICIPANTS` | Koyeb | Yes | `30` | Room capacity | Default |
| `SESSION_JOIN_RATE_LIMIT_PER_MINUTE` | Koyeb | Yes | `20` | Session token rate limit | Default |
| `DEFAULT_VIEW_MODE` | Vercel | Yes | `3d` | Initial view mode | Default |
| `DEFAULT_3D_QUALITY` | Vercel | Yes | `low` | Graphics profile | Default |
| `ENABLE_2D_ANALOG` | Vercel/Koyeb | Yes | `true` | 2D mode flag | Default |
| `ENABLE_WALL_ATTACHMENTS` | Vercel/Koyeb | Yes | `true` | Wall attachment feature | Default |
| `ENABLE_WALL_OBJECTS` | Koyeb | Yes | `true` | MVP+1 wall object API and room policy | MVP+1 branch |
| `WALL_OBJECT_*` | Koyeb | Yes | see `.env.example` | MVP+1 object limits, creation defaults, file size and MIME policy | MVP+1 branch |
| `ENABLE_WALL_WEB_*` / `WALL_WEB_EMBED_ALLOWLIST` | Koyeb | Yes | links true, embeds false | MVP+1 safe web resource and allowlisted iframe policy | MVP+1 branch |
| `ENABLE_WALL_SCREEN_SHARE` | Koyeb | Yes | `true` | MVP+1 browser-tab/screen wall share feature flag | MVP+1 branch |
| `ENABLE_WALL_STUDENT_*` | Koyeb | Yes | `false` | MVP+1 safe student upload/live-share defaults | MVP+1 branch |
| `NEXT_PUBLIC_ENABLE_WALL_*` | Vercel | Optional | see `.env.example` | MVP+1 public UI feature hints; backend remains authoritative | MVP+1 branch |
| `SPATIAL_AUDIO_*` | Vercel | Yes | see `.env.example` | Web Audio spatialization | Default |
| `MEDIA_*` | Vercel | Yes | see `.env.example` | Camera/mic defaults and limits | Default |

## Phase Progress

| Phase | Status | Evidence |
| --- | --- | --- |
| Phase 0: Status and repo foundation | **Complete** | Monorepo, docs, scripts |
| Phase 1: Auth, data, and API contracts | **Complete** | Clerk, Mongoose, Zod/OpenAPI |
| Phase 2: LiveKit session join | **Complete** | Production tokens; room join |
| Phase 3: Shared room manifest and 3D MVP | **Complete** | 3D room in production |
| Phase 4: Spatial audio and media | **Complete** | LiveKit camera/mic + spatial audio |
| Phase 5: 2D analog | **Complete** | 2D mode in production |
| Phase 6: Wall attachment readiness | **Complete** | R2 signed URLs; anchor UI |
| Phase 7: Deployment, verification, hardening | **Complete** | Vercel + Koyeb live; `/ready` all checks `ok`; Sentry deferred |

## Completed Work

### Implementation (local, pre-production)

- Monorepo: `apps/web`, `apps/api`, `packages/contracts`, `packages/room-engine`, docs.
- Shared Zod schemas, OpenAPI generation, default classroom manifest, room engine helpers.
- Fastify v1 API: classes, memberships, invites, rooms, manifests, sessions, attachments, events, health, readiness.
- Teacher/student authorization, Mongoose persistence, memory repo for local/test only.
- LiveKit token minting, data channels, camera/mic tracks, Web Audio spatial panner.
- S3-compatible signed upload/download (R2 in production).
- Next.js lobby (guided create → share → enter), 3D room, 2D analog, media controls, wall anchor panel.
- Vitest API/unit tests, Playwright smoke tests, 30-participant capacity simulation.
- Session join rate limiting (`429 rate_limited`).
- Docker image, `vercel.json`, deployment checklist, env templates.

### Production deployment and fixes

- Vercel frontend deployed (Next.js monorepo build from repo root).
- Koyeb API deployed from `apps/api/Dockerfile` (`node apps/api/dist/server.js` on port 8080).
- MongoDB Atlas connected; database name configured on Koyeb.
- Clerk authentication wired end-to-end (bearer tokens from Vercel to Koyeb).
- LiveKit Cloud connected for realtime media and data channels.
- Cloudflare R2 configured for wall attachment storage.
- API ESM production startup fix (`.js` import extensions, commit `6c60ad1`).
- Contracts build fix for `DELETE` routes (commit `89fa7e6`).
- Clerk production API request fix (commit `f2462b0`).
- Lobby deferred API calls until Clerk ready; Atlas DB name alignment (commits `7b6247b`, `f65fc7b`).
- Lobby UX redesign and 3D visibility improvements (commits `e78d65b`, `e7e5453`).

## In Progress

- None for MVP scope.
- **MVP+1** (separate branch `mvp-plus-one`): wall-mounted media per `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`; local implementation has added `WallObject` contracts, routes, persistence, attachment finalization, config flags, 3D/2D rendering, realtime messages, file object UI, live pin/share controls, web links, notes, timers, and polls. See `docs/planning/mvp+1/MVP_PLUS_ONE_STATUS.md` for current validation status.

## Blockers

**None** for MVP production operation.

Previously blocking items (resolved):

- Vercel project link and production env vars — resolved.
- Koyeb secrets (Clerk, LiveKit, MongoDB, R2) — resolved.
- API module resolution in Docker — resolved (`6c60ad1`).
- Clerk token forwarding from browser — resolved (`f2462b0`).

## Risks

- **Clerk Development keys on Vercel:** Clerk Production instances do not support `*.vercel.app` without a custom domain. Production currently uses a Clerk **Development** instance; console shows a warning and dev-tier limits apply until a custom domain + Clerk Production instance is added.
- **Sentry not configured:** No centralized error reporting; rely on Vercel/Koyeb/LiveKit logs and `/health` / `/ready`.
- **30-participant LiveKit load test:** API capacity simulation passed; full LiveKit media load test at 30 participants is still recommended before large classes.
- **npm audit:** Residual moderate advisories in Next's pinned PostCSS dependency; risk-accepted for MVP (no safe fix on Next 16.2.6 at last check).
- **Education compliance:** Privacy, retention, moderation, and school SSO may exceed MVP scope.

## Validation Evidence

### Local (2026-05-16)

- `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`, `npm run openapi` — passed.
- `docker build -f apps/api/Dockerfile` — passed.

### Production (2026-05-17)

API (`https://content-jeanine-juchheim-71a4f131.koyeb.app`):

- `GET /health` → `{"status":"ok","service":"3dspace-api",...}`
- `GET /ready` → `{"status":"ready","checks":[...]}` with `auth`, `mongodb`, `livekit`, and `object-storage` all **`ok`**.

Application (confirmed in production use):

- Teacher create room and invite flow works with Clerk sign-in.
- Student join via invite works.
- 3D movement, 2D analog, camera/microphone, and LiveKit realtime function against deployed services.

### Recommended follow-up validation

- Record additional Vercel preview hostnames in `CORS_ALLOWED_ORIGINS` if preview deploys call the production API.
- Staged 30-participant LiveKit session.
- Throttled-browser / low-end device check against deployed Vercel build.
- Provision Sentry or explicitly defer.

## Deployment State

| Target | Status | URL / location |
| --- | --- | --- |
| Vercel frontend | **Deployed** | https://3d-space-seven.vercel.app |
| Koyeb backend | **Deployed** | https://content-jeanine-juchheim-71a4f131.koyeb.app |
| LiveKit Cloud | **Provisioned** | Project `project-3dspace-wganhyh3` (LiveKit dashboard) |
| MongoDB Atlas | **Provisioned** | Connection via Koyeb `MONGODB_URI` secret |
| Object storage (R2) | **Provisioned** | Cloudflare R2 bucket (Koyeb `OBJECT_STORAGE_*` env) |
| Clerk | **Provisioned** | Clerk dashboard — Development instance for `*.vercel.app` |
| Sentry | **Not provisioned** | Optional; env vars unset |

## Known Limitations

- **Sentry:** Not configured; no DSN on Vercel or Koyeb.
- **Clerk on Vercel:** Development instance only until a custom domain enables Clerk Production.
- **Wall attachments:** Readiness only (metadata + signed URLs + placeholder UI); rich wall placement is **MVP+1**.
- **Teacher moderation:** Beyond self mute/camera; post-MVP.
- **Local dev fallbacks:** In-memory MongoDB and BroadcastChannel realtime when env vars unset — not used in production.
- **Audit advisories:** Moderate Next/PostCSS chain; monitored, risk-accepted for MVP.

## Post-MVP Backlog

Tracked in implementation planning:

- **MVP+1:** Rich wall-mounted media — `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`
- Screen sharing, computer audio sharing
- Teacher mute/remove/lock controls
- Custom room builder, whiteboards, collaborative objects
- Breakout rooms, LMS integrations, analytics, recording/replay/transcripts
