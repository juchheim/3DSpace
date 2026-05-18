# 3DSpace Session Memory

Last updated: 2026-05-18 (Safari LiveKit reconnect regression)

## Project Summary

3DSpace is a browser-based, multi-user immersive 3D educational space with a required 2D analog. Teachers run classes; up to 30 students join, move, share camera/audio on avatars, and hear spatial audio.

Workspace: `/Users/ejuchheim/Projects/3DSpace/3DSpace`

Implementation state: **MVP complete in production** (Vercel + Koyeb + Atlas + Clerk + LiveKit + R2). Sentry not provisioned. MVP+1 wall media implementation complete locally on `mvp-plus-one`; wall polls support teacher-defined choices, student voting via `vote` control action, and live result bars with choice labels separated from vote summaries on board surfaces; deployed LiveKit/browser-permission wall-share validation still recommended before release.

## Entities

- **Monorepo**: `apps/web`, `apps/api`, `packages/contracts`, `packages/room-engine`
- **Planning**: `docs/planning/mvp/MVP_IMPLEMENTATION_PLAN.md`, `MVP_STATUS.md`, `DEPLOYMENT_CHECKLIST.md`; `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`, `MVP_PLUS_ONE_STATUS.md`, `MVP_PLUS_ONE_CLASSROOM_TOOLS_PLAN.md`, `MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md`
- **Memory**: `.cursor/memory.md` (this file)
- **Env templates**: `.env.example`, `apps/api/.env.example`, `apps/web/.env.example`
- **Deploy artifacts**: `apps/api/Dockerfile`, `vercel.json`

## Stack (Current)

| Layer | Choice | Status |
| --- | --- | --- |
| Frontend | Next.js 16, React 19, Vercel | Deployed |
| 3D | Three.js, R3F, Drei | Implemented (third-person camera, pointer + keyboard movement) |
| 2D analog | React/SVG from shared manifest | Implemented |
| Backend | Fastify 5, Node, Koyeb | Deployed — https://content-jeanine-juchheim-71a4f131.koyeb.app |
| DB | MongoDB Atlas + Mongoose | Provisioned in production |
| Realtime | LiveKit + data channels; BroadcastChannel dev fallback | LiveKit Cloud in production |
| Auth | Clerk + backend membership | Clerk Development instance on Vercel (`*.vercel.app`) |
| Storage | S3-compatible signed URLs | Cloudflare R2 in production |
| Observability | Sentry | Not provisioned |
| Tests | Vitest (15 tests), Playwright (4 e2e) | Passing locally |

## Phase Progress

| Phase | Status |
| --- | --- |
| 0–6 | Complete locally |
| 7 Deployment | Complete — production live 2026-05-17; Sentry deferred |

## Key Features Implemented

- Teacher lobby: class/room/invite creation
- Student invite join (two-page Playwright validated)
- 3D room: floor, walls, anchors, avatars, third-person local camera follow, camera billboards, pointer click-to-move
- 2D analog: same manifest, movement, presence, media state
- LiveKit token minting, camera/mic publish/subscribe, spatial audio panner hook
- Session join rate limit (`SESSION_JOIN_RATE_LIMIT_PER_MINUTE`, default 20) → `429 rate_limited`
- Wall attachment records + signed upload/download URLs
- Production strict env validation (fails fast on missing secrets)
- MVP+1 wall objects: file-backed image/video/audio placement, live camera/mic/screen share intents, web links/allowlisted embeds, notes, polls, timers, moderation, policy defaults, realtime sync, 3D and 2D rendering.

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

## MVP+1 Validation Evidence (2026-05-17)

- `npm run typecheck -w @3dspace/contracts` — pass
- `npm run typecheck -w @3dspace/api` — pass
- `npm run test -- apps/api/tests/api.test.ts` — pass (8 tests)
- `npm run typecheck -w @3dspace/web` — pass
- `npm run typecheck` — pass
- `npm run test` — pass (15 tests)
- `npm run build` — pass
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npm run test:e2e` — pass (4 tests)

## Production URLs

- API: https://content-jeanine-juchheim-71a4f131.koyeb.app (`/health`, `/ready` verified 2026-05-17)
- Frontend: https://3d-space-seven.vercel.app
- LiveKit: `project-3dspace-wganhyh3` (LiveKit Cloud)

## Remaining (non-blocking)

- Sentry DSN not provisioned
- Clerk Production instance blocked on `*.vercel.app` without custom domain
- Formal 30-participant LiveKit load test not recorded

## Relationships

- Room manifest → consumed by 3D and 2D renderers
- 3D camera follows the local participant's `avatar.state.v1` position and yaw in `RoomView3D`
- Zod/OpenAPI = API contract; Mongoose = persistence
- LiveKit data channels = avatar state; not persisted in MVP
- `MVP_STATUS.md` must stay updated during implementation
- MVP+1 wall media plan → builds on MVP wall anchors, `WallAttachment` records, signed storage, LiveKit media/data channels, room events, and dual 3D/2D renderers
- MVP+1 design decision → introduce `WallObject` for visible placed wall content; keep `WallAttachment` as file asset metadata instead of stretching it to represent live streams, web links, whiteboards, polls, and timers
- MVP+1 implementation → `WallObject` persists outside the room manifest, hydrates via API, syncs via reliable realtime messages, and renders through shared wall-object state in both 3D and 2D.
- MVP+1 classroom tools plan → builds on `WallObject`, `ClassMembership`, LiveKit data channels, roster/people panel, and a new room-scoped `ClassroomState`; classroom state decorates participants but must not overwrite live avatar movement.
- Wall object clients now periodically refresh persisted room wall objects and hydrate signed asset URLs, so teacher boards recover from missed student upload realtime messages without polling or resetting avatar state.

## Post-MVP Backlog

Screen share, computer audio, teacher moderation, rich wall placement, room builder, whiteboards, breakouts, LMS, analytics, recording.

## Planning Observations

- **2026-05-17**: Created `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md` to specify extending MVP wall readiness into wall-mounted learning surfaces.
- MVP+1 scope covers image/video/audio files, live camera, live microphone, browser-tab/screen share, web links, allowlisted embeds, documents/slides, notes, polls, timers, and future whiteboards.
- Browser-on-wall should start as LiveKit-backed browser-tab/screen share plus safe web resource cards; arbitrary iframe embeds are unreliable/unsafe and should be allowlisted only.
- Wall media implementation should keep mutable wall content outside the room manifest. Anchors stay in the manifest; placed content lives in `WallObject` persistence and syncs by API plus reliable realtime messages.
- **2026-05-17**: MVP+1 local implementation completed and audited against `MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`; remaining release recommendation is manual deployed LiveKit/browser-permission validation for live wall shares.
- **2026-05-17**: Recreated lost MVP+1 classroom-tools planning in `MVP_PLUS_ONE_CLASSROOM_TOOLS_PLAN.md` and implementation roadmap in `MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md`; scope covers raise hand/board access grants, private checks, groups with spatial hold, board focus, and replanned lesson presentation.

## Bug Fixes

- **2026-05-16**: Remote camera video not visible — avatar state updates (~10 Hz) overwrote `ParticipantView` without preserving `cameraStream`/`microphoneStream` from LiveKit. Fixed by spreading existing participant on avatar updates; `onRemoteMedia` upserts when track arrives before presence.
- **2026-05-16**: Lobby navigation stuck on "Rendering..." from 3D room — soft Next.js navigation hung while WebGL/LiveKit/media stayed active. Fixed with teardown-first leave (`release` media, `disconnect(true)` LiveKit, unmount 3D canvas via `leaving` state) and `navigateToLobby` hard-navigation fallback after 2s.
- **2026-05-16**: Avatar name/mic label blocked view — Drei `Html` `distanceFactor={8}` scaled ~3× at third-person follow distance (~3m). Fixed with `distanceFactor={3}` and compact `.avatar-nameplate` styles in `RoomView3D.tsx` / `globals.css`.
- **2026-05-16**: Spawn + wall blocked view on room enter — teacher spawn at z=-3.9 put follow camera (2.85m behind) past front wall (z=-6). Walls/anchors now fade by camera signed distance; default spawns moved toward room center in `room-engine`.
- **2026-05-17**: 3D room viewport taller than browser — `.room-stage` had `min-height: 32rem` and `.room-main` used `minmax(28rem, 1fr)`, stacking above topbar/padding. Fixed by constraining `.room-layout` to viewport height and letting the stage row shrink with `minmax(0, 1fr)`.
- **2026-05-17**: Wall objects floated in front of boards and could exceed board bounds — 3D wall object HTML used fixed card sizing plus a large `zIndex`-based normal offset. Fixed by clamping placement to anchor bounds, scaling the HTML surface to board world units, using a tiny physical offset, and letting camera/video surfaces fill their placement while preserving full media with `object-fit: contain`.
- **2026-05-17**: Wall timer Resume reset countdown — sidebar and 3D board each mount `WallTimerDisplay` with separate refs; pause in one view did not update the other's elapsed state, so Resume could call `play(0)`. Fixed with shared `timerRuntime` store, resume keeps elapsed until playback catches up, and corrected `wall.playback.state.v1` handler shape in `useWallObjects`.
- **2026-05-17**: Pinned camera on 3D wall disappeared and dropped frame rate — wall camera rendering used an inline `srcObject` ref and rediscovered the local camera through frequently updated avatar participant state. Fixed with stable media elements, explicit local wall-media binding for local camera pins, and memoized 3D wall surfaces to avoid rerendering video surfaces on avatar ticks.
- **2026-05-17**: WASD/arrow keys could not type in wall tool inputs (note, poll, link) — `useAvatarMovement` captured movement keys globally with `preventDefault()`. Fixed by skipping movement capture when focus is in text inputs, textareas, selects, or contenteditable elements.
- **2026-05-17**: Teacher and student initial spawns could overlap at the front board and face away from it — local spawn selection used `participantId.length % spawnPoints.length`. Fixed with role-aware spawn selection, back-of-room student spawn candidates, occupied-position avoidance when known, and board-facing teacher/student rotations.
- **2026-05-17**: 3D wall object buttons not clickable — third-person camera drag bound to `.canvas-wrap` used `setPointerCapture`, stealing pointer events from Drei `Html` overlays (siblings of the canvas). Fixed by binding drag to the canvas only, skipping interactive targets as a fallback, and wiring `onRemove` / `onStopShare` / `onModerate` into `RoomView3D` wall surfaces.
- **2026-05-17**: Stop share on pinned camera kept video playing — `wallMediaStreams` and local wall-media sync still bound participant camera streams after `source_ended`. Fixed by only attaching streams for active live wall objects and clearing stale bindings on stop share.
- **2026-05-17**: Wall sidebar create options filtered by selected anchor `metadata.accepts` via `anchorSupportsCreateOption` in `room-engine`; `AnchorPanel` hides unsupported File/Note/Timer/Poll/Link/Cam/Mic/Screen actions per board.
- **2026-05-17**: Pinned camera on board did not spatialize sharer audio — `useSpatialAudio` only moved mic to wall anchors for `microphone.live`. Fixed by routing participant mic to the board anchor for active `camera.live` pins as well.
- **2026-05-17**: Pin camera broke LiveKit publish (track dimensions warning, publish timeout) — simultaneous camera+mic enable caused parallel `getUserMedia` and overlapping `publishTrack`. Fixed by unified media capture in `useLocalMedia`, serialized `setLocalMedia`, waiting for video dimensions before publish, and awaiting camera readiness before creating wall pin (removed auto-enable mic on pin).
- **2026-05-17**: Enabling mic while camera pinned blacked out board video — unified `useLocalMedia` re-acquired both tracks. Fixed with incremental capture: add audio-only when camera is already live (and vice versa), full capture only when needed.
- **2026-05-17**: Enabling mic after pinned camera caused multi-second 0 FPS — second `getUserMedia`, speaking VAD restarting movement RAF, and sync LiveKit publish. Fixed by holding muted audio with camera capture (mic on = enable tracks only), deferred speaking detection, stable movement media ref, split participant mic update, double-rAF LiveKit publish.
- **2026-05-17**: Wall objects stacked on one board — enforce one occupying object per anchor in API (`assertAnchorAvailableForNewObject`), client (`useWallObjects`, `AnchorPanel` disables create when occupied).
- **2026-05-17**: Wall anchor boards use 16:9 widescreen proportions (`widescreenHeight` in `room-engine`); 2D map rects use `projectAnchorRectTo2D`.
- **2026-05-17**: Main board sizing changes were blocked by stale session/API manifest data in the running web app. Added `normalizeRoomManifest` in web client to force current main-board dimensions before 3D/2D rendering, even when existing rooms send old anchor dimensions.
- **2026-05-18**: Safari LiveKit disconnects while Chrome works — Safari WebRTC is sensitive to simulcast/dynacast/adaptiveStream. Fixed in `apps/web/lib/realtime.ts` + `browser.ts`: Safari disables simulcast/dynacast/adaptiveStream, longer connect timeouts, auto-reconnect on unexpected disconnect + tab visibility, and no longer surfaces a dead-end "Disconnected from LiveKit." status during reconnect.
- **2026-05-18**: Safari status regressed to "Reconnecting to LiveKit..." during initial join after the first compatibility patch. Narrowed the patch by restoring LiveKit's default page-leave cleanup and publish defaults, while keeping Safari publish simulcast disabled and showing "Connecting to LiveKit..." before the first successful connection.

## Maintenance Rules

1. Update this file after meaningful changes
2. Update `MVP_STATUS.md` (required deliverable)
3. Keep `.env.example` files in sync when adding tunable config
