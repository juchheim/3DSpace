# MVP Deployment Checklist

This checklist captures the remaining provider work needed to turn the local MVP into the deployed MVP required by `MVP_IMPLEMENTATION_PLAN.md`.

Environment variable reference:

- `.env.example` — full local template
- `apps/api/.env.example` — Koyeb/backend variables
- `apps/web/.env.example` — Vercel/frontend variables
- `docs/planning/mvp/MVP_STATUS.md` — deployment status and authoritative env matrix

## Backend On Koyeb

Required Koyeb configuration:

- Deploy from `apps/api/Dockerfile`.
- Set `NODE_ENV=production`.
- Set `HOST=0.0.0.0`.
- Set `PORT=8080`.
- Set `API_PUBLIC_URL` to the final Koyeb HTTPS URL.
- Set `CORS_ALLOWED_ORIGINS` to the final Vercel HTTPS URL.
- Optionally tune `SESSION_JOIN_RATE_LIMIT_PER_MINUTE`; default is `20`.
- Attach `MONGODB_URI` from a MongoDB Atlas secret. A Koyeb secret named `mongodb-uri` currently exists, but it has not been verified for this app.
- Add missing secrets: `CLERK_SECRET_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY`.
- Optionally add `OBJECT_STORAGE_PUBLIC_BASE_URL`, `SENTRY_DSN`, and `CLERK_WEBHOOK_SECRET`.

Required backend smoke checks after deploy:

- `GET /health` returns `{"status":"ok"}`.
- `GET /ready` returns `ready`, not `degraded` or `not_ready`.
- `GET /openapi.json` returns the generated OpenAPI document.
- Teacher class creation, room creation, invite creation, and student session join work against the deployed URL.
- Clerk sign-in works from the Vercel frontend and API calls include bearer tokens accepted by the Koyeb backend.
- LiveKit token issuance returns a non-development JWT.
- Repeated session token requests are rate-limited with `429 rate_limited`.
- Wall attachment creation returns a signed upload URL and existing attachment records return signed download URLs.

## Frontend On Vercel

Required Vercel configuration:

- Create or link a Vercel project for 3DSpace. `vercel project ls` did not show an existing 3DSpace project on 2026-05-16.
- Build from repository root using `vercel.json`.
- Set `NEXT_PUBLIC_APP_URL` to the final Vercel HTTPS URL.
- Set `NEXT_PUBLIC_API_URL` to the final Koyeb HTTPS URL.
- Set `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`.
- Set `NEXT_PUBLIC_LIVEKIT_URL`.
- Optionally set `NEXT_PUBLIC_SENTRY_DSN`.

Required frontend smoke checks after deploy:

- Teacher can create/open a class room from the Vercel URL.
- Signed-in Clerk users can create rooms and accept invites without dev identity headers.
- Student can join with an invite.
- 3D room loads and movement is visible.
- 2D analog loads and movement is visible.
- Camera/microphone controls work with browser permission text.
- Remote camera and microphone work through LiveKit with spatial audio.
- Wall anchor UI can prepare signed upload and download URLs against deployed object storage.

## Signoff Gates

- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `npm audit --omit=dev` resolved or explicitly risk-accepted.
- LiveKit-backed two-browser teacher/student validation.
- Staged 30-participant LiveKit validation.
- Low-end-device or throttled-browser performance check.
