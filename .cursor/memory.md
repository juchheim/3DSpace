# 3DSpace Session Memory

Last updated: 2026-05-21 (Exit-ticket recap modal + Phase 7 UI)

## Project Summary

3DSpace is a browser-based, multi-user immersive 3D educational space with a required 2D analog. Teachers run classes; up to 30 students join, move, share camera/audio on avatars, and hear spatial audio.

Workspace: `/Users/ejuchheim/Projects/3DSpace/3DSpace`

Implementation state: **MVP complete in production** (Vercel + Koyeb + Atlas + Clerk + LiveKit + R2). Sentry not provisioned. MVP+1 wall media implementation complete locally on `mvp-plus-one`; wall polls support teacher-defined choices, student voting via `vote` control action, and live result bars with choice labels separated from vote summaries on board surfaces; deployed LiveKit/browser-permission wall-share validation still recommended before release. MVP+1 classroom tools phases 1-7 are now locally implemented, including help queue, People-panel board access grants, private checks, groups, focus, and the feature-flagged lesson planning discovery slice.

## Entities

- **Monorepo**: `apps/web`, `apps/api`, `packages/contracts`, `packages/room-engine`
- **Planning**: `docs/planning/mvp/MVP_IMPLEMENTATION_PLAN.md`, `MVP_STATUS.md`, `DEPLOYMENT_CHECKLIST.md`; `docs/planning/mvp+1/MVP_PLUS_ONE_WALL_MEDIA_PLAN.md`, `MVP_PLUS_ONE_STATUS.md`, `MVP_PLUS_ONE_CLASSROOM_TOOLS_PLAN.md`, `MVP_PLUS_ONE_CLASSROOM_TOOLS_IMPLEMENTATION.md`, `MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md`; `docs/planning/new-features/README.md`, `LEARNING_FEATURE_IDEAS.md`, `IMPL_EMOTES.md`, `IMPL_HALL_PASS.md`, `IMPL_WHISPER.md`, `IMPL_EXIT_TICKET.md`
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
| Tests | Vitest (47 tests), Playwright focused lesson e2e | Passing locally |

## Phase Progress

| Phase | Status |
| --- | --- |
| 0–6 | Complete locally |
| 7 Deployment | Complete — production live 2026-05-17; Sentry deferred |

## Key Features Implemented

- Teacher lobby: class/room/invite creation; **Your rooms** and in-room top bar expose **Copy invite** (GET `/v1/rooms/:roomId/invite` returns latest valid student invite or creates one)
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
- `ENABLE_CLASSROOM_LESSONS` / `NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS` (default off; gates Phase 7 lesson actions and UI)

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

## MVP+1 Classroom Validation Evidence (2026-05-19)

- `npm --workspace @3dspace/web run typecheck` — pass.
- `npm --workspace @3dspace/api run typecheck` — pass.
- `npm run test -- apps/api/tests/api.test.ts -t "filters classroom state|private-check"` — pass.
- `npm run test -- apps/api/tests/api.test.ts` — pass after updating the stale wall-object policy assertion to use a still-disallowed file type.

## MVP+1 Lesson Planning Validation Evidence (2026-05-19)

- `npm run typecheck` — pass.
- `npm test` — pass (47 tests).
- `npx vitest run packages/contracts/tests/lesson-run.test.ts apps/api/tests/api.test.ts` — pass (33 tests).
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npx playwright test apps/web/test/mvp.spec.ts --grep "three-step lesson"` — pass (teacher authors instruction -> focus-board -> private-check; student joins mid-run).

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
- `Roster` People panel now owns teacher board-access selection UI; `ClassroomState.boardAccessGrants` feeds both teacher participant controls and student `AnchorPanel` creation gating through `activeBoardGrant`.
- `ClassroomPanel` owns private-check authoring/open-close controls, student active-check forms, and teacher response review while relying on role-filtered classroom API responses to keep student clients limited to their own submissions.
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
- **2026-05-19**: Implemented classroom-tools Phase 3 board access grants in the live UI by turning the People panel into a teacher participant picker with board-share presets, allowed-type toggles, revoke controls, and contextual raised-hand details for the selected student.
- **2026-05-19**: Implemented classroom-tools Phase 4 private checks in `ClassroomPanel`: teachers can create multiple-choice, short-answer, or confidence checks; open/close/reopen them; and review individual responses. Students see active prompts and submit/update only their own filtered response.
- **2026-05-19**: Drafted `MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md` for classroom-tools Phase 7. Lesson run lives inside `ClassroomState.lessonRun`, orchestrates six step kinds (`instruction`, `focus-board`, `private-check`, `group-work`, `timer`, `student-share`) by dispatching existing classroom actions on advance/back with drift detection; reusable plans deferred to a later phase.
- **2026-05-19**: Implemented classroom-tools Phase 7 lesson planning discovery slice behind `ENABLE_CLASSROOM_LESSONS`: typed `LessonRun` contracts, server orchestration/cleanup/drift for all six step kinds, student privacy filtering, teacher HUD author/run/timeline controls, student late-join callouts, env templates, status docs, unit/API coverage, and focused Playwright coverage.
- **2026-05-20**: Created sweet-spot implementation docs under `docs/planning/new-features/`: `IMPL_EMOTES.md` (Small 1, ~2 days), `IMPL_HALL_PASS.md` (Small 6, ~2 days), `IMPL_WHISPER.md` (Small 4, ~3 days), `IMPL_EXIT_TICKET.md` (Small 3, ~3–4 days), plus a `README.md` index. Each doc is phased (contracts → server → realtime/spatial-audio → UI → polish), names exact files to touch, includes a feature flag, acceptance criteria, validation checkboxes, and risks. Each shippable independently behind its own `NEXT_PUBLIC_ENABLE_*` flag (exit ticket reuses existing `ENABLE_CLASSROOM_LESSONS`). Hall-pass plan extends `helpRequests.kind`, adds 4 actions, adds `hallpassHoldingZone` to the room manifest, persists durations to `RoomEvents`. Whisper plan attenuates listener-side gain in `useSpatialAudio` based on speaker mode + radius; teacher voice always carries; explicitly documented as "quieter, not private" for safeguarding. Exit-ticket adds 7th `LessonStepKindSchema` value, gates `end-lesson-run` via 409 `exit-ticket-incomplete` unless `force: true`, ships recap GET endpoint + CSV export. `LEARNING_FEATURE_IDEAS.md` recommendation section now points to these four docs as a defensible first sprint (~10–12 dev-days total).
- **2026-05-20**: Wrote and expanded `docs/planning/new-features/LEARNING_FEATURE_IDEAS.md` across three brainstorm passes. Final shape: 13 small ideas (Small 1 emotes, Small 2 live captions, Small 3 exit ticket + recap, Small 4 world pings, Small 5 whisper circles, Small 6 seat thought bubbles, Small 7 discussion role cards, Small 8 comprehension weather, Small 9 Quiet Corner sensory-break zone, Small 10 3D field-trip pin map, Small 11 digital hall pass, Small 12 translated captions for English Learners, Small 13 PBIS avatar badge stickers). Four full big ideas: AI Co-Pilot "LessonSmith"; Time Capsule Classroom (async ghost visits); World Skins (virtual field-trip skinning of the room — Mars / cell interior / Roman Forum / rainforest / art studio launch library, with standards crosswalks); Universal Access Suite (UDL/IEP/504/ELL accommodations profile that auto-applies per student, RFP-ready). Three alternate seeds: RoomObject manipulatives, breakout audio pods, spatial question orbs. Doc now ships two distinct recommendation sequences — Sequence A (district-sales priority: World Skins → Universal Access → Hall Pass → Translated Captions → Badges) and Sequence B (pedagogical-depth priority: emotes → whisper → exit ticket + recap → Time Capsule → AI Co-Pilot). Open questions explicitly call out the Sequence A vs B decision as the highest-leverage product call.

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
- **2026-05-18**: Safari LiveKit WebRTC timeout after many Safari-specific retries (`autoSubscribe: false`, room recreation, 100s outer timeout, `singlePeerConnection: false`, etc.). Reverted `apps/web/lib/realtime.ts` to pre–classroom-tools connect style (simple `room.connect` + `normalizeLiveKitUrl`, participant sync from `827776c`, production throws on failure). Removed `browser.ts`. Restored `livekit-client` `^2.2.0`. Kept `RoomClient` classroom polling fix (`a8a869d`) and 3s `syncParticipants` interval.
- **2026-05-18**: Safari stuck at WebRTC negotiation — mitigations in `realtime.ts`: `prepareConnection` before connect (Cloud edge + TLS warmup), `autoSubscribe: false` with `subscribeAllRemoteTracks` on Connected / ParticipantConnected / TrackPublished, `disconnectOnPageLeave: false`, VP8 publish defaults without simulcast/backupCodec, 45s peer connection timeout.
- **2026-05-18**: Safari LiveKit ICE — minimal repro at `/debug/livekit-safari/[roomId]` (`LiveKitSafariDebug.tsx`) rules out main app join/realtime/classroom code; raw relay-only TURN probe returns `candidates: []` on school Wi‑Fi and cellular hotspot. Documented in `docs/planning/mvp+1/safari-livekit-ice-failure.md`; investigation shifts to Safari × LiveKit Cloud TURN / support ticket.
- **2026-05-19**: Re-granting board access could stack multiple active grants for one student while the student UI only honored the newest one. Fixed by revoking prior active grants for that student before persisting a new grant; targeted API tests now cover the replacement behavior.
- **2026-05-19**: HUD panel smallest text was hard to read against the dark panel background. Lightened `--hud-tx-m` and `--hud-tx-d` tokens in `globals.css` for better contrast on secondary labels, subs, chevrons, and anchor hints.
- **2026-05-21**: Committed and pushed exit-ticket phases 1–6 on `mvp-plus-one` (`0d5f635`): contracts, server orchestration/recap/CSV/end-gate, authoring UI, `ApiError`, API tests.
- **2026-05-21**: Phase 7 exit-ticket recap UI: `LessonRecapPanel` modal (attendance, check counts, exit-ticket ratio/confidence, reflections list, authenticated CSV download), `fetchLessonRecap`/`lessonRecapCsvUrl`/`downloadLessonRecapCsv` in `apps/web/lib/api.ts`, auto-open on lesson `running|paused` → `ended` and **Last lesson recap** button in `LessonRunControls`. Follow-up fixed combined student exit-ticket submit path by using raw classroom actions for the reflection/confidence/what's-next sequence; using `lesson.runAction` added a stale `expectedVersion` after the first submit.
- **2026-05-21**: Teacher lesson-run ready state now surfaces as a highlighted Start button plus `HudCard` alert dot on `LessonRunControls`; the pulsing dot dismisses when the teacher clicks into the card or starts the run.
- **2026-05-21**: Teachers could only copy invite codes immediately after creating a classroom. Added `GET /v1/rooms/:roomId/invite` (teacher-only, get-or-create shareable student invite), `listInvitesForRoom` repository method, shared `CopyRoomInviteButton` in lobby **Your rooms** and `RoomClient` top HUD bar.
- **2026-05-21**: Join spawn rotation used fixed `spawn.rotation.y = Math.PI` (+Z), so back-row and side seats often faced walls. `createAvatarState` now sets yaw via `rotationFacingRoomCenter` (bounds center, same `atan2` as movement/camera).
- **2026-05-21**: Spawn center-facing regressed in 3D because `useAvatarMovement` overwrites avatar `rotation.y` from `cameraYawRef` (default 0) every frame. Fixed by seeding `cameraYawRef` from spawn rotation in `createAvatarState` effect and syncing camera when spawn rotation is set.
- **2026-05-21**: Drafted `docs/planning/new-features/PLAN_BREAKOUT_PODS.md` + `IMPL_BREAKOUT_PODS.md` for `LEARNING_FEATURE_IDEAS.md` Alternate B. Pods reuse the existing `ClassroomGroup` entity (no parallel model); new behavior is listener-side gain attenuation in `useSpatialAudio`, a `podsRuntime` field on `ClassroomState`, `toggle-pods` + `set-student-broadcast` classroom actions, widened `participant.audio-mode.v1` enum with `"broadcast"`, and a filled pod-floor visual. Whisper stays orthogonal; whisper-suggested glow is suppressed when pods are on; `autoEnableInGroupWork` is deprecated (kept in v1). Lesson `group-work` step auto-enables pods when `room.settings.pods.enabled === true`; `student-share` step temporarily disables them. Flag: `ENABLE_BREAKOUT_PODS` / `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS`. 3–5 weeks estimated. README index updated; both docs follow existing PLAN/IMPL shape.
- **2026-05-19**: Teacher Help Queue lost board-access grant UI after HUD redesign (grant controls only lived in floating `StudentDetailPanel`). Restored presets, share-type checkboxes, and Grant board in Help Queue via shared `BoardAccessGrantControls`.

## Maintenance Rules

1. Update this file after meaningful changes
2. Update `MVP_STATUS.md` (required deliverable)
3. Keep `.env.example` files in sync when adding tunable config
