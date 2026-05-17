# 3DSpace Session Memory

Last updated: 2026-05-17 (MVP+1 wall media planning)

## Project Summary

3DSpace is a browser-based, multi-user immersive 3D educational space with a required 2D analog. Teachers run classes; up to 30 students join, move, share camera/audio on avatars, and hear spatial audio.

Workspace: `/Users/ejuchheim/Projects/3DSpace/3DSpace`

Implementation state: **Local MVP complete; Phase 7 deployment blocked by missing provider credentials.**

## Entities

- **Monorepo**: `apps/web`, `apps/api`, `packages/contracts`, `packages/room-engine`
- **Planning**: `docs/planning/mvp/MVP_IMPLEMENTATION_PLAN.md`, `MVP_STATUS.md`, `DEPLOYMENT_CHECKLIST.md`; `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`
- **Memory**: `.cursor/memory.md` (this file)
- **Env templates**: `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`
- **Deploy artifacts**: `apps/api/Dockerfile`, `vercel.json`

## Stack (Current)

| Layer | Choice | Status |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, Vercel | Built locally; not deployed |
| 3D | Three.js, R3F, Drei | Implemented (third-person camera, pointer + keyboard movement) |
| 2D analog | React/SVG from shared manifest | Implemented |
| Backend | Fastify 5, Node, Koyeb | Built locally; Docker image builds |
| DB | MongoDB Atlas + Mongoose | Implemented; uses memory repo when `MONGODB_URI` unset |
| Realtime | LiveKit + data channels; BroadcastChannel dev fallback | Implemented |
| Auth | Clerk + backend membership | Implemented; dev headers when Clerk unset |
| Storage | S3-compatible signed URLs | Implemented; dev fallback URLs |
| Tests | Vitest (10 tests), Playwright (3 e2e) | Passing locally |

## Phase Progress

| Phase | Status |
| --- | --- |
| 0–6 | Complete locally |
| 7 Deployment | In progress — Vercel build fixed (ApiRoute `delete` type, commit 89fa7e6); env credentials still needed |

## Key Features Implemented

- Teacher lobby: class/room/invite creation
- Student invite join (two-page Playwright validated)
- 3D room: floor, walls, anchors, avatars, third-person local camera follow, camera billboards, pointer click-to-move
- 2D analog: same manifest, movement, presence, media state
- LiveKit token minting, camera/mic publish/subscribe, spatial audio panner hook
- Session join rate limit (`SESSION_JOIN_RATE_LIMIT_PER_MINUTE`, default 20) → `429 rate_limited`
- Wall attachment records + signed upload/download URLs
- Production strict env validation (fails fast on missing secrets)

## Environment Variables

Authoritative matrix: `docs/planning/mvp/MVP_STATUS.md`

Templates: `.env.example` (full), `apps/api/.env.example`, `apps/web/.env.example`

Notable vars added during implementation:
- `HOST` (127.0.0.1 local, 0.0.0.0 production)
- `PORT` (API, default 8080)
- `SESSION_JOIN_RATE_LIMIT_PER_MINUTE` (default 20)

Local loading:
- API dev: `tsx --env-file=../../.env.local` (and `.env`)
- Web: `envDir` in `apps/web/next.config.mjs` points to repo root

## Validation Evidence (2026-05-16)

- `npm run typecheck` — pass
- `npm test` — pass (10 tests, incl. rate limit + 30-participant sim)
- `npm run build` — pass
- `npm run test:e2e` — pass (3 tests: teacher flow, two-page student/realtime, throttled browser)
- `docker build -f apps/api/Dockerfile` — pass

## Blockers (Deployment)

- No Vercel project linked for 3DSpace
- Koyeb: only `mongodb-uri` secret exists; missing Clerk, LiveKit, storage
- No Clerk, Atlas URI, LiveKit Cloud, R2/S3, Sentry credentials in workspace
- `npm audit --omit=dev`: 3 moderate Next/PostCSS advisories, no safe fix on 16.2.6

## Relationships

- Room manifest → consumed by 3D and 2D renderers
- 3D camera follows the local participant's `avatar.state.v1` position and yaw in `RoomView3D`
- Zod/OpenAPI = API contract; Mongoose = persistence
- LiveKit data channels = avatar state; not persisted in MVP
- `MVP_STATUS.md` must stay updated during implementation
- MVP+1 wall media plan → builds on MVP wall anchors, `WallAttachment` records, signed storage, LiveKit media/data channels, room events, and dual 3D/2D renderers
- MVP+1 design decision → introduce `WallObject` for visible placed wall content; keep `WallAttachment` as file asset metadata instead of stretching it to represent live streams, web links, whiteboards, polls, and timers

## Post-MVP Backlog

Screen share, computer audio, teacher moderation, rich wall placement, room builder, whiteboards, breakouts, LMS, analytics, recording.

## Planning Observations

- **2026-05-17**: Created `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md` to specify extending MVP wall readiness into wall-mounted learning surfaces.
- MVP+1 scope covers image/video/audio files, live camera, live microphone, browser-tab/screen share, web links, allowlisted embeds, documents/slides, notes, polls, timers, and future whiteboards.
- Browser-on-wall should start as LiveKit-backed browser-tab/screen share plus safe web resource cards; arbitrary iframe embeds are unreliable/unsafe and should be allowlisted only.
- Wall media implementation should keep mutable wall content outside the room manifest. Anchors stay in the manifest; placed content lives in `WallObject` persistence and syncs by API plus reliable realtime messages.

## Bug Fixes

- **2026-05-16**: Remote camera video not visible — avatar state updates (~10 Hz) overwrote `ParticipantView` without preserving `cameraStream`/`microphoneStream` from LiveKit. Fixed by spreading existing participant on avatar updates; `onRemoteMedia` upserts when track arrives before presence.
- **2026-05-16**: Lobby navigation stuck on "Rendering..." from 3D room — soft Next.js navigation hung while WebGL/LiveKit/media stayed active. Fixed with teardown-first leave (`release` media, `disconnect(true)` LiveKit, unmount 3D canvas via `leaving` state) and `navigateToLobby` hard-navigation fallback after 2s.
- **2026-05-16**: Avatar name/mic label blocked view — Drei `Html` `distanceFactor={8}` scaled ~3× at third-person follow distance (~3m). Fixed with `distanceFactor={3}` and compact `.avatar-nameplate` styles in `RoomView3D.tsx` / `globals.css`.
- **2026-05-16**: Spawn + wall blocked view on room enter — teacher spawn at z=-3.9 put follow camera (2.85m behind) past front wall (z=-6). Walls/anchors now fade by camera signed distance; default spawns moved toward room center in `room-engine`.

## Maintenance Rules

1. Update this file after meaningful changes
2. Update `MVP_STATUS.md` (required deliverable)
3. Keep `.env.example` files in sync when adding tunable config
