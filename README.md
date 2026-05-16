# 3DSpace

3DSpace is a browser-based educational room MVP with a shared room manifest, a 3D renderer, a 2D analog, Fastify APIs, MongoDB persistence, LiveKit session/token plumbing, and S3-compatible wall attachment readiness.

## Local Development

1. Install dependencies:

```sh
npm install
```

2. Copy environment defaults:

```sh
cp .env.example .env.local
```

Environment templates:

- `.env.example` — full variable list for local development
- `apps/api/.env.example` — backend subset (Koyeb)
- `apps/web/.env.example` — frontend subset (Vercel)
- `docs/planning/mvp/MVP_STATUS.md` — authoritative matrix (required/optional, defaults, deployment status)
- `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md` — production provisioning steps

The API loads `/.env.local` and `/.env` from the repository root when those files exist (`apps/api/src/load-env.ts`). Next.js loads env files from the repository root via `envDir` in `apps/web/next.config.mjs`.

3. Run both apps:

```sh
npm run dev
```

The local backend uses an in-memory repository when `MONGODB_URI` is not set. The room uses a multi-tab `BroadcastChannel` realtime fallback when LiveKit credentials are not set. Production mode fails fast if required backend secrets are missing.

## Commands

```sh
npm run dev:api       # Fastify API on :8080
npm run dev:web       # Next.js web app on :3000
npm run build         # Build contracts, room engine, API, and web
npm run typecheck     # TypeScript validation
npm test              # Unit/API tests
npm run test:e2e      # Playwright MVP browser flow
npm run openapi       # Print generated OpenAPI JSON
```

## Workspace Layout

- `apps/api`: Fastify backend, auth guards, Mongoose schemas, LiveKit token minting, signed upload service, OpenAPI endpoint.
- `apps/web`: Next.js frontend, teacher/student lobby, 3D room, 2D analog, media controls, local realtime fallback.
- `packages/contracts`: Shared Zod request/response schemas and generated OpenAPI document helper.
- `packages/room-engine`: Shared room manifest, movement bounds, 2D projection, interpolation, and spatial-audio math.
- `docs/planning/mvp`: MVP source-of-truth docs and implementation status.
