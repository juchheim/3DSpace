# MVP+1 Implementation Status

Last updated: 2026-05-21
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

## Next Concrete Step

Local MVP+1 wall media, lesson planning discovery, and breakout-pods implementation are complete. Recommended follow-up before release: manually validate live wall shares against the deployed LiveKit/browser-permission path, run a 3-user breakout-pods perceptual check in staging, decide production values for web embed allowlists and file size limits, and run the lesson slice with at least one teacher before promoting the next product slice.
