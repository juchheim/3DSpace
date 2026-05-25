# MVP+1 Implementation Status

Last updated: 2026-05-23
Branch: `mvp-plus-one`

## Objective

Track MVP+1 implementation status across wall media and classroom-tools slices, keeping this file current for handoff.

## Current Baseline

- Working tree at start: branch `mvp-plus-one`; this status file was untracked/empty.
- Plan reviewed through all phases and acceptance criteria.
- Existing MVP code has room manifests, wall anchors, signed attachment targets, LiveKit/BroadcastChannel realtime, 3D/2D room renderers, and API tests.

## Prompt-To-Artifact Checklist

- WallObject model separate from attachments: complete in contracts, memory repository, and Mongo repository; covered by API tests.
- Attachment finalize/ready flow: complete in API/repositories; covered by API tests.
- Wall-object API routes and OpenAPI: complete for CRUD, control, live shares, web resources; covered by API tests.
- Room policy/config flags and safe defaults: complete in contracts/config/room settings and env docs.
- Teacher file-backed image/video/audio placement: complete in `AnchorPanel` with signed upload, binary dev upload, finalize, and object create.
- 3D wall object rendering: complete through `WallObjectLayer` and shared `WallObjectCard`.
- 2D wall object rendering/list accessibility: complete with anchor counts and a DOM list in 2D mode.
- Realtime wall upsert/remove/playback/share messages: complete in contracts, realtime adapter, and `useWallObjects`.
- Live camera pinning and browser-tab/screen share: implemented in UI/API/realtime; provider/browser-permission validation remains recommended because it is not covered by the automated e2e path.
- Web link and allowlisted embed safety: complete in API; UI creates safe links, embeds remain backend-gated by allowlist.
- Notes, timers, and simple polls: complete as inline wall objects.
- Teacher moderation/remove/lock controls: complete through remove/control endpoints and UI approve/reject/remove/stop controls.
- Student creation policy default teacher-only plus request mode: complete in room settings, API authorization, and API tests.
- Signed storage upload with explicit ready/finalized status before active asset visibility: complete; active file objects require finalized `ready` attachments.
- Privacy indicators and stop controls for live shares: complete through live badges, waiting-source states, and stop-share controls.
- Performance limits: complete through active wall object, active live share, file size, content type, and throttled-browser gates.
- Tests for contracts/API/persistence/browser flow: complete and passing.
- Env docs/templates and MVP status updates: complete.

## Validation So Far

- `npm run typecheck -w @3dspace/contracts`: pass.
- `npm run typecheck -w @3dspace/api`: pass.
- `npm run test -- apps/api/tests/api.test.ts`: pass, 8 tests.
- `npm run typecheck -w @3dspace/web`: pass.
- `npm run typecheck`: pass.
- `npm run test`: pass, 15 tests.
- `npm run build`: pass.
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npm run test:e2e`: pass, 4 tests.

## Final Completion Audit

- Typed `WallObject` separate from attachment metadata: complete.
- Image/video/audio wall placement on manifest anchors: complete.
- Live camera and browser-tab/screen share pinning: implemented; automated tests do not exercise browser permission/provider behavior.
- Wall state hydration and realtime synchronization: complete.
- 3D and 2D wall-object exposure: complete.
- Teacher moderation and removal controls: complete.
- Student wall creation policy safe by default: complete.
- Signed upload plus explicit ready/finalized lifecycle: complete.
- Browser/web safety: complete with HTTPS-only links and allowlisted embeds.
- Live media privacy indicators and stop controls: complete.
- Performance limits: complete.
- Contract/API/persistence/browser tests: complete and passing.
- Deployment docs/env templates: complete.

## Classroom Tools Phase 7 Lesson Planning Discovery Slice

Plan: `docs/planning/mvp+1/MVP_PLUS_ONE_LESSON_PLANNING_DISCOVERY_PLAN.md`

Status: complete locally behind `ENABLE_CLASSROOM_LESSONS` / `NEXT_PUBLIC_ENABLE_CLASSROOM_LESSONS`.

Completed:

- Contracts: `LessonRun`, `LessonStep`, `LessonRunStepRecord`, six discriminated step payloads, typed `ClassroomState.lessonRun`, and lesson classroom actions are exported and tested.
- API: teacher-only lesson actions cover init, title update, add/update/move/remove step, start, advance, retreat, pause, resume, end, abandon, and clear.
- API: all six step kinds orchestrate through existing classroom state: `instruction`, `focus-board`, `private-check`, `group-work`, `timer`, and `student-share`.
- API: step cleanup records drift when teachers manually change spotlight/group/grant/timer/check state before advance.
- API: student classroom state filters lesson runs to current-step-only payload visibility, strips teacher notes, and hides timeline.
- Frontend: teacher HUD supports authoring, editing, reordering, running, back/advance, pause/resume, end/abandon, clear, and timeline review.
- Frontend: student HUD shows late-join-safe current-step callouts and HUD timers.
- Feature flags: env templates and Playwright dev server commands opt into lessons for local verification while defaulting production off.

Validation:

- `npm run typecheck` — pass.
- `npm test` — pass, 47 tests.
- `npx vitest run packages/contracts/tests/lesson-run.test.ts apps/api/tests/api.test.ts` — pass, 33 tests.
- `PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 NEXT_PUBLIC_API_URL=http://127.0.0.1:8080 npx playwright test apps/web/test/mvp.spec.ts --grep "three-step lesson"` — pass, 1 focused Chromium test.

## Breakout Pods

Plan: [`docs/planning/new-features/PLAN_BREAKOUT_PODS.md`](../new-features/PLAN_BREAKOUT_PODS.md) and [`docs/planning/new-features/IMPL_BREAKOUT_PODS.md`](../new-features/IMPL_BREAKOUT_PODS.md)

Status: complete locally behind `ENABLE_BREAKOUT_PODS` / `NEXT_PUBLIC_ENABLE_BREAKOUT_PODS`; room-level default remains off.

Completed:

- Contracts, API orchestration, and room/classroom runtime state landed in Phases 1–2.
- Client spatial-audio routing, teacher controls, student HUD actions, and pod visuals landed in Phases 3–6.
- Env templates and Playwright local dev commands now opt into breakout pods for validation while keeping production defaults off.
- Focused browser coverage now seeds a two-pod classroom, enables pods from the teacher HUD, verifies student HUD indicators, verifies filled 2D pod zones plus cross-pod nameplate outlines, and checks that a teacher broadcast grant appears in both API state and the granted student's HUD.

Validation:

- `npm run typecheck -w @3dspace/web` — pass.
- `npm run test -- apps/api/tests/api.test.ts -t "pods runtime|group-work steps|student-share steps|pod actions"` — pass.
- `npx playwright test apps/web/test/breakout-pods.spec.ts` — pass locally with breakout-pod flags enabled through `playwright.config.ts`.

Rollout note:

- Planned staging rollout date: 2026-05-21, with `ENABLE_BREAKOUT_PODS=true` in staging only after merge; production default remains off until teacher validation is complete.

## RoomObject library

Plan: [`docs/planning/new-features/PLAN_ROOM_OBJECTS.md`](../new-features/PLAN_ROOM_OBJECTS.md) and [`docs/planning/new-features/IMPL_ROOM_OBJECTS.md`](../new-features/IMPL_ROOM_OBJECTS.md)

Status: complete locally behind `ENABLE_ROOM_OBJECTS` / `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS`; per-room `settings.roomObjects.enabled` remains the teacher opt-in gate (defaults **true** on new rooms when the feature flag is on).

Completed:

- Contracts, API persistence, grab lock, pose/release realtime, and teacher/student authorization through Phases 1–6.
- District-demo hero (`water-molecule` procedural) with v1 toolbar gating, inspector pedagogical parameters, 3D layer + 2D analog icons, and demo script in Phase 7.
- Custom `.glb` upload pipeline (signed targets, GLB validation, class-scoped templates) in Phase 8.
- Default custom RoomObject upload cap is now `15 MiB` for newly defaulted room settings; the triangle budget is now `100k` while the 2048 texture cap remains unchanged.
- Env templates (root, API, web) default room objects off; Playwright dev servers opt in for e2e.
- Playwright coverage: teacher opt-in + place hero, 3D canvas + inspector params + 2D icon, and two-tab grant → student 2D grab + transform sync → teacher reset/remove.

Validation:

- `npm run typecheck` — pass (see IMPL Phase 9 evidence).
- `npm run test -- apps/api/tests/api.test.ts -t "room object|template|grab|pose|release|custom template|glb upload"` — pass.
- `npm run test:e2e -- --grep "room objects"` — pass with Playwright-managed dev servers (`playwright.config.ts` flags).

Rollout note:

- Planned staging rollout date: **2026-05-22**, with `ENABLE_ROOM_OBJECTS=true` and `NEXT_PUBLIC_ENABLE_ROOM_OBJECTS=true` in staging only after merge; production flags stay off until the 60–90 s hero demo and Chromebook load check pass.
- `settings.roomObjects.customUploadsEnabled` stays off until Phase 8 stabilizes in staging; whitelist friendly districts before enabling uploads broadly.

## World Skins (Phase A)

Concept: [`docs/planning/new-features/CONCEPT_WORLD_SKINS_PHASE_A.md`](../new-features/CONCEPT_WORLD_SKINS_PHASE_A.md)
Implementation plan: [`docs/planning/new-features/IMPL_WORLD_SKINS_PHASE_A.md`](../new-features/IMPL_WORLD_SKINS_PHASE_A.md)
Demo script: [`docs/planning/new-features/WORLD_SKIN_DEMO_SCRIPT.md`](../new-features/WORLD_SKIN_DEMO_SCRIPT.md)

Status: **complete locally** behind `ENABLE_WORLD_SKINS` / `NEXT_PUBLIC_ENABLE_WORLD_SKINS` (default `false`). Five launch skins ship in the builtin catalog: `mars-surface`, `cell-interior`, `roman-forum`, `rainforest-canopy`, `art-studio`.

Completed (all nine phases):

- **Phase 0** — Dev harness at `/dev/world-skin-hero`; Mars Surface pilot skin; `packages/world-skins/` workspace with color-only hero draft.
- **Phase 1** — Contracts: `WorldSkinSchema`, `WorldSkinOverridesSchema`, `WorldSkinLightingPresetSchema`, `WorldSkinPanoramaWallSchema`, `RoomSkinMessageSchema`, three classroom actions, `RoomSettingsSchema.worldSkins`, OpenAPI entries.
- **Phase 2** — Five-skin `packages/world-skins/catalog/builtin.json`; API seed on startup; Mongoose `WorldSkin` collection + in-memory mirror.
- **Phase 3** — API routes (`GET /v1/world-skins`, `GET /v1/world-skins/:slug`, `GET /v1/world-skin-assets/*`), classroom actions (`set-room-skin`, `lock-room-skin`, `set-room-skin-day-night`), flag-gate on all three.
- **Phase 4** — Web API client (`listWorldSkins`, `fetchWorldSkin`), `useWorldSkinCatalog`, `useWorldSkin`, `CLIENT_TUNING.enableWorldSkins`, `RoomClient` realtime dispatcher for `room.skin.v1`, `window.__debug.worldSkin`.
- **Phase 5** — `SkinLayer` context provider + `WorldSkinContext`; `ambientPlayer.ts`; `SceneAtmosphere` R3F component; panorama texture clone pattern; skin-driven floor/tier colors; board-darken pass.
- **Phase 6** — `RoomView2D` themed floor map + environment label; `RoomClient` environment banner with per-session dismiss.
- **Phase 7** — Walk-speed multiplier (`useAvatarMovement` + `walkSpeedMultiplierRef`); avatar scale + nameplate `distanceFactor` compensation (`BlockyAvatar`); day/night lighting resolved in `SkinLayer`; walk-speed toast (6 s auto-dismiss).
- **Phase 8** — `EnvironmentCard` + `EnvironmentPicker` teacher HUD; ambient slider with 400 ms debounced `patchRoom`; `localAmbientGain` for immediate audio feedback; CSS for both components.
- **Phase 9** — Env template additions (`ENABLE_WORLD_SKINS`, `NEXT_PUBLIC_ENABLE_WORLD_SKINS`); Playwright dev servers opt-in; `apps/web/test/world-skins.spec.ts` focused suite; `mvp.spec.ts` skin-active smoke; docs updated.

Validation:

- `npm run typecheck` — pass.
- `npm run test -- apps/api/tests/api.test.ts -t "world skin"` — pass.
- `npx playwright test apps/web/test/world-skins.spec.ts` — pass with Playwright-managed dev servers.
- `npx playwright test apps/web/test/mvp.spec.ts` — pass (skin-active smoke included).

Rollout note:

- Planned staging rollout date: **2026-05-23**, with `ENABLE_WORLD_SKINS=true` and `NEXT_PUBLIC_ENABLE_WORLD_SKINS=true` in staging only.
- Operator must upload five v1 asset packs to R2 (`world-skins/<slug>/v1/...`) before flipping the flag in production.
- Existing rooms are unaffected on flag-on: `room.settings.worldSkins.skinId` defaults `null` (default theater).
- `room.settings.worldSkins.enabled` defaults `true`; per-room opt-out via the setting is available if needed.

## Next Concrete Step

Local MVP+1 wall media, lesson planning discovery, breakout pods, RoomObject library, and World Skins Phase A are all complete. Recommended next steps before production release: upload the five v1 skin asset packs to R2, flip `ENABLE_WORLD_SKINS=true` in staging, run the 90-second demo script, complete the Chromebook and iPad Safari QA checklist from Phase 9, and record a PR clip of the default → Mars → Cell → Forum day/night → Calm flow.
