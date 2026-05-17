# 3DSpace MVP Status

Last updated: 2026-05-16 (third-person 3D camera follow)

## Current Status

Status: Local MVP implementation complete; external service provisioning and deployment are pending.

Current phase: Phase 7, deployment and hardening. Local development, build, API, browser smoke, shared contracts, room engine, 3D room, 2D analog, media controls, LiveKit token/data/media plumbing, MongoDB/Mongoose persistence, 30-participant simulation, two-page student invite validation, throttled-browser validation, session-token abuse controls, and wall attachment upload/download readiness are implemented.

Important scope note: this workspace does not contain Vercel, Koyeb, Clerk, MongoDB Atlas, LiveKit Cloud, object storage, or Sentry credentials. Production deployment cannot be completed from the local files alone. Production startup is intentionally strict and fails fast when required backend secrets are missing.

## MVP Deliverables

- Fully functional browser-based multi-user 3D educational space: Implemented locally with LiveKit production plumbing and a development `BroadcastChannel` multi-tab fallback.
- Functional 2D analog for the same room/session: Implemented from the shared room manifest.
- Frontend deployed on Vercel: Blocked by missing linked Vercel project and production env vars.
- Backend deployed on Koyeb: Blocked by missing production service env vars.
- This status document kept current throughout implementation: Updated with local implementation evidence and blockers.

## Stack Requirements

| Layer | Selected stack | Status | Notes |
| --- | --- | --- | --- |
| Frontend hosting | Vercel | Pending deployment | App is build-ready with Next.js; Vercel CLI is authenticated, but no local project link or 3DSpace project exists yet. |
| Frontend app | Next.js 16, React 19, TypeScript | Implemented | `apps/web`; production build passes. |
| 3D renderer | Three.js 0.184, `@react-three/fiber` 9, `@react-three/drei` 10 | Implemented | Dynamic 3D room page renders floor, walls, anchors, spawns, avatars, third-person local camera follow, and camera billboards. |
| 2D analog | Shared room model rendered with React/SVG | Implemented | Same manifest/session/movement model as 3D. |
| Backend hosting | Koyeb | Pending deployment | API Docker image builds locally; Koyeb CLI can access apps, but required provider secrets are incomplete. |
| Backend app | Node.js, Fastify 5, TypeScript | Implemented | `apps/api`; health, readiness, auth guards, and v1 resources implemented. |
| Contracts | Zod schemas and generated OpenAPI | Implemented | `packages/contracts`; `/openapi.json` generated from route schemas. |
| Database | MongoDB Atlas | Implemented, not provisioned | Mongoose repository used when `MONGODB_URI` is set; memory repo used only for local/test fallback. |
| ODM | Mongoose | Implemented | Schemas and indexes for users, classes, memberships, invites, rooms, manifests, sessions, events, and attachments. |
| Realtime media | LiveKit Cloud | Implemented, not provisioned | Backend mints LiveKit tokens when credentials exist; frontend publishes local camera/mic tracks and subscribes remote media; dev token fallback is local-only. |
| Realtime avatar state | LiveKit data channels | Implemented | Frontend publishes versioned `avatar.state.v1`; dev uses BroadcastChannel fallback. |
| Object storage | Cloudflare R2 or S3-compatible storage | Implemented, not provisioned | Signed PUT and GET URLs generated when storage env vars exist; dev fallback URLs returned locally. |
| Auth | Clerk identity plus backend membership roles | Implemented, not provisioned | Clerk frontend provider activates when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` exists; backend JWT verification is used when `CLERK_SECRET_KEY` exists; dev headers are local-only. |
| Tests | Vitest 4, Playwright, API contract tests | Implemented | Unit/API tests, OpenAPI generation, and teacher/student browser smoke pass locally. |
| Observability | Sentry plus platform logs and health endpoints | Partially implemented | Env hooks and health/readiness exist; Sentry project not provisioned. |

## Environment Variables

Rules for implementers:

- Discover variables outside this doc via `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example`.
- Use Vercel for frontend variables and Koyeb for backend variables unless noted otherwise.
- Never expose server secrets through public frontend variables.
- Backend variables are parsed and validated at startup.
- Production mode requires real provider secrets and fails fast when they are missing.
- For secrets, record the owner/location instead of the secret value.

| Variable | Platform | Required | Default | Purpose | Status |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | Vercel/Koyeb | Yes | `development` | Runtime mode. | Implemented; production affects strict validation. |
| `HOST` | Koyeb/local | Optional | `127.0.0.1` locally, `0.0.0.0` in production | API bind host; local default avoids sandbox `EPERM`, production remains Koyeb-compatible. | Implemented. |
| `NEXT_PUBLIC_APP_URL` | Vercel | Yes | `http://127.0.0.1:3000` | Public frontend base URL. | Local default documented; production TBD. |
| `NEXT_PUBLIC_API_URL` | Vercel | Yes | `http://127.0.0.1:8080` | Browser-accessible backend API URL. | Local default documented; production TBD. |
| `API_PUBLIC_URL` | Koyeb | Yes | `http://127.0.0.1:8080` | Public backend URL used in upload fallback and metadata. | Local default documented; production TBD. |
| `CORS_ALLOWED_ORIGINS` | Koyeb | Yes | Localhost origins | Comma-separated allowed frontend origins. | Implemented. |
| `CLERK_SECRET_KEY` | Koyeb | Yes | None | Server-side auth verification. | Implemented; missing provider credential. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel | Yes | None | Public Clerk browser key. | Implemented; frontend uses Clerk bearer tokens when configured and local dev identity when absent. Missing provider credential. |
| `CLERK_WEBHOOK_SECRET` | Koyeb | Optional for MVP | None | Auth webhook verification if user sync is enabled. | Documented; webhook not required for local MVP. |
| `MONGODB_URI` | Koyeb | Yes | None | MongoDB Atlas connection string. | Implemented; missing Atlas credential. |
| `MONGODB_DB_NAME` | Koyeb | Optional | `3dspace` | Database name when not included in the URI (lowercase; Atlas is case-sensitive). | Implemented. |
| `LIVEKIT_URL` | Koyeb | Yes | `ws://localhost:7880` | LiveKit server URL for token generation. | Implemented; missing LiveKit Cloud URL. |
| `LIVEKIT_API_KEY` | Koyeb | Yes | None | LiveKit server API key. | Implemented; missing provider credential. |
| `LIVEKIT_API_SECRET` | Koyeb | Yes | None | LiveKit server API secret. | Implemented; missing provider credential. |
| `NEXT_PUBLIC_LIVEKIT_URL` | Vercel | Yes | None | Browser LiveKit connection URL. | Documented; session response provides backend URL. |
| `OBJECT_STORAGE_ENDPOINT` | Koyeb | Yes for attachments | None | S3-compatible storage endpoint. | Implemented; missing provider credential. |
| `OBJECT_STORAGE_BUCKET` | Koyeb | Yes for attachments | None | Bucket for wall attachment assets. | Implemented; missing provider credential. |
| `OBJECT_STORAGE_ACCESS_KEY_ID` | Koyeb | Yes for attachments | None | Signed upload credential. | Implemented; missing provider credential. |
| `OBJECT_STORAGE_SECRET_ACCESS_KEY` | Koyeb | Yes for attachments | None | Signed upload secret. | Implemented; missing provider credential. |
| `OBJECT_STORAGE_PUBLIC_BASE_URL` | Koyeb/Vercel | Optional | None | CDN/public base for uploaded assets. | Implemented. |
| `SENTRY_DSN` | Koyeb | Optional | None | Backend error reporting. | Documented; project not provisioned. |
| `NEXT_PUBLIC_SENTRY_DSN` | Vercel | Optional | None | Frontend error reporting. | Documented; project not provisioned. |
| `AVATAR_STATE_SEND_HZ` | Koyeb/Vercel | Yes | `12` | Max local avatar state messages per second. | Implemented. |
| `AVATAR_INTERPOLATION_MS` | Koyeb/Vercel | Yes | `120` | Remote avatar interpolation buffer. | Implemented in contracts/session tuning and room engine. |
| `MAX_ROOM_PARTICIPANTS` | Koyeb | Yes | `30` | Room capacity guard. | Implemented. |
| `SESSION_JOIN_RATE_LIMIT_PER_MINUTE` | Koyeb | Yes | `20` | Per-user, per-room session token request limit. | Implemented. |
| `DEFAULT_VIEW_MODE` | Vercel | Yes | `3d` | Initial view mode, allowed values `3d` or `2d`. | Implemented. |
| `DEFAULT_3D_QUALITY` | Vercel | Yes | `low` | Initial graphics profile. | Implemented. |
| `ENABLE_2D_ANALOG` | Vercel/Koyeb | Yes | `true` | Feature flag for 2D mode. | Implemented. |
| `ENABLE_WALL_ATTACHMENTS` | Vercel/Koyeb | Yes | `true` | Feature flag for wall attachment readiness. | Implemented. |
| `SPATIAL_AUDIO_ENABLED` | Vercel | Yes | `true` | Enable Web Audio spatialization. | Implemented in session tuning and spatial math. |
| `SPATIAL_AUDIO_DISTANCE_MODEL` | Vercel | Yes | `inverse` | Web Audio panner distance model. | Implemented. |
| `SPATIAL_AUDIO_REF_DISTANCE` | Vercel | Yes | `1` | Reference distance for audio falloff. | Implemented. |
| `SPATIAL_AUDIO_MAX_DISTANCE` | Vercel | Yes | `24` | Max distance for audio falloff. | Implemented. |
| `SPATIAL_AUDIO_ROLLOFF_FACTOR` | Vercel | Yes | `1.4` | Audio falloff strength. | Implemented. |
| `MEDIA_DEFAULT_CAMERA_ENABLED` | Vercel | Yes | `false` | Default local camera state on join. | Implemented. |
| `MEDIA_DEFAULT_MIC_ENABLED` | Vercel | Yes | `false` | Default local microphone state on join. | Implemented. |
| `MEDIA_MAX_VIDEO_WIDTH` | Vercel | Yes | `640` | Default camera capture width. | Implemented. |
| `MEDIA_MAX_VIDEO_HEIGHT` | Vercel | Yes | `360` | Default camera capture height. | Implemented. |
| `MEDIA_MAX_VIDEO_FPS` | Vercel | Yes | `15` | Default camera capture frame rate. | Implemented. |

## Phase Progress

| Phase | Status | Evidence |
| --- | --- | --- |
| Phase 0: Status and repo foundation | Complete | Monorepo, package workspaces, README, env example, build/typecheck/test scripts. |
| Phase 1: Auth, data, and API contracts | Complete locally | Clerk/dev auth, Mongoose schemas/indexes, Zod contracts, generated OpenAPI, health/readiness. |
| Phase 2: LiveKit session join | Complete locally | `/v1/rooms/:roomId/session`, LiveKit token minting, LiveKit data/media adapter, dev fallback, roster plumbing. |
| Phase 3: Shared room manifest and 3D MVP | Complete locally | Shared manifest, bounds/projection helpers, Three.js room, movement, avatars, camera billboards. |
| Phase 4: Spatial audio and media abstractions | Complete locally | Camera/mic controls, speaking state, LiveKit camera/mic publish/subscribe hooks, remote Web Audio panner hook, spatial audio math and tuning in session response, 30-participant simulation. |
| Phase 5: 2D analog | Complete locally | SVG plan-view analog with movement, participants, media state, walls, anchors. |
| Phase 6: Wall attachment readiness | Complete locally | Manifest anchors, attachment records, signed upload/download target services, placeholder UI. |
| Phase 7: Deployment, verification, and hardening | In progress | Local validation complete; production deployment blocked by provider credentials and remaining forced-upgrade audit advisories. |

## Completed Work

- Created root monorepo with `apps/web`, `apps/api`, `packages/contracts`, `packages/room-engine`, and docs.
- Implemented shared Zod schemas and generated OpenAPI route document.
- Implemented default classroom manifest with room bounds, spawn points, wall planes, wall anchors, capabilities, features, and spatial audio tuning.
- Implemented room engine helpers for bounds, 2D projection, avatar state, interpolation, and spatial audio math.
- Implemented Fastify backend with versioned class, membership, invite, room, manifest, session, attachment, event, health, readiness, and OpenAPI endpoints.
- Implemented backend authorization: teacher-only mutations and active membership checks for room access/session/token issuance.
- Implemented Mongoose schemas and indexes with a Mongo repository for provisioned environments.
- Implemented memory repository for local tests/dev only.
- Implemented LiveKit token minting and frontend data-channel adapter with local BroadcastChannel fallback.
- Implemented optional Clerk frontend provider, sign-in gate, and bearer-token API requests for provisioned production environments while preserving local dev identity fallback.
- Implemented LiveKit camera/microphone track publication and remote media subscription hooks.
- Implemented Web Audio panner management for subscribed remote microphone streams.
- Implemented S3-compatible signed upload/download target generation and local fallback URLs.
- Implemented Next.js lobby for teacher room creation, invite generation, student invite acceptance, and room opening.
- Implemented 3D classroom renderer with simple geometry, walls, anchors, spawns, avatars, third-person local camera follow, camera billboards, and quality-sensitive rendering.
- Implemented pointer click-to-move targeting on the 3D classroom floor in addition to keyboard and touch-pad movement.
- Implemented 2D analog renderer from the same manifest with movement, walls, anchors, participant presence, speaking state, and camera state.
- Implemented camera/microphone permission controls, local video preview, and speaking detection.
- Implemented wall attachment readiness UI for anchor selection, signed upload preparation, and attachment download URL preparation.
- Added Vitest API/unit tests, 30-participant capacity simulation, and Playwright MVP smoke tests.
- Added API test coverage for session token rate limiting.
- Added two-page Playwright coverage for student invite join, local multi-tab realtime presence, remote movement propagation, camera state propagation, and view-mode propagation.
- Added throttled Chromium smoke coverage for room creation, 2D fallback, and movement under a constrained browser profile.
- Fixed bodyless frontend POST requests so invite acceptance does not send an invalid empty JSON request.
- Fixed dev identity hydration so stored teacher/student identities are read before local storage writes and room joins wait for identity hydration.
- Fixed local realtime fallback presence replay and avatar publish timing so late-joining tabs receive participant names and movement/media/view state reliably.
- Added accessible roster movement/position readouts to make participant state visible and testable outside the canvas.
- Changed local dev host binding to `127.0.0.1` while preserving production host configurability for Koyeb.
- Added `apps/api/Dockerfile`, `.dockerignore`, `vercel.json`, and `docs/planning/mvp/DEPLOYMENT_CHECKLIST.md`.
- Synced environment templates: root `.env.example`, `apps/api/.env.example`, and `apps/web/.env.example` (includes `SESSION_JOIN_RATE_LIMIT_PER_MINUTE`, `PORT`, and pointers to this status doc).
- Verified Vercel CLI authentication and Koyeb CLI app access.
- Verified the API Docker image builds locally as `3dspace-api:local`.
- Upgraded hardening-related dependencies: Fastify 5.8.5, `@fastify/cors` 11.2.0, Next 16.2.6, React 19.2.6, `@react-three/fiber` 9.6.1, `@react-three/drei` 10.7.7, Three 0.184.0, and Vitest 4.1.6.
- Changed OpenAPI generation to use compiled Node output instead of `tsx`, avoiding local IPC restrictions.
- Installed Playwright Chromium locally for browser validation.
- Ran non-breaking `npm audit fix`; remaining audit fixes require major dependency upgrades.

## In Progress

- Provision external services: Vercel, Koyeb, Clerk, MongoDB Atlas, LiveKit Cloud, S3/R2 storage, and optional Sentry.
- Deploy frontend and backend with production environment variables.
- Decide whether to perform breaking dependency upgrades for remaining audit advisories before production signoff.

## Blockers

- Vercel CLI is authenticated as `juchheim`, but there is no local project link and no existing listed project named 3DSpace.
- Koyeb CLI can list apps and secrets, but only a MongoDB-related secret is present for this MVP; Clerk, LiveKit, storage, and Sentry secrets are missing.
- No Clerk project keys are available.
- No MongoDB Atlas URI is available.
- No LiveKit Cloud URL/API credentials are available.
- No object storage endpoint/bucket/credentials are available.
- No Sentry DSN is available.
- `npm audit --omit=dev` still reports 3 moderate advisories from Next's pinned PostCSS dependency, including the same advisory surfaced through `@clerk/nextjs`. Fastify/Vitest high-severity advisories were resolved; latest available `next` is 16.2.6 and npm reports no safe fix available.

## Risks

- LiveKit media track publication/subscription is implemented but still needs credential-backed validation against LiveKit Cloud.
- Remote Web Audio panner management is implemented but still needs validation with actual LiveKit remote microphone tracks.
- The API has a 30-participant session simulation; this is not a substitute for a 30-participant LiveKit media load test.
- The remaining Next/PostCSS audit advisories have no safe newer Next release available in npm at this time; production should either wait for a patched Next release or explicitly risk-accept the moderate advisories with compensating controls.
- Education deployments may need privacy, retention, moderation, and school SSO requirements beyond the MVP scope.

## Validation Evidence

Completed locally on 2026-05-16:

- `npm install`: passed; generated `package-lock.json`.
- `npm run typecheck`: passed across API, web, contracts, and room engine.
- `npm test`: passed, 2 test files and 10 tests, including a 30-participant capacity simulation, signed attachment upload/download API coverage, and session token rate-limit coverage.
- `npm run build`: passed; contracts, room engine, API, and Next.js production build succeeded.
- `env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ZHVtbXk npm run build`: passed; optional Clerk frontend provider branch compiles, but real Clerk authentication still requires provider credentials.
- `npm run openapi`: passed; generated OpenAPI JSON from compiled contracts/API output, including signed attachment upload and download routes.
- `npx playwright install chromium`: passed after approval; installed local Chromium runtime.
- `npm run test:e2e`: passed, 3 Chromium smoke tests covering teacher room creation, 3D pointer movement, 3D keyboard movement, 2D movement, camera control, microphone control, student invite join, two-page realtime presence, remote movement propagation, remote camera-state propagation, remote view-mode propagation, throttled-browser room usability, and 3D return.
- `docker build -f apps/api/Dockerfile -t 3dspace-api:local .`: passed; Koyeb API image build path validated locally.
- `vercel whoami`: passed with authenticated user `juchheim`.
- `vercel project ls`: passed; no 3DSpace project exists in the listed projects.
- `vercel build`: blocked because the directory has no local Vercel project settings; `vercel pull --yes` would require an existing linked project.
- `koyeb apps list`: passed; Koyeb account/token can list apps.
- `koyeb secrets list`: passed; `mongodb-uri` exists, but required Clerk, LiveKit, and object storage secrets are absent.
- `npm audit fix`: non-breaking fix applied.
- `npm audit fix --force`: upgraded Fastify, Next, and Vitest major versions; required matching upgrades to `@fastify/cors`, React, Three, R3F, and Drei.
- `npm audit --omit=dev`: still reports 3 moderate production vulnerabilities in Next's pinned PostCSS dependency, including the same dependency path through `@clerk/nextjs`. Latest available `next` is 16.2.6; npm reports no safe fix available.

Required before production signoff:

- Configure real provider services and production env vars.
- Run deployed smoke tests against Vercel frontend and Koyeb backend.
- Run LiveKit-backed teacher/student multi-browser validation with real remote camera/mic tracks.
- Run staged 30-participant validation against LiveKit Cloud.
- Repeat low-end-device or throttled-browser performance check against the deployed Vercel/Koyeb environment.
- Resolve remaining Next/PostCSS audit advisories when a patched Next release is available, or explicitly risk-accept them before production launch.

## Deployment State

| Target | Status | URL |
| --- | --- | --- |
| Vercel frontend | Not deployed | TBD |
| Koyeb backend | Not deployed | TBD |
| LiveKit room service | Not provisioned | TBD |
| MongoDB Atlas | Not provisioned | TBD |
| Object storage | Not provisioned | TBD |
| Clerk | Not provisioned | TBD |
| Sentry | Not provisioned | TBD |

## Known Limitations

- Production deployment is not complete because external service credentials are unavailable.
- Local realtime fallback supports multi-tab smoke testing but not real remote network/WebRTC validation.
- Camera output is shown locally on or near the avatar; remote camera rendering through LiveKit is implemented but needs credential-backed validation.
- Teacher moderation beyond own camera/microphone controls remains post-MVP.
- Rich drag-and-drop wall placement is deferred; MVP includes anchors, attachment records, signed uploads/downloads, and placeholder affordances.
- Remaining audit advisories are limited to Next's pinned PostCSS dependency and should be addressed or risk-accepted before public production use.

## Post-MVP Backlog

- Screen sharing.
- Computer audio sharing.
- Teacher mute/remove/lock controls.
- Rich wall-mounted image, video, and audio placement.
- Custom room builder.
- Whiteboards and collaborative objects.
- Breakout rooms.
- LMS integrations.
- Attendance and engagement analytics.
- Recording, replay, and transcripts.
